import { config as loadEnv } from "dotenv";
import {
  upsertDashboardRequirementDatabase,
  upsertDashboardRequirementVersionDatabase
} from "@/data/database-dashboard";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { authorizeProjectMutationsForActorMember } from "@/lib/project-management/access";
import { resolveVisibleProjectIds } from "@/lib/project-management/visibility";
import type { Requirement, RequirementVersion } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectRejected(action: () => Promise<unknown>, expectedMessage: string) {
  let error: unknown;

  try {
    await action();
  } catch (caught) {
    error = caught;
  }

  assertSmoke(error instanceof Error, `预期操作被拒绝：${expectedMessage}`);
  assertSmoke(error.message.includes(expectedMessage), `拒绝原因不符合预期：${error.message}`);
}

function projectPayload(workspaceId: string, id: string, name: string, ownerMemberId: string) {
  return {
    id,
    workspaceId,
    name,
    owner: ownerMemberId,
    ownerMemberId,
    status: "进行中",
    startDate: "2026-07-01",
    progress: 0,
    health: 100,
    riskLevel: "低",
    healthStatus: "待评估",
    dueDate: "2026-12-31",
    team: 1,
    riskCount: 0,
    summary: "PM 权限动态冒烟",
    deliveryLabelCatalog: toJsonValue([]),
    milestones: toJsonValue([])
  };
}

function versionRecord(input: {
  id: string;
  name: string;
  ownerMemberId?: string;
  project: string;
  projectId: string;
  workspaceId: string;
}): RequirementVersion {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.name,
    project: input.project,
    projectId: input.projectId,
    type: "版本",
    status: "规划中",
    startDate: "2026-07-01",
    releaseDate: "2026-12-31",
    progress: 0,
    riskLevel: "低",
    healthStatus: "待评估",
    goal: "验证 plan_unit 作用域",
    owner: input.ownerMemberId ? `owner-${input.ownerMemberId}` : undefined,
    ownerMemberId: input.ownerMemberId,
    milestones: []
  };
}

function requirementRecord(input: {
  designOwnerMemberId?: string;
  developerMemberIds?: string[];
  id: string;
  ownerMemberId?: string;
  project: string;
  projectId: string;
  versionId: string;
  versionName: string;
  workspaceId: string;
}): Requirement {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: `权限需求-${input.id}`,
    priority: "高",
    status: "待评审",
    project: input.project,
    projectId: input.projectId,
    versionId: input.versionId,
    versionName: input.versionName,
    owner: input.ownerMemberId ? `owner-${input.ownerMemberId}` : "未指定",
    ownerMemberId: input.ownerMemberId,
    designOwner: input.designOwnerMemberId ? `design-${input.designOwnerMemberId}` : undefined,
    designOwnerMemberId: input.designOwnerMemberId,
    developerMemberIds: input.developerMemberIds ?? [],
    acceptance: "权限与业务记录同事务落库",
    aiRisks: [],
    aiMissingItems: [],
    aiFrontendNotes: [],
    aiBackendNotes: [],
    aiTestingNotes: []
  };
}

