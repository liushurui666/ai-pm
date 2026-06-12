import { QdrantClient } from "@qdrant/js-client-rest";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { KnowledgeChunkCandidate, VectorSearchInput, VectorSearchMatch, VectorStorePort } from "@/lib/ai/knowledge/ports";

function assertConfigured(url: string) {
  if (!url) {
    throw new Error("缺少 QDRANT_URL，无法访问知识索引向量库。");
  }
}

function tokenize(text?: string) {
  return Array.from(new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[\s,，。；;:：、/\\()[\]{}"'`~!！?？<>《》|+-]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  ));
}

function calculateSparseScore(candidate: KnowledgeChunkCandidate, sparseQuery?: string) {
  const tokens = tokenize(sparseQuery);

  if (!tokens.length) {
    return 0;
  }

  const haystack = [
    candidate.title,
    candidate.heading,
    candidate.sparseText,
    candidate.content
  ].filter(Boolean).join("\n").toLowerCase();

  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0) / tokens.length;
}

type QdrantPayload = Partial<KnowledgeChunkCandidate>;

function isQdrantPayload(payload: unknown): payload is QdrantPayload {
  return typeof payload === "object" && payload !== null;
}

// Qdrant adapter 现在直接使用官方 JS client。业务层仍只依赖 VectorStorePort，
// 因此后续如果要切换云向量库或增加 sparse vector，也只改这个 adapter，不牵动 ChatBox/tool/worker。
export function createQdrantVectorStore(): VectorStorePort {
  const settings = getKnowledgeSettings();
  const baseUrl = settings.qdrantUrl.replace(/\/+$/, "");
  const collection = settings.qdrantCollection;
  const client = new QdrantClient({
    url: baseUrl || undefined,
    apiKey: settings.qdrantApiKey || undefined,
    // worker 和 ChatBox 的检索请求本身已经有业务级错误处理；关闭启动即探活，
    // 避免模块初始化时因为 Qdrant 暂未就绪导致 Next 构建或普通页面加载失败。
    checkCompatibility: false
  });
  let collectionReady: Promise<void> | undefined;

  async function ensureCollection() {
    assertConfigured(baseUrl);

    if (!collectionReady) {
      collectionReady = (async () => {
        const exists = await client.collectionExists(collection);

        if (exists.exists) {
          return;
        }

        await client.createCollection(collection, {
          vectors: {
            size: settings.embeddingDimensions,
            distance: "Cosine"
          }
        });
      })();
    }

    await collectionReady;
  }

  return {
    async upsertChunks(chunks) {
      if (chunks.length === 0) {
        return;
      }

      await ensureCollection();

      await client.upsert(collection, {
        wait: true,
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
      });
    },

    async deleteSource(sourceId) {
      await ensureCollection();

      await client.delete(collection, {
        wait: true,
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
      });
    },

    async hybridSearch(input: VectorSearchInput): Promise<VectorSearchMatch[]> {
      await ensureCollection();

      const result = await client.search(collection, {
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
      });

      return result.map((item) => {
        const payload = isQdrantPayload(item.payload) ? item.payload : {};
        const candidate: VectorSearchMatch = {
          id: String(item.id),
          sourceId: String(payload.sourceId ?? ""),
          workspaceId: input.workspaceId,
          title: String(payload.title ?? "未命名资料"),
          heading: typeof payload.heading === "string" ? payload.heading : undefined,
          content: String(payload.content ?? ""),
          sparseText: String(payload.sparseText ?? ""),
          metadata: typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {},
          vectorScore: item.score,
          score: item.score
        };
        const sparseScore = calculateSparseScore(candidate, input.sparseQuery);

        return {
          ...candidate,
          score: candidate.vectorScore * 0.8 + sparseScore * 0.2
        };
      }).sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
    }
  };
}
