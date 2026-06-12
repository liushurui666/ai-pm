import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { ClaimedIndexJob, EnqueueIndexJobInput, IndexQueuePort, KnowledgeMetadata } from "@/lib/ai/knowledge/ports";

function asMetadata(value: Prisma.JsonValue): KnowledgeMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as KnowledgeMetadata : {};
}

function createDefaultDedupeKey(input: EnqueueIndexJobInput) {
  return `${input.workspaceId}:${input.entityType}:${input.entityId}:${input.jobType}`.slice(0, 191);
}

function toClaimedJob(job: {
  id: string;
  workspaceId: string;
  sourceId: string | null;
  entityType: ClaimedIndexJob["entityType"];
  entityId: string;
  jobType: ClaimedIndexJob["jobType"];
  payload: Prisma.JsonValue;
  retryCount: number;
  maxRetries: number;
}): ClaimedIndexJob {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    sourceId: job.sourceId ?? undefined,
    entityType: job.entityType,
    entityId: job.entityId,
    jobType: job.jobType,
    payload: asMetadata(job.payload),
    retryCount: job.retryCount,
    maxRetries: job.maxRetries
  };
}

// MySQL 队列是 BullMQ/Redis 的兜底 adapter：它不是最终理想队列，但能让 RAG V1 的表结构、入队、
// 抢占、重试和 worker 协议先稳定下来。后续切到 BullMQ 时，业务层继续依赖 IndexQueuePort 即可。
export function createMySqlIndexQueue(): IndexQueuePort {
  const prisma = getPrismaClient();

  return {
    async enqueue(input) {
      const dedupeKey = input.dedupeKey ?? createDefaultDedupeKey(input);
      const payload = toJsonValue(input.payload ?? {});
      const job = await prisma.aiIndexJob.upsert({
        where: {
          dedupeKey
        },
        create: {
          workspaceId: input.workspaceId,
          sourceId: input.sourceId,
          entityType: input.entityType,
          entityId: input.entityId,
          jobType: input.jobType,
          dedupeKey,
          payload,
          priority: input.priority ?? 0,
          nextRunAt: input.nextRunAt,
          status: "pending"
        },
        update: {
          sourceId: input.sourceId,
          payload,
          priority: input.priority ?? 0,
          nextRunAt: input.nextRunAt,
          status: "pending",
          lockedAt: null,
          lockedBy: null,
          error: null
        }
      });

      return {
        id: job.id,
        dedupeKey: job.dedupeKey ?? undefined
      };
    },

    async claimNext(workerId) {
      const now = new Date();
      const staleLockedAt = new Date(now.getTime() - getKnowledgeSettings().indexJobLockMs);

      // Worker 异常退出时 running 任务会留下锁；每次抢任务前先释放过期锁，避免任务永久卡死。
      await prisma.aiIndexJob.updateMany({
        where: {
          status: "running",
          lockedAt: {
            lt: staleLockedAt
          }
        },
        data: {
          status: "pending",
          lockedAt: null,
          lockedBy: null
        }
      });

      const candidate = await prisma.aiIndexJob.findFirst({
        where: {
          status: "pending",
          OR: [
            {
              nextRunAt: null
            },
            {
              nextRunAt: {
                lte: now
              }
            }
          ]
        },
        orderBy: [
          {
            priority: "desc"
          },
          {
            createdAt: "asc"
          }
        ]
      });

      if (!candidate) {
        return undefined;
      }

      const claimed = await prisma.aiIndexJob.updateMany({
        where: {
          id: candidate.id,
          status: "pending"
        },
        data: {
          status: "running",
          lockedAt: now,
          lockedBy: workerId,
          error: null
        }
      });

      if (claimed.count === 0) {
        return undefined;
      }

      const job = await prisma.aiIndexJob.findUnique({
        where: {
          id: candidate.id
        }
      });

      return job ? toClaimedJob(job) : undefined;
    },

    async complete(jobId) {
      await prisma.aiIndexJob.update({
        where: {
          id: jobId
        },
        data: {
          status: "success",
          lockedAt: null,
          lockedBy: null,
          error: null
        }
      });
    },

    async fail(jobId, error, options) {
      const current = await prisma.aiIndexJob.findUnique({
        where: {
          id: jobId
        }
      });

      if (!current) {
        return;
      }

      const retryCount = current.retryCount + 1;
      const shouldRetry = !options?.terminal && retryCount <= current.maxRetries;

      await prisma.aiIndexJob.update({
        where: {
          id: jobId
        },
        data: {
          status: shouldRetry ? "pending" : "failed",
          retryCount,
          nextRunAt: shouldRetry ? options?.retryAt ?? new Date(Date.now() + Math.min(30 * 60_000, 2 ** retryCount * 60_000)) : null,
          lockedAt: null,
          lockedBy: null,
          error
        }
      });
    }
  };
}
