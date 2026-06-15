import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { config as loadEnv } from "dotenv";
import { processAssistantActionJobs } from "@/lib/ai/assistant-action-jobs";
import { getPrismaClient } from "@/lib/database/prisma";

// worker 直接由 pnpm 脚本启动，不经过 Next.js 的 env loader；显式加载本地和部署 env，避免误连默认数据库。
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const workerId = `assistant-action-${process.pid}-${randomUUID().slice(0, 8)}`;
const workerOnce = process.env.ASSISTANT_ACTION_WORKER_ONCE === "true";

function readPositiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const pollMs = readPositiveNumberEnv("ASSISTANT_ACTION_WORKER_POLL_MS", 1_000);
  const batchLimit = readPositiveNumberEnv("ASSISTANT_ACTION_WORKER_BATCH_LIMIT", 5);

  console.log(`[assistant-action-worker] started: ${workerId}`);

  while (true) {
    const handled = await processAssistantActionJobs({
      workerId,
      limit: batchLimit
    });

    if (workerOnce) {
      await getPrismaClient().$disconnect();
      break;
    }

    // 动作队列面向用户交互，轮询间隔比索引 worker 更短；没有任务时仍休眠，避免空转打数据库。
    if (!handled) {
      await sleep(pollMs);
    }
  }
}

main().catch((error) => {
  console.error("[assistant-action-worker] fatal", error);
  process.exit(1);
});
