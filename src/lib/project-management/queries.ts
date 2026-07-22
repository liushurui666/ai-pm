import type { Prisma, Project as ProjectDatabaseRecord } from "@prisma/client";
import { readDashboardMembersDatabase } from "@/data/database-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import { getPrismaClient } from "@/lib/database/prisma";
import { deriveAssignedRoles } from "@/lib/project-management/derived-roles";
import { buildEffectiveProjectPermission } from "@/lib/project-management/effective-permissions";
import {
  mapProjectActivityRecord,
  mapProjectMemberPermissionRecord,
  normalizeStoredFunctionalRoles
} from "@/lib/project-management/normalizers";
import { resolveProjectAccessState } from "@/lib/project-management/access";
import { canCurrentMemberReadProject } from "@/lib/project-management/visibility";
import type {
  ProjectManagementSnapshot,
  ProjectMemberPermissionView
} from "@/lib/project-management/types";
import { ProjectManagementError } from "@/lib/project-management/types";
import type {
  DashboardMember,
  Project,
  ProjectAccessLevel,
  ProjectMilestone
} from "@/types/dashboard";
import { normalizeProjectDeliveryLabelCatalog } from "@/data/project-delivery-labels";

function fromJsonMilestones(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as ProjectMilestone[] : [];
}

function mapProjectRecord(record: ProjectDatabaseRecord): Project {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    code: record.code ?? undefined,
    owner: record.owner,
    ownerMemberId: record.ownerMemberId ?? undefined,
    ownerOpenId: record.ownerOpenId ?? undefined,
    ownerUnionId: record.ownerUnionId ?? undefined,
    ownerUserId: record.ownerUserId ?? undefined,
    ownerEmail: record.ownerEmail ?? undefined,
    ownerAvatarUrl: record.ownerAvatarUrl ?? undefined,
    status: record.status as Project["status"],
    startDate: record.startDate,
    progress: record.progress,
    health: record.health,
    riskLevel: record.riskLevel as Project["riskLevel"],
    healthStatus: record.healthStatus as Project["healthStatus"],
    healthReason: record.healthReason ?? undefined,
    dueDate: record.dueDate,
    team: record.team,
    riskCount: record.riskCount,
    summary: record.summary,
    deliveryLabelCatalog: normalizeProjectDeliveryLabelCatalog(record.deliveryLabelCatalog),
    milestones: fromJsonMilestones(record.milestones)
  };
}

function permissionAccessLevel(value: string): ProjectAccessLevel {
  return value === "admin" || value === "member" || value === "commenter" ? value : "viewer";
}

function publicProjectMember(member?: DashboardMember) {
  if (!member) {
    return undefined;
  }

  // 项目成员展示只需姓名、头像、邮箱和基础状态；通知 webhook、飞书 ID 与登录 identity 不得随项目读取接口外泄。
  return {
    ...member,
    identities: [],
    notification: {
      channels: [],
      feishuEnabled: false,
      taskAssigned: false,
      requirementChanged: false
    }
  } satisfies DashboardMember;
}

function permissionMemberCapabilities(input: {
  actorCanManage: boolean;
  actorMemberId?: string;
  projectOwnerMemberId?: string;
  targetMemberId: string;
}) {
  return {
    canEdit: input.actorCanManage,
    canRemove: input.actorCanManage && input.targetMemberId !== input.projectOwnerMemberId,
    canViewEffectivePermission: input.actorCanManage || input.actorMemberId === input.targetMemberId
  };
}

function effectivePermissionForActor(
  canViewEffectivePermission: boolean,
  createDetail: () => ProjectMemberPermissionView["effectivePermission"]
) {
  if (canViewEffectivePermission) {
    return createDetail();
  }

  // 有效权限会暴露他人的职责来源与限制细节；非管理员且非本人时在 API 读模型就脱敏，不把安全边界交给前端。
  return {
    grants: [],
    sources: [],
    restrictions: ["仅项目管理员或权限本人可查看有效权限详情。"]
  };
}

