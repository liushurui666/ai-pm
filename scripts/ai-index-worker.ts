import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { config as loadEnv } from "dotenv";
import {
  createBullMqIndexQueue,
  createMastraKnowledgeWorkflow,
  createMySqlIndexQueue,
  isBullMqIndexQueueEnabled,
  runKnowledgeIndexCompensation,
  runBullMqIndexWorker
} from "@/lib/ai/knowledge";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { IndexQueuePort, WorkflowPort } from "@/lib/ai/knowledge";

// worker 通常由 `pnpm ai-index:worker` 直接启动，不经过 Next.js 的 env 加载器。
// 本地测试和运维手工排查要与 Web/doctor 读取同一份配置，否则会误连默认 localhost MySQL。
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const workerId = `ai-index-${process.pid}-${randomUUID().slice(0, 8)}`;
const shutdownController = new AbortController();

function installShutdownSignalHandlers() {
  const shutdown = () => {
    shutdownController.abort();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function pause(ms: number) {
  try {
    await sleep(ms, undefined, {
      signal: shutdownController.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }

    throw error;
  }
}

async function runOnce(queue: IndexQueuePort, workflow: WorkflowPort) {
  const job = await queue.claimNext(workerId);

  if (!job) {
    return false;
  }

  try {
    await workflow.runIndexJob(job);
    await queue.complete(job.id);
    console.log(`[ai-index-worker] job ${job.id} completed (${job.jobType})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await queue.fail(job.id, message);
    console.error(`[ai-index-worker] job ${job.id} failed: ${message}`);
  }

  return true;
}

async function runMySqlFallbackLoop() {
  const settings = getKnowledgeSettings();
  const queue = createMySqlIndexQueue();
  const workflow = createMastraKnowledgeWorkflow(queue);

  // Redis/BullMQ 是主队列后，历史版本或降级期仍可能留下 MySQL fallback job。
  // 后台 worker 低频扫这张表，避免旧 pending/running 任务需要用户点“重建索引”才能恢复。
  while (!shutdownController.signal.aborted) {
    try {
      const handled = await runOnce(queue, workflow);

      if (!handled) {
        await pause(settings.indexWorkerPollMs);
      }
    } catch (error) {
      console.error("[ai-index-worker] mysql fallback loop failed", error);
      await pause(settings.indexWorkerPollMs);
    }
  }
}

async function runCompensationLoop(queue: IndexQueuePort) {
  const settings = getKnowledgeSettings();

  while (!shutdownController.signal.aborted) {
    try {
      await runKnowledgeIndexCompensation({
        queue,
        workerId
      });
    } catch (error) {
      console.error("[ai-index-worker] compensation failed", error);
    }

    await pause(settings.indexCompensationIntervalMs);
  }
}

async function main() {
  const settings = getKnowledgeSettings();
  installShutdownSignalHandlers();
  console.log(`[ai-index-worker] started: ${workerId}`);

  if (isBullMqIndexQueueEnabled()) {
    const queue = createBullMqIndexQueue();
    const workflow = createMastraKnowledgeWorkflow(queue);

    void runMySqlFallbackLoop();
    void runCompensationLoop(queue);

    await runBullMqIndexWorker({
      workerId,
      onJob: (job) => workflow.runIndexJob(job)
    });
    return;
  }

  const queue = createMySqlIndexQueue();
  const workflow = createMastraKnowledgeWorkflow(queue);
  let lastCompensationAt = 0;

  while (!shutdownController.signal.aborted) {
    const now = Date.now();

    if (now - lastCompensationAt >= settings.indexCompensationIntervalMs) {
      await runKnowledgeIndexCompensation({
        queue,
        workerId
      });
      lastCompensationAt = now;
    }

    const handled = await runOnce(queue, workflow);

    // Worker 是后台常驻进程；没有任务时短暂休眠，避免空轮询打满 MySQL。
    if (!handled) {
      await pause(settings.indexWorkerPollMs);
    }
  }
}

main().catch((error) => {
  console.error("[ai-index-worker] fatal", error);
  process.exit(1);
});
