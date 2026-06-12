import type { EmbeddingPort, KnowledgeRetrieverPort, RerankerPort, TraceEvalPort, VectorStorePort } from "@/lib/ai/knowledge/ports";

export type KnowledgeRetrieverDependencies = {
  embedding: EmbeddingPort;
  vectorStore: VectorStorePort;
  reranker: RerankerPort;
  traceEval: TraceEvalPort;
};

// KnowledgeRetriever 是 ChatBox knowledge tool、周报和后续 Bug 分析共同复用的检索入口。
// 它只编排 query embedding、向量检索、精排和 trace，不直接理解具体业务页面，确保知识能力可以横向复用。
export function createKnowledgeRetriever({ embedding, reranker, traceEval, vectorStore }: KnowledgeRetrieverDependencies): KnowledgeRetrieverPort {
  return {
    async search({ workspaceId, query, limit = 8 }) {
      const queryVector = await embedding.embedQuery(query);
      const matches = await vectorStore.hybridSearch({
        workspaceId,
        queryVector,
        sparseQuery: query,
        limit: Math.max(limit * 4, 20)
      });
      const ranked = await reranker.rerank({
        query,
        candidates: matches,
        limit
      });

      await traceEval.record({
        workspaceId,
        name: "knowledge.search",
        input: {
          query,
          limit
        },
        output: {
          retrieved: matches.length,
          returned: ranked.length
        }
      });

      return ranked;
    }
  };
}
