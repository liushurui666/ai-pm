import type { Prisma, PrismaClient } from "@prisma/client";
import { DASHBOARD_SYNC_TRANSACTION_OPTIONS, seedDashboardDatabase } from "@/data/dashboard-database-seed";
import {
  normalizeProjectDeliveryLabelCatalog,
  remapVersionDeliveryMilestones,
  scopeDeliveryLabelCatalogToVersion
} from "@/data/project-delivery-labels";
import { fromJsonStringArray, toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { selectAutomaticRequirementVersionFallback } from "@/lib/project-management/deletion-policy";
import { normalizeTaskPriority } from "@/lib/tasks/priority";
import type {
  BugAttachment,
  BugFlowRecord,
  BugReport,
  DashboardData,
  DashboardMember,
  DashboardWorkspace,
  DocumentItem,
  Project,
  ProjectMilestone,
  Requirement,
  RequirementVersion,
  Risk,
  Task
} from "@/types/dashboard";

export const DASHBOARD_DATABASE_STORAGE = "MySQL";

type DashboardDatabase = Omit<DashboardData, "meta"> & {
  updatedAt: string;
};

type DashboardPrisma = PrismaClient | Prisma.TransactionClient;
type ReadDashboardDatabaseOptions = {
  scopeToWorkspace?: boolean;
  workspaceId?: string;
};

const DASHBOARD_DELETE_TRANSACTION_OPTIONS = {
  ...DASHBOARD_SYNC_TRANSACTION_OPTIONS,
  // 删除前的引用检查和最终删除必须看到同一份数据；Serializable 还会锁住已扫描的关联索引范围，
  // 避免并发创建任务/需求在检查之后插入并成为孤儿。
  isolationLevel: "Serializable" as const
};

const DASHBOARD_ASSIGNMENT_TRANSACTION_OPTIONS = {
  ...DASHBOARD_SYNC_TRANSACTION_OPTIONS,
  // 责任指派与项目成员权限是一个业务事实：两个并发保存不能在读取旧权限后相互覆盖。
  isolationLevel: "Serializable" as const
};

export type AssignmentPermissionActor = {
  memberId?: string;
  name?: string;
};

type AssignmentPermissionSyncInput = {
  actor?: AssignmentPermissionActor;
  assignees: Array<{
    memberId?: string;
    roleLabel: string;
  }>;
  entityId: string;
  entityLabel: string;
  entityType: "requirement" | "requirementVersion";
  projectId?: string;
  workspaceId: string;
};

type AssignmentPermissionSyncResult = {
  changedMemberIds: string[];
};

function uniqueAssignmentRoles(input: AssignmentPermissionSyncInput["assignees"]) {
  const rolesByMemberId = new Map<string, string[]>();

  for (const assignee of input) {
    const memberId = assignee.memberId?.trim();

    if (!memberId) {
      continue;
    }

    const roles = rolesByMemberId.get(memberId) ?? [];

    if (!roles.includes(assignee.roleLabel)) {
      roles.push(assignee.roleLabel);
    }
    rolesByMemberId.set(memberId, roles);
  }

  return rolesByMemberId;
}

async function syncAssignmentProjectMemberPermissions(
  prisma: Prisma.TransactionClient,
  input: AssignmentPermissionSyncInput
): Promise<AssignmentPermissionSyncResult> {
  const rolesByMemberId = uniqueAssignmentRoles(input.assignees);
  const memberIds = [...rolesByMemberId.keys()];

  // 取消指派只删除责任事实，不能反向删除或降级已获得的项目成员权限。
  if (!memberIds.length) {
    return { changedMemberIds: [] };
  }

  if (!input.projectId) {
    throw new Error(`无法为${input.entityLabel}负责人授予项目权限：记录缺少稳定 projectId。`);
  }

  const [project, activeMembers, existingPermissions] = await Promise.all([
    prisma.project.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId },
      select: { id: true }
    }),
    prisma.dashboardMember.findMany({
      where: {
        id: { in: memberIds },
        workspaceId: input.workspaceId,
        status: "active"
      },
      select: { id: true, name: true }
    }),
    prisma.projectMemberPermission.findMany({
      where: { projectId: input.projectId, memberId: { in: memberIds } },
      select: { accessLevel: true, memberId: true }
    })
  ]);

  if (!project) {
    throw new Error(`无法为${input.entityLabel}负责人授予项目权限：项目不存在或不属于当前工作区。`);
  }

  const activeMembersById = new Map(activeMembers.map((member) => [member.id, member]));
  const invalidMemberIds = memberIds.filter((memberId) => !activeMembersById.has(memberId));

  if (invalidMemberIds.length) {
    throw new Error(`负责人必须是当前工作区的启用成员：${invalidMemberIds.join("、")}`);
  }

  const existingByMemberId = new Map(
    existingPermissions.map((permission) => [permission.memberId, permission.accessLevel])
  );
  const createdMemberIds = memberIds.filter((memberId) => !existingByMemberId.has(memberId));
  const upgradedMemberIds = memberIds.filter((memberId) => {
    const accessLevel = existingByMemberId.get(memberId);

    return accessLevel === "viewer" || accessLevel === "commenter";
  });

  // createMany(skipDuplicates) + 只针对显式只读行 updateMany，同时兼顾并发安全和不降级语义。
  await prisma.projectMemberPermission.createMany({
    data: memberIds.map((memberId) => ({
      workspaceId: input.workspaceId,
      projectId: input.projectId as string,
      memberId,
      accessLevel: "member",
      functionalRoles: asJson([]),
      createdByMemberId: input.actor?.memberId ?? null,
      updatedByMemberId: input.actor?.memberId ?? null
    })),
    skipDuplicates: true
  });
  await prisma.projectMemberPermission.updateMany({
    where: {
      projectId: input.projectId,
      memberId: { in: memberIds },
      accessLevel: { in: ["viewer", "commenter"] }
    },
    data: {
      accessLevel: "member",
      updatedByMemberId: input.actor?.memberId ?? null
    }
  });

  const changedMemberIds = [...new Set([...createdMemberIds, ...upgradedMemberIds])];

  if (changedMemberIds.length) {
    await prisma.projectActivity.createMany({
      data: changedMemberIds.map((memberId) => {
        const memberName = activeMembersById.get(memberId)?.name ?? memberId;
        const roleLabels = rolesByMemberId.get(memberId) ?? [];
        const wasUpgraded = upgradedMemberIds.includes(memberId);

        return {
          workspaceId: input.workspaceId,
          projectId: input.projectId as string,
          actorMemberId: input.actor?.memberId ?? null,
          actorName: input.actor?.name?.trim() || "系统",
          action: "assignment_permission_synced",
          entityType: input.entityType,
          entityId: input.entityId,
          target: memberName,
          detail: `因被指派为${input.entityLabel}的${roleLabels.join("、")}，${wasUpgraded ? "已将项目访问级别从只读提升为项目成员" : "已自动加入项目成员"}。`
        };
      })
    });
  }

  return { changedMemberIds };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return toJsonValue(value);
}

function fromJsonArray<T>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toOptionalText(value: string | null) {
  return value ?? undefined;
}

function toOptionalDateText(value: Date | null) {
  return value ? value.toISOString() : undefined;
}

function getWorkspaceId(value: { workspaceId?: string }) {
  return value.workspaceId || "ws-default";
}

function getDeleteWhere(ids: string[]) {
  return ids.length ? { id: { notIn: ids } } : {};
}

function resolveScopedWorkspaceId(workspaces: DashboardWorkspace[], requestedWorkspaceId?: string) {
  return (
    workspaces.find((workspace) => workspace.id === requestedWorkspaceId && workspace.status === "active") ??
    workspaces.find((workspace) => workspace.status === "active") ??
    workspaces[0]
  )?.id;
}

// Prisma 返回的 nullable 字段需要在数据层统一转成前端类型，避免页面侧到处判断 null/undefined 差异。
function mapWorkspaceRecord(workspace: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}): DashboardWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    description: toOptionalText(workspace.description),
    status: workspace.status as DashboardWorkspace["status"],
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  };
}

function mapMemberRecord(member: {
  id: string;
  workspaceId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  registrationChannel: string;
  role: string;
  status: string;
  identities: Prisma.JsonValue;
  notification: Prisma.JsonValue;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}): DashboardMember {
  const identities = fromJsonArray<DashboardMember["identities"][number]>(member.identities);

  return {
    id: member.id,
    workspaceId: member.workspaceId,
    name: member.name,
    email: toOptionalText(member.email),
    avatarUrl: toOptionalText(member.avatarUrl),
    registrationChannel: member.registrationChannel as DashboardMember["registrationChannel"],
    role: member.role as DashboardMember["role"],
    status: member.status as DashboardMember["status"],
    identities,
    notification: member.notification as DashboardMember["notification"],
    lastActiveAt: toOptionalText(member.lastActiveAt),
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  };
}

