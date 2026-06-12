import { createBullMqIndexQueue, isBullMqIndexQueueEnabled } from "@/lib/ai/knowledge/bullmq-index-queue";
import { createMySqlIndexQueue } from "@/lib/ai/knowledge/mysql-index-queue";
import type { IndexQueuePort } from "@/lib/ai/knowledge/ports";

// 这是业务写入、管理员重建和 workflow 内部二次入队的统一队列入口。
// V1 正式环境优先 BullMQ + Redis；本地或临时部署没有 Redis 时才降级 MySQL 队列表，业务层不感知 adapter 差异。
export function createIndexQueue(): IndexQueuePort {
  if (isBullMqIndexQueueEnabled()) {
    return createBullMqIndexQueue();
  }

  return createMySqlIndexQueue();
}
