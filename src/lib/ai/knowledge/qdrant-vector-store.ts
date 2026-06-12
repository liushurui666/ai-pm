import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { KnowledgeChunkCandidate, VectorSearchInput, VectorSearchMatch, VectorStorePort } from "@/lib/ai/knowledge/ports";

function createHeaders(apiKey: string) {
  return {
    ...(apiKey ? { "api-key": apiKey } : {}),
    "Content-Type": "application/json"
  };
}

function assertConfigured(url: string) {
  if (!url) {
    throw new Error("缺少 QDRANT_URL，无法访问知识索引向量库。");
  }
}

// Qdrant adapter 先使用稳定 HTTP API，避免 SDK 安装不稳定时阻塞 V1 骨架。
// 外部仍然只依赖 VectorStorePort；后续切换为官方 JS client 时，不影响调用方。
export function createQdrantVectorStore(): VectorStorePort {
  const settings = getKnowledgeSettings();
  const baseUrl = settings.qdrantUrl.replace(/\/+$/, "");
  const collection = settings.qdrantCollection;

  return {
    async upsertChunks(chunks) {
      assertConfigured(baseUrl);

      if (chunks.length === 0) {
        return;
      }

      const response = await fetch(`${baseUrl}/collections/${collection}/points?wait=true`, {
        method: "PUT",
        headers: createHeaders(settings.qdrantApiKey),
        body: JSON.stringify({
          points: chunks.map((chunk) => ({
            id: chunk.id,
            vector: chunk.vector,
            payload: {
              workspaceId: chunk.workspaceId,
              sourceId: chunk.sourceId,
              title: chunk.title,
              heading: chunk.heading,
              content: chunk.content,
              sparseText: chunk.sparseText,
              metadata: chunk.metadata ?? {}
            }
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`Qdrant 写入失败（${response.status}）`);
      }
    },

    async deleteSource(sourceId) {
      assertConfigured(baseUrl);

      const response = await fetch(`${baseUrl}/collections/${collection}/points/delete?wait=true`, {
        method: "POST",
        headers: createHeaders(settings.qdrantApiKey),
        body: JSON.stringify({
          filter: {
            must: [
              {
                key: "sourceId",
                match: {
                  value: sourceId
                }
              }
            ]
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Qdrant 删除 source 向量失败（${response.status}）`);
      }
    },

    async hybridSearch(input: VectorSearchInput): Promise<VectorSearchMatch[]> {
      assertConfigured(baseUrl);

      const response = await fetch(`${baseUrl}/collections/${collection}/points/search`, {
        method: "POST",
        headers: createHeaders(settings.qdrantApiKey),
        body: JSON.stringify({
          vector: input.queryVector,
          limit: input.limit,
          with_payload: true,
          filter: {
            must: [
              {
                key: "workspaceId",
                match: {
                  value: input.workspaceId
                }
              }
            ]
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Qdrant 检索失败（${response.status}）`);
      }

      const payload = await response.json().catch(() => null) as {
        result?: Array<{
          id: string;
          score: number;
          payload?: Partial<KnowledgeChunkCandidate>;
        }>;
      } | null;

      return payload?.result?.map((item) => ({
        id: String(item.id),
        sourceId: String(item.payload?.sourceId ?? ""),
        workspaceId: input.workspaceId,
        title: String(item.payload?.title ?? "未命名资料"),
        heading: typeof item.payload?.heading === "string" ? item.payload.heading : undefined,
        content: String(item.payload?.content ?? ""),
        sparseText: String(item.payload?.sparseText ?? ""),
        metadata: typeof item.payload?.metadata === "object" && item.payload.metadata ? item.payload.metadata : {},
        vectorScore: item.score,
        score: item.score
      })) ?? [];
    }
  };
}
