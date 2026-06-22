const DEFAULT_EMBEDDING_MODEL = "text-embedding-v4";
const DEFAULT_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_RERANK_MODEL = "qwen3-rerank";
const DEFAULT_RERANK_URL = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";
const DEFAULT_QDRANT_COLLECTION = "ai_pm_knowledge_chunks";
const DEFAULT_INDEX_QUEUE_NAME = "ai-pm-index";
const DEFAULT_INDEX_JOB_LOCK_MS = 10 * 60 * 1000;
const DEFAULT_INDEX_COMPENSATION_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_INDEX_COMPENSATION_DEDUPE_MS = 60 * 60 * 1000;

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
    rerankModel: process.env.AI_RERANK_MODEL?.trim() || DEFAULT_RERANK_MODEL,
    rerankUrl: process.env.AI_RERANK_URL?.trim() || DEFAULT_RERANK_URL,
    qdrantUrl: process.env.QDRANT_URL?.trim() || "",
    qdrantApiKey: process.env.QDRANT_API_KEY?.trim() || "",
    qdrantCollection: process.env.QDRANT_COLLECTION?.trim() || DEFAULT_QDRANT_COLLECTION,
    redisUrl: process.env.REDIS_URL?.trim() || "",
    indexQueueName: process.env.AI_INDEX_QUEUE_NAME?.trim() || DEFAULT_INDEX_QUEUE_NAME,
    indexJobLockMs: readNumberEnv("AI_INDEX_JOB_LOCK_MS", DEFAULT_INDEX_JOB_LOCK_MS),
    indexWorkerPollMs: readNumberEnv("AI_INDEX_WORKER_POLL_MS", 5_000),
    indexCompensationIntervalMs: readNumberEnv("AI_INDEX_COMPENSATION_INTERVAL_MS", DEFAULT_INDEX_COMPENSATION_INTERVAL_MS),
    indexCompensationDedupeMs: readNumberEnv("AI_INDEX_COMPENSATION_DEDUPE_MS", DEFAULT_INDEX_COMPENSATION_DEDUPE_MS),
    indexCompensationWorkspaceBatchSize: readNumberEnv("AI_INDEX_COMPENSATION_WORKSPACE_BATCH_SIZE", 20),
    indexCompensationEntityBatchSize: readNumberEnv("AI_INDEX_COMPENSATION_ENTITY_BATCH_SIZE", 50)
  };
}
