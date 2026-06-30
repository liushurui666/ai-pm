import { config as loadEnv } from "dotenv";
import { createMySqlIndexQueue } from "@/lib/ai/knowledge/mysql-index-queue";
import { createMySqlDashboardSideEffectQueue } from "@/lib/dashboard-side-effects/mysql-queue";
import { createNotificationPayload } from "@/lib/dashboard-side-effects/worker";
import { getPrismaClient } from "@/lib/database/prisma";
import {
  addBugFixJobCheck,
  appendBugFixJobLog,
  claimNextBugFixJob,
  createBugFixJob,
  failBugFixJob,
  getBugFixJob,
  listBugFixJobsByBug,
  updateBugFixJobStatus
} from "@/server/repositories/bug-fix-jobs";
import { createProjectRepository } from "@/server/repositories/project-repositories";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";

type SmokeBugFixJobListItem = {
  id: string;
};

function createRunLabel() {
  return `infra-e2e-${Date.now()}`;
}

function createLocalId(prefix: string, runLabel: string) {
  return `${prefix}-${runLabel}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 191);
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanupInfraSmoke(runLabel: string, ids: { bugId?: string; repositoryId?: string }) {
  const prisma = getPrismaClient();

  // 基础设施冒烟会直接触达队列表和 AI 修复仓储；清理时按外键反向删除，
  // 并且所有 where 都带 runLabel，避免误删真实业务任务或历史测试记录。
  await prisma.dashboardSideEffectJob.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      OR: [
        {
          dedupeKey: {
            contains: runLabel
          }
        },
        {
          entityId: {
            contains: runLabel
          }
        }
      ]
    }
  });
  await prisma.aiIndexJob.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      OR: [
        {
          dedupeKey: {
            contains: runLabel
          }
        },
        {
          entityId: {
            contains: runLabel
          }
        }
      ]
    }
  });

  if (ids.bugId) {
    await prisma.bugFixJob.deleteMany({
      where: {
        bugId: ids.bugId
      }
    });
    await prisma.bugReport.deleteMany({
      where: {
        id: ids.bugId,
        title: {
          contains: runLabel
        }
      }
    });
  }

  if (ids.repositoryId) {
    await prisma.projectRepository.deleteMany({
      where: {
        id: ids.repositoryId,
        repoFullName: {
          contains: runLabel
        }
      }
    });
  }
}

async function verifyWorkspaceExists() {
  const prisma = getPrismaClient();
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: WORKSPACE_ID
    },
    select: {
      id: true,
      name: true
    }
  });

  assertSmoke(workspace, `工作区 ${WORKSPACE_ID} 不存在，无法执行基础设施冒烟。`);

  return workspace;
}

async function smokeAiIndexQueue(runLabel: string) {
  const queue = createMySqlIndexQueue();
  const prisma = getPrismaClient();
  const workerId = `codex-index-${runLabel}`;
  const entityId = createLocalId("infra-index-task", runLabel);
  const dedupeKey = `${WORKSPACE_ID}:task:${entityId}:index_entity:${runLabel}`;
  const enqueued = await queue.enqueue({
    workspaceId: WORKSPACE_ID,
    entityType: "task",
    entityId,
    jobType: "index_entity",
    dedupeKey,
    priority: 1_000_000,
    payload: {
      source: "full-chain-infra-smoke",
      runLabel
    }
  });

  assertSmoke(enqueued.id, "AI 索引队列入队未返回任务 ID");
  assertSmoke(enqueued.dedupeKey === dedupeKey, "AI 索引队列 dedupeKey 未保持稳定");

  const claimed = await queue.claimNext(workerId);

  if (claimed && claimed.id !== enqueued.id) {
    // claimNext 是全局抢任务；如果环境里遗留了更高优先级真实任务，测试不能把它卡在 running。
    // 先把意外领取的任务恢复成 pending，再让脚本失败暴露测试环境队列不干净。
    await prisma.aiIndexJob.updateMany({
      where: {
        id: claimed.id,
        lockedBy: workerId,
        status: "running"
      },
      data: {
        status: "pending",
        lockedAt: null,
        lockedBy: null
      }
    });
  }
  assertSmoke(claimed?.id === enqueued.id, "AI 索引队列未能领取刚入队的测试任务");
  assertSmoke(claimed.payload.source === "full-chain-infra-smoke", "AI 索引队列 payload 读取异常");

  await queue.fail(claimed.id, "Codex infra smoke retry check", {
    retryAt: new Date(Date.now() - 1000)
  });

  const retried = await queue.claimNext(`${workerId}-retry`);

  assertSmoke(retried?.id === enqueued.id, "AI 索引队列失败后未按预期重新进入 pending");
  assertSmoke(retried.retryCount === 1, "AI 索引队列重试次数未更新");

  await queue.complete(retried.id);

  const completed = await prisma.aiIndexJob.findUnique({
    where: {
      id: enqueued.id
    },
    select: {
      retryCount: true,
      status: true
    }
  });

  assertSmoke(completed?.status === "success", "AI 索引队列 complete 未写入 success 状态");

  return {
    id: enqueued.id,
    retryCount: completed.retryCount,
    status: completed.status
  };
}

async function smokeDashboardSideEffectQueue(runLabel: string) {
  const prisma = getPrismaClient();
  const queue = createMySqlDashboardSideEffectQueue();
  const workerId = `codex-side-effect-${runLabel}`;
  const entityId = createLocalId("infra-side-effect", runLabel);
  const dedupeKey = `${WORKSPACE_ID}:infra:${entityId}:notify_owner:${runLabel}`;
  const futureRunAt = new Date(Date.now() + 60 * 60_000);
  const enqueued = await queue.enqueue({
    workspaceId: WORKSPACE_ID,
    entityType: "task",
    entityId,
    jobType: "notify_owner",
    dedupeKey,
    nextRunAt: futureRunAt,
    priority: 1_000_000,
    // 这里的目标不是测试真实通知发送，而是测试生产已实现的 Dashboard 副作用队列协议。
    // 使用 notify_owner 可以避开 schema 里预留但 worker 尚未实现的 job 类型；nextRunAt 先放到未来，
    // 等 inline worker 扫过空队列后再手动领取，确保不会误触发飞书或邮箱发送。
    payload: createNotificationPayload({
      targetIdentities: [`codex-infra-${runLabel}`],
      notificationScene: "taskAssigned",
      ownerName: `Codex 基础设施冒烟 ${runLabel}`,
      cardTitle: "Codex 基础设施冒烟",
      cardText: "这是一条仅用于验证队列协议的测试任务，不应真实发送。",
      view: "tasks",
      channelProvider: "feishu",
      channelId: `codex-infra-${runLabel}`
    })
  });

  assertSmoke(enqueued.id, "Dashboard 副作用队列入队未返回任务 ID");
  assertSmoke(enqueued.dedupeKey === dedupeKey, "Dashboard 副作用队列 dedupeKey 未保持稳定");

  // MySQL fallback enqueue 会异步调度一次 inline worker。测试任务先放到未来时间，
  // 等 inline worker 扫过空队列后再改成可领取，避免测试过程触发真实通知 worker。
  await new Promise((resolve) => setTimeout(resolve, 100));
  await prisma.dashboardSideEffectJob.update({
    where: {
      id: enqueued.id
    },
    data: {
      nextRunAt: null
    }
  });

  const claimed = await queue.claimNext(workerId);

  if (claimed && claimed.id !== enqueued.id) {
    // Dashboard 副作用队列也可能残留历史 queued 任务；冒烟脚本只验证自己的协议任务，
    // 意外领取到的任务必须立即还原，避免影响真实通知或后台补偿。
    await prisma.dashboardSideEffectJob.updateMany({
      where: {
        id: claimed.id,
        lockedBy: workerId,
        status: "running"
      },
      data: {
        status: "queued",
        lockedAt: null,
        lockedBy: null
      }
    });
  }
  assertSmoke(claimed?.id === enqueued.id, "Dashboard 副作用队列未能领取刚入队的测试任务");
  assertSmoke(claimed.jobType === "notify_owner", "Dashboard 副作用队列任务类型读取异常");
  assertSmoke(claimed.payload.ownerName === `Codex 基础设施冒烟 ${runLabel}`, "Dashboard 副作用队列 payload 读取异常");

  await queue.fail(claimed.id, "Codex infra smoke retry check", {
    retryAt: new Date(Date.now() - 1000)
  });

  const retried = await queue.claimNext(`${workerId}-retry`);

  assertSmoke(retried?.id === enqueued.id, "Dashboard 副作用队列失败后未按预期重新进入 queued");
  assertSmoke(retried.retryCount === 1, "Dashboard 副作用队列重试次数未更新");

  await queue.complete(retried.id);

  const completed = await prisma.dashboardSideEffectJob.findUnique({
    where: {
      id: enqueued.id
    },
    select: {
      retryCount: true,
      status: true
    }
  });

  assertSmoke(completed?.status === "succeeded", "Dashboard 副作用队列 complete 未写入 succeeded 状态");

  return {
    id: enqueued.id,
    retryCount: completed.retryCount,
    status: completed.status
  };
}

async function smokeBugFixRepository(runLabel: string) {
  const prisma = getPrismaClient();
  const bugId = createLocalId("bug", runLabel);
  const repository = await createProjectRepository({
    workspaceId: WORKSPACE_ID,
    repoFullName: `codex/${runLabel}`,
    cloneUrl: `https://example.com/codex/${runLabel}.git`,
    defaultBranch: "main",
    installCommand: "pnpm install",
    lintCommand: "pnpm lint",
    testCommand: "pnpm test",
    buildCommand: "pnpm build",
    allowedPaths: ["src/**", "app/**"],
    blockedPaths: [".env*", "node_modules/**"]
  });

  // Bug 修复任务仓储依赖真实 Bug 和仓库外键；这里创建一个完全隔离的临时 Bug，
  // 只验证任务生命周期和状态回写，不启动真正的代码修复 worker 或 Git 推送。
  await prisma.bugReport.create({
    data: {
      id: bugId,
      workspaceId: WORKSPACE_ID,
      title: `基础设施冒烟 Bug ${runLabel}`,
      status: "新建",
      severity: "一般",
      project: "Codex Infra Smoke",
      versionId: "rv-backlog",
      versionName: "未规划需求池",
      reporter: "Codex QA",
      owner: "Codex QA",
      environment: "local smoke",
      reproduction: "1. 创建 AI 修复任务\n2. 记录日志和检查\n3. 失败回写并清理",
      expected: "仓储生命周期可正常写入。",
      actual: "用于基础设施冒烟验证。",
      createdAt: new Date().toISOString(),
      flowRecords: {
        create: {
          id: createLocalId("bugFlow", runLabel),
          action: "created",
          at: new Date().toISOString(),
          operator: "Codex QA",
          to: "新建",
          note: "创建基础设施冒烟 Bug"
        }
      }
    }
  });

  const queuedBefore = await prisma.bugFixJob.count({
    where: {
      status: "queued"
    }
  });
  const job = await createBugFixJob({
    workspaceId: WORKSPACE_ID,
    bugId,
    repositoryId: repository.id,
    baseBranch: "main",
    requestedBy: "Codex QA"
  });

  assertSmoke(job.status === "queued", "Bug 修复任务创建后状态不是 queued");

  await appendBugFixJobLog(job.id, "基础设施冒烟写入日志");
  await addBugFixJobCheck({
    jobId: job.id,
    name: "lint",
    command: "pnpm lint",
    status: "passed",
    durationMs: 123,
    outputTail: "infra smoke passed"
  });

  let claimMode: "repository-claim" | "direct-status-update" = "direct-status-update";

  if (queuedBefore === 0) {
    const claimed = await claimNextBugFixJob();

    assertSmoke(claimed?.id === job.id, "Bug 修复任务领取到了非本次测试任务");
    claimMode = "repository-claim";
  } else {
    // 如果环境里已经有真实 queued 修复任务，冒烟脚本不抢全局队列，避免影响用户正在排队的修复任务。
    await updateBugFixJobStatus(job.id, "preparing", {
      fixBranch: `codex/${runLabel}`
    });
  }

  await failBugFixJob(job.id, "Codex infra smoke expected failure");

  const failedJob = await getBugFixJob(job.id);
  // Bug 修复仓储列表在脚本构建里可能被推成 any[]；此处只验证返回列表包含测试 job。
  const jobsByBug = await listBugFixJobsByBug(bugId) as SmokeBugFixJobListItem[];
  const bug = await prisma.bugReport.findUnique({
    where: {
      id: bugId
    },
    select: {
      aiFixError: true,
      aiFixLatestJobId: true,
      aiFixStatus: true
    }
  });

  assertSmoke(failedJob?.status === "failed", "Bug 修复任务失败状态未写入");
  assertSmoke((failedJob.logs ?? []).length >= 2, "Bug 修复任务日志未按预期写入");
  assertSmoke((failedJob.checks ?? []).length === 1, "Bug 修复任务检查结果未按预期写入");
  assertSmoke(jobsByBug.some((item) => item.id === job.id), "按 Bug 查询修复任务未返回测试任务");
  assertSmoke(bug?.aiFixLatestJobId === job.id, "Bug 未回写最新 AI 修复任务 ID");
  assertSmoke(bug?.aiFixStatus === "failed", "Bug 未回写 AI 修复失败状态");

  return {
    bugId,
    claimMode,
    id: job.id,
    repositoryId: repository.id,
    status: failedJob.status
  };
}

