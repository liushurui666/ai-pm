import { readDashboardMembersDatabase } from "@/data/database-dashboard";
import { getPrismaClient } from "@/lib/database/prisma";
import { toJsonValue } from "@/lib/database/json";
import { deriveAssignedRoles } from "@/lib/project-management/derived-roles";
import {
  loadActiveWorkspaceMembers,
  projectActivityActor,
  requireGovernanceCapability,
  uniqueStrings
} from "@/lib/project-management/mutation-context";
import {
  mapProjectActivityRecord,
  normalizeStoredFunctionalRoles
} from "@/lib/project-management/normalizers";
import { selectUniqueProjectNameCandidate } from "@/lib/project-management/record-scope-core";
import type {
  AddProjectMembersInput,
  RemoveProjectMemberInput,
  UpdateProjectMemberInput
} from "@/lib/project-management/types";
import { ProjectManagementError } from "@/lib/project-management/types";
import type { ProjectAccessLevel, ProjectActivity, ProjectFunctionalRoleAssignment } from "@/types/dashboard";

type GovernanceMutationResult = {
  message: string;
  activity?: ProjectActivity;
};

export async function addProjectMembers(input: AddProjectMembersInput): Promise<GovernanceMutationResult & {
  addedMemberIds: string[];
  skippedMemberIds: string[];
}> {
  const state = await requireGovernanceCapability(input, "canManageMembers");
  const memberIds = uniqueStrings(input.memberIds);
  const accessLevel = input.accessLevel ?? "member";
  const functionalRoles = ["commenter", "viewer"].includes(accessLevel)
    ? []
    : normalizeStoredFunctionalRoles(input.functionalRoles).filter((role) => !role.sourceType || role.sourceType === "manual");

  if (!memberIds.length) {
    throw new ProjectManagementError("请至少选择一位项目成员。", 400);
  }

  // 新增成员的初始权限必须和权限行在同一事务落库；先校验需求作用域，避免旧的 POST 后 PATCH
  // 两段式流程在第二步失败时留下一个意外拥有默认 member 访问级别的半成品成员。
  await validateFunctionalRoleScopes({
    workspaceId: state.workspaceId,
    projectId: state.project.id,
    projectName: state.project.name,
    roles: functionalRoles
  });

  const members = await loadActiveWorkspaceMembers(state.workspaceId, memberIds);
  const prisma = getPrismaClient();
  const existingRows = await prisma.projectMemberPermission.findMany({
    where: { projectId: state.project.id, memberId: { in: memberIds } },
    select: { memberId: true }
  });
  const existingIds = new Set(existingRows.map((row) => row.memberId));
  const addedMembers = members.filter((member) => !existingIds.has(member.id));
  let activity: ProjectActivity | undefined;

  if (addedMembers.length) {
    const createdActivity = await prisma.$transaction(async (tx) => {
      await tx.projectMemberPermission.createMany({
        data: addedMembers.map((member) => ({
          workspaceId: state.workspaceId,
          projectId: state.project!.id,
          memberId: member.id,
          accessLevel,
          functionalRoles: toJsonValue(functionalRoles),
          createdByMemberId: state.currentMember?.id ?? null,
          updatedByMemberId: state.currentMember?.id ?? null
        })),
        skipDuplicates: true
      });

      return tx.projectActivity.create({
        data: {
          workspaceId: state.workspaceId,
          projectId: state.project!.id,
          ...projectActivityActor(state),
          action: "members_added",
          entityType: "project",
          entityId: state.project!.id,
          target: addedMembers.map((member) => member.name).join("、"),
          detail: `将 ${addedMembers.map((member) => member.name).join("、")} 加入项目，初始访问级别为${accessLevelLabel(accessLevel)}，并同步配置职能职责范围。`
        }
      });
    });
    activity = mapProjectActivityRecord(createdActivity);
  }

  return {
    message: addedMembers.length
      ? `已添加 ${addedMembers.length} 位项目成员。`
      : "所选成员已在项目中，未重复添加。",
    activity,
    addedMemberIds: addedMembers.map((member) => member.id),
    skippedMemberIds: memberIds.filter((memberId) => existingIds.has(memberId))
  };
}

