import { config as loadEnv } from "dotenv";
import { runKnowledgeRetrievalEval } from "@/lib/ai/knowledge/eval";
import { getPrismaClient } from "@/lib/database/prisma";

// eval 是本地/上线后验收命令，必须显式模拟 Next 的 env 加载顺序。
// 如果只读取 .env，会在开发机漏掉 .env.local 里的数据库、百炼和 Qdrant 配置，导致评测结果失真。
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

function readPositiveInt(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

async function main() {
  const workspaceId = process.env.AI_INDEX_EVAL_WORKSPACE_ID?.trim() || process.env.WORKSPACE_ID?.trim();

  if (!workspaceId) {
    throw new Error("请设置 AI_INDEX_EVAL_WORKSPACE_ID 或 WORKSPACE_ID 后再运行知识索引评测。");
  }

  const result = await runKnowledgeRetrievalEval({
    workspaceId,
    limit: readPositiveInt("AI_INDEX_EVAL_CASE_LIMIT", 20),
    topK: readPositiveInt("AI_INDEX_EVAL_TOP_K", 5)
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("[ai-index-eval] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // eval 会读取 source、写 trace，并复用项目 Prisma 单例；脚本结束前主动断开，
    // 否则命令虽然已打印评测结果，但 Node 进程会因为连接池存活而无法自然退出。
    await getPrismaClient().$disconnect();
  });
