import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { chunkKnowledgeText, createContentHash } from "@/lib/ai/knowledge/chunking";
import type { ClaimedIndexJob, IndexQueuePort, KnowledgeEntityType, KnowledgeMetadata } from "@/lib/ai/knowledge/ports";

type BuiltKnowledgeSource = {
  workspaceId: string;
  projectId?: string;
  versionId?: string;
  entityType: KnowledgeEntityType;
  entityId: string;
  title: string;
  content: string;
  metadata: KnowledgeMetadata;
};

function compactLines(lines: Array<string | undefined | null | false>) {
  return lines
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .join("\n");
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return toJsonValue(value);
}

async function buildVersionSource(entityId: string, workspaceId: string): Promise<BuiltKnowledgeSource | undefined> {
  const prisma = getPrismaClient();
  const version = await prisma.requirementVersion.findFirst({
    where: {
      id: entityId,
      workspaceId
    }
  });

  if (!version) {
    return undefined;
  }

  return {
    workspaceId,
    projectId: version.project === "跨项目" ? undefined : version.project,
    versionId: version.id,
    entityType: "version",
    entityId: version.id,
    title: version.name,
    content: compactLines([
      `版本：${version.name}`,
      `状态：${version.status}`,
      `项目：${version.project}`,
      `周期：${version.startDate} 至 ${version.releaseDate}`,
      version.parentVersionName ? `父版本：${version.parentVersionName}` : undefined,
      version.productOwner ? `产品负责人：${version.productOwner}` : undefined,
      version.uiOwner ? `UI 负责人：${version.uiOwner}` : undefined,
      version.devOwner ? `研发负责人：${version.devOwner}` : undefined,
      `目标：${version.goal}`
    ]),
    metadata: {
      status: version.status,
      project: version.project,
      startDate: version.startDate,
      releaseDate: version.releaseDate
    }
  };
}

async function buildRequirementSource(entityId: string, workspaceId: string): Promise<BuiltKnowledgeSource | undefined> {
  const prisma = getPrismaClient();
  const requirement = await prisma.requirement.findFirst({
    where: {
      id: entityId,
      workspaceId
    }
  });

  if (!requirement) {
    return undefined;
  }

  return {
    workspaceId,
    projectId: requirement.project,
    versionId: requirement.versionId ?? undefined,
    entityType: "requirement",
    entityId: requirement.id,
    title: requirement.title,
    content: compactLines([
      `需求：${requirement.title}`,
      `状态：${requirement.status}`,
      `优先级：${requirement.priority}`,
      `项目：${requirement.project}`,
      requirement.versionName ? `版本：${requirement.versionName}` : undefined,
      `负责人：${requirement.owner}`,
      requirement.uiLink ? `UI 链接：${requirement.uiLink}` : undefined,
      requirement.documentLink ? `需求文档：${requirement.documentLink}` : undefined,
      requirement.aiSummary ? `AI 摘要：${requirement.aiSummary}` : undefined,
      `验收标准：${requirement.acceptance}`
    ]),
    metadata: {
      status: requirement.status,
      priority: requirement.priority,
      project: requirement.project,
      versionName: requirement.versionName
    }
  };
}

async function buildBugSource(entityId: string, workspaceId: string): Promise<BuiltKnowledgeSource | undefined> {
  const prisma = getPrismaClient();
  const bug = await prisma.bugReport.findFirst({
    where: {
      id: entityId,
      workspaceId
    }
  });

  if (!bug) {
    return undefined;
  }

  return {
    workspaceId,
    projectId: bug.project,
    versionId: bug.versionId ?? undefined,
    entityType: "bug",
    entityId: bug.id,
    title: bug.title,
    content: compactLines([
      `Bug：${bug.title}`,
      `状态：${bug.status}`,
      `严重程度：${bug.severity}`,
      `项目：${bug.project}`,
      bug.versionName ? `版本：${bug.versionName}` : undefined,
      `报告人：${bug.reporter}`,
      `负责人：${bug.owner}`,
      `环境：${bug.environment}`,
      `复现步骤：${bug.reproduction}`,
      `期望结果：${bug.expected}`,
      `实际结果：${bug.actual}`
    ]),
    metadata: {
      status: bug.status,
      severity: bug.severity,
      project: bug.project,
      versionName: bug.versionName
    }
  };
}

async function buildTaskSource(entityId: string, workspaceId: string): Promise<BuiltKnowledgeSource | undefined> {
  const prisma = getPrismaClient();
  const task = await prisma.projectTask.findFirst({
    where: {
      id: entityId,
      workspaceId
    }
  });

  if (!task) {
    return undefined;
  }

  return {
    workspaceId,
    projectId: task.project,
    versionId: task.versionId ?? undefined,
    entityType: "task",
    entityId: task.id,
    title: task.title,
    content: compactLines([
      `任务：${task.title}`,
      `阶段：${task.stage}`,
      `优先级：${task.priority}`,
      `项目：${task.project}`,
      task.versionName ? `版本：${task.versionName}` : undefined,
      `负责人：${task.owner}`,
      `周期：${task.startDate} 至 ${task.dueDate}`,
      `AI 提示：${task.aiHint}`
    ]),
    metadata: {
      stage: task.stage,
      priority: task.priority,
      project: task.project,
      versionName: task.versionName
    }
  };
}

