import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { getDashboardSideEffectSettings } from "@/lib/dashboard-side-effects/settings";
import type {
  ClaimedDashboardSideEffectJob,
  DashboardSideEffectPayload,
  DashboardSideEffectQueuePort,
  EnqueueDashboardSideEffectJobInput
} from "@/lib/dashboard-side-effects/ports";

type BullMqDashboardSideEffectJobData = {
  workspaceId: string;
  entityType: string;
  entityId: string;
  jobType: ClaimedDashboardSideEffectJob["jobType"];
  payload: DashboardSideEffectPayload;
};
type BullMqDashboardSideEffectJobName = ClaimedDashboardSideEffectJob["jobType"];

type BullMqWorkerOptions = {
  workerId: string;
  onJob: (job: ClaimedDashboardSideEffectJob) => Promise<void>;
};

let producerQueue: Queue<BullMqDashboardSideEffectJobData, void, BullMqDashboardSideEffectJobName> | undefined;

function createDefaultDedupeKey(input: EnqueueDashboardSideEffectJobInput) {
  return `${input.workspaceId}:${input.entityType}:${input.entityId}:${input.jobType}`.slice(0, 191);
}

function toBullMqJobId(dedupeKey: string) {
  return dedupeKey.replace(/[:\s]+/g, "__").slice(0, 191);
}

function createRedisConnection(): ConnectionOptions {
  const settings = getDashboardSideEffectSettings();

  if (!settings.redisUrl) {
    throw new Error("缺少 REDIS_URL，无法启用 BullMQ Dashboard 副作用队列。");
  }

  const url = new URL(settings.redisUrl);
  const dbText = url.pathname.replace("/", "");
  const db = dbText ? Number(dbText) : undefined;

  // BullMQ Worker 的底层阻塞连接要求关闭 maxRetriesPerRequest；和 RAG 队列保持同一解析策略。
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

  // 业务侧沿用“数字越大越优先”；BullMQ 是数字越小越优先，这里统一翻转。
  return Math.max(1, 2_097_152 - Math.trunc(priority));
}

function toClaimedJob(job: Job<BullMqDashboardSideEffectJobData>): ClaimedDashboardSideEffectJob {
  return {
    id: String(job.id ?? job.name),
    workspaceId: job.data.workspaceId,
    entityType: job.data.entityType,
    entityId: job.data.entityId,
    jobType: job.data.jobType,
    payload: job.data.payload,
    retryCount: job.attemptsMade,
    maxRetries: typeof job.opts.attempts === "number" ? job.opts.attempts : 1
  };
}

export function isBullMqDashboardSideEffectQueueEnabled() {
  return Boolean(getDashboardSideEffectSettings().redisUrl);
}

export function createBullMqDashboardSideEffectQueue(): DashboardSideEffectQueuePort {
  const settings = getDashboardSideEffectSettings();

  if (!producerQueue) {
    // Web/API 每次业务保存都会入队；producer 必须复用 Redis 连接，避免连接数随请求上涨。
    producerQueue = new Queue<BullMqDashboardSideEffectJobData, void, BullMqDashboardSideEffectJobName>(settings.queueName, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 30_000
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 2_000
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
        throw new Error("BullMQ Dashboard 副作用 producer queue 初始化失败。");
      }

      const job = await queue.add(input.jobType, {
        workspaceId: input.workspaceId,
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

export async function runBullMqDashboardSideEffectWorker({ onJob, workerId }: BullMqWorkerOptions) {
  const settings = getDashboardSideEffectSettings();
  const worker = new Worker<BullMqDashboardSideEffectJobData, void, BullMqDashboardSideEffectJobName>(settings.queueName, async (job) => {
    await onJob(toClaimedJob(job));
  }, {
    connection: createRedisConnection(),
    concurrency: settings.workerConcurrency,
    lockDuration: settings.jobLockMs
  });

  worker.on("completed", (job) => {
    console.log(`[dashboard-side-effect-worker] BullMQ job ${job.id} completed (${job.name})`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[dashboard-side-effect-worker] BullMQ job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });
  worker.on("error", (error) => {
    console.error("[dashboard-side-effect-worker] BullMQ worker error", error);
  });

  await worker.waitUntilReady();
  console.log(`[dashboard-side-effect-worker] BullMQ worker ready: ${workerId}, queue=${settings.queueName}`);

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      await worker.close();
      resolve();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
