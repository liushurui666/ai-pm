import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import type { DashboardData } from "@/types/dashboard";
import { createAssistantSystemPrompt } from "@/lib/ai/assistant-prompt";
import type { AssistantInternalActionRuntime } from "@/lib/ai/assistant-internal-actions";
import { createAssistantTools } from "@/lib/ai/assistant-tools";
import { resolveValidatedAiModel } from "@/lib/ai/model-availability";
import { getAiApiKey, getAiBaseUrl } from "@/lib/ai/settings";

async function createAiModel(model?: string) {
  const provider = createOpenAICompatible({
    name: "ai-pm-openai-compatible",
    baseURL: getAiBaseUrl(),
    apiKey: getAiApiKey()
  });

  return provider(await resolveValidatedAiModel(model));
}

// 这里仅装配 AI SDK 流式运行时：模型、系统约束、历史消息和 tools；项目判断仍完全由模型基于工具结果完成。
export async function createAssistantStreamResult({
  actionRuntime,
  data,
  model,
  messages
}: {
  actionRuntime?: AssistantInternalActionRuntime;
  data: DashboardData;
  model?: string;
  messages: UIMessage[];
}) {
  const tools = createAssistantTools(data, messages, actionRuntime);

  return streamText({
    model: await createAiModel(model),
    system: createAssistantSystemPrompt(),
    messages: await convertToModelMessages(messages, {
      tools,
      ignoreIncompleteToolCalls: true
    }),
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(8),
    temperature: 0.2,
    maxOutputTokens: 1800
  });
}