function mapTaskRecord(task: {
  id: string;
  workspaceId: string;
  title: string;
  stage: string;
  owner: string;
  ownerMemberId: string | null;
  ownerOpenId: string | null;
  ownerUnionId: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerAvatarUrl: string | null;
  project: string;
  projectId: string | null;
  versionId: string | null;
  versionName: string | null;
  requirementId: string | null;
  requirementTitle: string | null;
  description: string | null;
  taskType: string | null;
  storyPoints: number | null;
  estimatedMinutes: number | null;
  priority: string;
  startDate: string;
  dueDate: string;
  completedAt: string | null;
  aiHint: string;
}): Task {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    title: task.title,
    stage: task.stage as Task["stage"],
    owner: task.owner,
    ownerMemberId: toOptionalText(task.ownerMemberId),
    ownerOpenId: toOptionalText(task.ownerOpenId),
    ownerUnionId: toOptionalText(task.ownerUnionId),
    ownerUserId: toOptionalText(task.ownerUserId),
    ownerEmail: toOptionalText(task.ownerEmail),
    ownerAvatarUrl: toOptionalText(task.ownerAvatarUrl),
    project: task.project,
    projectId: toOptionalText(task.projectId),
    versionId: toOptionalText(task.versionId),
    versionName: toOptionalText(task.versionName),
    requirementId: toOptionalText(task.requirementId),
    requirementTitle: toOptionalText(task.requirementTitle),
    description: toOptionalText(task.description),
    taskType: toOptionalText(task.taskType),
    storyPoints: task.storyPoints ?? undefined,
    estimatedMinutes: task.estimatedMinutes ?? undefined,
    // 历史 MySQL 行中的“中”在读模型边界统一转为“普通”，不让旧字段突破新的 TaskPriority 类型。
    priority: normalizeTaskPriority(task.priority),
    startDate: task.startDate,
    dueDate: task.dueDate,
    completedAt: toOptionalText(task.completedAt),
    aiHint: task.aiHint
  };
}

function mapRequirementVersionRecord(version: {
  id: string;
  workspaceId: string;
  parentVersionId: string | null;
  parentVersionName: string | null;
  name: string;
  project: string;
  projectId: string | null;
  type: string;
  status: string;
  startDate: string;
  releaseDate: string;
  actualStartDate: string | null;
  actualCompletedDate: string | null;
  progress: number;
  riskLevel: string;
  healthStatus: string;
  healthReason: string | null;
  goal: string;
  owner: string | null;
  ownerMemberId: string | null;
  ownerOpenId: string | null;
  ownerUnionId: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerAvatarUrl: string | null;
  productOwner: string | null;
  productOwnerMemberId: string | null;
  productOwnerOpenId: string | null;
  productOwnerUnionId: string | null;
  productOwnerUserId: string | null;
  productOwnerEmail: string | null;
  productOwnerAvatarUrl: string | null;
  uiOwner: string | null;
  uiOwnerMemberId: string | null;
  uiOwnerOpenId: string | null;
  uiOwnerUnionId: string | null;
  uiOwnerUserId: string | null;
  uiOwnerEmail: string | null;
  uiOwnerAvatarUrl: string | null;
  devOwner: string | null;
  devOwnerMemberId: string | null;
  devOwnerOpenId: string | null;
  devOwnerUnionId: string | null;
  devOwnerUserId: string | null;
  devOwnerEmail: string | null;
  devOwnerAvatarUrl: string | null;
  deliveryLabelCatalog: Prisma.JsonValue;
  milestones: Prisma.JsonValue;
}): RequirementVersion {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    parentVersionId: toOptionalText(version.parentVersionId),
    parentVersionName: toOptionalText(version.parentVersionName),
    name: version.name,
    project: version.project,
    projectId: toOptionalText(version.projectId),
    type: version.type as RequirementVersion["type"],
    status: version.status as RequirementVersion["status"],
    startDate: version.startDate,
    releaseDate: version.releaseDate,
    actualStartDate: toOptionalText(version.actualStartDate),
    actualCompletedDate: toOptionalText(version.actualCompletedDate),
    progress: version.progress,
    riskLevel: version.riskLevel as RequirementVersion["riskLevel"],
    healthStatus: version.healthStatus as RequirementVersion["healthStatus"],
    healthReason: toOptionalText(version.healthReason),
    goal: version.goal,
    owner: toOptionalText(version.owner),
    ownerMemberId: toOptionalText(version.ownerMemberId),
    ownerOpenId: toOptionalText(version.ownerOpenId),
    ownerUnionId: toOptionalText(version.ownerUnionId),
    ownerUserId: toOptionalText(version.ownerUserId),
    ownerEmail: toOptionalText(version.ownerEmail),
    ownerAvatarUrl: toOptionalText(version.ownerAvatarUrl),
    productOwner: toOptionalText(version.productOwner),
    productOwnerMemberId: toOptionalText(version.productOwnerMemberId),
    productOwnerOpenId: toOptionalText(version.productOwnerOpenId),
    productOwnerUnionId: toOptionalText(version.productOwnerUnionId),
    productOwnerUserId: toOptionalText(version.productOwnerUserId),
    productOwnerEmail: toOptionalText(version.productOwnerEmail),
    productOwnerAvatarUrl: toOptionalText(version.productOwnerAvatarUrl),
    uiOwner: toOptionalText(version.uiOwner),
    uiOwnerMemberId: toOptionalText(version.uiOwnerMemberId),
    uiOwnerOpenId: toOptionalText(version.uiOwnerOpenId),
    uiOwnerUnionId: toOptionalText(version.uiOwnerUnionId),
    uiOwnerUserId: toOptionalText(version.uiOwnerUserId),
    uiOwnerEmail: toOptionalText(version.uiOwnerEmail),
    uiOwnerAvatarUrl: toOptionalText(version.uiOwnerAvatarUrl),
    devOwner: toOptionalText(version.devOwner),
    devOwnerMemberId: toOptionalText(version.devOwnerMemberId),
    devOwnerOpenId: toOptionalText(version.devOwnerOpenId),
    devOwnerUnionId: toOptionalText(version.devOwnerUnionId),
    devOwnerUserId: toOptionalText(version.devOwnerUserId),
    devOwnerEmail: toOptionalText(version.devOwnerEmail),
    devOwnerAvatarUrl: toOptionalText(version.devOwnerAvatarUrl),
    deliveryLabelCatalog: normalizeProjectDeliveryLabelCatalog(
      version.deliveryLabelCatalog,
      { fallbackToDefaults: false }
    ),
    milestones: fromJsonArray<ProjectMilestone>(version.milestones)
  };
}

function mapBugRecord(bug: {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  severity: string;
  project: string;
  projectId: string | null;
  versionId: string | null;
  versionName: string | null;
  reporter: string;
  owner: string;
  ownerMemberId: string | null;
  ownerOpenId: string | null;
  ownerUnionId: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerAvatarUrl: string | null;
  environment: string;
  reproduction: string;
  expected: string;
  actual: string;
  createdAt: string;
  aiFixLatestJobId: string | null;
  aiFixStatus: string | null;
  aiFixBranch: string | null;
  aiFixMrUrl: string | null;
  aiFixSummary: string | null;
  aiFixError: string | null;
  aiFixUpdatedAt: Date | null;
  attachments: Array<{
    id: string;
    key: string;
    name: string;
    url: string;
    type: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
  }>;
  flowRecords: Array<{
    id: string;
    action: string;
    at: string;
    operator: string;
    from: string | null;
    to: string | null;
    note: string | null;
  }>;
}): BugReport {
  return {
    id: bug.id,
    workspaceId: bug.workspaceId,
    title: bug.title,
    status: bug.status as BugReport["status"],
    severity: bug.severity as BugReport["severity"],
    project: bug.project,
    projectId: toOptionalText(bug.projectId),
    versionId: toOptionalText(bug.versionId),
    versionName: toOptionalText(bug.versionName),
    reporter: bug.reporter,
    owner: bug.owner,
    ownerMemberId: toOptionalText(bug.ownerMemberId),
    ownerOpenId: toOptionalText(bug.ownerOpenId),
    ownerUnionId: toOptionalText(bug.ownerUnionId),
    ownerUserId: toOptionalText(bug.ownerUserId),
    ownerEmail: toOptionalText(bug.ownerEmail),
    ownerAvatarUrl: toOptionalText(bug.ownerAvatarUrl),
    environment: bug.environment,
    reproduction: bug.reproduction,
    expected: bug.expected,
    actual: bug.actual,
    createdAt: bug.createdAt,
    attachments: bug.attachments.map((attachment): BugAttachment => ({
      id: attachment.id,
      key: attachment.key,
      name: attachment.name,
      url: attachment.url,
      type: attachment.type as BugAttachment["type"],
      mimeType: attachment.mimeType,
      size: attachment.size,
      uploadedAt: attachment.uploadedAt
    })),
    flowRecords: bug.flowRecords.map((record): BugFlowRecord => ({
      id: record.id,
      action: record.action as BugFlowRecord["action"],
      at: record.at,
      operator: record.operator,
      from: toOptionalText(record.from),
      to: toOptionalText(record.to),
      note: toOptionalText(record.note)
    })),
    aiFix: bug.aiFixLatestJobId
      ? {
          latestJobId: bug.aiFixLatestJobId,
          status: (bug.aiFixStatus ?? undefined) as NonNullable<BugReport["aiFix"]>["status"],
          branch: toOptionalText(bug.aiFixBranch),
          mrUrl: toOptionalText(bug.aiFixMrUrl),
          summary: toOptionalText(bug.aiFixSummary),
          error: toOptionalText(bug.aiFixError),
          updatedAt: toOptionalDateText(bug.aiFixUpdatedAt)
        }
      : undefined
  };
}

