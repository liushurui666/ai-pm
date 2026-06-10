const DEFAULT_AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_MODEL = "qwen3-max";

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

// 所有 AI 能力入口共享同一个配置检查，避免局部功能误判模型是否可用。
export function isAiAssistantConfigured() {
  return Boolean(getAiApiKey());
}
