import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, stepCountIs, streamText, type ToolCallRepairFunction, type ToolSet, type UIMessage } from "ai";
import type { DashboardData } from "@/types/dashboard";
import { createAssistantSystemPrompt } from "@/lib/ai/assistant-prompt";
import type { AssistantInternalActionRuntime } from "@/lib/ai/assistant-internal-actions";
import { createAssistantTools } from "@/lib/ai/assistant-tools";
import { getAiApiKey, getAiBaseUrl, resolveAiModel } from "@/lib/ai/settings";

const MAX_MODEL_HISTORY_MESSAGES = 16;

type TextUIMessagePart = Extract<UIMessage["parts"][number], { type: "text" }>;

function isTextUIMessagePart(part: UIMessage["parts"][number]): part is TextUIMessagePart {
  return part.type === "text" && Boolean(part.text.trim());
}

function sanitizeMessagesForModel(messages: UIMessage[]) {
  // ChatBox 会把多轮会话持久化到 localStorage；历史里如果残留旧版 tool part 或失败的 function.arguments，
  // AI SDK 在再次 convertToModelMessages 时会把这些旧工具片段送回百炼，导致模型在本轮工具真正开始前就 400。
  // 服务端发给模型的历史只保留用户/助手可见文本；工具事实和动作结果必须通过本轮 tools 重新读取/执行。
  return messages
    .map((message) => {
      const textParts = message.parts
        .filter(isTextUIMessagePart)
        .map((part) => ({
          type: "text" as const,
          text: part.text
        }));

      if (textParts.length === 0) {
        return null;
      }

      return {
        ...message,
        parts: textParts
      } as UIMessage;
    })
    .filter((message): message is UIMessage => Boolean(message))
    .slice(-MAX_MODEL_HISTORY_MESSAGES);
}

function shouldDisableDashScopeThinking(model: string) {
  const normalizedModel = model.toLowerCase();

  // 百炼 qwen3/qwen3.7 等推理模型在 OpenAI-compatible 流里会先输出大量 reasoning_content。
  // ChatBox 的核心诉求是稳定返回业务结论；默认关闭深度思考可以避免用户在普通问答或执行指令里等待几十秒，
  // 同时 tools / reasoning part 的前端 Think 面板仍然保留，后续如需“展开推理模式”再由显式开关控制。
  return normalizedModel.startsWith("qwen3") || normalizedModel.includes("qwen3.");
}

function extractJsonObjectText(value: string) {
  const trimmedValue = value.trim();

  try {
    const parsedValue = JSON.parse(trimmedValue);

    if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
      return JSON.stringify(parsedValue);
    }
  } catch {
    // 继续走截取兜底；模型偶发会在 JSON 前后包解释性文字，不能让整条流直接断掉。
  }

  const start = trimmedValue.indexOf("{");
  const end = trimmedValue.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  const candidate = trimmedValue.slice(start, end + 1);

  try {
    const parsedCandidate = JSON.parse(candidate);

    return parsedCandidate && typeof parsedCandidate === "object" && !Array.isArray(parsedCandidate)
      ? JSON.stringify(parsedCandidate)
      : null;
  } catch {
    return null;
  }
}

const repairAssistantToolCall: ToolCallRepairFunction<ToolSet> = async ({ toolCall, error }) => {
  const repairedInput = extractJsonObjectText(toolCall.input);

  if (!repairedInput) {
    console.warn("[assistant] tool call repair skipped", {
      error: error.message,
      inputPreview: toolCall.input.slice(0, 240),
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName
    });

    return null;
  }

  // 只修复“参数外壳不是严格 JSON”的问题，不替模型补业务字段；
  // 业务字段缺失仍由对应 tool schema/业务 API 返回失败，避免服务端替模型做事实判断。
  console.warn("[assistant] tool call repaired", {
    error: error.message,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName
  });

  return {
    ...toolCall,
    input: repairedInput
  };
};

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
  const modelMessages = await convertToModelMessages(sanitizeMessagesForModel(messages), {
    tools,
    ignoreIncompleteToolCalls: true
  });

  return streamText({
    model: await createAiModel(model),
    system: createAssistantSystemPrompt(),
    messages: modelMessages,
    tools,
    toolChoice: "auto",
    experimental_repairToolCall: repairAssistantToolCall,
    experimental_onToolCallStart: ({ toolCall }) => {
      console.info("[assistant] tool call started", {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName
      });
    },
    experimental_onToolCallFinish: ({ toolCall }) => {
      console.info("[assistant] tool call finished", {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName
      });
    },
    stopWhen: stepCountIs(8),
    temperature: 0.2,
    maxOutputTokens: 1800
  });
}
