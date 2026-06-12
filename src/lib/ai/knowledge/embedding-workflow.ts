import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { createDashScopeEmbedding } from "@/lib/ai/knowledge/dashscope-embedding";
import { createQdrantVectorStore } from "@/lib/ai/knowledge/qdrant-vector-store";
import type { ClaimedIndexJob } from "@/lib/ai/knowledge/ports";

function getSourceId(job: ClaimedIndexJob) {
  const payloadSourceId = typeof job.payload.sourceId === "string" ? job.payload.sourceId : undefined;

  return job.sourceId ?? payloadSourceId;
}

// embed_chunks 是重型步骤：批量调用百炼 embedding，再写入 Qdrant，并把 chunk/source 状态推进到 ready。
// 该函数只在 worker 中执行，绝不在业务保存请求里同步调用，避免用户保存版本/需求/Bug/任务时被模型或向量库拖慢。
export async function embedPendingChunks(job: ClaimedIndexJob) {
  const sourceId = getSourceId(job);

  if (!sourceId) {
    throw new Error("Embedding 任务缺少 sourceId");
  }

  const prisma = getPrismaClient();
  const chunks = await prisma.aiIndexChunk.findMany({
    where: {
      sourceId,
      status: "pending"
    },
    orderBy: {
      chunkIndex: "asc"
    }
  });

  if (!chunks.length) {
    await prisma.aiIndexSource.update({
      where: {
        id: sourceId
      },
      data: {
        status: "ready",
        lastIndexedAt: new Date(),
        error: null
      }
    });
    return;
  }

  const embedding = createDashScopeEmbedding();
  const vectorStore = createQdrantVectorStore();
  const model = embedding.getModelInfo();
  const embedded = await embedding.embedDocuments(chunks.map((chunk) => chunk.content));

  await vectorStore.upsertChunks(chunks.map((chunk, index) => ({
    id: chunk.id,
    sourceId: chunk.sourceId,
    workspaceId: chunk.workspaceId,
    title: chunk.title,
    heading: chunk.heading ?? undefined,
    content: chunk.content,
    sparseText: chunk.sparseText,
    metadata: chunk.metadata && typeof chunk.metadata === "object" && !Array.isArray(chunk.metadata)
      ? chunk.metadata as Record<string, unknown>
      : {},
    vector: embedded[index].vector
  })));

  await prisma.$transaction(async (tx) => {
    for (const chunk of chunks) {
      await tx.aiIndexChunk.update({
        where: {
          id: chunk.id
        },
        data: {
          status: "ready",
          embeddingModel: model.model,
          embeddingDimensions: model.dimensions,
          embeddingVectorRef: chunk.id,
          error: null,
          metadata: toJsonValue({
            indexedBy: "dashscope",
            model: model.model
          })
        }
      });
    }

    await tx.aiIndexSource.update({
      where: {
        id: sourceId
      },
      data: {
        status: "ready",
        lastIndexedAt: new Date(),
        error: null
      }
    });
  });
}
