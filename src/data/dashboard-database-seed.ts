import type { Prisma, PrismaClient } from "@prisma/client";
import { toJsonValue } from "@/lib/database/json";
import type { DashboardData } from "@/types/dashboard";

type DashboardDatabase = Omit<DashboardData, "meta"> & {
  updatedAt: string;
};

export const DASHBOARD_SYNC_TRANSACTION_OPTIONS = {
  maxWait: 30_000,
  timeout: 60_000
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return toJsonValue(value);
}

function getWorkspaceId(value: { workspaceId?: string }) {
  return value.workspaceId || "ws-default";
}

export async function seedDashboardDatabase(data: DashboardDatabase, prisma: PrismaClient) {
  await prisma.$transaction(
    async (tx) => {
      // 空库初始化只会发生在正式库第一次启动时；这里批量插入种子数据，避免公网 MySQL 下逐条 upsert 产生几十次网络往返。
      if (data.workspaces.length) {
        await tx.workspace.createMany({
          data: data.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            status: workspace.status,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt
          }))
        });
      }

      if (data.members.length) {
        await tx.dashboardMember.createMany({
          data: data.members.map((member) => ({
            id: member.id,
            workspaceId: member.workspaceId,
            name: member.name,
            email: member.email,
            avatarUrl: member.avatarUrl,
            // 新版本成员种子必须显式携带注册渠道；缺失时只给手动成员默认值，不再从旧 identities 反推登录来源。
            registrationChannel: member.registrationChannel ?? "email",
            role: member.role,
            status: member.status,
            identities: asJson(member.identities),
            notification: asJson(member.notification),
            lastActiveAt: member.lastActiveAt,
            createdAt: member.createdAt,
            updatedAt: member.updatedAt
          }))
        });
      }

      if (data.projects.length) {
        await tx.project.createMany({
          data: data.projects.map((project) => ({
            id: project.id,
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
          }))
        });
      }

      if (data.tasks.length) {
        await tx.projectTask.createMany({
          data: data.tasks.map((task) => ({
            id: task.id,
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
          }))
        });
      }

      if (data.risks.length) {
        await tx.risk.createMany({
          data: data.risks.map((risk) => ({
            id: risk.id,
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
          }))
        });
      }

      if (data.bugs.length) {
        await tx.bugReport.createMany({
          data: data.bugs.map((bug) => ({
            id: bug.id,
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
          }))
        });
      }

      const bugAttachments = data.bugs.flatMap((bug) =>
        (bug.attachments ?? []).map((attachment) => ({
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
      );

      if (bugAttachments.length) {
        await tx.bugAttachment.createMany({
          data: bugAttachments
        });
      }

      const bugFlowRecords = data.bugs.flatMap((bug) =>
        (bug.flowRecords ?? []).map((record) => ({
          id: record.id,
          bugId: bug.id,
          action: record.action,
          at: record.at,
          operator: record.operator,
          from: record.from,
          to: record.to,
          note: record.note
        }))
      );

      if (bugFlowRecords.length) {
        await tx.bugFlowRecord.createMany({
          data: bugFlowRecords
        });
      }

      if (data.requirementVersions.length) {
        await tx.requirementVersion.createMany({
          data: data.requirementVersions.map((version) => ({
            id: version.id,
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
          }))
        });
      }

      if (data.requirements.length) {
        await tx.requirement.createMany({
          data: data.requirements.map((requirement) => ({
            id: requirement.id,
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
          }))
        });
      }

      if (data.documents.length) {
        await tx.documentItem.createMany({
          data: data.documents.map((document) => ({
            id: document.id,
            workspaceId: getWorkspaceId(document),
            title: document.title,
            type: document.type,
            updatedAt: document.updatedAt,
            aiSummary: document.aiSummary
          }))
        });
      }

      if (data.weeklyInsight.length) {
        const workspaceId = data.workspaces[0]?.id ?? "ws-default";

        await tx.weeklyInsight.createMany({
          data: data.weeklyInsight.map((content, index) => ({
            id: `weekly-${workspaceId}-${index}`,
            workspaceId,
            content,
            sortOrder: index
          }))
        });
      }
    },
    // 首次初始化仍保持一个事务，避免只写入部分表；批量插入后实际执行时间会远低于逐条 upsert。
    DASHBOARD_SYNC_TRANSACTION_OPTIONS
  );
}
