import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createDashboardRecord, createDashboardWorkspace, getDashboardData } from "@/data/local-dashboard";
import { createMySqlIndexQueue } from "@/lib/ai/knowledge/mysql-index-queue";
import { createMastraKnowledgeWorkflow } from "@/lib/ai/knowledge/mastra-workflow";
import { getPrismaClient } from "@/lib/database/prisma";
import type { BugReport, FeishuUser, Requirement, RequirementVersion, Task } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

type AiIndexAdminCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

type PayloadScope = {
  scope?: unknown;
};

const repoRoot = process.cwd();
const statusRoutePath = path.join(repoRoot, "app/api/ai-index/status/route.ts");
const rebuildRoutePath = path.join(repoRoot, "app/api/ai-index/rebuild/route.ts");

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createRunLabel() {
  return `ai-index-admin-e2e-${Date.now()}`;
}

function createUser(runLabel: string): FeishuUser {
  return {
    authProvider: "github",
    authUserId: `auth_${runLabel}_owner`,
    email: `${runLabel}.owner@example.test`,
    name: `AI索引管理员 ${runLabel}`,
    openId: `ou_${runLabel}`,
    userId: `user_${runLabel}`
  };
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function runCheck(name: string, check: () => Record<string, unknown>): AiIndexAdminCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "AI 索引管理员链路冒烟失败"
      },
      name,
      ok: false
    };
  }
}

async function cleanupByRunLabel(runLabel: string, workspaceId?: string) {
  const prisma = getPrismaClient();

  // 脚本会创建临时工作区、业务记录、AI index source/job；优先按 workspaceId 级联删除，
  // 同时保留 runLabel 兜底，避免上次中断留下的孤立队列记录影响真实工作区。
  if (workspaceId) {
    await prisma.workspace.deleteMany({
      where: {
        id: workspaceId
      }
    });
  }

  await Promise.all([
    prisma.aiIndexJob.deleteMany({
      where: {
        OR: [
          { workspaceId: { contains: runLabel } },
          { entityId: { contains: runLabel } },
          { dedupeKey: { contains: runLabel } }
        ]
      }
    }),
    prisma.aiIndexSource.deleteMany({
      where: {
        OR: [
          { workspaceId: { contains: runLabel } },
          { entityId: { contains: runLabel } },
          { title: { contains: runLabel } }
        ]
      }
    }),
    prisma.dashboardMember.deleteMany({
      where: {
        OR: [
          { id: { contains: runLabel } },
          { email: { contains: runLabel } },
          { name: { contains: runLabel } }
        ]
      }
    }),
    prisma.workspace.deleteMany({
      where: {
        name: {
          contains: runLabel
        }
      }
    })
  ]);
}