async function main() {
  const prisma = getPrismaClient();
  const runId = `pm-access-${Date.now().toString(36)}`;
  const workspaceId = `ws-${runId}`;
  const projectAId = `project-a-${runId}`;
  const projectBId = `project-b-${runId}`;
  const duplicateProjectAId = `project-duplicate-a-${runId}`;
  const duplicateProjectBId = `project-duplicate-b-${runId}`;
  const projectAName = `Alpha-${runId}`;
  const projectBName = `Beta-${runId}`;
  const duplicateProjectName = `Duplicate-${runId}`;
  const versionAId = `version-a-${runId}`;
  const versionBId = `version-b-${runId}`;
  const actorId = `member-actor-${runId}`;
  const readonlyId = `member-readonly-${runId}`;
  const newMemberId = `member-new-${runId}`;
  const adminId = `member-admin-${runId}`;
  const stableMemberId = `member-stable-${runId}`;
  const inactiveId = `member-inactive-${runId}`;
  const versionReadonlyId = `member-version-readonly-${runId}`;
  const planActorId = `member-plan-${runId}`;
  const visibilityActorId = `member-visible-${runId}`;
  const duplicateActorId = `member-duplicate-${runId}`;
  const now = new Date().toISOString();
  const memberIds = [
    actorId,
    readonlyId,
    newMemberId,
    adminId,
    stableMemberId,
    inactiveId,
    versionReadonlyId,
    planActorId,
    visibilityActorId,
    duplicateActorId
  ];

  try {
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: runId,
        status: "active",
        createdAt: now,
        updatedAt: now
      }
    });
    await prisma.dashboardMember.createMany({
      data: memberIds.map((id) => ({
        id,
        workspaceId,
        name: id,
        role: id === actorId ? "admin" : "backend",
        status: id === inactiveId ? "disabled" : "active",
        identities: toJsonValue([]),
        notification: toJsonValue({ channels: [] }),
        createdAt: now,
        updatedAt: now
      }))
    });
    await prisma.project.createMany({
      data: [
        projectPayload(workspaceId, projectAId, projectAName, actorId),
        projectPayload(workspaceId, projectBId, projectBName, actorId),
        projectPayload(workspaceId, duplicateProjectAId, duplicateProjectName, actorId),
        projectPayload(workspaceId, duplicateProjectBId, duplicateProjectName, actorId)
      ]
    });
    await prisma.requirementVersion.createMany({
      data: [
        {
          id: versionAId,
          workspaceId,
          name: "Version A",
          project: projectAName,
          projectId: projectAId,
          type: "版本",
          status: "规划中",
          startDate: "2026-07-01",
          releaseDate: "2026-12-31",
          progress: 0,
          riskLevel: "低",
          healthStatus: "待评估",
          goal: "验证 plan_unit 作用域",
          deliveryLabelCatalog: toJsonValue([]),
          milestones: toJsonValue([])
        },
        {
          id: versionBId,
          workspaceId,
          name: "Version B",
          project: projectBName,
          projectId: projectBId,
          type: "版本",
          status: "规划中",
          startDate: "2026-07-01",
          releaseDate: "2026-12-31",
          progress: 0,
          riskLevel: "低",
          healthStatus: "待评估",
          goal: "验证 plan_unit 作用域",
          deliveryLabelCatalog: toJsonValue([]),
          milestones: toJsonValue([])
        }
      ]
    });
    await prisma.projectMemberPermission.createMany({
      data: [
        {
          workspaceId,
          projectId: projectAId,
          memberId: readonlyId,
          accessLevel: "viewer",
          functionalRoles: toJsonValue([])
        },
        {
          workspaceId,
          projectId: projectAId,
          memberId: adminId,
          accessLevel: "admin",
          functionalRoles: toJsonValue([{ roleKey: "tester", scopeType: "project", sourceType: "manual" }])
        },
        {
          workspaceId,
          projectId: projectAId,
          memberId: stableMemberId,
          accessLevel: "member",
          functionalRoles: toJsonValue([{ roleKey: "developer", scopeType: "project", sourceType: "manual" }])
        },
        {
          workspaceId,
          projectId: projectBId,
          memberId: versionReadonlyId,
          accessLevel: "commenter",
          functionalRoles: toJsonValue([])
        },
        {
          workspaceId,
          projectId: projectAId,
          memberId: planActorId,
          accessLevel: "member",
          functionalRoles: toJsonValue([
            { roleKey: "delivery_manager", scopeType: "plan_unit", scopeId: versionAId, sourceType: "manual" },
            { roleKey: "product_owner", scopeType: "plan_unit", scopeId: versionAId, sourceType: "manual" },
            { roleKey: "design_owner", scopeType: "plan_unit", scopeId: versionAId, sourceType: "manual" },
            { roleKey: "developer", scopeType: "plan_unit", scopeId: versionAId, sourceType: "manual" }
          ])
        }
      ]
    });

    const requirement = requirementRecord({
      designOwnerMemberId: newMemberId,
      developerMemberIds: [adminId, stableMemberId],
      id: `requirement-assignment-${runId}`,
      ownerMemberId: readonlyId,
      project: projectAName,
      projectId: projectAId,
      versionId: versionAId,
      versionName: "Version A",
      workspaceId
    });

    await upsertDashboardRequirementDatabase(requirement, undefined, {
      memberId: actorId,
      name: "权限冒烟操作人"
    });

    const assignmentPermissions = await prisma.projectMemberPermission.findMany({
      where: {
        projectId: projectAId,
        memberId: { in: [readonlyId, newMemberId, adminId, stableMemberId] }
      },
      select: { accessLevel: true, functionalRoles: true, memberId: true }
    });
    const permissionByMemberId = new Map(assignmentPermissions.map((row) => [row.memberId, row]));

    assertSmoke(permissionByMemberId.get(readonlyId)?.accessLevel === "member", "viewer 负责人未升级为 member。");
    assertSmoke(permissionByMemberId.get(newMemberId)?.accessLevel === "member", "无权限负责人未自动加入项目。");
    assertSmoke(permissionByMemberId.get(adminId)?.accessLevel === "admin", "admin 负责人被错误降级。");
    assertSmoke(permissionByMemberId.get(stableMemberId)?.accessLevel === "member", "member 负责人访问级别被改写。");
    assertSmoke(
      Array.isArray(permissionByMemberId.get(adminId)?.functionalRoles),
      "admin 的手工职能角色被覆盖。"
    );
    assertSmoke(
      await prisma.projectActivity.count({
        where: {
          projectId: projectAId,
          entityId: requirement.id,
          action: "assignment_permission_synced"
        }
      }) === 2,
      "责任指派权限审计条数不正确。"
    );

    await upsertDashboardRequirementDatabase({
      ...requirement,
      owner: "未指定",
      ownerMemberId: undefined,
      designOwner: undefined,
      designOwnerMemberId: undefined,
      developerMemberIds: []
    });
    assertSmoke(
      await prisma.projectMemberPermission.count({
        where: {
          projectId: projectAId,
          memberId: { in: [readonlyId, newMemberId, adminId, stableMemberId] },
          accessLevel: { in: ["member", "admin"] }
        }
      }) === 4,
      "取消/改派责任后错误删除或降级项目成员。"
    );

    const invalidRequirement = requirementRecord({
      id: `requirement-invalid-${runId}`,
      ownerMemberId: inactiveId,
      project: projectAName,
      projectId: projectAId,
      versionId: versionAId,
      versionName: "Version A",
      workspaceId
    });
    await expectRejected(
      () => upsertDashboardRequirementDatabase(invalidRequirement),
      "负责人必须是当前工作区的启用成员"
    );
    assertSmoke(
      await prisma.requirement.count({ where: { id: invalidRequirement.id, workspaceId } }) === 0,
      "无效负责人拒绝后需求主记录未回滚。"
    );

    const ownedVersion = versionRecord({
      id: `version-owner-${runId}`,
      name: "Version owner sync",
      ownerMemberId: versionReadonlyId,
      project: projectBName,
      projectId: projectBId,
      workspaceId
    });
    await upsertDashboardRequirementVersionDatabase(ownedVersion);
    assertSmoke(
      (await prisma.projectMemberPermission.findUnique({
        where: { projectId_memberId: { projectId: projectBId, memberId: versionReadonlyId } },
        select: { accessLevel: true }
      }))?.accessLevel === "member",
      "版本总负责人的 commenter 权限未升级为 member。"
    );
    await upsertDashboardRequirementVersionDatabase({
      ...ownedVersion,
      owner: undefined,
      ownerMemberId: undefined
    });
    assertSmoke(
      (await prisma.projectMemberPermission.findUnique({
        where: { projectId_memberId: { projectId: projectBId, memberId: versionReadonlyId } },
        select: { accessLevel: true }
      }))?.accessLevel === "member",
      "清空版本总负责人后项目成员被降级。"
    );

    const planAuthorizations = await authorizeProjectMutationsForActorMember({
      workspaceId,
      actorMemberId: planActorId,
      mutations: [
        {
          entityType: "requirementVersion",
          action: "update",
          record: { id: versionAId, project: projectAName, projectId: projectAId },
          values: { goal: "allowed" }
        },
        {
          entityType: "requirementVersion",
          action: "update",
          record: { id: versionBId, project: projectBName, projectId: projectBId },
          values: { goal: "denied" }
        },
        {
          entityType: "requirement",
          action: "create",
          values: { project: projectAName, projectId: projectAId, versionId: versionAId }
        },
        {
          entityType: "requirement",
          action: "create",
          values: { project: projectAName, projectId: projectAId, versionId: versionBId }
        },
        {
          entityType: "task",
          action: "create",
          values: { project: projectAName, projectId: projectAId, versionId: versionAId }
        },
        {
          entityType: "task",
          action: "update",
          record: {
            id: `task-${runId}`,
            ownerMemberId: actorId,
            project: projectAName,
            projectId: projectAId,
            versionId: versionAId
          },
          values: { stage: "进行中" }
        },
        {
          entityType: "risk",
          action: "update",
          record: { id: `risk-${runId}`, project: projectAName, projectId: projectAId },
          values: { mitigation: "must remain denied" }
        },
        {
          entityType: "requirementVersion",
          action: "delete",
          record: { id: versionAId, project: projectAName, projectId: projectAId }
        }
      ]
    });
    const expectedPlanDecisions = [true, false, true, false, true, true, false, false];

    assertSmoke(
      planAuthorizations.every((authorization, index) => authorization.allowed === expectedPlanDecisions[index]),
      `plan_unit 作用域决策不符合预期：${planAuthorizations.map((item) => item.allowed).join(",")}`
    );

    await prisma.requirement.createMany({
      data: [
        {
          id: `requirement-visible-${runId}`,
          workspaceId,
          title: "visible assignment",
          priority: "普通",
          status: "待评审",
          project: projectAName,
          projectId: projectAId,
          versionId: versionAId,
          versionName: "Version A",
          owner: actorId,
          developerMemberIds: toJsonValue([visibilityActorId]),
          acceptance: "visible",
          aiRisks: toJsonValue([]),
          aiMissingItems: toJsonValue([]),
          aiFrontendNotes: toJsonValue([]),
          aiBackendNotes: toJsonValue([]),
          aiTestingNotes: toJsonValue([])
        },
        {
          id: `requirement-duplicate-${runId}`,
          workspaceId,
          title: "ambiguous legacy assignment",
          priority: "普通",
          status: "待评审",
          project: duplicateProjectName,
          projectId: null,
          versionId: null,
          versionName: null,
          owner: duplicateActorId,
          ownerMemberId: duplicateActorId,
          developerMemberIds: toJsonValue([]),
          acceptance: "must stay hidden",
          aiRisks: toJsonValue([]),
          aiMissingItems: toJsonValue([]),
          aiFrontendNotes: toJsonValue([]),
          aiBackendNotes: toJsonValue([]),
          aiTestingNotes: toJsonValue([])
        }
      ]
    });
    await prisma.requirementVersion.update({
      where: { id: versionBId },
      data: { ownerMemberId: visibilityActorId }
    });
    const [visibleIds, ambiguousIds, managerIds] = await Promise.all([
      resolveVisibleProjectIds({
        currentMember: {
          id: visibilityActorId,
          workspaceId,
          role: "backend",
          status: "active"
        },
        workspaceId
      }),
      resolveVisibleProjectIds({
        currentMember: {
          id: duplicateActorId,
          workspaceId,
          role: "backend",
          status: "active"
        },
        workspaceId
      }),
      resolveVisibleProjectIds({
        currentMember: {
          id: actorId,
          workspaceId,
          role: "admin",
          status: "active"
        },
        workspaceId
      })
    ]);

    assertSmoke(
      visibleIds.has(projectAId) && visibleIds.has(projectBId) && visibleIds.size === 2,
      "需求开发+版本 owner 可见项目并集不正确。"
    );
    assertSmoke(ambiguousIds.size === 0, "legacy 重名项目需求泄露了项目可见性。");
    assertSmoke(managerIds.size === 4, "workspace admin 没有获得当前工作区全部项目。");

    console.log(JSON.stringify({
      checked: 14,
      ok: true,
      results: [
        "requirement assignment upgrades viewer",
        "requirement assignment creates missing member",
        "admin/member access preserved",
        "assignment permission audit recorded",
        "unassign never downgrades or deletes member",
        "inactive assignee rejects and rolls back record",
        "version owner upgrades commenter",
        "version owner clear preserves member",
        "plan_unit version update isolated",
        "plan_unit requirement create isolated",
        "plan_unit task create/update isolated",
        "plan_unit does not grant risk/delete",
        "assignment visibility union resolved",
        "ambiguous legacy project remains hidden"
      ]
    }, null, 2));
  } finally {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

const smokeKeepAlive = setInterval(() => undefined, 1_000);

void main()
  .catch((error) => {
    console.error("[project-management-access-smoke] failed", error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(smokeKeepAlive));
