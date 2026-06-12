import { getPrismaClient } from "@/lib/database/prisma";
import { createDashScopeEmbedding } from "@/lib/ai/knowledge/dashscope-embedding";
import { createDashScopeReranker } from "@/lib/ai/knowledge/dashscope-reranker";
import { createPrismaTraceEval } from "@/lib/ai/knowledge/langfuse-trace";
import { createQdrantVectorStore } from "@/lib/ai/knowledge/qdrant-vector-store";
import { createKnowledgeRetriever } from "@/lib/ai/knowledge/retriever";

export type KnowledgeEvalCase = {
  id: string;
  query: string;
  expectedSourceId: string;
  expectedTitle: string;
};

export type KnowledgeEvalResult = {
  workspaceId: string;
  total: number;
  evaluated: number;
  topK: number;
  recallAtK: number;
  mrr: number;
  cases: Array<{
    id: string;
    query: string;
    expectedTitle: string;
    hitRank?: number;
    returnedSourceIds: string[];
  }>;
};

export async function createKnowledgeEvalCases(input: { workspaceId: string; limit?: number }): Promise<KnowledgeEvalCase[]> {
  const prisma = getPrismaClient();
  const sources = await prisma.aiIndexSource.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "ready"
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: input.limit ?? 20,
    select: {
      id: true,
      title: true,
      entityType: true
    }
  });

  return sources.map((source) => ({
    id: source.id,
    query: `${source.title} ${source.entityType}`,
    expectedSourceId: source.id,
    expectedTitle: source.title
  }));
}

// V1 轻量 Eval：用已成功入库的 source 标题反查自身，衡量检索链路是否能把正确 source 召回到 TopK。
// 这不是最终评测平台，但能在上线和重建索引后快速发现 embedding/Qdrant/rerank 配置错误。
export async function runKnowledgeRetrievalEval(input: {
  workspaceId: string;
  cases?: KnowledgeEvalCase[];
  limit?: number;
  topK?: number;
}): Promise<KnowledgeEvalResult> {
  const topK = input.topK ?? 5;
  const cases = input.cases ?? await createKnowledgeEvalCases({
    workspaceId: input.workspaceId,
    limit: input.limit
  });
  const retriever = createKnowledgeRetriever({
    embedding: createDashScopeEmbedding(),
    vectorStore: createQdrantVectorStore(),
    reranker: createDashScopeReranker(),
    traceEval: createPrismaTraceEval()
  });
  const results: KnowledgeEvalResult["cases"] = [];
  let hits = 0;
  let reciprocalRankSum = 0;

  for (const testCase of cases) {
    const matches = await retriever.search({
      workspaceId: input.workspaceId,
      query: testCase.query,
      limit: topK
    });
    const returnedSourceIds = matches.map((match) => match.sourceId);
    const hitIndex = returnedSourceIds.findIndex((sourceId) => sourceId === testCase.expectedSourceId);
    const hitRank = hitIndex >= 0 ? hitIndex + 1 : undefined;

    if (hitRank) {
      hits += 1;
      reciprocalRankSum += 1 / hitRank;
    }

    results.push({
      id: testCase.id,
      query: testCase.query,
      expectedTitle: testCase.expectedTitle,
      hitRank,
      returnedSourceIds
    });
  }

  return {
    workspaceId: input.workspaceId,
    total: cases.length,
    evaluated: results.length,
    topK,
    recallAtK: cases.length ? hits / cases.length : 0,
    mrr: cases.length ? reciprocalRankSum / cases.length : 0,
    cases: results
  };
}
