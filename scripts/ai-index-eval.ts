import "dotenv/config";
import { runKnowledgeRetrievalEval } from "@/lib/ai/knowledge/eval";

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

main().catch((error) => {
  console.error("[ai-index-eval] failed", error);
  process.exit(1);
});
