import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createBullMqIndexQueue,
  createMastraKnowledgeWorkflow,
  createMySqlIndexQueue,
  isBullMqIndexQueueEnabled,
  runBullMqIndexWorker
} from "@/lib/ai/knowledge";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";

const workerId = `ai-index-${process.pid}-${randomUUID().slice(0, 8)}`;

async function runOnce() {
  const queue = createMySqlIndexQueue();
  const workflow = createMastraKnowledgeWorkflow(queue);
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

async function main() {
  const settings = getKnowledgeSettings();
  console.log(`[ai-index-worker] started: ${workerId}`);

  if (isBullMqIndexQueueEnabled()) {
    const queue = createBullMqIndexQueue();
    const workflow = createMastraKnowledgeWorkflow(queue);

    await runBullMqIndexWorker({
      workerId,
      onJob: (job) => workflow.runIndexJob(job)
    });
    return;
  }

  while (true) {
    const handled = await runOnce();

    // Worker 是后台常驻进程；没有任务时短暂休眠，避免空轮询打满 MySQL。
    if (!handled) {
      await sleep(settings.indexWorkerPollMs);
    }
  }
}

main().catch((error) => {
  console.error("[ai-index-worker] fatal", error);
  process.exit(1);
});
