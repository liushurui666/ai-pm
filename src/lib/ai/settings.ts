const DEFAULT_AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_MODEL = "qwen3-max";
const DEFAULT_AI_MODEL_OPTIONS = [
  DEFAULT_AI_MODEL,
  "qwen-plus",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-flash",
  "qwen-turbo"
];
const AI_MODEL_NAME_PATTERN = /^[\w./:-]{1,120}$/;

function parseModelList(value?: string) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item && AI_MODEL_NAME_PATTERN.test(item)) ?? [];
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.filter((model) => AI_MODEL_NAME_PATTERN.test(model))));
}

// AI 连接配置统一放在领域模块内，避免聊天、文档拆解和需求体检各自散落默认模型。
export function getAiApiKey() {
  return process.env.AI_API_KEY?.trim() ?? "";
}

// OpenAI-compatible 服务端点允许通过环境变量切换供应商；默认使用 DashScope 兼容模式。
export function getAiBaseUrl() {
  return (process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
}

// 默认模型升级为 qwen3-max，但生产环境仍可通过 AI_MODEL 快速回滚或灰度切换。
export function getAiModel() {
  return process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
}

// ChatBox 模型下拉只暴露文本对话可用的候选；生产可通过 AI_MODELS 精确控制可切换范围。
export function getAiAvailableModels() {
  const configuredModels = parseModelList(process.env.AI_MODELS || process.env.AI_AVAILABLE_MODELS);
  const fallbackModels = configuredModels.length > 0 ? configuredModels : DEFAULT_AI_MODEL_OPTIONS;

  return uniqueModels([getAiModel(), ...fallbackModels]);
}

export function resolveAiModel(requestedModel?: string) {
  const model = requestedModel?.trim();
  const availableModels = getAiAvailableModels();

  if (model && availableModels.includes(model)) {
    return model;
  }

  return getAiModel();
}

// 所有 AI 能力入口共享同一个配置检查，避免局部功能误判模型是否可用。
export function isAiAssistantConfigured() {
  return Boolean(getAiApiKey());
}