async function seedWorkspaceRecords(runLabel: string, user: FeishuUser) {
  const prisma = getPrismaClient();
  const workspaceResult = await createDashboardWorkspace({
    description: "AI 索引管理员冒烟临时工作区，会在脚本结束清理。",
    name: `AI索引管理员冒烟 ${runLabel}`
  }, user);
  const workspaceId = workspaceResult.workspace.id;
  const projectName = `AI索引项目 ${runLabel}`;

  // 管理员重建必须覆盖“历史业务数据”而不依赖已有 source；这里按版本、需求、任务、Bug 各放一条记录。
  await createDashboardRecord("project", {
    dueDate: "2026-07-30",
    health: 88,
    name: projectName,
    owner: user.name,
    ownerEmail: user.email,
    progress: 35,
    riskCount: 1,
    status: "进行中",
    summary: "AI 索引管理员重建冒烟临时项目。"
  }, workspaceId, user);

  const versionResult = await createDashboardRecord("requirementVersion", {
    goal: "验证管理员重建可以扫描历史版本。",
    name: `AI索引版本 ${runLabel}`,
    project: projectName,
    releaseDate: "2026-07-20",
    startDate: "2026-06-25",
    status: "进行中"
  }, workspaceId, user);
  const version = versionResult.record as RequirementVersion;
  const requirementResult = await createDashboardRecord("requirement", {
    acceptance: "管理员重建后应为需求投递 index_entity，并为飞书文档投递 sync_feishu。",
    documentLink: `https://example.feishu.cn/docx/${runLabel}`,
    owner: user.name,
    ownerEmail: user.email,
    priority: "P0",
    project: projectName,
    status: "开发中",
    title: `AI索引需求 ${runLabel}`,
    versionId: version.id,
    versionName: version.name
  }, workspaceId, user);
  const requirement = requirementResult.record as Requirement;
  const taskResult = await createDashboardRecord("task", {
    aiHint: "管理员重建应为任务补索引。",
    dueDate: "2026-07-05",
    owner: user.name,
    ownerEmail: user.email,
    priority: "高",
    project: projectName,
    stage: "进行中",
    startDate: "2026-06-25",
    title: `AI索引任务 ${runLabel}`,
    versionId: version.id,
    versionName: version.name
  }, workspaceId, user);
  const task = taskResult.record as Task;
  const bugResult = await createDashboardRecord("bug", {
    actual: "需要管理员重建补索引。",
    environment: "local",
    expected: "入队 index_entity。",
    owner: user.name,
    ownerEmail: user.email,
    project: projectName,
    reporter: user.name,
    reproduction: "1. 创建临时 Bug\n2. 触发 workspace rebuild",
    severity: "严重",
    status: "定位中",
    title: `AI索引Bug ${runLabel}`,
    versionId: version.id,
    versionName: version.name
  }, workspaceId, user);
  const bug = bugResult.record as BugReport;

  const feishuSource = await prisma.aiIndexSource.create({
    data: {
      workspaceId,
      versionId: version.id,
      entityType: "requirement",
      entityId: requirement.id,
      sourceProvider: "feishu",
      sourceType: "feishu_doc",
      title: `AI索引飞书源 ${runLabel}`,
      sourceUrl: `https://example.feishu.cn/docx/${runLabel}`,
      contentHash: "ai-index-admin-smoke-hash",
      status: "ready",
      metadata: {
        runLabel
      }
    }
  });
  const data = await getDashboardData(user, workspaceId);

  assertSmoke(data.meta?.permissions?.canManageMembers, "临时工作区创建者应具备管理员重建权限。");

  return {
    bug,
    feishuSource,
    requirement,
    task,
    version,
    workspace: workspaceResult.workspace
  };
}

function asPayloadScope(value: unknown): PayloadScope {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PayloadScope : {};
}

