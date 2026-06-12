const DEFAULT_AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_MODEL = "qwen3.6-plus";
const DEFAULT_AI_MODEL_OPTIONS = [
  DEFAULT_AI_MODEL,
  "qwen3.6-max-preview",
  "qwen3.6-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "kimi-k2.6",
  "glm-5.1",
  "glm-4.5-air",
  "MiniMax-M2.7",
  "qwen-plus",
  "qwen3.7-max"
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

// 默认清单对齐 ai-interview 维护的百炼国内 region 模型目录，并额外保留 AI PM 历史模型。
// 真正展示前还会经过健康检查；这样同一把 API key 能复用更多模型，但不会把账号未开通或 tools 不兼容的模型放进生产下拉框。
export function getAiModel() {
  return process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
}

// ChatBox 模型下拉先读取显式白名单；没有白名单时使用本地维护目录，真正展示前还会经过可用性探测。
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
