import type { RerankerPort } from "@/lib/ai/knowledge/ports";

// Reranker 的真实模型接入会跟随百炼可用模型确认后补齐；当前 adapter 先提供稳定降级策略。
// 这样 RAG 检索链路可以先以 hybrid/vector score 工作，并在 trace 中识别为未精排，避免接口形状反复变化。
export function createFallbackReranker(): RerankerPort {
  return {
    async rerank({ candidates, limit }) {
      return [...candidates]
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .slice(0, limit);
    }
  };
}
