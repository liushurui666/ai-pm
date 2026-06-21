import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
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

function createJobId() {
  return `dashboardSideEffect-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function asPayload(value: Prisma.JsonValue | string): DashboardSideEffectPayload {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Prisma.JsonValue;

      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as DashboardSideEffectPayload : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? value as DashboardSideEffectPayload : {};
}

function toClaimedJob(job: {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  jobType: ClaimedDashboardSideEffectJob["jobType"];
  dedupeKey?: string | null;
  payload: Prisma.JsonValue | string;
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
      const payload = JSON.stringify(input.payload ?? {});
      const now = new Date();

      // 兜底队列故意使用原生 SQL，不走 `prisma.dashboardSideEffectJob` delegate。
      // 本地/线上如果还没重启或重新 generate Prisma Client，delegate 可能不存在；原生 SQL 只要求迁移表存在，能避免通知入队被旧 client 卡住。
      await prisma.$executeRaw`
        INSERT INTO dashboard_side_effect_jobs (
          id,
          workspaceId,
          entityType,
          entityId,
          jobType,
          dedupeKey,
          payload,
          priority,
          nextRunAt,
          status,
          createdAt,
          updatedAt
        )
        VALUES (
          ${createJobId()},
          ${input.workspaceId},
          ${input.entityType},
          ${input.entityId},
          ${input.jobType},
          ${dedupeKey},
          ${payload},
          ${input.priority ?? 0},
          ${input.nextRunAt ?? null},
          ${"queued"},
          ${now},
          ${now}
        )
        ON DUPLICATE KEY UPDATE
          payload = VALUES(payload),
          priority = VALUES(priority),
          nextRunAt = VALUES(nextRunAt),
          status = VALUES(status),
          lockedAt = NULL,
          lockedBy = NULL,
          error = NULL,
          updatedAt = VALUES(updatedAt)
      `;
      const [job] = await prisma.$queryRaw<Array<{ id: string; dedupeKey: string | null }>>`
        SELECT id, dedupeKey
        FROM dashboard_side_effect_jobs
        WHERE dedupeKey = ${dedupeKey}
        LIMIT 1
      `;

      if (!job) {
        throw new Error("Dashboard 副作用任务入队后未能读取任务记录。");
      }

      return {
        id: job.id,
        dedupeKey: job.dedupeKey ?? undefined
      };
    },

    async claimNext(workerId) {
      const now = new Date();
      const staleLockedAt = new Date(now.getTime() - getDashboardSideEffectSettings().jobLockMs);

      // Worker 如果在 running 状态崩溃，会留下锁；抢任务前释放过期锁，避免通知或补偿永久卡住。
      await prisma.$executeRaw`
        UPDATE dashboard_side_effect_jobs
        SET status = ${"queued"}, lockedAt = NULL, lockedBy = NULL, updatedAt = ${now}
        WHERE status = ${"running"} AND lockedAt < ${staleLockedAt}
      `;
      const [candidate] = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM dashboard_side_effect_jobs
        WHERE status = ${"queued"} AND (nextRunAt IS NULL OR nextRunAt <= ${now})
        ORDER BY priority DESC, createdAt ASC
        LIMIT 1
      `;

      if (!candidate) {
        return undefined;
      }

      const claimed = await prisma.$executeRaw`
        UPDATE dashboard_side_effect_jobs
        SET status = ${"running"}, lockedAt = ${now}, lockedBy = ${workerId}, error = NULL, updatedAt = ${now}
        WHERE id = ${candidate.id} AND status = ${"queued"}
      `;

      if (claimed === 0) {
        return undefined;
      }

      const [job] = await prisma.$queryRaw<Array<{
        id: string;
        workspaceId: string;
        entityType: string;
        entityId: string;
        jobType: ClaimedDashboardSideEffectJob["jobType"];
        payload: Prisma.JsonValue | string;
        retryCount: number;
        maxRetries: number;
      }>>`
        SELECT id, workspaceId, entityType, entityId, jobType, payload, retryCount, maxRetries
        FROM dashboard_side_effect_jobs
        WHERE id = ${candidate.id}
        LIMIT 1
      `;

      return job ? toClaimedJob(job) : undefined;
    },

    async complete(jobId) {
      await prisma.$executeRaw`
        UPDATE dashboard_side_effect_jobs
        SET status = ${"succeeded"}, lockedAt = NULL, lockedBy = NULL, error = NULL, updatedAt = ${new Date()}
        WHERE id = ${jobId}
      `;
    },

    async fail(jobId, error, options) {
      const [current] = await prisma.$queryRaw<Array<{ retryCount: number; maxRetries: number }>>`
        SELECT retryCount, maxRetries
        FROM dashboard_side_effect_jobs
        WHERE id = ${jobId}
        LIMIT 1
      `;

      if (!current) {
        return;
      }

      const retryCount = current.retryCount + 1;
      const shouldRetry = !options?.terminal && retryCount <= current.maxRetries;

      await prisma.$executeRaw`
        UPDATE dashboard_side_effect_jobs
        SET
          status = ${shouldRetry ? "queued" : "failed"},
          retryCount = ${retryCount},
          nextRunAt = ${shouldRetry ? options?.retryAt ?? new Date(Date.now() + Math.min(30 * 60_000, 2 ** retryCount * 30_000)) : null},
          lockedAt = NULL,
          lockedBy = NULL,
          error = ${error},
          updatedAt = ${new Date()}
        WHERE id = ${jobId}
      `;
    }
  };
}
