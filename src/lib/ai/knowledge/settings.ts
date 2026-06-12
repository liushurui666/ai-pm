const DEFAULT_EMBEDDING_MODEL = "text-embedding-v4";
const DEFAULT_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_QDRANT_COLLECTION = "ai_pm_knowledge_chunks";
const DEFAULT_INDEX_JOB_LOCK_MS = 10 * 60 * 1000;

function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// 知识索引配置集中读取，避免 worker、API route 和 adapter 各自散落环境变量名。
// 默认值选择百炼 embedding + Qdrant 常规 collection，部署时只需补充连接地址和密钥。
export function getKnowledgeSettings() {
  return {
    embeddingModel: process.env.AI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: readNumberEnv("AI_EMBEDDING_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS),
    qdrantUrl: process.env.QDRANT_URL?.trim() || "",
    qdrantApiKey: process.env.QDRANT_API_KEY?.trim() || "",
    qdrantCollection: process.env.QDRANT_COLLECTION?.trim() || DEFAULT_QDRANT_COLLECTION,
    redisUrl: process.env.REDIS_URL?.trim() || "",
    indexJobLockMs: readNumberEnv("AI_INDEX_JOB_LOCK_MS", DEFAULT_INDEX_JOB_LOCK_MS),
    indexWorkerPollMs: readNumberEnv("AI_INDEX_WORKER_POLL_MS", 5_000)
  };
}
