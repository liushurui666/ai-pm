import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { getDashboardSideEffectSettings } from "@/lib/dashboard-side-effects/settings";
import type {
  ClaimedDashboardSideEffectJob,
  DashboardSideEffectPayload,
  DashboardSideEffectQueuePort,
  EnqueueDashboardSideEffectJobInput
} from "@/lib/dashboard-side-effects/ports";

function createDefaultDedupeKey(input: EnqueueDashboardSideEffectJobInput) {
  return `${input.workspaceId}:${input.entityType}:${input.entityId}:${input.jobType}`.slice(0, 191);
}

function asPayload(value: Prisma.JsonValue): DashboardSideEffectPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DashboardSideEffectPayload : {};
}

function toClaimedJob(job: {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  jobType: ClaimedDashboardSideEffectJob["jobType"];
  payload: Prisma.JsonValue;
  retryCount: number;
  maxRetries: number;
}): ClaimedDashboardSideEffectJob {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    entityType: job.entityType,
    entityId: job.entityId,
    jobType: job.jobType,
    payload: asPayload(job.payload),
    retryCount: job.retryCount,
    maxRetries: job.maxRetries
  };
}

// MySQL 队列是 Redis/BullMQ 不可用时的兜底；协议和 BullMQ adapter 保持一致，业务保存路径只依赖 Port。
export function createMySqlDashboardSideEffectQueue(): DashboardSideEffectQueuePort {
  const prisma = getPrismaClient();

  return {
    async enqueue(input) {
      const dedupeKey = input.dedupeKey ?? createDefaultDedupeKey(input);
      const payload = toJsonValue(input.payload ?? {});
      const job = await prisma.dashboardSideEffectJob.upsert({
        where: { dedupeKey },
        create: {
          workspaceId: input.workspaceId,
          entityType: input.entityType,
          entityId: input.entityId,
          jobType: input.jobType,
          dedupeKey,
          payload,
          priority: input.priority ?? 0,
          nextRunAt: input.nextRunAt,
          status: "queued"
        },
        update: {
          payload,
          priority: input.priority ?? 0,
          nextRunAt: input.nextRunAt,
          status: "queued",
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
      const staleLockedAt = new Date(now.getTime() - getDashboardSideEffectSettings().jobLockMs);

      // Worker 如果在 running 状态崩溃，会留下锁；抢任务前释放过期锁，避免通知或补偿永久卡住。
      await prisma.dashboardSideEffectJob.updateMany({
        where: {
          status: "running",
          lockedAt: { lt: staleLockedAt }
        },
        data: {
          status: "queued",
          lockedAt: null,
          lockedBy: null
        }
      });

      const candidate = await prisma.dashboardSideEffectJob.findFirst({
        where: {
          status: "queued",
          OR: [
            { nextRunAt: null },
            { nextRunAt: { lte: now } }
          ]
        },
        orderBy: [
          { priority: "desc" },
          { createdAt: "asc" }
        ]
      });

      if (!candidate) {
        return undefined;
      }

      const claimed = await prisma.dashboardSideEffectJob.updateMany({
        where: {
          id: candidate.id,
          status: "queued"
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

      const job = await prisma.dashboardSideEffectJob.findUnique({ where: { id: candidate.id } });

      return job ? toClaimedJob(job) : undefined;
    },

    async complete(jobId) {
      await prisma.dashboardSideEffectJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          lockedAt: null,
          lockedBy: null,
          error: null
        }
      });
    },

    async fail(jobId, error, options) {
      const current = await prisma.dashboardSideEffectJob.findUnique({ where: { id: jobId } });

      if (!current) {
        return;
      }

      const retryCount = current.retryCount + 1;
      const shouldRetry = !options?.terminal && retryCount <= current.maxRetries;

      await prisma.dashboardSideEffectJob.update({
        where: { id: jobId },
        data: {
          status: shouldRetry ? "queued" : "failed",
          retryCount,
          nextRunAt: shouldRetry ? options?.retryAt ?? new Date(Date.now() + Math.min(30 * 60_000, 2 ** retryCount * 30_000)) : null,
          lockedAt: null,
          lockedBy: null,
          error
        }
      });
    }
  };
}
