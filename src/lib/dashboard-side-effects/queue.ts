import {
  createBullMqDashboardSideEffectQueue,
  isBullMqDashboardSideEffectQueueEnabled
} from "@/lib/dashboard-side-effects/bullmq-queue";
import { createMySqlDashboardSideEffectQueue } from "@/lib/dashboard-side-effects/mysql-queue";
import type { DashboardSideEffectQueuePort } from "@/lib/dashboard-side-effects/ports";

// Dashboard 副作用任务统一入口：生产优先 Redis/BullMQ，本地没有 Redis 时自动落到 MySQL 兜底队列表。
export function createDashboardSideEffectQueue(): DashboardSideEffectQueuePort {
  if (isBullMqDashboardSideEffectQueueEnabled()) {
    return createBullMqDashboardSideEffectQueue();
  }

  return createMySqlDashboardSideEffectQueue();
}
