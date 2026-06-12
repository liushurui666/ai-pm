import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { ClaimedIndexJob, IndexQueuePort, WorkflowPort } from "@/lib/ai/knowledge/ports";
import { getPrismaClient } from "@/lib/database/prisma";
import { embedPendingChunks } from "@/lib/ai/knowledge/embedding-workflow";
import { cleanupKnowledgeSource, indexBusinessEntity, rebuildBusinessSource, syncFeishuDocument } from "@/lib/ai/knowledge/source-builders";

type WorkflowHandlers = {
  indexEntity?: (job: ClaimedIndexJob) => Promise<void>;
  syncFeishu?: (job: ClaimedIndexJob) => Promise<void>;
  embedChunks?: (job: ClaimedIndexJob) => Promise<void>;
  rebuildSource?: (job: ClaimedIndexJob) => Promise<void>;
  cleanupSource?: (job: ClaimedIndexJob) => Promise<void>;
};

const knowledgeMetadataSchema = z.record(z.string(), z.unknown());

const claimedIndexJobSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sourceId: z.string().optional(),
  entityType: z.enum(["version", "requirement", "bug", "task", "feishu_doc", "feishu_wiki"]),
  entityId: z.string(),
  jobType: z.enum(["index_entity", "sync_feishu", "embed_chunks", "rebuild_source", "cleanup_source"]),
  payload: knowledgeMetadataSchema,
  retryCount: z.number(),
  maxRetries: z.number()
});

const workflowResultSchema = z.object({
  ok: z.boolean()
});

const workspaceRebuildInputSchema = z.object({
  workspaceId: z.string(),
  requestedBy: z.string().optional()
});

const workspaceRebuildOutputSchema = z.object({
  enqueued: z.number()
});

async function assertMastraRunSucceeded<T>(result: unknown, fallback: T): Promise<T> {
  const payload = result as {
    status?: string;
    result?: T;
    error?: unknown;
  };

  if (payload.status === "success") {
    return payload.result ?? fallback;
  }

  throw new Error(`Mastra workflow 执行失败：${payload.status ?? "unknown"} ${payload.error ? JSON.stringify(payload.error) : ""}`.trim());
}

// Mastra 在 V1 中是强绑定的 workflow/agent 编排层。业务页面仍然不能直接依赖 Mastra，
// 只通过 WorkflowPort 调用；但 adapter 内部必须真实创建并启动 Mastra workflow，避免“只命名为 Mastra”的假接入。
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
        await (handlers.cleanupSource ?? cleanupKnowledgeSource)(job);
        break;
      default:
        throw new Error(`未知 AI 索引任务类型：${job.jobType}`);
    }
  }

  async function enqueueWorkspaceRebuild(workspaceId: string) {
    const prisma = getPrismaClient();
    const [sources, linkedRequirements] = await Promise.all([
      prisma.aiIndexSource.findMany({
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
      }),
      prisma.requirement.findMany({
        where: {
          workspaceId,
          documentLink: {
            not: null
          }
        },
        select: {
          id: true,
          title: true,
          project: true,
          versionId: true,
          versionName: true,
          documentLink: true
        }
      })
    ]);
    const rebuildJobs = sources.map((source) => queue.enqueue({
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
    }));
    const feishuJobs = linkedRequirements
      .filter((requirement) => requirement.documentLink?.trim())
      .map((requirement) => queue.enqueue({
        workspaceId,
        entityType: "feishu_doc",
        entityId: requirement.id,
        jobType: "sync_feishu",
        dedupeKey: `${workspaceId}:requirement:${requirement.id}:sync_feishu`,
        priority: 8,
        payload: {
          scope: "workspace_rebuild",
          requirementId: requirement.id,
          requirementTitle: requirement.title,
          versionId: requirement.versionId,
          versionName: requirement.versionName,
          project: requirement.project,
          documentLink: requirement.documentLink
        }
      }));
    const jobs = await Promise.all([...rebuildJobs, ...feishuJobs]);

    return {
      enqueued: jobs.length
    };
  }

  const runIndexJobStep = createStep({
    id: "run-index-job",
    inputSchema: claimedIndexJobSchema,
    outputSchema: workflowResultSchema,
    async execute({ inputData }) {
      await runIndexJob(inputData);

      return { ok: true };
    }
  });
  const indexJobWorkflow = createWorkflow({
    id: "ai-pm-knowledge-index-job",
    inputSchema: claimedIndexJobSchema,
    outputSchema: workflowResultSchema
  }).then(runIndexJobStep).commit();

  const rebuildWorkspaceStep = createStep({
    id: "enqueue-workspace-rebuild",
    inputSchema: workspaceRebuildInputSchema,
    outputSchema: workspaceRebuildOutputSchema,
    async execute({ inputData }) {
      return enqueueWorkspaceRebuild(inputData.workspaceId);
    }
  });
  const workspaceRebuildWorkflow = createWorkflow({
    id: "ai-pm-knowledge-workspace-rebuild",
    inputSchema: workspaceRebuildInputSchema,
    outputSchema: workspaceRebuildOutputSchema
  }).then(rebuildWorkspaceStep).commit();

  return {
    async runIndexJob(job) {
      // workflow 只负责编排和路由；未接入的步骤必须通过 Mastra run 显式失败进入队列重试/封存，
      // 不能假装成功，否则后台索引会出现“任务成功但 chunk 仍未 embedding”的隐性数据缺口。
      const run = await indexJobWorkflow.createRun();
      const result = await run.start({ inputData: job });

      await assertMastraRunSucceeded(result, { ok: true });
    },

    async runWorkspaceRebuild(input) {
      const run = await workspaceRebuildWorkflow.createRun();
      const result = await run.start({ inputData: input });

      return assertMastraRunSucceeded(result, { enqueued: 0 });
    }
  };
}
