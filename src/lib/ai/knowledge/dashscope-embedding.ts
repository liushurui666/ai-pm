import { getAiApiKey, getAiBaseUrl } from "@/lib/ai/settings";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import type { EmbeddedText, EmbeddingPort } from "@/lib/ai/knowledge/ports";

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
  error?: {
    message?: string;
  };
};

// 百炼兼容 OpenAI embeddings 接口；这里集中封装，避免业务代码知道模型名、维度和 API 路径。
// 如果后续换供应商，只需要替换 EmbeddingPort 实现，不影响索引队列和 ChatBox knowledge tool。
export function createDashScopeEmbedding(): EmbeddingPort {
  const settings = getKnowledgeSettings();

  async function embed(texts: string[]): Promise<EmbeddedText[]> {
    const apiKey = getAiApiKey();

    if (!apiKey) {
      throw new Error("缺少 AI_API_KEY，无法生成知识索引 embedding。");
    }

    const response = await fetch(`${getAiBaseUrl()}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.embeddingModel,
        input: texts,
        dimensions: settings.embeddingDimensions
      }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null) as EmbeddingResponse | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message || `Embedding 请求失败（${response.status}）`);
    }

    const vectors = payload?.data ?? [];

    return texts.map((text, index) => {
      const vector = vectors.find((item) => item.index === index)?.embedding ?? vectors[index]?.embedding;

      if (!vector || vector.length === 0) {
        throw new Error(`Embedding 响应缺少第 ${index + 1} 段文本的向量。`);
      }

      return {
        text,
        vector
      };
    });
  }

  return {
    embedDocuments: embed,
    async embedQuery(text) {
      const [result] = await embed([text]);

      return result.vector;
    },
    getModelInfo() {
      return {
        model: settings.embeddingModel,
        dimensions: settings.embeddingDimensions
      };
    }
  };
}