// 工作区写库字段被全量同步和增量创建复用，集中组装可以保证两条路径的数据结构一致。
function getWorkspacePayload(workspace: DashboardWorkspace) {
  return {
    name: workspace.name,
    description: workspace.description,
    status: workspace.status,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  };
}

// 成员身份字段包含 JSON 和通知配置，集中转换 Prisma JSON 可以避免不同写入路径出现结构漂移。
function getMemberPayload(member: DashboardMember) {
  return {
    workspaceId: member.workspaceId,
    name: member.name,
    email: member.email,
    avatarUrl: member.avatarUrl,
    registrationChannel: member.registrationChannel,
    role: member.role,
    status: member.status,
    identities: asJson(member.identities),
    notification: asJson(member.notification),
    lastActiveAt: member.lastActiveAt,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  };
}

function getProjectPayload(project: Project) {
  return {
    workspaceId: getWorkspaceId(project),
    name: project.name,
    code: project.code ?? null,
    owner: project.owner,
    ownerMemberId: project.ownerMemberId,
    ownerOpenId: project.ownerOpenId,
    ownerUnionId: project.ownerUnionId,
    ownerUserId: project.ownerUserId,
    ownerEmail: project.ownerEmail,
    ownerAvatarUrl: project.ownerAvatarUrl,
    status: project.status,
    startDate: project.startDate,
    progress: project.progress,
    health: project.health,
    riskLevel: project.riskLevel,
    healthStatus: project.healthStatus,
    healthReason: project.healthReason ?? null,
    dueDate: project.dueDate,
    team: project.team,
    riskCount: project.riskCount,
    summary: project.summary,
    deliveryLabelCatalog: asJson(normalizeProjectDeliveryLabelCatalog(project.deliveryLabelCatalog)),
    milestones: asJson(project.milestones)
  };
}

// 任务看板的拖拽、排序和跨负责人流转属于高频单行更新，必须只写 project_tasks 当前记录。
// 如果继续复用全量同步事务，会在公网 MySQL 上反复 delete/upsert 多张业务表，容易和页面并发读取或连续拖拽保存产生锁等待。
function getTaskPayload(task: Task) {
  return {
    workspaceId: getWorkspaceId(task),
    title: task.title,
    stage: task.stage,
    owner: task.owner,
    ownerMemberId: task.ownerMemberId ?? null,
    ownerOpenId: task.ownerOpenId ?? null,
    ownerUnionId: task.ownerUnionId ?? null,
    ownerUserId: task.ownerUserId ?? null,
    ownerEmail: task.ownerEmail ?? null,
    ownerAvatarUrl: task.ownerAvatarUrl ?? null,
    project: task.project,
    projectId: task.projectId ?? null,
    versionId: task.versionId ?? null,
    versionName: task.versionName ?? null,
    requirementId: task.requirementId ?? null,
    requirementTitle: task.requirementTitle ?? null,
    description: task.description ?? null,
    taskType: task.taskType ?? null,
    storyPoints: task.storyPoints ?? null,
    estimatedMinutes: task.estimatedMinutes ?? null,
    // 所有普通表单、AI 和 legacy 数据的任务写入在 payload 边界二次收敛，避免“中”重新落库。
    priority: normalizeTaskPriority(task.priority),
    startDate: task.startDate,
    dueDate: task.dueDate,
    completedAt: task.completedAt ?? null,
    aiHint: task.aiHint
  };
}

async function seedDatabaseIfEmpty(prisma: PrismaClient, createSeed: () => DashboardDatabase) {
  const workspaceCount = await prisma.workspace.count();

  if (workspaceCount > 0) {
    return;
  }

  const seed = createSeed();

  await seedDashboardDatabase(seed, prisma);

  // 旧种子器仍负责一次性批量初始化全部历史表；随后只补写本次新增字段，既不扩大修改范围到旧种子模块，
  // 也避免 fresh database 只拿到 Prisma 默认值而丢失 dashboard.ts 中的项目 ID、健康状态和需求负责人数据。
  await prisma.$transaction(
    async (tx) => {
      await syncProjects(tx, seed.projects);
      await syncTasks(tx, seed.tasks);
      await syncRisks(tx, seed.risks);
      await syncRequirementVersions(tx, seed.requirementVersions);
      await syncRequirements(tx, seed.requirements);
    },
    DASHBOARD_SYNC_TRANSACTION_OPTIONS
  );
}

