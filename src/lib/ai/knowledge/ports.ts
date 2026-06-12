// RAG V1 的核心边界定义在这里：业务层只能依赖这些 Port，不直接依赖 Mastra、Qdrant、BullMQ、Langfuse 等 SDK。
// 这样做是为了让 ChatBox、周报、Bug 分析和版本问答复用同一套索引能力，同时保留后续替换底层组件的空间。
export type KnowledgeEntityType = "version" | "requirement" | "bug" | "task" | "feishu_doc" | "feishu_wiki";
export type KnowledgeSourceProvider = "internal" | "feishu";
export type KnowledgeSourceType = "record" | "feishu_doc" | "feishu_wiki";
export type KnowledgeJobType = "index_entity" | "sync_feishu" | "embed_chunks" | "rebuild_source" | "cleanup_source";
export type KnowledgeJobStatus = "pending" | "running" | "success" | "failed";

export type KnowledgeMetadata = Record<string, unknown>;

export type EnqueueIndexJobInput = {
  workspaceId: string;
  sourceId?: string;
  entityType: KnowledgeEntityType;
  entityId: string;
  jobType: KnowledgeJobType;
  payload?: KnowledgeMetadata;
  priority?: number;
  dedupeKey?: string;
  nextRunAt?: Date;
};

export type ClaimedIndexJob = Required<Pick<EnqueueIndexJobInput, "workspaceId" | "entityType" | "entityId" | "jobType">> & {
  id: string;
  sourceId?: string;
  payload: KnowledgeMetadata;
  retryCount: number;
  maxRetries: number;
};

export type KnowledgeChunkCandidate = {
  id: string;
  sourceId: string;
  workspaceId: string;
  title: string;
  heading?: string;
  content: string;
  sparseText: string;
  score?: number;
  metadata?: KnowledgeMetadata;
};

export type EmbeddedText = {
  text: string;
  vector: number[];
};

export type VectorSearchInput = {
  workspaceId: string;
  queryVector: number[];
  sparseQuery?: string;
  limit: number;
  filter?: KnowledgeMetadata;
};

export type VectorSearchMatch = KnowledgeChunkCandidate & {
  vectorScore: number;
};

export type RerankInput = {
  query: string;
  candidates: KnowledgeChunkCandidate[];
  limit: number;
};

export type TraceEvalEvent = {
  workspaceId: string;
  traceId?: string;
  name: string;
  input?: KnowledgeMetadata;
  output?: KnowledgeMetadata;
  scores?: KnowledgeMetadata;
};

export interface IndexQueuePort {
  enqueue(input: EnqueueIndexJobInput): Promise<{ id: string; dedupeKey?: string }>;
  claimNext(workerId: string): Promise<ClaimedIndexJob | undefined>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string, options?: { retryAt?: Date; terminal?: boolean }): Promise<void>;
}

export interface WorkflowPort {
  runIndexJob(job: ClaimedIndexJob): Promise<void>;
  runWorkspaceRebuild(input: { workspaceId: string; requestedBy?: string }): Promise<{ enqueued: number }>;
}

export interface EmbeddingPort {
  embedDocuments(texts: string[]): Promise<EmbeddedText[]>;
  embedQuery(text: string): Promise<number[]>;
  getModelInfo(): { model: string; dimensions?: number };
}

export interface VectorStorePort {
  upsertChunks(chunks: Array<KnowledgeChunkCandidate & { vector: number[] }>): Promise<void>;
  deleteSource(sourceId: string): Promise<void>;
  hybridSearch(input: VectorSearchInput): Promise<VectorSearchMatch[]>;
}

export interface RerankerPort {
  rerank(input: RerankInput): Promise<KnowledgeChunkCandidate[]>;
}

export interface TraceEvalPort {
  record(event: TraceEvalEvent): Promise<void>;
}

export interface KnowledgeRetrieverPort {
  search(input: { workspaceId: string; query: string; limit?: number }): Promise<KnowledgeChunkCandidate[]>;
}
