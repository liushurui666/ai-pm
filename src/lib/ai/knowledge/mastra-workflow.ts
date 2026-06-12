import type { ClaimedIndexJob, IndexQueuePort, WorkflowPort } from "@/lib/ai/knowledge/ports";
import { getPrismaClient } from "@/lib/database/prisma";
import { embedPendingChunks } from "@/lib/ai/knowledge/embedding-workflow";
import { indexBusinessEntity, rebuildBusinessSource, syncFeishuDocument } from "@/lib/ai/knowledge/source-builders";

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
        await (handlers.indexEntity ?? ((nextJob) => indexBusinessEntity(nextJob, queue)))(job);
        break;
      case "sync_feishu":
        await (handlers.syncFeishu ?? ((nextJob) => syncFeishuDocument(nextJob, queue)))(job);
        break;
      case "embed_chunks":
        await (handlers.embedChunks ?? embedPendingChunks)(job);
        break;
      case "rebuild_source":
        await (handlers.rebuildSource ?? ((nextJob) => rebuildBusinessSource(nextJob, queue)))(job);
        break;
      case "cleanup_source":
        if (!handlers.cleanupSource) {
          throw new Error("索引清理 workflow 尚未接入处理器");
        }
        await handlers.cleanupSource(job);
        break;
      default:
        throw new Error(`未知 AI 索引任务类型：${job.jobType}`);
    }
  }

  return {
    async runIndexJob(job) {
      // workflow 只负责编排和路由；未接入的步骤必须显式失败进入队列重试/封存，
      // 不能假装成功，否则后台索引会出现“任务成功但 chunk 仍未 embedding”的隐性数据缺口。
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
