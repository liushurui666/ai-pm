import { config as loadEnv } from "dotenv";
import {
  deleteDashboardProjectDatabase,
  deleteDashboardRequirementDatabase,
  deleteDashboardRequirementVersionDatabase
} from "@/data/database-dashboard";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";

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

function projectPayload(workspaceId: string, id: string, name: string) {
  return {
    id,
    workspaceId,
    name,
    owner: "删除冒烟",
    status: "进行中",
    startDate: "2026-07-01",
    progress: 0,
    health: 80,
    riskLevel: "低",
    healthStatus: "待评估",
    dueDate: "2026-08-01",
    team: 1,
    riskCount: 0,
    summary: "增量删除隔离验证",
    deliveryLabelCatalog: toJsonValue([]),
    milestones: toJsonValue([])
  };
}

function versionPayload(workspaceId: string, projectId: string, project: string, id: string, name: string) {
  return {
    id,
    workspaceId,
    name,
    project,
    projectId,
    type: "版本",
    status: "规划中",
    startDate: "2026-07-01",
    releaseDate: "2026-08-01",
    progress: 0,
    riskLevel: "低",
    healthStatus: "待评估",
    goal: "验证版本删除",
    deliveryLabelCatalog: toJsonValue([]),
    milestones: toJsonValue([])
  };
}

