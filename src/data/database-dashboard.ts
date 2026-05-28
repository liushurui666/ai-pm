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

async function seedDatabaseIfEmpty(prisma: PrismaClient, createSeed: () => DashboardDatabase) {
  const workspaceCount = await prisma.workspace.count();

  if (workspaceCount > 0) {
    return;
  }

  await seedDashboardDatabase(createSeed(), prisma);
}

export async function readDashboardDatabase(createSeed: () => DashboardDatabase): Promise<DashboardDatabase> {
  const prisma = getPrismaClient();

  await seedDatabaseIfEmpty(prisma, createSeed);

  const [
    workspaces,
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
    prisma.workspace.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.dashboardMember.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.projectTask.findMany({ orderBy: { dueDate: "asc" } }),
    prisma.risk.findMany({ orderBy: { title: "asc" } }),
    prisma.bugReport.findMany({
      include: {
        attachments: true,
        flowRecords: {
          orderBy: { at: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.requirementVersion.findMany({ orderBy: { startDate: "desc" } }),
    prisma.requirement.findMany({ orderBy: { title: "asc" } }),
    prisma.documentItem.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.weeklyInsight.findMany({ orderBy: { sortOrder: "asc" } })
  ]);

  return {
    metrics: {
      activeProjects: 0,
      aiSavedHours: 0,
      deliveryRate: 0,
      overdueTasks: 0
    },
    workspaces: workspaces.map((workspace): DashboardWorkspace => ({
      id: workspace.id,
      name: workspace.name,
      description: toOptionalText(workspace.description),
      status: workspace.status as DashboardWorkspace["status"],
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    })),
    members: members.map((member): DashboardMember => ({
      id: member.id,
      workspaceId: member.workspaceId,
      name: member.name,
      email: toOptionalText(member.email),
      avatarUrl: toOptionalText(member.avatarUrl),
      role: member.role as DashboardMember["role"],
      status: member.status as DashboardMember["status"],
      identities: fromJsonArray(member.identities),
      notification: member.notification as DashboardMember["notification"],
      createdAt: member.createdAt,
      updatedAt: member.updatedAt
    })),
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

async function syncWorkspaces(prisma: DashboardPrisma, workspaces: DashboardWorkspace[]) {
  await prisma.workspace.deleteMany({
    where: getDeleteWhere(workspaces.map((workspace) => workspace.id))
  });

  for (const workspace of workspaces) {
    await prisma.workspace.upsert({
      where: { id: workspace.id },
      update: {
        name: workspace.name,
        description: workspace.description,
        status: workspace.status,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt
      },
      create: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        status: workspace.status,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt
      }
    });
  }
}

async function syncMembers(prisma: DashboardPrisma, members: DashboardMember[]) {
  await prisma.dashboardMember.deleteMany({
    where: getDeleteWhere(members.map((member) => member.id))
  });

  for (const member of members) {
    const payload = {
      workspaceId: member.workspaceId,
      name: member.name,
      email: member.email,
      avatarUrl: member.avatarUrl,
      role: member.role,
      status: member.status,
      identities: asJson(member.identities),
      notification: asJson(member.notification),
      createdAt: member.createdAt,
      updatedAt: member.updatedAt
    };

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
    const payload = {
      workspaceId: getWorkspaceId(task),
      title: task.title,
      stage: task.stage,
      owner: task.owner,
      ownerMemberId: task.ownerMemberId,
      ownerOpenId: task.ownerOpenId,
      ownerUnionId: task.ownerUnionId,
      ownerUserId: task.ownerUserId,
      ownerEmail: task.ownerEmail,
      ownerAvatarUrl: task.ownerAvatarUrl,
      project: task.project,
      versionId: task.versionId,
      versionName: task.versionName,
      priority: task.priority,
      startDate: task.startDate,
      dueDate: task.dueDate,
      aiHint: task.aiHint
    };

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

async function syncBugs(prisma: DashboardPrisma, bugs: BugReport[]) {
  await prisma.bugReport.deleteMany({
    where: getDeleteWhere(bugs.map((bug) => bug.id))
  });

  for (const bug of bugs) {
    const payload = {
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

    await prisma.bugReport.upsert({
      where: { id: bug.id },
      update: payload,
      create: {
        id: bug.id,
        ...payload
      }
    });

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

export async function writeDashboardIdentityDatabase(data: Pick<DashboardDatabase, "members" | "workspaces">, client?: PrismaClient) {
  const prisma = client ?? getPrismaClient();

  await prisma.$transaction(
    async (tx) => {
      await syncWorkspaces(tx, data.workspaces);
      await syncMembers(tx, data.members);
    },
    // 首次登录或会话资料变化只会影响工作区/成员身份；只写身份表，避免 GET 页面数据时把所有任务在公网 MySQL 上逐条 upsert。
    DASHBOARD_SYNC_TRANSACTION_OPTIONS
  );
}