async function findPermissionForMutation(projectId: string, permissionId?: string, memberId?: string) {
  if (!permissionId && !memberId) {
    throw new ProjectManagementError("缺少 permissionId 或 memberId。", 400);
  }

  const prisma = getPrismaClient();
  const permission = await prisma.projectMemberPermission.findFirst({
    where: {
      projectId,
      ...(permissionId ? { id: permissionId } : { memberId })
    }
  });

  if (!permission) {
    throw new ProjectManagementError("项目成员权限记录不存在。", 404);
  }

  return permission;
}

async function validateFunctionalRoleScopes(input: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  roles: ProjectFunctionalRoleAssignment[];
}) {
  const requirementIds = uniqueStrings(
    input.roles
      .filter((role) => role.scopeType === "requirement")
      .map((role) => role.scopeId ?? "")
  );
  const versionIds = uniqueStrings(
    input.roles
      .filter((role) => role.scopeType === "plan_unit")
      .map((role) => role.scopeId ?? "")
  );

  if (!requirementIds.length && !versionIds.length) {
    return;
  }

  const prisma = getPrismaClient();
  const projectNameCandidates = await prisma.project.findMany({
    where: { workspaceId: input.workspaceId, name: input.projectName },
    select: { id: true },
    take: 2
  });
  const uniqueNameProject = selectUniqueProjectNameCandidate(projectNameCandidates);
  const canUseLegacyProjectName = uniqueNameProject?.id === input.projectId;
  const [requirements, versions] = await Promise.all([
    requirementIds.length
      ? prisma.requirement.findMany({
          where: {
            id: { in: requirementIds },
            workspaceId: input.workspaceId,
            OR: [
              { projectId: input.projectId },
              // 历史需求未回填 projectId 时，只允许用同工作区内唯一且对应当前项目的名称验证归属。
              ...(canUseLegacyProjectName ? [{ projectId: null, project: input.projectName }] : [])
            ]
          },
          select: { id: true }
        })
      : [],
    versionIds.length
      ? prisma.requirementVersion.findMany({
          where: {
            id: { in: versionIds },
            workspaceId: input.workspaceId,
            OR: [
              { projectId: input.projectId },
              // plan_unit legacy 归属与需求使用同一严格唯一名称回退，不能指向同名项目。
              ...(canUseLegacyProjectName ? [{ projectId: null, project: input.projectName }] : [])
            ]
          },
          select: { id: true }
        })
      : []
  ]);
  const validIds = new Set(requirements.map((requirement) => requirement.id));
  const foreignIds = requirementIds.filter((requirementId) => !validIds.has(requirementId));
  const validVersionIds = new Set(versions.map((version) => version.id));
  const foreignVersionIds = versionIds.filter((versionId) => !validVersionIds.has(versionId));

  if (foreignIds.length) {
    throw new ProjectManagementError(`职能角色引用了不属于当前项目的需求：${foreignIds.join("、")}`, 400);
  }

  if (foreignVersionIds.length) {
    throw new ProjectManagementError(`职能角色引用了不属于当前项目的计划单元：${foreignVersionIds.join("、")}`, 400);
  }
}

function accessLevelLabel(accessLevel: ProjectAccessLevel) {
  return {
    admin: "项目管理员",
    member: "项目成员",
    commenter: "可评论成员",
    viewer: "只读成员"
  }[accessLevel];
}

function storedAccessLevel(value: string): ProjectAccessLevel {
  return value === "admin" || value === "member" || value === "commenter" ? value : "viewer";
}

