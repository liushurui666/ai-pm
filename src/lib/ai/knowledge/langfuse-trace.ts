import type { TraceEvalEvent, TraceEvalPort } from "@/lib/ai/knowledge/ports";

// Trace/Eval 的第一批实现先落统一入口；Langfuse SDK 依赖稳定后只需要替换这里的内部实现。
// 当前 no-op 不会阻断主链路，避免观测平台临时不可用时影响用户提问和后台索引。
export function createNoopTraceEval(): TraceEvalPort {
  return {
    async record(event: TraceEvalEvent) {
      void event;
      return;
    }
  };
}