export async function getProjectManagementSnapshot(input: {
  user?: Parameters<typeof resolveProjectAccessState>[0]["user"];
  workspaceId?: string;
  projectId: string;
}): Promise<ProjectManagementSnapshot> {
  const state = await resolveProjectAccessState(input);

  if (!state.project) {
    throw new ProjectManagementError("项目不存在或不属于当前工作区。", 404);
  }

  // 项目时间线和权限同样可能包含敏感管理信息；认证开启时只向当前工作区的启用成员开放。
  if (isAuthServiceConfigured() && !state.currentMember) {
    throw new ProjectManagementError("你还不是当前工作区的启用成员。", 403);
  }

  const canRead = await canCurrentMemberReadProject({
    currentMember: state.currentMember,
    isLocalDemo: state.isLocalDemo,
    projectId: state.project.id,
    workspaceId: state.workspaceId
  });

  if (!canRead) {
    // snapshot 包含项目成员、职责来源和活动时间线；“工作区成员”不等于“可读任意项目”。
    throw new ProjectManagementError("当前成员无权查看该项目。", 403);
  }

  const prisma = getPrismaClient();
  const [project, permissionRows, activityRows, members, derivedRolesByMemberId] = await Promise.all([
    prisma.project.findUnique({ where: { id: state.project.id } }),
    prisma.projectMemberPermission.findMany({
      where: { projectId: state.project.id, workspaceId: state.workspaceId },
      orderBy: [{ accessLevel: "asc" }, { createdAt: "asc" }]
    }),
    prisma.projectActivity.findMany({
      where: { projectId: state.project.id, workspaceId: state.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    readDashboardMembersDatabase(state.workspaceId),
    deriveAssignedRoles({
      workspaceId: state.workspaceId,
      projectId: state.project.id,
      projectName: state.project.name
    })
  ]);

  if (!project) {
    throw new ProjectManagementError("项目不存在或已被删除。", 404);
  }

  const membersById = new Map<string, DashboardMember>(members.map((member) => [member.id, member]));
  const actorCanManage = state.capabilities.canManageMembers;
  const explicitMemberIds = new Set(permissionRows.map((row) => row.memberId));
  const permissions = permissionRows.map((row): ProjectMemberPermissionView => {
    const storedPermission = mapProjectMemberPermissionRecord(row);
    const permission = {
      ...storedPermission,
      functionalRoles: normalizeStoredFunctionalRoles([
        ...storedPermission.functionalRoles,
        ...(derivedRolesByMemberId.get(storedPermission.memberId) ?? [])
      ])
    };
    const member = membersById.get(permission.memberId);
    const isWorkspaceManager = Boolean(member?.status === "active" && ["owner", "admin"].includes(member.role));
    const isProjectOwner = project.ownerMemberId === permission.memberId;
    const capabilities = permissionMemberCapabilities({
      actorCanManage,
      actorMemberId: state.currentMember?.id,
      projectOwnerMemberId: project.ownerMemberId ?? undefined,
      targetMemberId: permission.memberId
    });

    return {
      ...permission,
      member: publicProjectMember(member),
      effectivePermission: effectivePermissionForActor(capabilities.canViewEffectivePermission, () => (
        buildEffectiveProjectPermission({
          member,
          isWorkspaceManager,
          isProjectOwner,
          accessLevel: permissionAccessLevel(permission.accessLevel),
          functionalRoles: permission.functionalRoles
        })
      )),
      capabilities
    };
  });
  const derivedPermissionTimestamp = "1970-01-01T00:00:00.000Z";

  for (const [memberId, functionalRoles] of derivedRolesByMemberId) {
    if (explicitMemberIds.has(memberId)) {
      continue;
    }

    const member = membersById.get(memberId);
    const canViewEffectivePermission = actorCanManage || state.currentMember?.id === memberId;

    // 派生行仅是需求/版本责任的读模型，id 使用稳定前缀便于前端识别，且所有编辑/移除 capability 都关闭。
    permissions.push({
      id: `derived:${project.id}:${memberId}`,
      workspaceId: state.workspaceId,
      projectId: project.id,
      memberId,
      accessLevel: "member",
      functionalRoles,
      createdAt: derivedPermissionTimestamp,
      updatedAt: derivedPermissionTimestamp,
      member: publicProjectMember(member),
      effectivePermission: effectivePermissionForActor(canViewEffectivePermission, () => (
        buildEffectiveProjectPermission({
          member,
          isWorkspaceManager: Boolean(member?.status === "active" && ["owner", "admin"].includes(member.role)),
          isProjectOwner: project.ownerMemberId === memberId,
          accessLevel: "member",
          functionalRoles
        })
      )),
      capabilities: {
        canEdit: false,
        canRemove: false,
        canViewEffectivePermission
      }
    });
  }
  const effectivePermission = buildEffectiveProjectPermission({
    member: state.currentMember,
    isLocalDemo: state.isLocalDemo,
    isWorkspaceManager: state.isWorkspaceManager,
    isProjectOwner: state.isProjectOwner,
    accessLevel: state.accessLevel,
    functionalRoles: state.functionalRoles,
    legacyProductRole: state.legacyProductRole
  });

  return {
    project: mapProjectRecord(project),
    permissions,
    activities: activityRows.map(mapProjectActivityRecord),
    capabilities: state.capabilities,
    actorAccess: {
      memberId: state.currentMember?.id,
      accessLevel: state.accessLevel,
      functionalRoles: state.functionalRoles,
      legacyProductRole: state.legacyProductRole
    },
    effectivePermission
  };
}