export async function readDashboardDatabase(
  createSeed: () => DashboardDatabase,
  options: ReadDashboardDatabaseOptions = {}
): Promise<DashboardDatabase> {
  const prisma = getPrismaClient();

  await seedDatabaseIfEmpty(prisma, createSeed);

  const workspaces = (await prisma.workspace.findMany({ orderBy: { createdAt: "asc" } })).map(mapWorkspaceRecord);
  const scopedWorkspaceId = options.scopeToWorkspace
    ? resolveScopedWorkspaceId(workspaces, options.workspaceId)
    : undefined;
  const workspaceWhere = scopedWorkspaceId ? { workspaceId: scopedWorkspaceId } : undefined;

  const [
    members,
    projects,
    tasks,
    risks,
    bugs,
    requirementVersions,
    requirements,
    documents,
    weeklyInsights
  ] = await Promise.all([
    // 页面读路径会先确定真实工作区，再把 workspaceId 下推到各业务表；如果请求参数无效，
    // 这里会回退到第一个启用工作区，避免上层拿到“默认工作区 + 空业务数据”的错配结果。
    prisma.dashboardMember.findMany({ where: workspaceWhere, orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({ where: workspaceWhere, orderBy: { name: "asc" } }),
    prisma.projectTask.findMany({ where: workspaceWhere, orderBy: { dueDate: "asc" } }),
    prisma.risk.findMany({ where: workspaceWhere, orderBy: { title: "asc" } }),
    prisma.bugReport.findMany({
      where: workspaceWhere,
      include: {
        attachments: true,
        flowRecords: {
          orderBy: { at: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.requirementVersion.findMany({ where: workspaceWhere, orderBy: { startDate: "desc" } }),
    prisma.requirement.findMany({ where: workspaceWhere, orderBy: { title: "asc" } }),
    prisma.documentItem.findMany({ where: workspaceWhere, orderBy: { updatedAt: "desc" } }),
    prisma.weeklyInsight.findMany({ where: workspaceWhere, orderBy: { sortOrder: "asc" } })
  ]);

  return {
    metrics: {
      activeProjects: 0,
      aiSavedHours: 0,
      deliveryRate: 0,
      overdueTasks: 0
    },
    workspaces,
    members: members.map(mapMemberRecord),
    projects: projects.map((project): Project => ({
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      code: toOptionalText(project.code),
      owner: project.owner,
      ownerMemberId: toOptionalText(project.ownerMemberId),
      ownerOpenId: toOptionalText(project.ownerOpenId),
      ownerUnionId: toOptionalText(project.ownerUnionId),
      ownerUserId: toOptionalText(project.ownerUserId),
      ownerEmail: toOptionalText(project.ownerEmail),
      ownerAvatarUrl: toOptionalText(project.ownerAvatarUrl),
      status: project.status as Project["status"],
      startDate: project.startDate,
      progress: project.progress,
      health: project.health,
      riskLevel: project.riskLevel as Project["riskLevel"],
      healthStatus: project.healthStatus as Project["healthStatus"],
      healthReason: toOptionalText(project.healthReason),
      dueDate: project.dueDate,
      team: project.team,
      riskCount: project.riskCount,
      summary: project.summary,
      deliveryLabelCatalog: normalizeProjectDeliveryLabelCatalog(project.deliveryLabelCatalog),
      milestones: fromJsonArray<ProjectMilestone>(project.milestones)
    })),
    tasks: tasks.map(mapTaskRecord),
    risks: risks.map((risk): Risk => ({
      id: risk.id,
      workspaceId: risk.workspaceId,
      title: risk.title,
      level: risk.level as Risk["level"],
      owner: risk.owner,
      ownerMemberId: toOptionalText(risk.ownerMemberId),
      ownerOpenId: toOptionalText(risk.ownerOpenId),
      ownerUnionId: toOptionalText(risk.ownerUnionId),
      ownerUserId: toOptionalText(risk.ownerUserId),
      ownerEmail: toOptionalText(risk.ownerEmail),
      ownerAvatarUrl: toOptionalText(risk.ownerAvatarUrl),
      project: risk.project,
      projectId: toOptionalText(risk.projectId),
      mitigation: risk.mitigation
    })),
    bugs: bugs.map(mapBugRecord),
    requirementVersions: requirementVersions.map(mapRequirementVersionRecord),
    requirements: requirements.map((requirement): Requirement => ({
      id: requirement.id,
      workspaceId: requirement.workspaceId,
      title: requirement.title,
      priority: requirement.priority as Requirement["priority"],
      status: requirement.status as Requirement["status"],
      project: requirement.project,
      projectId: toOptionalText(requirement.projectId),
      versionId: toOptionalText(requirement.versionId),
      versionName: toOptionalText(requirement.versionName),
      description: toOptionalText(requirement.description),
      owner: requirement.owner,
      ownerMemberId: toOptionalText(requirement.ownerMemberId),
      ownerOpenId: toOptionalText(requirement.ownerOpenId),
      ownerUnionId: toOptionalText(requirement.ownerUnionId),
      ownerUserId: toOptionalText(requirement.ownerUserId),
      ownerEmail: toOptionalText(requirement.ownerEmail),
      ownerAvatarUrl: toOptionalText(requirement.ownerAvatarUrl),
      designOwner: toOptionalText(requirement.designOwner),
      designOwnerMemberId: toOptionalText(requirement.designOwnerMemberId),
      designOwnerOpenId: toOptionalText(requirement.designOwnerOpenId),
      designOwnerUnionId: toOptionalText(requirement.designOwnerUnionId),
      designOwnerUserId: toOptionalText(requirement.designOwnerUserId),
      designOwnerEmail: toOptionalText(requirement.designOwnerEmail),
      designOwnerAvatarUrl: toOptionalText(requirement.designOwnerAvatarUrl),
      developerMemberIds: fromJsonStringArray(requirement.developerMemberIds),
      startDate: toOptionalText(requirement.startDate),
      dueDate: toOptionalText(requirement.dueDate),
      uiLink: toOptionalText(requirement.uiLink),
      documentLink: toOptionalText(requirement.documentLink),
      acceptance: requirement.acceptance,
      aiSummary: toOptionalText(requirement.aiSummary),
      aiRisks: fromJsonStringArray(requirement.aiRisks),
      aiMissingItems: fromJsonStringArray(requirement.aiMissingItems),
      aiFrontendNotes: fromJsonStringArray(requirement.aiFrontendNotes),
      aiBackendNotes: fromJsonStringArray(requirement.aiBackendNotes),
      aiTestingNotes: fromJsonStringArray(requirement.aiTestingNotes),
      aiCompletenessScore: requirement.aiCompletenessScore ?? undefined
    })),
    documents: documents.map((document): DocumentItem => ({
      id: document.id,
      workspaceId: document.workspaceId,
      title: document.title,
      type: document.type as DocumentItem["type"],
      updatedAt: document.updatedAt,
      aiSummary: document.aiSummary
    })),
    weeklyInsight: weeklyInsights.map((insight) => insight.content),
    updatedAt: new Date().toISOString()
  };
}

export async function readDashboardWorkspacesDatabase(createSeed: () => DashboardDatabase): Promise<DashboardWorkspace[]> {
  const prisma = getPrismaClient();

  // 工作区创建只需要校验名称是否重复，不能为了一个下拉/抽屉动作读取项目、任务、Bug 全量数据；空库时仍沿用统一种子保护。
  await seedDatabaseIfEmpty(prisma, createSeed);

  const workspaces = await prisma.workspace.findMany({ orderBy: { createdAt: "asc" } });

  return workspaces.map(mapWorkspaceRecord);
}

export async function readDashboardTaskDatabase(taskId: string, client?: PrismaClient): Promise<Task | undefined> {
  const prisma = client ?? getPrismaClient();
  const task = await prisma.projectTask.findUnique({
    where: {
      id: taskId
    }
  });

  // 任务拖拽轻量更新只需要当前任务一行；找不到时交给上层返回统一的“记录不存在”业务错误。
  return task ? mapTaskRecord(task) : undefined;
}

export async function readDashboardMemberDatabase(memberId: string, client?: PrismaClient): Promise<DashboardMember | undefined> {
  const prisma = client ?? getPrismaClient();
  const member = await prisma.dashboardMember.findUnique({
    where: {
      id: memberId
    }
  });

  // 成员资料编辑只需要先定位 workspace_members 当前行；后续重复身份校验再按该成员的工作区读取同区成员。
  return member ? mapMemberRecord(member) : undefined;
}

export async function readDashboardMembersDatabase(workspaceId: string, client?: PrismaClient): Promise<DashboardMember[]> {
  const prisma = client ?? getPrismaClient();
  const members = await prisma.dashboardMember.findMany({
    where: {
      workspaceId
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  // 负责人变更通知只需要当前工作区成员身份和渠道配置，不能为了入队通知重新读取整份 dashboard。
  return members.map(mapMemberRecord);
}

export async function readDashboardRequirementVersionDatabase(
  workspaceId: string,
  versionId: string,
  client?: PrismaClient
): Promise<RequirementVersion | undefined> {
  const prisma = client ?? getPrismaClient();
  const version = await prisma.requirementVersion.findFirst({
    where: {
      id: versionId,
      workspaceId
    }
  });

  // 任务创建只需要用关联版本回填 versionName/project，不需要读取当前工作区全部版本树。
  return version ? mapRequirementVersionRecord(version) : undefined;
}

export async function readDashboardBugDatabase(bugId: string, client?: PrismaClient): Promise<BugReport | undefined> {
  const prisma = client ?? getPrismaClient();
  const bug = await prisma.bugReport.findUnique({
    where: {
      id: bugId
    },
    include: {
      attachments: true,
      flowRecords: {
        orderBy: {
          at: "asc"
        }
      }
    }
  });

  // Bug 限权编辑只需要当前 Bug 用于保留不可编辑字段，不能为此读取整个 dashboard。
  return bug ? mapBugRecord(bug) : undefined;
}

async function syncWorkspaces(prisma: DashboardPrisma, workspaces: DashboardWorkspace[]) {
  await prisma.workspace.deleteMany({
    where: getDeleteWhere(workspaces.map((workspace) => workspace.id))
  });

  for (const workspace of workspaces) {
    const payload = getWorkspacePayload(workspace);

    await prisma.workspace.upsert({
      where: { id: workspace.id },
      update: payload,
      create: {
        id: workspace.id,
        ...payload
      }
    });
  }
}

async function syncMembers(prisma: DashboardPrisma, members: DashboardMember[]) {
  await prisma.dashboardMember.deleteMany({
    where: getDeleteWhere(members.map((member) => member.id))
  });

  for (const member of members) {
    const payload = getMemberPayload(member);

    await prisma.dashboardMember.upsert({
      where: { id: member.id },
      update: payload,
      create: {
        id: member.id,
        ...payload
      }
    });
  }
}

async function upsertIdentityWorkspaces(prisma: PrismaClient, workspaces: DashboardWorkspace[]) {
  for (const workspace of workspaces) {
    const payload = getWorkspacePayload(workspace);

    await prisma.workspace.upsert({
      where: { id: workspace.id },
      update: payload,
      create: {
        id: workspace.id,
        ...payload
      }
    });
  }
}

async function upsertIdentityMembers(prisma: PrismaClient, members: DashboardMember[]) {
  for (const member of members) {
    const payload = getMemberPayload(member);

    await prisma.dashboardMember.upsert({
      where: { id: member.id },
      update: payload,
      create: {
        id: member.id,
        ...payload
      }
    });
  }
}

export async function upsertDashboardMemberDatabase(member: DashboardMember, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();
  const payload = getMemberPayload(member);

  // 成员资料和通知渠道是单行配置写入，不能复用全量 dashboard 同步事务。
  // 否则用户只改一个邮箱通知渠道，也会重写任务、Bug、需求等业务表，在公网 MySQL 下容易表现为保存按钮长时间 loading。
  await prisma.dashboardMember.upsert({
    where: { id: member.id },
    update: payload,
    create: {
      id: member.id,
      ...payload
    }
  });
}

async function syncProjects(prisma: DashboardPrisma, projects: Project[]) {
  await prisma.project.deleteMany({
    where: getDeleteWhere(projects.map((project) => project.id))
  });

  for (const project of projects) {
    const payload = getProjectPayload(project);

    await prisma.project.upsert({
      where: { id: project.id },
      update: payload,
      create: {
        id: project.id,
        ...payload
      }
    });
  }
}

async function syncTasks(prisma: DashboardPrisma, tasks: Task[]) {
  await prisma.projectTask.deleteMany({
    where: getDeleteWhere(tasks.map((task) => task.id))
  });

  for (const task of tasks) {
    const payload = getTaskPayload(task);

    await prisma.projectTask.upsert({
      where: { id: task.id },
      update: payload,
      create: {
        id: task.id,
        ...payload
      }
    });
  }
}

// 风险在全量同步和项目改名级联中都需要写入同一组字段，集中组装可避免两条路径遗漏 projectId。
function getRiskPayload(risk: Risk) {
  return {
    workspaceId: getWorkspaceId(risk),
    title: risk.title,
    level: risk.level,
    owner: risk.owner,
    ownerMemberId: risk.ownerMemberId,
    ownerOpenId: risk.ownerOpenId,
    ownerUnionId: risk.ownerUnionId,
    ownerUserId: risk.ownerUserId,
    ownerEmail: risk.ownerEmail,
    ownerAvatarUrl: risk.ownerAvatarUrl,
    project: risk.project,
    projectId: risk.projectId,
    mitigation: risk.mitigation
  };
}

async function syncRisks(prisma: DashboardPrisma, risks: Risk[]) {
  await prisma.risk.deleteMany({
    where: getDeleteWhere(risks.map((risk) => risk.id))
  });

  for (const risk of risks) {
    const payload = getRiskPayload(risk);

    await prisma.risk.upsert({
      where: { id: risk.id },
      update: payload,
      create: {
        id: risk.id,
        ...payload
      }
    });
  }
}

function getBugPayload(bug: BugReport) {
  return {
    workspaceId: getWorkspaceId(bug),
    title: bug.title,
    status: bug.status,
    severity: bug.severity,
    project: bug.project,
    projectId: bug.projectId,
    versionId: bug.versionId,
    versionName: bug.versionName,
    reporter: bug.reporter,
    owner: bug.owner,
    ownerMemberId: bug.ownerMemberId,
    ownerOpenId: bug.ownerOpenId,
    ownerUnionId: bug.ownerUnionId,
    ownerUserId: bug.ownerUserId,
    ownerEmail: bug.ownerEmail,
    ownerAvatarUrl: bug.ownerAvatarUrl,
    environment: bug.environment,
    reproduction: bug.reproduction,
    expected: bug.expected,
    actual: bug.actual,
    createdAt: bug.createdAt,
    aiFixLatestJobId: bug.aiFix?.latestJobId,
    aiFixStatus: bug.aiFix?.status,
    aiFixBranch: bug.aiFix?.branch,
    aiFixMrUrl: bug.aiFix?.mrUrl,
    aiFixSummary: bug.aiFix?.summary,
    aiFixError: bug.aiFix?.error,
    aiFixUpdatedAt: bug.aiFix?.updatedAt ? new Date(bug.aiFix.updatedAt) : undefined
  };
}

async function replaceBugChildRecords(prisma: DashboardPrisma, bug: BugReport) {
  await prisma.bugAttachment.deleteMany({
    where: { bugId: bug.id }
  });
  await prisma.bugFlowRecord.deleteMany({
    where: { bugId: bug.id }
  });

  if (bug.attachments?.length) {
    await prisma.bugAttachment.createMany({
      data: bug.attachments.map((attachment) => ({
        id: attachment.id,
        bugId: bug.id,
        key: attachment.key,
        name: attachment.name,
        url: attachment.url,
        type: attachment.type,
        mimeType: attachment.mimeType,
        size: attachment.size,
        uploadedAt: attachment.uploadedAt
      }))
    });
  }

  if (bug.flowRecords?.length) {
    await prisma.bugFlowRecord.createMany({
      data: bug.flowRecords.map((record) => ({
        id: record.id,
        bugId: bug.id,
        action: record.action,
        at: record.at,
        operator: record.operator,
        from: record.from,
        to: record.to,
        note: record.note
      }))
    });
  }
}

async function syncBugs(prisma: DashboardPrisma, bugs: BugReport[]) {
  await prisma.bugReport.deleteMany({
    where: getDeleteWhere(bugs.map((bug) => bug.id))
  });

  for (const bug of bugs) {
    const payload = getBugPayload(bug);

    await prisma.bugReport.upsert({
      where: { id: bug.id },
      update: payload,
      create: {
        id: bug.id,
        ...payload
      }
    });

    await replaceBugChildRecords(prisma, bug);
  }
}

async function syncRequirementVersions(prisma: DashboardPrisma, versions: RequirementVersion[]) {
  await prisma.requirementVersion.deleteMany({
    where: getDeleteWhere(versions.map((version) => version.id))
  });

  for (const version of versions) {
    const payload = getRequirementVersionPayload(version);

    await prisma.requirementVersion.upsert({
      where: { id: version.id },
      update: payload,
      create: {
        id: version.id,
        ...payload
      }
    });
  }
}

function getRequirementVersionPayload(version: RequirementVersion) {
  const existingCatalog = normalizeProjectDeliveryLabelCatalog(
    version.deliveryLabelCatalog,
    { fallbackToDefaults: false }
  );
  const deliveryLabels = scopeDeliveryLabelCatalogToVersion(
    version.id,
    version.deliveryLabelCatalog,
    {
      preserveIds: Array.isArray(version.deliveryLabelCatalog)
        ? new Set(existingCatalog.map((label) => label.id))
        : undefined
    }
  );
  const milestones = remapVersionDeliveryMilestones(
    version.milestones,
    deliveryLabels.catalog,
    deliveryLabels.idMap
  );

  return {
    workspaceId: getWorkspaceId(version),
    parentVersionId: version.parentVersionId,
    parentVersionName: version.parentVersionName,
    name: version.name,
    project: version.project,
    projectId: version.projectId ?? null,
    type: version.type,
    status: version.status,
    startDate: version.startDate,
    releaseDate: version.releaseDate,
    actualStartDate: version.actualStartDate ?? null,
    actualCompletedDate: version.actualCompletedDate ?? null,
    progress: version.progress,
    riskLevel: version.riskLevel,
    healthStatus: version.healthStatus,
    healthReason: version.healthReason ?? null,
    goal: version.goal,
    owner: version.owner ?? null,
    ownerMemberId: version.ownerMemberId ?? null,
    ownerOpenId: version.ownerOpenId ?? null,
    ownerUnionId: version.ownerUnionId ?? null,
    ownerUserId: version.ownerUserId ?? null,
    ownerEmail: version.ownerEmail ?? null,
    ownerAvatarUrl: version.ownerAvatarUrl ?? null,
    productOwner: version.productOwner,
    productOwnerMemberId: version.productOwnerMemberId,
    productOwnerOpenId: version.productOwnerOpenId,
    productOwnerUnionId: version.productOwnerUnionId,
    productOwnerUserId: version.productOwnerUserId,
    productOwnerEmail: version.productOwnerEmail,
    productOwnerAvatarUrl: version.productOwnerAvatarUrl,
    uiOwner: version.uiOwner,
    uiOwnerMemberId: version.uiOwnerMemberId,
    uiOwnerOpenId: version.uiOwnerOpenId,
    uiOwnerUnionId: version.uiOwnerUnionId,
    uiOwnerUserId: version.uiOwnerUserId,
    uiOwnerEmail: version.uiOwnerEmail,
    uiOwnerAvatarUrl: version.uiOwnerAvatarUrl,
    devOwner: version.devOwner,
    devOwnerMemberId: version.devOwnerMemberId,
    devOwnerOpenId: version.devOwnerOpenId,
    devOwnerUnionId: version.devOwnerUnionId,
    devOwnerUserId: version.devOwnerUserId,
    devOwnerEmail: version.devOwnerEmail,
    devOwnerAvatarUrl: version.devOwnerAvatarUrl,
    deliveryLabelCatalog: asJson(deliveryLabels.catalog),
    milestones: asJson(milestones)
  };
}

function getRequirementPayload(requirement: Requirement) {
  return {
    workspaceId: getWorkspaceId(requirement),
    title: requirement.title,
    priority: requirement.priority,
    status: requirement.status,
    project: requirement.project,
    projectId: requirement.projectId ?? null,
    versionId: requirement.versionId,
    versionName: requirement.versionName,
    description: requirement.description ?? null,
    owner: requirement.owner,
    ownerMemberId: requirement.ownerMemberId,
    ownerOpenId: requirement.ownerOpenId,
    ownerUnionId: requirement.ownerUnionId,
    ownerUserId: requirement.ownerUserId,
    ownerEmail: requirement.ownerEmail,
    ownerAvatarUrl: requirement.ownerAvatarUrl,
    designOwner: requirement.designOwner ?? null,
    designOwnerMemberId: requirement.designOwnerMemberId ?? null,
    designOwnerOpenId: requirement.designOwnerOpenId ?? null,
    designOwnerUnionId: requirement.designOwnerUnionId ?? null,
    designOwnerUserId: requirement.designOwnerUserId ?? null,
    designOwnerEmail: requirement.designOwnerEmail ?? null,
    designOwnerAvatarUrl: requirement.designOwnerAvatarUrl ?? null,
    developerMemberIds: asJson(requirement.developerMemberIds ?? []),
    startDate: requirement.startDate ?? null,
    dueDate: requirement.dueDate ?? null,
    uiLink: requirement.uiLink,
    documentLink: requirement.documentLink,
    acceptance: requirement.acceptance,
    aiSummary: requirement.aiSummary,
    aiRisks: asJson(requirement.aiRisks ?? []),
    aiMissingItems: asJson(requirement.aiMissingItems ?? []),
    aiFrontendNotes: asJson(requirement.aiFrontendNotes ?? []),
    aiBackendNotes: asJson(requirement.aiBackendNotes ?? []),
    aiTestingNotes: asJson(requirement.aiTestingNotes ?? []),
    aiCompletenessScore: requirement.aiCompletenessScore
  };
}

async function syncRequirements(prisma: DashboardPrisma, requirements: Requirement[]) {
  await prisma.requirement.deleteMany({
    where: getDeleteWhere(requirements.map((requirement) => requirement.id))
  });

  for (const requirement of requirements) {
    const payload = getRequirementPayload(requirement);

    await prisma.requirement.upsert({
      where: { id: requirement.id },
      update: payload,
      create: {
        id: requirement.id,
        ...payload
      }
    });
  }
}

async function syncDocuments(prisma: DashboardPrisma, documents: DocumentItem[]) {
  await prisma.documentItem.deleteMany({
    where: getDeleteWhere(documents.map((document) => document.id))
  });

  for (const document of documents) {
    const payload = {
      workspaceId: getWorkspaceId(document),
      title: document.title,
      type: document.type,
      updatedAt: document.updatedAt,
      aiSummary: document.aiSummary
    };

    await prisma.documentItem.upsert({
      where: { id: document.id },
      update: payload,
      create: {
        id: document.id,
        ...payload
      }
    });
  }
}

async function syncWeeklyInsights(prisma: DashboardPrisma, data: DashboardDatabase) {
  const workspaceId = data.workspaces[0]?.id ?? "ws-default";

  await prisma.weeklyInsight.deleteMany({});

  if (data.weeklyInsight.length) {
    await prisma.weeklyInsight.createMany({
      data: data.weeklyInsight.map((content, index) => ({
        id: `weekly-${workspaceId}-${index}`,
        workspaceId,
        content,
        sortOrder: index
      }))
    });
  }
}

export async function writeDashboardDatabase(data: DashboardDatabase, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(
    async (tx) => {
      await syncWorkspaces(tx, data.workspaces);
      await syncMembers(tx, data.members);
      await syncProjects(tx, data.projects);
      await syncTasks(tx, data.tasks);
      await syncRisks(tx, data.risks);
      await syncBugs(tx, data.bugs);
      await syncRequirementVersions(tx, data.requirementVersions);
      await syncRequirements(tx, data.requirements);
      await syncDocuments(tx, data.documents);
      await syncWeeklyInsights(tx, data);
    },
    // 腾讯云 MySQL 公网访问比本地库延迟高，首次空库种子同步会连续写入多张表；保留事务原子性，同时把等待和执行窗口拉到足够覆盖冷启动。
    DASHBOARD_SYNC_TRANSACTION_OPTIONS
  );
}

export async function upsertDashboardProjectDatabase(project: Project, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();
  const payload = getProjectPayload(project);

  // 项目创建/编辑是单条项目元数据变更；项目健康度和风险数读取时派生，
  // 不能为了保存一个项目把任务、Bug、需求等所有业务表重新同步一遍。
  await prisma.project.upsert({
    where: { id: project.id },
    update: payload,
    create: {
      id: project.id,
      ...payload
    }
  });
}

export async function upsertDashboardProjectScopeDatabase({
  bugs,
  project,
  requirements,
  risks,
  tasks,
  versions
}: {
  bugs: BugReport[];
  project: Project;
  requirements: Requirement[];
  risks: Risk[];
  tasks: Task[];
  versions: RequirementVersion[];
}, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(
    async (tx) => {
      const projectPayload = getProjectPayload(project);

      // 项目改名后必须把所有稳定 projectId 关联行的展示名在同一事务中更新。
      // 这里只遍历已在服务层按 projectId 筛选的项目作用域，不会因为项目同名误伤其他记录。
      await tx.project.upsert({
        where: { id: project.id },
        update: projectPayload,
        create: {
          id: project.id,
          ...projectPayload
        }
      });

      for (const version of versions) {
        const payload = getRequirementVersionPayload(version);

        await tx.requirementVersion.upsert({
          where: { id: version.id },
          update: payload,
          create: { id: version.id, ...payload }
        });
      }

      for (const requirement of requirements) {
        const payload = getRequirementPayload(requirement);

        await tx.requirement.upsert({
          where: { id: requirement.id },
          update: payload,
          create: { id: requirement.id, ...payload }
        });
      }

      for (const task of tasks) {
        const payload = getTaskPayload(task);

        await tx.projectTask.upsert({
          where: { id: task.id },
          update: payload,
          create: { id: task.id, ...payload }
        });
      }

      for (const risk of risks) {
        const payload = getRiskPayload(risk);

        await tx.risk.upsert({
          where: { id: risk.id },
          update: payload,
          create: { id: risk.id, ...payload }
        });
      }

      for (const bug of bugs) {
        const payload = getBugPayload(bug);

        // 改名只修改 Bug 主记录的项目快照，附件和流转历史没有变化，因此不做先删后建。
        await tx.bugReport.upsert({
          where: { id: bug.id },
          update: payload,
          create: { id: bug.id, ...payload }
        });
      }
    },
    DASHBOARD_SYNC_TRANSACTION_OPTIONS
  );
}

export async function upsertDashboardRequirementVersionDatabase(
  version: RequirementVersion,
  client?: PrismaClient,
  actor?: AssignmentPermissionActor
) {
  const prisma = client ?? getPrismaClient();
  const payload = getRequirementVersionPayload(version);

  await prisma.$transaction(async (tx) => {
    // 版本总负责人的履职权限必须和版本主记录同成同败，不能依赖读取时的派生角色补救。
    await syncAssignmentProjectMemberPermissions(tx, {
      actor,
      assignees: [{ memberId: version.ownerMemberId, roleLabel: "总负责人" }],
      entityId: version.id,
      entityLabel: `版本「${version.name}」`,
      entityType: "requirementVersion",
      projectId: version.projectId,
      workspaceId: getWorkspaceId(version)
    });

    // 新建版本只影响 project_versions 当前行；子记录在后续创建时按 versionId 归一化。
    await tx.requirementVersion.upsert({
      where: { id: version.id },
      update: payload,
      create: {
        id: version.id,
        ...payload
      }
    });
  }, DASHBOARD_ASSIGNMENT_TRANSACTION_OPTIONS);
}

export async function upsertDashboardRequirementVersionScopeDatabase({
  actor,
  bugs,
  requirements,
  tasks,
  version
}: {
  actor?: AssignmentPermissionActor;
  bugs: BugReport[];
  requirements: Requirement[];
  tasks: Task[];
  version: RequirementVersion;
}, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(
    async (tx) => {
      const versionPayload = getRequirementVersionPayload(version);

      await syncAssignmentProjectMemberPermissions(tx, {
        actor,
        assignees: [{ memberId: version.ownerMemberId, roleLabel: "总负责人" }],
        entityId: version.id,
        entityLabel: `版本「${version.name}」`,
        entityType: "requirementVersion",
        projectId: version.projectId,
        workspaceId: getWorkspaceId(version)
      });

      // 编辑版本名称/项目后，只需要同步该版本及其直接关联记录；这条路径不能回退到整库同步，
      // 否则版本编辑会在公网 MySQL 上重写所有任务并触发 60 秒事务过期。
      await tx.requirementVersion.upsert({
        where: { id: version.id },
        update: versionPayload,
        create: {
          id: version.id,
          ...versionPayload
        }
      });

      for (const requirement of requirements) {
        const payload = getRequirementPayload(requirement);

        await tx.requirement.upsert({
          where: { id: requirement.id },
          update: payload,
          create: {
            id: requirement.id,
            ...payload
          }
        });
      }

      for (const task of tasks) {
        const payload = getTaskPayload(task);

        await tx.projectTask.upsert({
          where: { id: task.id },
          update: payload,
          create: {
            id: task.id,
            ...payload
          }
        });
      }

      for (const bug of bugs) {
        const payload = getBugPayload(bug);

        await tx.bugReport.upsert({
          where: { id: bug.id },
          update: payload,
          create: {
            id: bug.id,
            ...payload
          }
        });
        await replaceBugChildRecords(tx, bug);
      }
    },
    DASHBOARD_ASSIGNMENT_TRANSACTION_OPTIONS
  );
}

export async function updateDashboardTaskDatabase(task: Task, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  // 任务卡片拖拽保存只需要命中主键更新一行，不包交互式事务，也不触碰其他表。
  // 这样可以把锁持有时间压到单条 SQL 级别，避免 “Lock wait timeout exceeded” 在连续拖拽时放大。
  await prisma.projectTask.update({
    where: { id: task.id },
    data: getTaskPayload(task)
  });
}

export async function upsertDashboardTaskDatabase(task: Task, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();
  const payload = getTaskPayload(task);

  // 新建任务和编辑任务一样只影响 project_tasks 当前行；如果复用全量 dashboard 同步，
  // 会把创建一个任务放大成所有任务、项目、需求、Bug 的长事务，在公网 MySQL 上容易超过 60 秒事务窗口。
  await prisma.projectTask.upsert({
    where: { id: task.id },
    update: payload,
    create: {
      id: task.id,
      ...payload
    }
  });
}

export async function deleteDashboardTaskDatabase(taskId: string, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  // 删除任务只需要删除 project_tasks 主记录；AI 索引清理由 API 层单独入队，项目进度在读取时重新派生。
  await prisma.projectTask.delete({
    where: { id: taskId }
  });
}

export async function upsertDashboardBugDatabase(bug: BugReport, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(
    async (tx) => {
      const payload = getBugPayload(bug);

      // Bug 创建/流转只需要更新当前 Bug 以及它自己的附件、流转记录。
      // 不能为了一个 Bug 保存调用全量 dashboard 同步，否则飞书通知已经发出后，前端还会继续等待整库重写完成。
      await tx.bugReport.upsert({
        where: { id: bug.id },
        update: payload,
        create: {
          id: bug.id,
          ...payload
        }
      });

      await replaceBugChildRecords(tx, bug);
    },
    DASHBOARD_SYNC_TRANSACTION_OPTIONS
  );
}

export async function deleteDashboardBugDatabase(bugId: string, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  // Bug 删除依赖 Prisma 外键级联清理附件、流转记录和 AI 修复任务；这里不再全量重写 dashboard，
  // 避免“删除一个 Bug”在公网 MySQL 上退化成多表 delete/upsert 长事务。
  await prisma.bugReport.delete({
    where: { id: bugId }
  });
}

type RequirementVersionDeleteInput = {
  fallbackVersionId?: string;
  versionId: string;
  workspaceId: string;
};

type VersionProjectReference = {
  project: string;
  projectId: string | null;
};

async function resolveVersionProjectReference(
  prisma: Prisma.TransactionClient,
  workspaceId: string,
  version: VersionProjectReference
) {
  if (version.projectId) {
    return await prisma.project.findFirst({
      where: { id: version.projectId, workspaceId },
      select: { id: true, name: true }
    }) ?? undefined;
  }

  if (version.project === "跨项目" || version.project === "未关联项目") {
    return undefined;
  }

  const candidates = await prisma.project.findMany({
    where: { name: version.project, workspaceId },
    select: { id: true, name: true },
    take: 2
  });

  // 旧版本只有项目名时必须唯一命中；同名项目下不能选择任意迁移目标。
  return candidates.length === 1 ? candidates[0] : undefined;
}

export async function deleteDashboardRequirementVersionDatabase(
  input: RequirementVersionDeleteInput,
  client?: PrismaClient
) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const sourceVersion = await tx.requirementVersion.findFirst({
      where: { id: input.versionId, workspaceId: input.workspaceId },
      select: { id: true, project: true, projectId: true }
    });

    if (!sourceVersion) {
      throw new Error("项目/版本不存在或不属于当前工作区。");
    }

    const [requirementCount, taskCount, bugCount] = await Promise.all([
      tx.requirement.count({ where: { workspaceId: input.workspaceId, versionId: input.versionId } }),
      tx.projectTask.count({ where: { workspaceId: input.workspaceId, versionId: input.versionId } }),
      tx.bugReport.count({ where: { workspaceId: input.workspaceId, versionId: input.versionId } })
    ]);
    const referenceCount = requirementCount + taskCount + bugCount;
    let fallbackVersion: {
      id: string;
      name: string;
      project: string;
      projectId: string | null;
    } | undefined;
    let fallbackProject: { id: string; name: string } | undefined;

    if (referenceCount > 0) {
      if (!input.fallbackVersionId) {
        throw new Error("项目/版本仍有业务引用，但没有可迁移的同项目版本。");
      }

      const sourceProject = await resolveVersionProjectReference(tx, input.workspaceId, sourceVersion);
      const candidateVersions = await tx.requirementVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          NOT: { id: input.versionId }
        },
        select: { id: true, name: true, project: true, projectId: true }
      });
      const resolvedCandidates = await Promise.all(candidateVersions.map(async (version) => ({
        project: await resolveVersionProjectReference(tx, input.workspaceId, version),
        version
      })));
      const sameProjectCandidates = resolvedCandidates.filter((candidate) => {
        const sameNeutralScope = !sourceProject
          && !candidate.project
          && ["跨项目", "未关联项目"].includes(sourceVersion.project)
          && candidate.version.project === sourceVersion.project;

        return sameNeutralScope || Boolean(sourceProject && sourceProject.id === candidate.project?.id);
      });
      const systemFallback = sameProjectCandidates.find((candidate) => candidate.version.id === "rv-backlog");
      const siblingCandidates = sameProjectCandidates.filter((candidate) => candidate.version.id !== "rv-backlog");
      const automaticFallback = selectAutomaticRequirementVersionFallback(systemFallback, siblingCandidates);

      if (automaticFallback.ambiguous) {
        throw new Error("当前项目有多个可迁移版本，请先保留唯一迁移目标或将关联记录手动迁移后再删除。");
      }

      if (!automaticFallback.fallback || automaticFallback.fallback.version.id !== input.fallbackVersionId) {
        throw new Error("版本迁移目标已变化或不属于同一项目，已回滚本次删除。");
      }

      fallbackVersion = automaticFallback.fallback.version;
      fallbackProject = automaticFallback.fallback.project;
    }

    if (fallbackVersion) {
      const relationUpdate = {
        versionId: fallbackVersion.id,
        versionName: fallbackVersion.name,
        ...(fallbackProject
          ? { project: fallbackProject.name, projectId: fallbackProject.id }
          : {})
      };

      // 版本及其需求/任务/Bug 的迁移在同一事务内完成，任何一张表失败都会回滚，避免半迁移状态。
      await tx.requirement.updateMany({
        where: { workspaceId: input.workspaceId, versionId: input.versionId },
        data: relationUpdate
      });
      await tx.projectTask.updateMany({
        where: { workspaceId: input.workspaceId, versionId: input.versionId },
        data: relationUpdate
      });
      await tx.bugReport.updateMany({
        where: { workspaceId: input.workspaceId, versionId: input.versionId },
        data: relationUpdate
      });
    }

    await tx.requirementVersion.updateMany({
      where: { workspaceId: input.workspaceId, parentVersionId: input.versionId },
      data: { parentVersionId: null, parentVersionName: null }
    });
    const deleted = await tx.requirementVersion.deleteMany({
      where: { id: input.versionId, workspaceId: input.workspaceId }
    });

    if (deleted.count !== 1) {
      throw new Error("项目/版本在删除期间发生并发变化，已回滚本次操作。");
    }
  }, DASHBOARD_DELETE_TRANSACTION_OPTIONS);
}

type ProjectDeleteInput = {
  projectId: string;
  workspaceId: string;
};

export async function deleteDashboardProjectDatabase(input: ProjectDeleteInput, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId },
      select: { id: true, name: true }
    });

    if (!project) {
      throw new Error("项目不存在或不属于当前工作区。");
    }

    const sameNameProjects = await tx.project.findMany({
      where: { workspaceId: input.workspaceId, name: project.name },
      select: { id: true },
      take: 2
    });
    const canUseLegacyName = sameNameProjects.length === 1 && sameNameProjects[0].id === project.id;
    const relationWhere = {
      workspaceId: input.workspaceId,
      OR: [
        { projectId: project.id },
        ...(canUseLegacyName ? [{ projectId: null, project: project.name }] : [])
      ]
    };
    const [versionCount, requirementCount, taskCount, riskCount, bugCount, repositoryCount] = await Promise.all([
      tx.requirementVersion.count({ where: relationWhere }),
      tx.requirement.count({ where: relationWhere }),
      tx.projectTask.count({ where: relationWhere }),
      tx.risk.count({ where: relationWhere }),
      tx.bugReport.count({ where: relationWhere }),
      tx.projectRepository.count({ where: { workspaceId: input.workspaceId, projectId: project.id } })
    ]);
    const relatedCount = versionCount + requirementCount + taskCount + riskCount + bugCount + repositoryCount;

    if (relatedCount > 0) {
      throw new Error(
        `项目仍包含 ${versionCount} 个项目/版本、${requirementCount} 个需求、${taskCount} 个任务、${riskCount} 个风险、${bugCount} 个 Bug 和 ${repositoryCount} 个代码仓库，请先迁移关联数据或将项目归档。`
      );
    }

    const deleted = await tx.project.deleteMany({
      where: { id: project.id, workspaceId: input.workspaceId }
    });

    if (deleted.count !== 1) {
      throw new Error("项目在删除期间发生并发变化，已回滚本次操作。");
    }
  }, DASHBOARD_DELETE_TRANSACTION_OPTIONS);
}

