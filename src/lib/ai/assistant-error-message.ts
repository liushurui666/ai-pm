const genericAssistantErrorMessage = "AI 助手暂时无法完成回复，请稍后重试。";
const gatewayAssistantErrorMessage = "AI 助手的模型服务暂时不可用，请稍后重试。";
const networkAssistantErrorMessage = "AI 助手连接中断，请稍后重试。";
const timeoutAssistantErrorMessage = "AI 助手响应超时，请稍后重试。";

function getRawErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

// 助手错误会同时来自 AI SDK 流式事件、站点网关和模型供应商；
// 这里统一把 HTML、网关原文和内部异常净化成用户可读中文，避免把部署细节或供应商错误页暴露在 ChatBox。
export function sanitizeAssistantErrorMessage(error: unknown) {
  const rawMessage = getRawErrorMessage(error).trim();

  if (!rawMessage) {
    return genericAssistantErrorMessage;
  }

  const normalized = rawMessage.toLowerCase();
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(rawMessage);
  const isGatewayError = normalized.includes("502")
    || normalized.includes("bad gateway")
    || normalized.includes("stgw")
    || normalized.includes("gateway")
    || normalized.includes("upstream");
  const isTimeout = normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("aborterror")
    || rawMessage.includes("超过");
  const isNetworkError = normalized.includes("network error")
    || normalized.includes("networkerror")
    || normalized.includes("fetch failed")
    || normalized.includes("failed to fetch")
    || normalized.includes("load failed")
    || normalized.includes("connection was lost")
    || normalized.includes("err_http2")
    || normalized.includes("http2")
    || normalized.includes("econnreset")
    || normalized.includes("socket hang up");
  const isToolArgumentError = normalized.includes("function.arguments")
    || normalized.includes("tool call")
    || normalized.includes("invalidtoolinput")
    || normalized.includes("invalidparameter")
    || normalized.includes("algo.invalidparameter");

  if (looksLikeHtml || isGatewayError) {
    return gatewayAssistantErrorMessage;
  }

  if (isTimeout) {
    return timeoutAssistantErrorMessage;
  }

  if (isNetworkError) {
    return networkAssistantErrorMessage;
  }

  if (isToolArgumentError) {
    return "AI 助手本次动作参数生成失败，请缩小要处理的记录范围后重试。";
  }

  if (normalized.includes("未登录") || normalized.includes("session")) {
    return "登录状态已失效，请重新登录后继续使用 AI 项目助手。";
  }

  if (normalized.includes("api_key") || normalized.includes("apikey") || normalized.includes("unauthorized")) {
    return "AI 助手配置暂不可用，请联系管理员检查模型服务配置。";
  }

  return rawMessage.length > 160 ? genericAssistantErrorMessage : rawMessage;
}
