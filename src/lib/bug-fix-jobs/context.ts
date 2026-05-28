import { fromJsonStringArray } from "@/lib/database/json";
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
      // 腾讯云 MySQL 使用 JSON 保存数组型仓库规则，交给 Worker 前恢复为 string[]，保持安全检查逻辑单一。
      allowedPaths: fromJsonStringArray(job.repository.allowedPaths),
      blockedPaths: fromJsonStringArray(job.repository.blockedPaths),
      defaultReviewers: fromJsonStringArray(job.repository.defaultReviewers),
      status: job.repository.status,
      createdAt: job.repository.createdAt.toISOString(),
      updatedAt: job.repository.updatedAt.toISOString()
    }
  };
}

export function createBugFixPrompt(context: BugFixExecutionContext) {
  const { bug, repository } = context;
  // 这些规则会随每次 AI 自动修复任务一起下发，确保 Runner 生成的代码也遵守项目结构、注释和安全边界。
  const projectCodeGenerationRules = [
    "必须遵守仓库根目录 AI-CONSTRAINTS.md。",
    "React 组件必须使用 组件目录/index.tsx + 组件目录/index.less，禁止新增平铺组件文件。",
    "src/lib 工具代码必须按领域放入 ai、auth、database、documents、feishu、access、theme、reports、bug-fix-jobs、git-providers、requirements 等目录，禁止在 src/lib 根目录新增 .ts 工具文件。",
    "新增或修改代码必须补齐详细中文注释，说明业务意图、边界条件、关键取舍和不这样处理的风险。",
    "涉及数据库、权限、会话、第三方接口、AI Prompt、自动修复安全限制、时间版本负责人计算等逻辑时，必须写清楚中文注释。",
    "禁止新增只重复代码字面意思的空泛注释；除第三方协议名、API 字段名、命令、错误码等不可翻译内容外，不新增英文注释。"
  ];

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
    "项目级代码生成规则：",
    ...projectCodeGenerationRules.map((rule, index) => `${index + 1}. ${rule}`),
    "交付要求：",
    "1. 定位问题并直接修改代码。",
    "2. 保持改动最小化，禁止修改密钥、CI、部署和基础设施文件。",
    "3. 修改完成后输出 JSON，字段包含 summary、changedFiles、riskNotes。",
    "4. 如果无法修复，也必须退出非 0，让 Worker 标记失败。"
  ].join("\n");
}