export async function deleteDashboardRiskDatabase(input: { riskId: string; workspaceId: string }, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();
  const deleted = await prisma.risk.deleteMany({
    where: { id: input.riskId, workspaceId: input.workspaceId }
  });

  if (deleted.count !== 1) {
    throw new Error("风险不存在或不属于当前工作区。");
  }
}

export async function deleteDashboardDocumentDatabase(
  input: { documentId: string; workspaceId: string },
  client?: PrismaClient
) {
  const prisma = client ?? getPrismaClient();
  const deleted = await prisma.documentItem.deleteMany({
    where: { id: input.documentId, workspaceId: input.workspaceId }
  });

  if (deleted.count !== 1) {
    throw new Error("文档不存在或不属于当前工作区。");
  }
}

export async function upsertDashboardRequirementDatabase(
  requirement: Requirement,
  client?: PrismaClient,
  actor?: AssignmentPermissionActor
) {
  const prisma = client ?? getPrismaClient();
  const payload = getRequirementPayload(requirement);

  await prisma.$transaction(async (tx) => {
    await syncAssignmentProjectMemberPermissions(tx, {
      actor,
      assignees: [
        { memberId: requirement.ownerMemberId, roleLabel: "产品负责人" },
        { memberId: requirement.designOwnerMemberId, roleLabel: "设计负责人" },
        ...(requirement.developerMemberIds ?? []).map((memberId) => ({
          memberId,
          roleLabel: "开发负责人"
        }))
      ],
      entityId: requirement.id,
      entityLabel: `需求「${requirement.title}」`,
      entityType: "requirement",
      projectId: requirement.projectId,
      workspaceId: getWorkspaceId(requirement)
    });

    // 需求主记录和责任人的项目成员权限在同一事务内落库；其他 dashboard 表不参与重写。
    await tx.requirement.upsert({
      where: { id: requirement.id },
      update: payload,
      create: {
        id: requirement.id,
        ...payload
      }
    });
  }, DASHBOARD_ASSIGNMENT_TRANSACTION_OPTIONS);
}

