import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { ClaimedIndexJob, EnqueueIndexJobInput, IndexQueuePort, KnowledgeMetadata } from "@/lib/ai/knowledge/ports";

type BullMqIndexJobData = {
  workspaceId: string;
  sourceId?: string;
  entityType: ClaimedIndexJob["entityType"];
  entityId: string;
  jobType: ClaimedIndexJob["jobType"];
  payload: KnowledgeMetadata;
};
type BullMqIndexJobName = ClaimedIndexJob["jobType"];

type BullMqWorkerOptions = {
  workerId: string;
  onJob: (job: ClaimedIndexJob) => Promise<void>;
};

let producerQueue: Queue<BullMqIndexJobData, void, BullMqIndexJobName> | undefined;

function createDefaultDedupeKey(input: EnqueueIndexJobInput) {
  return `${input.workspaceId}:${input.entityType}:${input.entityId}:${input.jobType}`.slice(0, 191);
}

function toBullMqJobId(dedupeKey: string) {
  return dedupeKey.replace(/[:\s]+/g, "__").slice(0, 191);
}

function createRedisConnection(): ConnectionOptions {
  const settings = getKnowledgeSettings();

  if (!settings.redisUrl) {
    throw new Error("缺少 REDIS_URL，无法启用 BullMQ AI 索引队列。");
  }

  const url = new URL(settings.redisUrl);
  const dbText = url.pathname.replace("/", "");
  const db = dbText ? Number(dbText) : undefined;

  // BullMQ 的 Worker 使用阻塞连接，官方要求底层 ioredis 关闭 maxRetriesPerRequest。
  // 这里把 REDIS_URL 统一转成 BullMQ 可接受的连接对象，避免项目直接依赖 ioredis 造成版本类型冲突。
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    db: Number.isFinite(db) ? db : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  };
}

function toBullMqPriority(priority?: number) {
  if (!priority || priority <= 0) {
    return undefined;
  }

  // MySQL 兜底队列中 priority 越大越靠前；BullMQ 中数字越小越靠前。
  // 用固定上限反转，保证业务侧不用理解两套队列的优先级语义差异。
  return Math.max(1, 2_097_152 - Math.trunc(priority));
}

function toClaimedJob(job: Job<BullMqIndexJobData>): ClaimedIndexJob {
  return {
    id: String(job.id ?? job.name),
    workspaceId: job.data.workspaceId,
    sourceId: job.data.sourceId,
    entityType: job.data.entityType,
    entityId: job.data.entityId,
    jobType: job.data.jobType,
    payload: job.data.payload,
    retryCount: job.attemptsMade,
    maxRetries: typeof job.opts.attempts === "number" ? job.opts.attempts : 1
  };
}

export function isBullMqIndexQueueEnabled() {
  return Boolean(getKnowledgeSettings().redisUrl);
}

export function createBullMqIndexQueue(): IndexQueuePort {
  const settings = getKnowledgeSettings();

  if (!producerQueue) {
    // Web/API 进程会频繁入队，producer queue 必须复用同一个 Redis 连接；
    // 否则每次保存业务记录都创建连接，线上连接数会随请求数缓慢膨胀。
    producerQueue = new Queue<BullMqIndexJobData, void, BullMqIndexJobName>(settings.indexQueueName, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: {
          type: "exponential",
          delay: 60_000
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1_000
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 5_000
        }
      }
    });
  }

  return {
    async enqueue(input) {
      const dedupeKey = input.dedupeKey ?? createDefaultDedupeKey(input);
      const delay = input.nextRunAt ? Math.max(0, input.nextRunAt.getTime() - Date.now()) : undefined;
      const queue = producerQueue;

      if (!queue) {
        throw new Error("BullMQ producer queue 初始化失败。");
      }

      const job = await queue.add(input.jobType, {
        workspaceId: input.workspaceId,
        sourceId: input.sourceId,
        entityType: input.entityType,
        entityId: input.entityId,
        jobType: input.jobType,
        payload: input.payload ?? {}
      }, {
        jobId: toBullMqJobId(dedupeKey),
        delay,
        priority: toBullMqPriority(input.priority)
      });

      return {
        id: String(job.id ?? dedupeKey),
        dedupeKey
      };
    },

    async claimNext() {
      throw new Error("BullMQ 队列由 BullMQ Worker 主动消费，不支持手动 claimNext。");
    },

    async complete() {
      return;
    },

    async fail() {
      return;
    }
  };
}

export async function runBullMqIndexWorker({ onJob, workerId }: BullMqWorkerOptions) {
  const settings = getKnowledgeSettings();
  const worker = new Worker<BullMqIndexJobData, void, BullMqIndexJobName>(settings.indexQueueName, async (job) => {
    await onJob(toClaimedJob(job));
  }, {
    connection: createRedisConnection(),
    concurrency: Number(process.env.AI_INDEX_WORKER_CONCURRENCY || 2),
    lockDuration: settings.indexJobLockMs
  });

  worker.on("completed", (job) => {
    console.log(`[ai-index-worker] BullMQ job ${job.id} completed (${job.name})`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[ai-index-worker] BullMQ job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });
  worker.on("error", (error) => {
    console.error("[ai-index-worker] BullMQ worker error", error);
  });

  await worker.waitUntilReady();
  console.log(`[ai-index-worker] BullMQ worker ready: ${workerId}, queue=${settings.indexQueueName}`);

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      await worker.close();
      resolve();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