async function main() {
  const prisma = getPrismaClient();
  const runId = `pm-delete-${Date.now().toString(36)}`;
  const workspaceId = `ws-${runId}`;
  const projectId = `project-${runId}`;
  const duplicateProjectId = `project-duplicate-${runId}`;
  const repositoryProjectId = `project-repo-${runId}`;
  const sourceVersionId = `version-source-${runId}`;
  const siblingVersionAId = `version-a-${runId}`;
  const siblingVersionBId = `version-b-${runId}`;
  const requirementId = `requirement-${runId}`;
  const guardedRequirementId = `requirement-guard-${runId}`;
  const guardedTaskId = `task-guard-${runId}`;
  const sentinelDocumentId = `document-sentinel-${runId}`;
  const repositoryId = `repository-${runId}`;

  try {
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: runId,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
    await prisma.project.createMany({
      data: [
        projectPayload(workspaceId, projectId, `交付项目-${runId}`),
        projectPayload(workspaceId, repositoryProjectId, `仓库项目-${runId}`)
      ]
    });
    await prisma.requirementVersion.createMany({
      data: [
        versionPayload(workspaceId, projectId, `交付项目-${runId}`, sourceVersionId, "待删除版本"),
        versionPayload(workspaceId, projectId, `交付项目-${runId}`, siblingVersionAId, "迁移候选 A"),
        versionPayload(workspaceId, projectId, `交付项目-${runId}`, siblingVersionBId, "迁移候选 B")
      ]
    });
    await prisma.requirement.create({
      data: {
        id: requirementId,
        workspaceId,
        title: "版本引用需求",
        priority: "高",
        status: "待评审",
        project: `交付项目-${runId}`,
        projectId,
        versionId: sourceVersionId,
        versionName: "待删除版本",
        owner: "删除冒烟",
        developerMemberIds: toJsonValue([]),
        acceptance: "迁移后仍可读取",
        aiRisks: toJsonValue([]),
        aiMissingItems: toJsonValue([]),
        aiFrontendNotes: toJsonValue([]),
        aiBackendNotes: toJsonValue([]),
        aiTestingNotes: toJsonValue([])
      }
    });
    await prisma.documentItem.create({
      data: {
        id: sentinelDocumentId,
        workspaceId,
        title: "无关记录哨兵",
        type: "PRD",
        updatedAt: new Date().toISOString(),
        aiSummary: "任何项目/版本删除都不能误删此记录"
      }
    });

    await expectRejected(
      () => deleteDashboardRequirementVersionDatabase({
        fallbackVersionId: siblingVersionAId,
        versionId: sourceVersionId,
        workspaceId
      }),
      "多个可迁移版本"
    );
    assertSmoke(
      await prisma.requirementVersion.count({ where: { id: sourceVersionId, workspaceId } }) === 1,
      "多候选拒绝后源版本不应被删除。"
    );

    await prisma.requirementVersion.delete({ where: { id: siblingVersionBId } });
    await deleteDashboardRequirementVersionDatabase({
      fallbackVersionId: siblingVersionAId,
      versionId: sourceVersionId,
      workspaceId
    });
    const migratedRequirement = await prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { versionId: true }
    });

    assertSmoke(migratedRequirement?.versionId === siblingVersionAId, "版本引用没有迁移到唯一候选。");
    assertSmoke(
      await prisma.documentItem.count({ where: { id: sentinelDocumentId, workspaceId } }) === 1,
      "增量版本删除误删了无关文档。"
    );

    await prisma.requirement.create({
      data: {
        id: guardedRequirementId,
        workspaceId,
        title: "受任务保护需求",
        priority: "普通",
        status: "待评审",
        project: `交付项目-${runId}`,
        projectId,
        versionId: siblingVersionAId,
        versionName: "迁移候选 A",
        owner: "删除冒烟",
        developerMemberIds: toJsonValue([]),
        acceptance: "有任务时不能删除",
        aiRisks: toJsonValue([]),
        aiMissingItems: toJsonValue([]),
        aiFrontendNotes: toJsonValue([]),
        aiBackendNotes: toJsonValue([]),
        aiTestingNotes: toJsonValue([])
      }
    });
    await prisma.projectTask.create({
      data: {
        id: guardedTaskId,
        workspaceId,
        title: "需求引用任务",
        stage: "待处理",
        owner: "删除冒烟",
        project: `交付项目-${runId}`,
        projectId,
        versionId: siblingVersionAId,
        versionName: "迁移候选 A",
        requirementId: guardedRequirementId,
        requirementTitle: "受任务保护需求",
        priority: "普通",
        startDate: "2026-07-01",
        dueDate: "2026-07-10",
        aiHint: "无"
      }
    });
    await expectRejected(
      () => deleteDashboardRequirementDatabase({ requirementId: guardedRequirementId, workspaceId }),
      "仍关联 1 个任务"
    );

    await prisma.projectTask.delete({ where: { id: guardedTaskId } });
    await prisma.projectTask.create({
      data: {
        id: guardedTaskId,
        workspaceId,
        title: "历史需求引用任务",
        stage: "待处理",
        owner: "删除冒烟",
        project: `交付项目-${runId}`,
        projectId: null,
        versionId: siblingVersionAId,
        versionName: "迁移候选 A",
        requirementId: null,
        requirementTitle: "受任务保护需求",
        priority: "普通",
        startDate: "2026-07-01",
        dueDate: "2026-07-10",
        aiHint: "无"
      }
    });
    await expectRejected(
      () => deleteDashboardRequirementDatabase({ requirementId: guardedRequirementId, workspaceId }),
      "仍关联 1 个任务"
    );

    await prisma.project.create({
      data: projectPayload(workspaceId, duplicateProjectId, `交付项目-${runId}`)
    });
    await expectRejected(
      () => deleteDashboardRequirementDatabase({ requirementId: guardedRequirementId, workspaceId }),
      "项目名称不唯一"
    );

    await prisma.projectRepository.create({
      data: {
        id: repositoryId,
        workspaceId,
        projectId: repositoryProjectId,
        provider: "github",
        repoFullName: `codex/${runId}`,
        cloneUrl: `https://example.invalid/${runId}.git`,
        installCommand: "pnpm install",
        allowedPaths: toJsonValue([]),
        blockedPaths: toJsonValue([]),
        defaultReviewers: toJsonValue([])
      }
    });
    await expectRejected(
      () => deleteDashboardProjectDatabase({ projectId: repositoryProjectId, workspaceId }),
      "1 个代码仓库"
    );
    assertSmoke(
      await prisma.project.count({ where: { id: repositoryProjectId, workspaceId } }) === 1,
      "仓库保护失败后项目不应被删除。"
    );

    console.log(JSON.stringify({
      checked: 6,
      ok: true,
      results: [
        "多版本候选拒绝随机迁移",
        "唯一候选原子迁移且无关记录保留",
        "需求当前任务引用阻止删除",
        "需求 legacy 标题引用阻止删除",
        "需求 legacy 同名项目歧义拒绝",
        "项目代码仓库引用阻止删除"
      ]
    }, null, 2));
  } finally {
    // 所有测试数据都绑定独立工作区；按工作区级联清理，绝不触碰库内其他业务数据。
    await prisma.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

// MariaDB adapter 首次建连可能尚未创建可保持事件循环的 socket；显式 keep-alive 确保连接失败也会进入 catch，
// 避免 CI 把“Promise 尚未完成但进程自然退出”误报成空输出成功。
const smokeKeepAlive = setInterval(() => undefined, 1_000);

void main()
  .catch((error) => {
    console.error("[project-management-delete-smoke] failed", error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(smokeKeepAlive));