export async function deleteDashboardRequirementDatabase(
  input: { requirementId: string; workspaceId: string },
  client?: PrismaClient
) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const requirement = await tx.requirement.findFirst({
      where: { id: input.requirementId, workspaceId: input.workspaceId },
      select: {
        id: true,
        project: true,
        projectId: true,
        title: true,
        versionId: true
      }
    });

    if (!requirement) {
      throw new Error("需求不存在或不属于当前工作区。");
    }

    const [directTaskCount, projectCandidates, legacyTaskCandidates] = await Promise.all([
      tx.projectTask.count({
        where: { workspaceId: input.workspaceId, requirementId: requirement.id }
      }),
      tx.project.findMany({
        where: { workspaceId: input.workspaceId },
        select: { id: true, name: true }
      }),
      tx.projectTask.findMany({
        where: {
          workspaceId: input.workspaceId,
          requirementId: null,
          requirementTitle: requirement.title,
          versionId: requirement.versionId
        },
        select: { project: true, projectId: true }
      })
    ]);
    const normalizeProjectName = (value: string) => value.trim().toLowerCase();
    const normalizedRequirementProject = normalizeProjectName(requirement.project);
    const sameNameProjects = projectCandidates.filter(
      (project) => normalizeProjectName(project.name) === normalizedRequirementProject
    );
    const uniqueNameProject = sameNameProjects.length === 1 ? sameNameProjects[0] : undefined;
    const resolvedRequirementProjectId = requirement.projectId ?? uniqueNameProject?.id;
    const matchingLegacyTasks = legacyTaskCandidates.filter((task) => {
      if (task.projectId) {
        return Boolean(resolvedRequirementProjectId && task.projectId === resolvedRequirementProjectId);
      }

      return normalizeProjectName(task.project) === normalizedRequirementProject;
    });
    const hasNameOnlyLegacyTask = matchingLegacyTasks.some((task) => !task.projectId);

    if (
      hasNameOnlyLegacyTask
      && (!uniqueNameProject || uniqueNameProject.id !== resolvedRequirementProjectId)
    ) {
      // 老任务只有“需求标题 + 版本 + 项目名”快照时，只有项目名严格唯一且和需求稳定 ID 一致才可判定归属。
      // 同名项目或悬空项目名都不能靠猜测放行，否则并发插入的旧格式任务会在需求删除后成为孤儿。
      throw new Error("需求所属项目名称不唯一，无法安全核对历史关联，请先补齐 projectId/requirementId 后再删除。");
    }

    const relatedTaskCount = directTaskCount + matchingLegacyTasks.length;

    if (relatedTaskCount > 0) {
      throw new Error(`需求仍关联 ${relatedTaskCount} 个任务，请先迁移或解除任务关联后再删除。`);
    }

    // 稳定 ID 与 legacy 标题引用都在 Serializable 事务内重检，防止检查后插入任一种格式的新任务形成孤儿。
    const deleted = await tx.requirement.deleteMany({
      where: { id: requirement.id, workspaceId: input.workspaceId }
    });

    if (deleted.count !== 1) {
      throw new Error("需求在删除期间发生并发变化，已回滚本次操作。");
    }
  }, DASHBOARD_DELETE_TRANSACTION_OPTIONS);
}

