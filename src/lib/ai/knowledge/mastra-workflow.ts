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
    const enqueueRunId = Date.now();
    const [sources, versions, requirements, bugs, tasks, linkedRequirements] = await Promise.all([
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
          entityId: true,
          sourceType: true
        }
      }),
      prisma.requirementVersion.findMany({
        where: {
          workspaceId
        },
        select: {
          id: true
        }
      }),
      prisma.requirement.findMany({
        where: {
          workspaceId
        },
        select: {
          id: true
        }
      }),
      prisma.bugReport.findMany({
        where: {
          workspaceId
        },
        select: {
          id: true
        }
      }),
      prisma.projectTask.findMany({
        where: {
          workspaceId
        },
        select: {
          id: true
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

    // 重建入口必须覆盖“从未进入过 AI 索引的历史业务数据”。如果只扫描 ai_index_sources，
    // 新上线工作区会因为没有 source 而返回 0，导致用户以为已重建但 ChatBox 实际检索不到任何业务事实。
    const recordJobs = [
      ...versions.map((version) => ({
        entityType: "version" as const,
        entityId: version.id
      })),
      ...requirements.map((requirement) => ({
        entityType: "requirement" as const,
        entityId: requirement.id
      })),
      ...bugs.map((bug) => ({
        entityType: "bug" as const,
        entityId: bug.id
      })),
      ...tasks.map((task) => ({
        entityType: "task" as const,
        entityId: task.id
      }))
    ].map((record) => queue.enqueue({
      workspaceId,
      entityType: record.entityType,
      entityId: record.entityId,
      jobType: "index_entity" as const,
      // 重建请求需要成为独立的一轮后台任务；BullMQ 保留已完成 job 时，固定 jobId 会让重建被误判为重复。
      // 真正的无变化数据会在 source contentHash 阶段跳过重型 embedding。
      dedupeKey: `${workspaceId}:${record.entityType}:${record.entityId}:index_entity:${enqueueRunId}`,
      priority: 10,
      payload: {
        scope: "workspace_rebuild"
      }
    }));
    const feishuSourceRebuildJobs = sources
      .filter((source) => source.sourceType === "feishu_doc" || source.sourceType === "feishu_wiki")
      .map((source) => queue.enqueue({
        workspaceId,
        sourceId: source.id,
        entityType: source.entityType,
        entityId: source.entityId,
        jobType: "rebuild_source",
        dedupeKey: `${workspaceId}:${source.id}:rebuild_source:${enqueueRunId}`,
        priority: 9,
        payload: {
          scope: "workspace_rebuild",
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
        dedupeKey: `${workspaceId}:requirement:${requirement.id}:sync_feishu:${enqueueRunId}`,
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
    const jobs = await Promise.all([...recordJobs, ...feishuSourceRebuildJobs, ...feishuJobs]);

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
