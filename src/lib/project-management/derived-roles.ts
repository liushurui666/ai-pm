import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/database/prisma";
import { normalizeStoredFunctionalRoles } from "@/lib/project-management/normalizers";
import { selectUniqueProjectNameCandidate } from "@/lib/project-management/record-scope-core";
import type { ProjectFunctionalRoleAssignment } from "@/types/dashboard";

function jsonStringIds(value: Prisma.JsonValue) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function addDerivedRole(
  rolesByMemberId: Map<string, ProjectFunctionalRoleAssignment[]>,
  memberId: string | null,
  role: ProjectFunctionalRoleAssignment
) {
  if (!memberId) {
    return;
  }

  rolesByMemberId.set(
    memberId,
    normalizeStoredFunctionalRoles([...(rolesByMemberId.get(memberId) ?? []), role])
  );
}

/**
 * 需求责任与版本总体负责人本身就是细粒度权限事实。
 * 这里在读取时派生只读职能角色，不回写 project_member_permissions，以免改派后留下过期授权。
 */
export async function deriveAssignedRoles(input: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  memberIds?: string[];
}) {
  const prisma = getPrismaClient();
  const projectNameCandidates = await prisma.project.findMany({
    where: { workspaceId: input.workspaceId, name: input.projectName },
    select: { id: true },
    take: 2
  });
  const uniqueNameProject = selectUniqueProjectNameCandidate(projectNameCandidates);
  const canUseLegacyProjectName = uniqueNameProject?.id === input.projectId;
  const [requirements, versions] = await Promise.all([
    prisma.requirement.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { projectId: input.projectId },
          // 仅当目标名称在当前工作区唯一且确实对应当前 projectId 时，才派生旧需求上的职能角色。
          ...(canUseLegacyProjectName ? [{ projectId: null, project: input.projectName }] : [])
        ]
      },
      select: {
        id: true,
        title: true,
        ownerMemberId: true,
        designOwnerMemberId: true,
        developerMemberIds: true
      }
    }),
    prisma.requirementVersion.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { projectId: input.projectId },
          // 旧版本同样只在项目名唯一时进入当前项目的派生成员读模型。
          ...(canUseLegacyProjectName ? [{ projectId: null, project: input.projectName }] : [])
        ]
      },
      select: { id: true, name: true, ownerMemberId: true }
    })
  ]);
  const memberFilter = input.memberIds?.length ? new Set(input.memberIds) : undefined;
  const rolesByMemberId = new Map<string, ProjectFunctionalRoleAssignment[]>();

  for (const requirement of requirements) {
    const base = {
      scopeType: "requirement" as const,
      scopeId: requirement.id,
      sourceType: "requirement_assignment" as const,
      sourceId: requirement.id,
      sourceLabel: requirement.title
    };

    if (!memberFilter || (requirement.ownerMemberId && memberFilter.has(requirement.ownerMemberId))) {
      addDerivedRole(rolesByMemberId, requirement.ownerMemberId, { ...base, roleKey: "product_owner" });
    }

    if (!memberFilter || (requirement.designOwnerMemberId && memberFilter.has(requirement.designOwnerMemberId))) {
      addDerivedRole(rolesByMemberId, requirement.designOwnerMemberId, { ...base, roleKey: "design_owner" });
    }

    for (const memberId of jsonStringIds(requirement.developerMemberIds)) {
      if (!memberFilter || memberFilter.has(memberId)) {
        addDerivedRole(rolesByMemberId, memberId, { ...base, roleKey: "developer" });
      }
    }
  }

  for (const version of versions) {
    if (!memberFilter || (version.ownerMemberId && memberFilter.has(version.ownerMemberId))) {
      // plan_unit 作用域仅用于成员读模型和权限说明；实际写授权仍由 access.ts 按目标 version id 校验，
      // 不能把版本负责人放大成整个项目的 delivery_manager。
      addDerivedRole(rolesByMemberId, version.ownerMemberId, {
        roleKey: "delivery_manager",
        scopeType: "plan_unit",
        scopeId: version.id,
        sourceType: "version_assignment",
        sourceId: version.id,
        sourceLabel: version.name
      });
    }
  }

  return rolesByMemberId;
}
