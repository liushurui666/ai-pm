import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import type { DashboardData } from "@/types/dashboard";
import { createAssistantSystemPrompt } from "@/lib/ai/assistant-prompt";
import type { AssistantInternalActionRuntime } from "@/lib/ai/assistant-internal-actions";
import { createAssistantTools } from "@/lib/ai/assistant-tools";
import { getAiApiKey, getAiBaseUrl, resolveAiModel } from "@/lib/ai/settings";

function shouldDisableDashScopeThinking(model: string) {
  const normalizedModel = model.toLowerCase();

  // 百炼 qwen3/qwen3.7 等推理模型在 OpenAI-compatible 流里会先输出大量 reasoning_content。
  // ChatBox 的核心诉求是稳定返回业务结论；默认关闭深度思考可以避免用户在普通问答或执行指令里等待几十秒，
  // 同时 tools / reasoning part 的前端 Think 面板仍然保留，后续如需“展开推理模式”再由显式开关控制。
  return normalizedModel.startsWith("qwen3") || normalizedModel.includes("qwen3.");
}

async function createAiModel(model?: string) {
  // 正式发送链路不能再等待模型健康检查：本地/冷启动时会并发探测整个模型候选清单，
  // 一个“你好”也会被额外拖 4-5 秒。模型下拉接口已经负责健康检查，发送时只做同步白名单兜底。
  const resolvedModel = resolveAiModel(model);
  const provider = createOpenAICompatible({
    name: "ai-pm-openai-compatible",
    baseURL: getAiBaseUrl(),
    apiKey: getAiApiKey(),
    transformRequestBody: (body) => {
      if (!shouldDisableDashScopeThinking(resolvedModel)) {
        return body;
      }

      return {
        ...body,
        enable_thinking: false
      };
    }
  });

  return provider(resolvedModel);
}

// 这里仅装配 AI SDK 流式运行时：模型、系统约束、历史消息和 tools；项目判断仍完全由模型基于工具结果完成。
export async function createAssistantStreamResult({
  actionRuntime,
  data,
  loadData,
  model,
  messages
}: {
  actionRuntime?: AssistantInternalActionRuntime;
  data?: DashboardData;
  loadData?: () => Promise<DashboardData>;
  model?: string;
  messages: UIMessage[];
}) {
  const dataSource = data ?? loadData;

  if (!dataSource) {
    throw new Error("缺少 AI 助手数据源：请提供 data 或 loadData。");
  }

  const tools = createAssistantTools(dataSource, messages, actionRuntime);
  const modelMessages = await convertToModelMessages(messages, {
    tools,
    ignoreIncompleteToolCalls: true
  });

  return streamText({
    model: await createAiModel(model),
    system: createAssistantSystemPrompt(),
    messages: modelMessages,
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(8),
    temperature: 0.2,
    maxOutputTokens: 1800
  });
}