async function verifyWorkspaceRebuild() {
  const prisma = getPrismaClient();
  const runLabel = createRunLabel();
  const user = createUser(runLabel);
  let workspaceId = "";

  await cleanupByRunLabel(runLabel);

  try {
    const seeded = await seedWorkspaceRecords(runLabel, user);
    workspaceId = seeded.workspace.id;
    const queue = createMySqlIndexQueue();
    const workflow = createMastraKnowledgeWorkflow(queue);
    const beforeRebuildJobs = await prisma.aiIndexJob.count({
      where: {
        workspaceId
      }
    });
    const result = await workflow.runWorkspaceRebuild({
      requestedBy: user.authUserId,
      workspaceId
    });
    const jobs = await prisma.aiIndexJob.findMany({
      where: {
        workspaceId,
        payload: {
          // Prisma 7 + MySQL/MariaDB adapter 的 JSON path 使用字符串语法；
          // 数组 path 会在本地 MySQL 冒烟里直接触发 validation error。
          path: "$.scope",
          equals: "workspace_rebuild"
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const jobKeys = jobs.map((job) => `${job.entityType}:${job.jobType}:${job.entityId}`);
    const expectedKeys = [
      `version:index_entity:${seeded.version.id}`,
      `requirement:index_entity:${seeded.requirement.id}`,
      `task:index_entity:${seeded.task.id}`,
      `bug:index_entity:${seeded.bug.id}`,
      `requirement:rebuild_source:${seeded.requirement.id}`,
      `feishu_doc:sync_feishu:${seeded.requirement.id}`
    ];
    const missingKeys = expectedKeys.filter((key) => !jobKeys.includes(key));
    const syncFeishuJob = jobs.find((job) => job.jobType === "sync_feishu");
    const rebuildSourceJob = jobs.find((job) => job.jobType === "rebuild_source");

    // 管理员重建只应投递后台任务，不同步执行 embedding/Qdrant；断言 pending 可以避免误把 worker 逻辑塞进 API 路径。
    assertSmoke(result.enqueued === expectedKeys.length, `管理员重建入队数量不正确：expected=${expectedKeys.length}, actual=${result.enqueued}`);
    assertSmoke(!missingKeys.length, `管理员重建缺少任务：${missingKeys.join(", ")}`);
    assertSmoke(jobs.every((job) => job.status === "pending"), "管理员重建任务应保持 pending，等待 worker 异步消费。");
    assertSmoke(jobs.every((job) => asPayloadScope(job.payload).scope === "workspace_rebuild"), "管理员重建任务 payload.scope 应统一标记。");
    assertSmoke(syncFeishuJob?.payload && JSON.stringify(syncFeishuJob.payload).includes(seeded.requirement.title), "飞书文档同步 job 应携带需求上下文。");
    assertSmoke(rebuildSourceJob?.sourceId === seeded.feishuSource.id, "已有飞书 source 应投递 rebuild_source 并关联 sourceId。");

    return {
      beforeRebuildJobs,
      enqueued: result.enqueued,
      jobTypes: jobs.reduce<Record<string, number>>((accumulator, job) => {
        accumulator[job.jobType] = (accumulator[job.jobType] ?? 0) + 1;

        return accumulator;
      }, {}),
      workspaceId
    };
  } finally {
    await cleanupByRunLabel(runLabel, workspaceId);
  }
}

function verifyApiContracts() {
  const statusRoute = readText(statusRoutePath);
  const rebuildRoute = readText(rebuildRoutePath);

  // API route 正向权限目前依赖真实登录态；脚本用服务层跑重建，再用静态契约守住 route 的鉴权和只读状态查询。
  assertSmoke(statusRoute.includes("isAuthServiceConfigured() && !session"), "AI 索引状态接口缺少登录保护。");
  assertSmoke(rebuildRoute.includes("isAuthServiceConfigured() && !session"), "AI 索引重建接口缺少登录保护。");
  assertSmoke(statusRoute.includes("getWorkspaceAccessContext(session?.user, workspaceIdFromQuery)"), "AI 索引状态接口应使用轻量工作区访问上下文。");
  assertSmoke(rebuildRoute.includes("getWorkspaceAccessContext(session?.user, body?.workspaceId)"), "AI 索引重建接口应使用轻量工作区访问上下文。");
  assertSmoke(!statusRoute.includes("getDashboardData("), "AI 索引状态接口不应读取整份 dashboard。");
  assertSmoke(!rebuildRoute.includes("getDashboardData("), "AI 索引重建接口不应读取整份 dashboard。");
  assertSmoke(statusRoute.includes("canPerformAction(permissions, \"member:manage\")"), "AI 索引状态接口缺少管理员权限校验。");
  assertSmoke(rebuildRoute.includes("canPerformAction(permissions, \"member:manage\")"), "AI 索引重建接口缺少管理员权限校验。");
  assertSmoke(statusRoute.includes("countByStatus(sourceStatuses"), "AI 索引状态接口未统计 source 状态。");
  assertSmoke(statusRoute.includes("countByStatus(jobStatuses"), "AI 索引状态接口未统计 job 状态。");
  assertSmoke(rebuildRoute.includes("createMastraKnowledgeWorkflow(queue)"), "AI 索引重建接口未走 Mastra workflow。");
  assertSmoke(rebuildRoute.includes("runWorkspaceRebuild"), "AI 索引重建接口未调用 workspace rebuild。");
  assertSmoke(rebuildRoute.includes("requestedBy: session?.user?.authUserId"), "AI 索引重建接口未记录请求人 authUserId。");

  return {
    rebuildProtected: true,
    statusProtected: true,
    usesMastraWorkflow: true
  };
}

async function main() {
  const serviceResult = await verifyWorkspaceRebuild();
  const results = [
    {
      detail: serviceResult,
      name: "workspace rebuild service",
      ok: true
    },
    runCheck("api route contracts", verifyApiContracts)
  ];
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    checked: results.length,
    failed: failed.length,
    results
  }, null, 2));

  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[full-chain-ai-index-admin-smoke] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Mastra workflow 和 Prisma client 都可能留下数据库连接；冒烟脚本必须显式断开，
    // 否则命令已经输出成功结果但进程不退出，会让统一 suite 在该用例上超时。
    await getPrismaClient().$disconnect();
  });