export async function updateProjectMember(input: UpdateProjectMemberInput): Promise<GovernanceMutationResult> {
  const state = await requireGovernanceCapability(input, "canManageMembers");
  const permission = await findPermissionForMutation(state.project.id, input.permissionId, input.memberId);

  if (!input.accessLevel && input.functionalRoles === undefined) {
    throw new ProjectManagementError("没有提供需要更新的访问级别或职能角色。", 400);
  }

  let nextAccessLevel = input.accessLevel ?? storedAccessLevel(permission.accessLevel);
  // requirement/version assignment 是实时派生的只读事实，即使前端把 GET 返回的合并角色原样回传，也绝不能写入手工权限表。
  let nextRoles = (input.functionalRoles ?? normalizeStoredFunctionalRoles(permission.functionalRoles))
    .filter((role) => !role.sourceType || role.sourceType === "manual");

  if (permission.memberId === state.project.ownerMemberId) {
    // 项目负责人的完整权限来自 owner 身份，存储层仍强制记为 admin，防止 UI 展示与服务端真实权限分裂。
    nextAccessLevel = "admin";
  }

  if (nextAccessLevel === "commenter" || nextAccessLevel === "viewer") {
    const derivedRoles = (await deriveAssignedRoles({
      workspaceId: state.workspaceId,
      projectId: state.project.id,
      projectName: state.project.name,
      memberIds: [permission.memberId]
    })).get(permission.memberId) ?? [];

    if (derivedRoles.length) {
      // 显式只读级别会覆盖实时派生职责；负责人仍挂在需求/版本上时禁止降级，避免“有责任但无履职权限”。
      throw new ProjectManagementError("该成员仍承担需求或版本责任，请先完成责任交接后再降为只读成员。", 409);
    }

    nextRoles = [];
  }

  await validateFunctionalRoleScopes({
    workspaceId: state.workspaceId,
    projectId: state.project.id,
    projectName: state.project.name,
    roles: nextRoles
  });

  const members = await readDashboardMembersDatabase(state.workspaceId);
  const targetMember = members.find((member) => member.id === permission.memberId);
  const prisma = getPrismaClient();
  const createdActivity = await prisma.$transaction(async (tx) => {
    await tx.projectMemberPermission.update({
      where: { id: permission.id },
      data: {
        accessLevel: nextAccessLevel,
        functionalRoles: toJsonValue(nextRoles),
        updatedByMemberId: state.currentMember?.id ?? null
      }
    });

    return tx.projectActivity.create({
      data: {
        workspaceId: state.workspaceId,
        projectId: state.project!.id,
        ...projectActivityActor(state),
        action: "member_permission_updated",
        entityType: "project",
        entityId: state.project!.id,
        target: targetMember?.name || permission.memberId,
        detail: `将 ${targetMember?.name || permission.memberId} 的访问级别设为${accessLevelLabel(nextAccessLevel)}，并更新了职能职责范围。`
      }
    });
  });

  return {
    message: `已更新 ${targetMember?.name || permission.memberId} 的项目权限。`,
    activity: mapProjectActivityRecord(createdActivity)
  };
}

export async function removeProjectMember(input: RemoveProjectMemberInput): Promise<GovernanceMutationResult> {
  const state = await requireGovernanceCapability(input, "canManageMembers");
  const permission = await findPermissionForMutation(state.project.id, input.permissionId, input.memberId);

  if (permission.memberId === state.project.ownerMemberId) {
    throw new ProjectManagementError("不能移除当前项目负责人；请先执行负责人交接。", 400);
  }

  const derivedRoles = (await deriveAssignedRoles({
    workspaceId: state.workspaceId,
    projectId: state.project.id,
    projectName: state.project.name,
    memberIds: [permission.memberId]
  })).get(permission.memberId) ?? [];

  if (derivedRoles.length) {
    throw new ProjectManagementError("该成员仍承担需求或版本责任，请先完成责任交接后再移出项目。", 409);
  }

  const members = await readDashboardMembersDatabase(state.workspaceId);
  const targetMember = members.find((member) => member.id === permission.memberId);
  const prisma = getPrismaClient();
  const createdActivity = await prisma.$transaction(async (tx) => {
    await tx.projectMemberPermission.delete({ where: { id: permission.id } });

    return tx.projectActivity.create({
      data: {
        workspaceId: state.workspaceId,
        projectId: state.project!.id,
        ...projectActivityActor(state),
        action: "member_removed",
        entityType: "project",
        entityId: state.project!.id,
        target: targetMember?.name || permission.memberId,
        detail: `将 ${targetMember?.name || permission.memberId} 移出项目成员列表。`
      }
    });
  });

  return {
    message: `已将 ${targetMember?.name || permission.memberId} 移出项目。`,
    activity: mapProjectActivityRecord(createdActivity)
  };
}
