import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { runDashboardSideEffectWorker } from "@/lib/dashboard-side-effects";
import { getPrismaClient } from "@/lib/database/prisma";

// worker 直接由 pnpm 脚本启动，不经过 Next.js env loader；显式加载本地和部署 env，避免误连默认数据库。
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const workerId = `dashboard-side-effect-${process.pid}-${randomUUID().slice(0, 8)}`;

async function main() {
  console.log(`[dashboard-side-effect-worker] started: ${workerId}`);
  await runDashboardSideEffectWorker(workerId);
}

main().catch(async (error) => {
  console.error("[dashboard-side-effect-worker] fatal", error);
  await getPrismaClient().$disconnect();
  process.exit(1);
});
