import type { Prisma, PrismaClient } from "@prisma/client";
import { DASHBOARD_SYNC_TRANSACTION_OPTIONS, seedDashboardDatabase } from "@/data/dashboard-database-seed";
import { fromJsonStringArray, toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
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
    versionId: task.versionId ?? null,
    versionName: task.versionName ?? null,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    aiHint: task.aiHint
  };
}

async function seedDatabaseIfEmpty(prisma: PrismaClient, createSeed: () => DashboardDatabase) {
  const workspaceCount = await prisma.workspace.count();

  if (workspaceCount > 0) {
    return;
  }

  await seedDashboardDatabase(createSeed(), prisma);
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
    members: members.map((member): DashboardMember => {
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
    }),
    projects: projects.map((project): Project => ({
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      owner: project.owner,
      ownerMemberId: toOptionalText(project.ownerMemberId),
      ownerOpenId: toOptionalText(project.ownerOpenId),
      ownerUnionId: toOptionalText(project.ownerUnionId),
      ownerUserId: toOptionalText(project.ownerUserId),
      ownerEmail: toOptionalText(project.ownerEmail),
      ownerAvatarUrl: toOptionalText(project.ownerAvatarUrl),
      status: project.status as Project["status"],
      progress: project.progress,
      health: project.health,
      dueDate: project.dueDate,
      team: project.team,
      riskCount: project.riskCount,
      summary: project.summary,
      milestones: fromJsonArray<ProjectMilestone>(project.milestones)
    })),
    tasks: tasks.map((task): Task => ({
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
      versionId: toOptionalText(task.versionId),
      versionName: toOptionalText(task.versionName),
      priority: task.priority as Task["priority"],
      startDate: task.startDate,
      dueDate: task.dueDate,
      aiHint: task.aiHint
    })),
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
      mitigation: risk.mitigation
    })),
    bugs: bugs.map((bug): BugReport => ({
      id: bug.id,
      workspaceId: bug.workspaceId,
      title: bug.title,
      status: bug.status as BugReport["status"],
      severity: bug.severity as BugReport["severity"],
      project: bug.project,
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
            status: bug.aiFixStatus ?? undefined,
            branch: toOptionalText(bug.aiFixBranch),
            mrUrl: toOptionalText(bug.aiFixMrUrl),
            summary: toOptionalText(bug.aiFixSummary),
            error: toOptionalText(bug.aiFixError),
            updatedAt: toOptionalDateText(bug.aiFixUpdatedAt)
          }
        : undefined
    })),
    requirementVersions: requirementVersions.map((version): RequirementVersion => ({
      id: version.id,
      workspaceId: version.workspaceId,
      parentVersionId: toOptionalText(version.parentVersionId),
      parentVersionName: toOptionalText(version.parentVersionName),
      name: version.name,
      project: version.project,
      status: version.status as RequirementVersion["status"],
      startDate: version.startDate,
      releaseDate: version.releaseDate,
      goal: version.goal,
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
      milestones: fromJsonArray<ProjectMilestone>(version.milestones)
    })),
    requirements: requirements.map((requirement): Requirement => ({
      id: requirement.id,
      workspaceId: requirement.workspaceId,
      title: requirement.title,
      priority: requirement.priority as Requirement["priority"],
      status: requirement.status as Requirement["status"],
      project: requirement.project,
      versionId: toOptionalText(requirement.versionId),
      versionName: toOptionalText(requirement.versionName),
      owner: requirement.owner,
      ownerMemberId: toOptionalText(requirement.ownerMemberId),
      ownerOpenId: toOptionalText(requirement.ownerOpenId),
      ownerUnionId: toOptionalText(requirement.ownerUnionId),
      ownerUserId: toOptionalText(requirement.ownerUserId),
      ownerEmail: toOptionalText(requirement.ownerEmail),
      ownerAvatarUrl: toOptionalText(requirement.ownerAvatarUrl),
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
    const payload = {
      workspaceId: getWorkspaceId(project),
      name: project.name,
      owner: project.owner,
      ownerMemberId: project.ownerMemberId,
      ownerOpenId: project.ownerOpenId,
      ownerUnionId: project.ownerUnionId,
      ownerUserId: project.ownerUserId,
      ownerEmail: project.ownerEmail,
      ownerAvatarUrl: project.ownerAvatarUrl,
      status: project.status,
      progress: project.progress,
      health: project.health,
      dueDate: project.dueDate,
      team: project.team,
      riskCount: project.riskCount,
      summary: project.summary,
      milestones: asJson(project.milestones)
    };

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

async function syncRisks(prisma: DashboardPrisma, risks: Risk[]) {
  await prisma.risk.deleteMany({
    where: getDeleteWhere(risks.map((risk) => risk.id))
  });

  for (const risk of risks) {
    const payload = {
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
      mitigation: risk.mitigation
    };

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
    const payload = {
      workspaceId: getWorkspaceId(version),
      parentVersionId: version.parentVersionId,
      parentVersionName: version.parentVersionName,
      name: version.name,
      project: version.project,
      status: version.status,
      startDate: version.startDate,
      releaseDate: version.releaseDate,
      goal: version.goal,
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
      milestones: asJson(version.milestones)
    };

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

async function syncRequirements(prisma: DashboardPrisma, requirements: Requirement[]) {
  await prisma.requirement.deleteMany({
    where: getDeleteWhere(requirements.map((requirement) => requirement.id))
  });

  for (const requirement of requirements) {
    const payload = {
      workspaceId: getWorkspaceId(requirement),
      title: requirement.title,
      priority: requirement.priority,
      status: requirement.status,
      project: requirement.project,
      versionId: requirement.versionId,
      versionName: requirement.versionName,
      owner: requirement.owner,
      ownerMemberId: requirement.ownerMemberId,
      ownerOpenId: requirement.ownerOpenId,
      ownerUnionId: requirement.ownerUnionId,
      ownerUserId: requirement.ownerUserId,
      ownerEmail: requirement.ownerEmail,
      ownerAvatarUrl: requirement.ownerAvatarUrl,
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