async function main() {
  const prisma = getPrismaClient();
  const runLabel = createRunLabel();
  const ids: { bugId?: string; repositoryId?: string } = {};
  const timings: Array<{ durationMs: number; step: string }> = [];
  let stepStartedAt = Date.now();

  function markStep(step: string) {
    const now = Date.now();

    timings.push({
      durationMs: now - stepStartedAt,
      step
    });
    stepStartedAt = now;
  }

  try {
    const workspace = await verifyWorkspaceExists();

    markStep("verify workspace");

    const aiIndexQueue = await smokeAiIndexQueue(runLabel);

    markStep("ai index queue");

    const dashboardSideEffectQueue = await smokeDashboardSideEffectQueue(runLabel);

    markStep("dashboard side effect queue");

    const bugFixRepository = await smokeBugFixRepository(runLabel);

    ids.bugId = bugFixRepository.bugId;
    ids.repositoryId = bugFixRepository.repositoryId;
    markStep("bug fix repository");

    const result = {
      ok: true,
      runLabel,
      workspace,
      aiIndexQueue,
      dashboardSideEffectQueue,
      bugFixRepository,
      timings
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await cleanupInfraSmoke(runLabel, ids);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[full-chain-infra-smoke] failed", error);
  process.exitCode = 1;
});
