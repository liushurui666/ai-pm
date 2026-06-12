import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { chunkKnowledgeText, createContentHash } from "@/lib/ai/knowledge/chunking";
import type { ClaimedIndexJob, IndexQueuePort, KnowledgeEntityType, KnowledgeMetadata } from "@/lib/ai/knowledge/ports";
import { parseFeishuDocumentLink, readFeishuDocumentFromLink } from "@/lib/requirements/feishu-document";
import { createQdrantVectorStore } from "@/lib/ai/knowledge/qdrant-vector-store";

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

function getPayloadText(payload: KnowledgeMetadata, key: string) {
  const value = payload[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getFeishuSourceType(link: string) {
  const parsed = parseFeishuDocumentLink(link);

  if (parsed.type === "wiki") {
    return {
      entityType: "feishu_wiki" as const,
      sourceType: "feishu_wiki" as const,
      sourceToken: parsed.token
    };
  }

  return {
    entityType: "feishu_doc" as const,
    sourceType: "feishu_doc" as const,
    sourceToken: parsed.token
  };
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
  const existingSource = await prisma.aiIndexSource.findUnique({
    where: {
      workspaceId_entityType_entityId_sourceType: {
        workspaceId: source.workspaceId,
        entityType: source.entityType,
        entityId: source.entityId,
        sourceType: "record"
      }
    },
    select: {
      id: true,
      contentHash: true,
      status: true
    }
  });

  if (existingSource?.status === "ready" && existingSource.contentHash === contentHash) {
    // 内容没有变化时不重复切 chunk、调 embedding 或写 Qdrant；只刷新标题、关联字段和元数据。
    // 这样业务保存可以频繁触发 index job，但不会把模型服务和向量库成本放大。
    await prisma.aiIndexSource.update({
      where: {
        id: existingSource.id
      },
      data: {
        projectId: source.projectId,
        versionId: source.versionId,
        title: source.title,
        error: null,
        lastIndexedAt: new Date(),
        metadata: asInputJson(source.metadata)
      }
    });
    return;
  }

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

export async function syncFeishuDocument(job: ClaimedIndexJob, queue: IndexQueuePort) {
  const prisma = getPrismaClient();
  const documentLink = getPayloadText(job.payload, "documentLink");
  const requirementId = getPayloadText(job.payload, "requirementId") ?? job.entityId;

  if (!documentLink) {
    throw new Error("飞书同步任务缺少 documentLink");
  }

  const feishuSource = getFeishuSourceType(documentLink);
  const document = await readFeishuDocumentFromLink(documentLink);
  const requirement = await prisma.requirement.findFirst({
    where: {
      id: requirementId,
      workspaceId: job.workspaceId
    }
  });
  const title = requirement?.title ? `${requirement.title} - ${document.title}` : document.title;
  const sourceMetadata = {
    requirementId,
    requirementTitle: requirement?.title ?? getPayloadText(job.payload, "requirementTitle"),
    project: requirement?.project ?? getPayloadText(job.payload, "project"),
    versionName: requirement?.versionName ?? getPayloadText(job.payload, "versionName"),
    documentTitle: document.title,
    documentToken: document.documentToken,
    sourceType: feishuSource.sourceType
  };
  const content = compactLines([
    `飞书文档：${document.title}`,
    sourceMetadata.requirementTitle ? `关联需求：${sourceMetadata.requirementTitle}` : undefined,
    sourceMetadata.project ? `项目：${sourceMetadata.project}` : undefined,
    sourceMetadata.versionName ? `版本：${sourceMetadata.versionName}` : undefined,
    document.content
  ]);
  const contentHash = createContentHash(content);
  const existingSource = await prisma.aiIndexSource.findUnique({
    where: {
      workspaceId_entityType_entityId_sourceType: {
        workspaceId: job.workspaceId,
        entityType: feishuSource.entityType,
        entityId: requirementId,
        sourceType: feishuSource.sourceType
      }
    },
    select: {
      id: true,
      contentHash: true,
      status: true
    }
  });

  if (existingSource?.status === "ready" && existingSource.contentHash === contentHash) {
    // 飞书正文未变化时只刷新需求/版本关联和文档标题，避免管理员重建或重复保存时反复拉高 embedding 成本。
    await prisma.aiIndexSource.update({
      where: {
        id: existingSource.id
      },
      data: {
        projectId: sourceMetadata.project,
        versionId: requirement?.versionId ?? getPayloadText(job.payload, "versionId"),
        title,
        sourceUrl: documentLink,
        sourceToken: feishuSource.sourceToken,
        error: null,
        lastIndexedAt: new Date(),
        metadata: asInputJson(sourceMetadata)
      }
    });
    return;
  }

  const chunks = chunkKnowledgeText({
    content,
    heading: title,
    sparsePrefix: [
      title,
      document.title,
      sourceMetadata.requirementTitle,
      sourceMetadata.project,
      sourceMetadata.versionName,
      feishuSource.entityType
    ].filter(Boolean).join(" ")
  });

  if (!chunks.length) {
    throw new Error("飞书文档没有可索引文本");
  }

  const savedSource = await prisma.$transaction(async (tx) => {
    const nextSource = await tx.aiIndexSource.upsert({
      where: {
        workspaceId_entityType_entityId_sourceType: {
          workspaceId: job.workspaceId,
          entityType: feishuSource.entityType,
          entityId: requirementId,
          sourceType: feishuSource.sourceType
        }
      },
      create: {
        workspaceId: job.workspaceId,
        projectId: sourceMetadata.project,
        versionId: requirement?.versionId ?? getPayloadText(job.payload, "versionId"),
        entityType: feishuSource.entityType,
        entityId: requirementId,
        sourceProvider: "feishu",
        sourceType: feishuSource.sourceType,
        title,
        sourceUrl: documentLink,
        sourceToken: feishuSource.sourceToken,
        contentHash,
        status: "indexing",
        metadata: asInputJson(sourceMetadata)
      },
      update: {
        projectId: sourceMetadata.project,
        versionId: requirement?.versionId ?? getPayloadText(job.payload, "versionId"),
        title,
        sourceUrl: documentLink,
        sourceToken: feishuSource.sourceToken,
        contentHash,
        status: "indexing",
        error: null,
        metadata: asInputJson(sourceMetadata)
      }
    });

    await tx.aiIndexChunk.deleteMany({
      where: {
        sourceId: nextSource.id
      }
    });

    await tx.aiIndexChunk.createMany({
      data: chunks.map((chunk) => ({
        workspaceId: job.workspaceId,
        sourceId: nextSource.id,
        chunkIndex: chunk.chunkIndex,
        title,
        heading: chunk.heading,
        content: chunk.content,
        sparseText: chunk.sparseText,
        contentHash: chunk.contentHash,
        metadata: asInputJson(sourceMetadata),
        status: "pending" as const
      }))
    });

    return nextSource;
  });

  await queue.enqueue({
    workspaceId: job.workspaceId,
    sourceId: savedSource.id,
    entityType: feishuSource.entityType,
    entityId: requirementId,
    jobType: "embed_chunks",
    dedupeKey: `${job.workspaceId}:${savedSource.id}:embed_chunks:${contentHash}`,
    payload: {
      sourceId: savedSource.id,
      contentHash,
      chunkCount: chunks.length,
      sourceType: feishuSource.sourceType
    }
  });
}

export async function cleanupKnowledgeSource(job: ClaimedIndexJob) {
  const prisma = getPrismaClient();
  const vectorStore = createQdrantVectorStore();
  const entityTypes: KnowledgeEntityType[] = job.entityType === "requirement"
    ? ["requirement", "feishu_doc", "feishu_wiki"]
    : [job.entityType];
  const sources = await prisma.aiIndexSource.findMany({
    where: {
      workspaceId: job.workspaceId,
      entityId: job.entityId,
      entityType: {
        in: entityTypes
      }
    },
    select: {
      id: true
    }
  });

  for (const source of sources) {
    // 先删 Qdrant，再删 MySQL 元数据；如果向量库删除失败，job 会重试，避免数据库先删导致向量残留不可追踪。
    await vectorStore.deleteSource(source.id);
    await prisma.aiIndexSource.delete({
      where: {
        id: source.id
      }
    });
  }
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
      entityId: true,
      sourceType: true,
      sourceUrl: true,
      projectId: true,
      versionId: true,
      title: true,
      metadata: true
    }
  });

  if (!source) {
    throw new Error(`未找到需要重建的索引源：${sourceId}`);
  }

  if (source.sourceType === "feishu_doc" || source.sourceType === "feishu_wiki") {
    if (!source.sourceUrl) {
      throw new Error(`飞书索引源缺少 sourceUrl：${sourceId}`);
    }

    const metadata = source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
      ? source.metadata as KnowledgeMetadata
      : {};

    await syncFeishuDocument({
      ...job,
      sourceId,
      entityType: source.entityType,
      entityId: source.entityId,
      jobType: "sync_feishu",
      payload: {
        ...metadata,
        documentLink: source.sourceUrl,
        requirementId: source.entityId,
        requirementTitle: typeof metadata.requirementTitle === "string" ? metadata.requirementTitle : source.title,
        versionId: source.versionId,
        project: source.projectId
      }
    }, queue);
    return;
  }

  await indexBusinessEntity({
    ...job,
    sourceId,
    entityType: source.entityType,
    entityId: source.entityId,
    jobType: "index_entity"
  }, queue);
}
