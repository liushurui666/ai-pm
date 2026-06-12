import { createHash } from "node:crypto";

export type KnowledgeTextChunk = {
  chunkIndex: number;
  heading?: string;
  content: string;
  sparseText: string;
  contentHash: string;
};

const DEFAULT_CHUNK_SIZE = 1_200;
const DEFAULT_CHUNK_OVERLAP = 160;

export function createContentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeKnowledgeText(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// V1 先用可预测的字符窗口切片，避免引入复杂切分策略导致索引结果不可解释。
// 后续接入 LlamaIndex.TS 时仍输出同样的 KnowledgeTextChunk，业务和 Qdrant adapter 不需要改。
export function chunkKnowledgeText({
  content,
  heading,
  sparsePrefix,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
}: {
  content: string;
  heading?: string;
  sparsePrefix?: string;
  chunkSize?: number;
  overlap?: number;
}): KnowledgeTextChunk[] {
  const normalized = normalizeKnowledgeText(content);

  if (!normalized) {
    return [];
  }

  const chunks: KnowledgeTextChunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    const text = normalized.slice(start, end).trim();

    if (text) {
      const sparseText = [sparsePrefix, heading, text].filter(Boolean).join("\n");

      chunks.push({
        chunkIndex: chunks.length,
        heading,
        content: text,
        sparseText,
        contentHash: createContentHash(text)
      });
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
