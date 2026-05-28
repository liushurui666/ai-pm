import { getPrismaClient } from "@/lib/database/prisma";
import type { BugReport, ProjectRepository } from "@/types/dashboard";

export type BugFixExecutionContext = {
  bug: BugReport;
  repository: ProjectRepository;
};

export async function getBugFixExecutionContext(jobId: string): Promise<BugFixExecutionContext> {
  const prisma = getPrismaClient();
  const job = await prisma.bugFixJob.findUnique({
    where: {
      id: jobId
    },
    include: {
      bug: {
        include: {
          attachments: true,
          flowRecords: {
            orderBy: {
              at: "asc"
            }
          }
        }
      },
      repository: true
    }
  });

  if (!job) {
    throw new Error("AI 修复任务不存在");
  }

  return {
    bug: {
      id: job.bug.id,
      workspaceId: job.bug.workspaceId,
      title: job.bug.title,
      status: job.bug.status as BugReport["status"],
      severity: job.bug.severity as BugReport["severity"],
      project: job.bug.project,
      versionId: job.bug.versionId ?? undefined,
      versionName: job.bug.versionName ?? undefined,
      reporter: job.bug.reporter,
      owner: job.bug.owner,
      ownerMemberId: job.bug.ownerMemberId ?? undefined,
      ownerOpenId: job.bug.ownerOpenId ?? undefined,
      ownerUnionId: job.bug.ownerUnionId ?? undefined,
      ownerUserId: job.bug.ownerUserId ?? undefined,
      ownerEmail: job.bug.ownerEmail ?? undefined,
      ownerAvatarUrl: job.bug.ownerAvatarUrl ?? undefined,
      environment: job.bug.environment,
      reproduction: job.bug.reproduction,
      expected: job.bug.expected,
      actual: job.bug.actual,
      attachments: job.bug.attachments.map((attachment) => ({
        id: attachment.id,
        key: attachment.key,
        name: attachment.name,
        url: attachment.url,
        type: attachment.type as "image" | "video",
        mimeType: attachment.mimeType,
        size: attachment.size,
        uploadedAt: attachment.uploadedAt
      })),
      flowRecords: job.bug.flowRecords.map((record) => ({
        id: record.id,
        action: record.action as NonNullable<BugReport["flowRecords"]>[number]["action"],
        at: record.at,
        operator: record.operator,
        from: record.from ?? undefined,
        to: record.to ?? undefined,
        note: record.note ?? undefined
      })),
      aiFix: job.bug.aiFixLatestJobId
        ? {
            latestJobId: job.bug.aiFixLatestJobId,
            status: job.bug.aiFixStatus ?? undefined,
            branch: job.bug.aiFixBranch ?? undefined,
            mrUrl: job.bug.aiFixMrUrl ?? undefined,
            summary: job.bug.aiFixSummary ?? undefined,
            error: job.bug.aiFixError ?? undefined,
            updatedAt: job.bug.aiFixUpdatedAt?.toISOString()
          }
        : undefined,
      createdAt: job.bug.createdAt
    },
    repository: {
      id: job.repository.id,
      workspaceId: job.repository.workspaceId,
      projectId: job.repository.projectId ?? undefined,
      provider: job.repository.provider,
      repoFullName: job.repository.repoFullName,
      cloneUrl: job.repository.cloneUrl,
      defaultBranch: job.repository.defaultBranch,
      packageManager: job.repository.packageManager as ProjectRepository["packageManager"],
      installCommand: job.repository.installCommand,
      lintCommand: job.repository.lintCommand ?? undefined,
      testCommand: job.repository.testCommand ?? undefined,
      buildCommand: job.repository.buildCommand ?? undefined,
      allowedPaths: job.repository.allowedPaths,
      blockedPaths: job.repository.blockedPaths,
      defaultReviewers: job.repository.defaultReviewers,
      status: job.repository.status,
      createdAt: job.repository.createdAt.toISOString(),
      updatedAt: job.repository.updatedAt.toISOString()
    }
  };
}

export function createBugFixPrompt(context: BugFixExecutionContext) {
  const { bug, repository } = context;

  return [
    "你是 AI PM 的自动修复执行器。必须直接修改当前 checkout 工作区代码，不能只输出修改建议。",
    `目标仓库：${repository.repoFullName}`,
    `Bug 标题：${bug.title}`,
    `严重程度：${bug.severity}`,
    `当前状态：${bug.status}`,
    `所属项目：${bug.project}`,
    `关联版本：${bug.versionName ?? "未关联版本"}`,
    `运行环境：${bug.environment}`,
    `复现步骤：${bug.reproduction}`,
    `预期结果：${bug.expected}`,
    `实际结果：${bug.actual}`,
    `附件：${bug.attachments?.map((attachment) => `${attachment.name}(${attachment.url})`).join("，") || "无"}`,
    "交付要求：",
    "1. 定位问题并直接修改代码。",
    "2. 保持改动最小化，禁止修改密钥、CI、部署和基础设施文件。",
    "3. 修改完成后输出 JSON，字段包含 summary、changedFiles、riskNotes。",
    "4. 如果无法修复，也必须退出非 0，让 Worker 标记失败。"
  ].join("\n");
}
