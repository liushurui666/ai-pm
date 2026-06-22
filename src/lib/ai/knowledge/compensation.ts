import { getPrismaClient } from "@/lib/database/prisma";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { EnqueueIndexJobInput, IndexQueuePort, KnowledgeEntityType } from "@/lib/ai/knowledge/ports";
import { parseFeishuDocumentLink } from "@/lib/requirements/feishu-document";

type CompensationOptions = {
  queue: IndexQueuePort;
  workerId: string;
  maxWorkspaces?: number;
  perEntityLimit?: number;
};

type CompensationResult = {
  workspaces: number;
  enqueued: number;
};

type SourceKey = `${KnowledgeEntityType}:${string}:${string}`;

function createSourceKey(entityType: KnowledgeEntityType, entityId: string, sourceType: string): SourceKey {
  return `${entityType}:${entityId}:${sourceType}`;
}

function getCompensationRunKey(now: Date) {
  const intervalMs = getKnowledgeSettings().indexCompensationDedupeMs;

  return Math.floor(now.getTime() / intervalMs);
}

function createCompensationDedupeKey(input: EnqueueIndexJobInput, now: Date) {
  const runKey = getCompensationRunKey(now);
  const sourcePart = input.sourceId ? `:${input.sourceId}` : "";

  return `${input.workspaceId}:${input.entityType}:${input.entityId}${sourcePart}:${input.jobType}:compensate:${runKey}`.slice(0, 191);
}

async function enqueueCompensationJob(queue: IndexQueuePort, input: EnqueueIndexJobInput, now: Date) {
  await queue.enqueue({
    ...input,
    dedupeKey: input.dedupeKey ?? createCompensationDedupeKey(input, now),
    payload: {
      scope: "auto_compensation",
      ...(input.payload ?? {})
    }
  });

  return 1;
}

function getFeishuSourceType(documentLink: string) {
  try {
    const parsed = parseFeishuDocumentLink(documentLink);

    if (parsed.type === "wiki") {
      return "feishu_wiki" as const;
    }

    if (parsed.type === "docx") {
      return "feishu_doc" as const;
    }
  } catch {
    // 自动补偿不能因为单条历史脏链接阻断整个工作区扫描；真正读取飞书正文时仍会在 job 内记录失败原因。
  }

  return undefined;
}

