import { getAiApiKey } from "@/lib/ai/settings";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { RerankerPort } from "@/lib/ai/knowledge/ports";

export function createFallbackReranker(): RerankerPort {
  return {
    async rerank({ candidates, limit }) {
      return [...candidates]
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .slice(0, limit);
    }
  };
}

type DashScopeRerankResponse = {
  output?: {
    results?: Array<{
      index?: number;
      relevance_score?: number;
      relevanceScore?: number;
    }>;
  };
  error?: {
    message?: string;
  };
};

// 百炼 Rerank 使用 DashScope native 接口，不是 chat/embedding 的 OpenAI-compatible endpoint。
// adapter 内保留分数降级，避免排序模型临时不可用时把整个 ChatBox/RAG 检索链路打断。
export function createDashScopeReranker(): RerankerPort {
  const fallback = createFallbackReranker();

  return {
    async rerank(input) {
      if (input.candidates.length === 0) {
        return [];
      }

      const apiKey = getAiApiKey();

      if (!apiKey) {
        return fallback.rerank(input);
      }

      try {
        const settings = getKnowledgeSettings();
        const response = await fetch(settings.rerankUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: settings.rerankModel,
            input: {
              query: input.query,
              documents: input.candidates.map((candidate) => [
                candidate.title,
                candidate.heading,
                candidate.content
              ].filter(Boolean).join("\n"))
            },
            parameters: {
              return_documents: false,
              top_n: input.limit
            }
          }),
          cache: "no-store"
        });
        const payload = await response.json().catch(() => null) as DashScopeRerankResponse | null;

        if (!response.ok) {
          console.warn("[knowledge-reranker] DashScope rerank failed", {
            status: response.status,
            message: payload?.error?.message
          });
          return fallback.rerank(input);
        }

        const results = payload?.output?.results ?? [];

        if (!results.length) {
          return fallback.rerank(input);
        }

        return results
          .map((item) => {
            const candidate = typeof item.index === "number" ? input.candidates[item.index] : undefined;

            if (!candidate) {
              return undefined;
            }

            const score = item.relevance_score ?? item.relevanceScore ?? candidate.score;

            return {
              ...candidate,
              score
            };
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
          .slice(0, input.limit);
      } catch (error) {
        console.warn("[knowledge-reranker] DashScope rerank unavailable", error);
        return fallback.rerank(input);
      }
    }
  };
}