async function buildKnowledgeSource(job: ClaimedIndexJob) {
  if (job.entityType === "version") {
    return buildVersionSource(job.entityId, job.workspaceId);
  }

  if (job.entityType === "requirement") {
    return buildRequirementSource(job.entityId, job.workspaceId);
  }

  if (job.entityType === "bug") {
    return buildBugSource(job.entityId, job.workspaceId);
  }

  if (job.entityType === "task") {
    return buildTaskSource(job.entityId, job.workspaceId);
  }

  return undefined;
}

// index_entity 的真实落库处理：读取业务事实、生成统一 source、切 chunk、写入 MySQL 元数据。
// 这里仍然不做 embedding/Qdrant 写入，而是继续投递 embed_chunks，保证保存和文本标准化不会被模型服务拖慢。
export async function indexBusinessEntity(job: ClaimedIndexJob, queue: IndexQueuePort) {
  const prisma = getPrismaClient();
  const source = await buildKnowledgeSource(job);

  if (!source) {
    throw new Error(`未找到可索引的业务对象：${job.entityType}/${job.entityId}`);
  }

  const contentHash = createContentHash(source.content);
  const chunks = chunkKnowledgeText({
    content: source.content,
    heading: source.title,
    sparsePrefix: [source.title, source.entityType, source.metadata.project, source.metadata.versionName]
      .filter(Boolean)
      .join(" ")
  });

  if (!chunks.length) {
    throw new Error(`业务对象没有可索引文本：${job.entityType}/${job.entityId}`);
  }

  const savedSource = await prisma.$transaction(async (tx) => {
    const nextSource = await tx.aiIndexSource.upsert({
      where: {
        workspaceId_entityType_entityId_sourceType: {
          workspaceId: source.workspaceId,
          entityType: source.entityType,
          entityId: source.entityId,
          sourceType: "record"
        }
      },
      create: {
        workspaceId: source.workspaceId,
        projectId: source.projectId,
        versionId: source.versionId,
        entityType: source.entityType,
        entityId: source.entityId,
        sourceProvider: "internal",
        sourceType: "record",
        title: source.title,
        contentHash,
        status: "indexing",
        metadata: asInputJson(source.metadata)
      },
      update: {
        projectId: source.projectId,
        versionId: source.versionId,
        title: source.title,
        contentHash,
        status: "indexing",
        error: null,
        metadata: asInputJson(source.metadata)
      }
    });

    await tx.aiIndexChunk.deleteMany({
      where: {
        sourceId: nextSource.id
      }
    });

    await tx.aiIndexChunk.createMany({
      data: chunks.map((chunk) => ({
        workspaceId: source.workspaceId,
        sourceId: nextSource.id,
        chunkIndex: chunk.chunkIndex,
        title: source.title,
        heading: chunk.heading,
        content: chunk.content,
        sparseText: chunk.sparseText,
        contentHash: chunk.contentHash,
        metadata: asInputJson(source.metadata),
        status: "pending" as const
      }))
    });

    return nextSource;
  });

  await queue.enqueue({
    workspaceId: source.workspaceId,
    sourceId: savedSource.id,
    entityType: source.entityType,
    entityId: source.entityId,
    jobType: "embed_chunks",
    dedupeKey: `${source.workspaceId}:${savedSource.id}:embed_chunks`,
    payload: {
      sourceId: savedSource.id,
      contentHash,
      chunkCount: chunks.length
    }
  });
}

// 管理员重建入口最终会落到 rebuild_source job；这里把它转回 index_entity 的同一条标准化链路，
// 保证重建和普通业务更新使用完全一致的 source/chunk 生成规则。
export async function rebuildBusinessSource(job: ClaimedIndexJob, queue: IndexQueuePort) {
  const sourceId = typeof job.payload.sourceId === "string" ? job.payload.sourceId : job.sourceId;

  if (!sourceId) {
    throw new Error("重建索引任务缺少 sourceId");
  }

  const prisma = getPrismaClient();
  const source = await prisma.aiIndexSource.findFirst({
    where: {
      id: sourceId,
      workspaceId: job.workspaceId
    },
    select: {
      entityType: true,
      entityId: true
    }
  });

  if (!source) {
    throw new Error(`未找到需要重建的索引源：${sourceId}`);
  }

  await indexBusinessEntity({
    ...job,
    sourceId,
    entityType: source.entityType,
    entityId: source.entityId,
    jobType: "index_entity"
  }, queue);
}