async function compensateWorkspace(input: {
  queue: IndexQueuePort;
  workspaceId: string;
  perEntityLimit: number;
  now: Date;
}) {
  const prisma = getPrismaClient();
  const staleSourceBefore = new Date(input.now.getTime() - getKnowledgeSettings().indexJobLockMs);
  const [sources, versions, requirements, bugs, tasks, staleSources] = await Promise.all([
    prisma.aiIndexSource.findMany({
      where: {
        workspaceId: input.workspaceId,
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
        workspaceId: input.workspaceId
      },
      take: input.perEntityLimit,
      select: {
        id: true
      }
    }),
    prisma.requirement.findMany({
      where: {
        workspaceId: input.workspaceId
      },
      take: input.perEntityLimit,
      select: {
        id: true,
        title: true,
        project: true,
        versionId: true,
        versionName: true,
        documentLink: true
      }
    }),
    prisma.bugReport.findMany({
      where: {
        workspaceId: input.workspaceId
      },
      take: input.perEntityLimit,
      select: {
        id: true
      }
    }),
    prisma.projectTask.findMany({
      where: {
        workspaceId: input.workspaceId
      },
      take: input.perEntityLimit,
      select: {
        id: true
      }
    }),
    prisma.aiIndexSource.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          {
            status: "failed"
          },
          {
            status: {
              in: ["pending", "indexing"]
            },
            updatedAt: {
              lt: staleSourceBefore
            }
          }
        ]
      },
      take: input.perEntityLimit,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        sourceType: true,
        sourceUrl: true
      }
    })
  ]);
  const sourceKeys = new Set(sources.map((source) => createSourceKey(source.entityType, source.entityId, source.sourceType)));
  let enqueued = 0;

  // 补偿扫描只处理“缺口”和“卡住”的索引源，不把重建按钮搬到后台无脑全量重建。
  // 这样既能覆盖历史数据/worker 崩溃，也避免每次扫描都重复消耗 embedding 和向量库写入成本。
  for (const version of versions) {
    if (!sourceKeys.has(createSourceKey("version", version.id, "record"))) {
      enqueued += await enqueueCompensationJob(input.queue, {
        workspaceId: input.workspaceId,
        entityType: "version",
        entityId: version.id,
        jobType: "index_entity",
        priority: 6
      }, input.now);
    }
  }

  for (const requirement of requirements) {
    if (!sourceKeys.has(createSourceKey("requirement", requirement.id, "record"))) {
      enqueued += await enqueueCompensationJob(input.queue, {
        workspaceId: input.workspaceId,
        entityType: "requirement",
        entityId: requirement.id,
        jobType: "index_entity",
        priority: 6
      }, input.now);
    }

    const documentLink = requirement.documentLink?.trim();
    const feishuEntityType = documentLink ? getFeishuSourceType(documentLink) : undefined;

    if (documentLink && feishuEntityType && !sourceKeys.has(createSourceKey(feishuEntityType, requirement.id, feishuEntityType))) {
      enqueued += await enqueueCompensationJob(input.queue, {
        workspaceId: input.workspaceId,
        entityType: feishuEntityType,
        entityId: requirement.id,
        jobType: "sync_feishu",
        priority: 5,
        payload: {
          requirementId: requirement.id,
          requirementTitle: requirement.title,
          versionId: requirement.versionId,
          versionName: requirement.versionName,
          project: requirement.project,
          documentLink
        }
      }, input.now);
    }
  }

  for (const bug of bugs) {
    if (!sourceKeys.has(createSourceKey("bug", bug.id, "record"))) {
      enqueued += await enqueueCompensationJob(input.queue, {
        workspaceId: input.workspaceId,
        entityType: "bug",
        entityId: bug.id,
        jobType: "index_entity",
        priority: 6
      }, input.now);
    }
  }

  for (const task of tasks) {
    if (!sourceKeys.has(createSourceKey("task", task.id, "record"))) {
      enqueued += await enqueueCompensationJob(input.queue, {
        workspaceId: input.workspaceId,
        entityType: "task",
        entityId: task.id,
        jobType: "index_entity",
        priority: 6
      }, input.now);
    }
  }

  for (const source of staleSources) {
    const isFeishuSource = source.sourceType === "feishu_doc" || source.sourceType === "feishu_wiki";

    enqueued += await enqueueCompensationJob(input.queue, {
      workspaceId: input.workspaceId,
      sourceId: source.id,
      entityType: source.entityType,
      entityId: source.entityId,
      jobType: isFeishuSource ? "rebuild_source" : "index_entity",
      priority: 4,
      payload: {
        sourceId: source.id,
        documentLink: source.sourceUrl ?? undefined
      }
    }, input.now);
  }

  return enqueued;
}

// AI 索引补偿只属于后台 worker 职责：业务写入仍只做轻量入队，普通页面也不暴露“同步/重建”按钮。
// 扫描器按工作区小批量发现缺失 source、失败 source 和长时间卡在 pending/indexing 的 source，再投递标准队列任务。
export async function runKnowledgeIndexCompensation(options: CompensationOptions): Promise<CompensationResult> {
  const prisma = getPrismaClient();
  const settings = getKnowledgeSettings();
  const now = new Date();
  const workspaces = await prisma.workspace.findMany({
    orderBy: {
      id: "asc"
    },
    take: options.maxWorkspaces ?? settings.indexCompensationWorkspaceBatchSize,
    select: {
      id: true
    }
  });
  let enqueued = 0;

  for (const workspace of workspaces) {
    enqueued += await compensateWorkspace({
      queue: options.queue,
      workspaceId: workspace.id,
      perEntityLimit: options.perEntityLimit ?? settings.indexCompensationEntityBatchSize,
      now
    });
  }

  if (enqueued > 0) {
    console.log(`[ai-index-worker] compensation enqueued ${enqueued} jobs by ${options.workerId}`);
  }

  return {
    workspaces: workspaces.length,
    enqueued
  };
}
