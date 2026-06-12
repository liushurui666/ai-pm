import type { TraceEvalEvent, TraceEvalPort } from "@/lib/ai/knowledge/ports";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";

// V1 先把 RAG 检索 trace 落到 MySQL，保证没有 Langfuse 时也能评估召回量、返回量和后续评分。
// 记录失败只写服务端日志，不阻断 ChatBox 回答或后台索引；后续接 Langfuse 时继续复用 TraceEvalPort。
export function createPrismaTraceEval(): TraceEvalPort {
  const prisma = getPrismaClient();

  return {
    async record(event: TraceEvalEvent) {
      try {
        await prisma.aiIndexTrace.create({
          data: {
            workspaceId: event.workspaceId,
            traceId: event.traceId,
            name: event.name,
            input: toJsonValue(event.input ?? {}),
            output: toJsonValue(event.output ?? {}),
            scores: toJsonValue(event.scores ?? {})
          }
        });
      } catch (error) {
        console.error("[knowledge-trace] record failed", {
          error,
          workspaceId: event.workspaceId,
          name: event.name
        });
      }
    }
  };
}

export const createNoopTraceEval = createPrismaTraceEval;
