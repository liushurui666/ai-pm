import type { ClaimedIndexJob, IndexQueuePort, WorkflowPort } from "@/lib/ai/knowledge/ports";
import { getPrismaClient } from "@/lib/database/prisma";

type WorkflowHandlers = {
  indexEntity?: (job: ClaimedIndexJob) => Promise<void>;
  syncFeishu?: (job: ClaimedIndexJob) => Promise<void>;
  embedChunks?: (job: ClaimedIndexJob) => Promise<void>;
  rebuildSource?: (job: ClaimedIndexJob) => Promise<void>;
  cleanupSource?: (job: ClaimedIndexJob) => Promise<void>;
};

// Mastra 在 V1 中是强绑定的编排层，但当前第一批落地先把 workflow 的业务边界稳定下来。
// 这里不让业务页面直接依赖 Mastra SDK，而是通过 WorkflowPort 挂接具体步骤；等依赖安装稳定后，
// adapter 内部可以替换为真实 Mastra workflow，外部 worker 和 tools 不需要改。
export function createMastraKnowledgeWorkflow(queue: IndexQueuePort, handlers: WorkflowHandlers = {}): WorkflowPort {
  async function runIndexJob(job: ClaimedIndexJob) {
    switch (job.jobType) {
      case "index_entity":
        await handlers.indexEntity?.(job);
        break;
      case "sync_feishu":
        await handlers.syncFeishu?.(job);
        break;
      case "embed_chunks":
        await handlers.embedChunks?.(job);
        break;
      case "rebuild_source":
        await handlers.rebuildSource?.(job);
        break;
      case "cleanup_source":
        await handlers.cleanupSource?.(job);
        break;
      default:
        throw new Error(`未知 AI 索引任务类型：${job.jobType}`);
    }
  }

  return {
    async runIndexJob(job) {
      // 目前没有绑定具体 source builder 前，workflow 只负责把任务路由到可插拔 handler；
      // 如果 handler 还没实现，任务会被视为成功的 no-op，避免 V1 骨架部署后反复失败刷库。
      await runIndexJob(job);
    },

    async runWorkspaceRebuild({ workspaceId }) {
      const prisma = getPrismaClient();
      const sources = await prisma.aiIndexSource.findMany({
        where: {
          workspaceId,
          status: {
            not: "disabled"
          }
        },
        select: {
          id: true,
          entityType: true,
          entityId: true
        }
      });
      const jobs = await Promise.all(
        sources.map((source) => queue.enqueue({
          workspaceId,
          sourceId: source.id,
          entityType: source.entityType,
          entityId: source.entityId,
          jobType: "rebuild_source",
          dedupeKey: `${workspaceId}:${source.id}:rebuild_source`,
          priority: 10,
          payload: {
            scope: "workspace",
            sourceId: source.id
          }
        }))
      );

      return {
        enqueued: jobs.length
      };
    }
  };
}