export async function writeDashboardIdentityDatabase(data: Pick<DashboardDatabase, "members" | "workspaces">, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  // 页面读取阶段触发的身份同步只负责补齐当前工作区和登录成员资料，不能使用交互式事务包住全量 delete/upsert。
  // 腾讯云 MySQL 公网访问偶尔会因为锁等待或网络抖动让 interactive transaction 过期，导致成员页这样的只读页面被 60 秒事务拖崩。
  // 这里改为幂等 upsert：不删除历史成员、不触碰业务表，即使中途失败也只会留下旧身份资料，下一次请求仍可继续补齐。
  await upsertIdentityWorkspaces(prisma, data.workspaces);
  await upsertIdentityMembers(prisma, data.members);
}

export async function createDashboardWorkspaceDatabase(workspace: DashboardWorkspace, member?: DashboardMember, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(
    async (tx) => {
      // 新建工作区是增量写入场景，只插入新空间和创建者 owner 成员；不触碰旧业务表，避免公网 MySQL 下无关数据被批量 upsert。
      await tx.workspace.create({
        data: {
          id: workspace.id,
          ...getWorkspacePayload(workspace)
        }
      });

      if (member) {
        await tx.dashboardMember.create({
          data: {
            id: member.id,
            ...getMemberPayload(member)
          }
        });
      }
    },
    DASHBOARD_SYNC_TRANSACTION_OPTIONS
  );
}
