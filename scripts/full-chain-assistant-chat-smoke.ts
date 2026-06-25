import fs from "node:fs";
import path from "node:path";
import { createAssistantSystemPrompt } from "@/lib/ai/assistant-prompt";
import { sanitizeAssistantErrorMessage } from "@/lib/ai/assistant-error-message";

type AssistantChatCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const assistantRoutePath = path.join(repoRoot, "app/api/assistant/route.ts");
const assistantModelsRoutePath = path.join(repoRoot, "app/api/assistant/models/route.ts");
const assistantStreamPath = path.join(repoRoot, "src/lib/ai/assistant-stream.ts");
const assistantToolsPath = path.join(repoRoot, "src/lib/ai/assistant-tools.ts");
const assistantChatBoxPath = path.join(
  repoRoot,
  "src/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box/index.tsx"
);
const assistantSessionStorePath = path.join(
  repoRoot,
  "src/components/project-management-platform/drawers/assistant-drawer/assistant-session-store.ts"
);

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): AssistantChatCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "AI 助手 ChatBox 冒烟失败"
      },
      name,
      ok: false
    };
  }
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function verifyAssistantRouteContract() {
  const routeText = readText(assistantRoutePath);
  const modelsRouteText = readText(assistantModelsRoutePath);

  // 助手主接口是登录后高频流式入口：必须先守住会话、模型配置和错误净化，再进入 AI SDK 流。
  assertSmoke(routeText.includes('export const runtime = "nodejs"'), "助手主接口必须使用 nodejs runtime。");
  assertSmoke(routeText.includes("export const maxDuration = 120"), "助手主接口缺少 120s 流式上限。");
  assertSmoke(routeText.includes("isAuthServiceConfigured() && !session"), "助手主接口缺少登录保护。");
  assertSmoke(routeText.includes("请输入要分析的问题"), "助手主接口缺少空消息 400。");
  assertSmoke(routeText.includes("!isAiAssistantConfigured()"), "助手主接口缺少模型未配置保护。");
  assertSmoke(routeText.includes("status: 503"), "助手主接口模型未配置应返回 503。");
  assertSmoke(routeText.includes("createAssistantStreamResult"), "助手主接口未进入统一流式运行时。");
  assertSmoke(routeText.includes("cookieHeader: request.headers.get(\"cookie\")"), "助手动作运行时没有透传同源 Cookie。");
  assertSmoke(routeText.includes("origin: getRequestOriginFromRequest(request)"), "助手动作运行时没有使用请求 origin。");
  assertSmoke(routeText.includes("workspaceId: requestedWorkspaceId"), "助手动作运行时没有绑定当前工作区。");
  assertSmoke(routeText.includes("loadData: () => getDashboardData(session?.user, body?.workspaceId)"), "助手 tools 数据读取未按当前会话/工作区加载。");
  assertSmoke(routeText.includes("toUIMessageStreamResponse"), "助手主接口没有返回 UIMessage stream。");
  assertSmoke(routeText.includes("onError: (error)"), "助手流式错误缺少 onError 收口。");
  assertSmoke(routeText.includes("sanitizeAssistantErrorMessage(error)"), "助手接口错误没有统一净化。");
  assertSmoke(routeText.includes("AuthServiceUnavailableError ? 503 : 502"), "认证服务异常和普通服务异常状态码未区分。");

  // 模型列表接口决定前端下拉可选项；必须同样守住登录态，并返回已健康检查过的模型结果。
  assertSmoke(modelsRouteText.includes('export const runtime = "nodejs"'), "助手模型接口必须使用 nodejs runtime。");
  assertSmoke(modelsRouteText.includes("isAuthServiceConfigured() && !session"), "助手模型接口缺少登录保护。");
  assertSmoke(modelsRouteText.includes("getValidatedAiAvailableModels()"), "助手模型接口没有走模型可用性校验。");
  assertSmoke(modelsRouteText.includes("configured: isAiAssistantConfigured()"), "助手模型接口未返回 configured 状态。");

  return {
    authProtected: true,
    modelGuard: true,
    streamErrorSanitized: true,
    toolsUseSessionData: true
  };
}

function verifyAssistantStreamContract() {
  const streamText = readText(assistantStreamPath);

  // ChatBox 会持久化多轮历史。服务端必须剥掉历史 tool part，只把可见文本送给模型，避免旧 function.arguments 污染新一轮。
  assertSmoke(streamText.includes("const MAX_MODEL_HISTORY_MESSAGES = 16"), "助手服务端历史窗口上限被移除。");
  assertSmoke(streamText.includes("function sanitizeMessagesForModel"), "助手服务端缺少历史消息清洗。");
  assertSmoke(streamText.includes("part.type === \"text\""), "助手服务端历史清洗没有限制为文本 part。");
  assertSmoke(streamText.includes(".slice(-MAX_MODEL_HISTORY_MESSAGES)"), "助手服务端没有截断最近历史。");
  assertSmoke(streamText.includes("ignoreIncompleteToolCalls: true"), "助手服务端没有忽略历史不完整 tool 调用。");

  // 明确写操作不能只靠模型口头承诺：首步强制进入批量动作工具，结果必须来自后台 action job。
  assertSmoke(streamText.includes("function getForcedActionToolChoice"), "助手服务端缺少写意图强制工具选择。");
  assertSmoke(streamText.includes('toolName: "bulkCreateTasks"'), "批量创建任务意图没有强制 bulkCreateTasks。");
  assertSmoke(streamText.includes('toolName: "bulkAssignTasks"'), "批量归属任务意图没有强制 bulkAssignTasks。");
  assertSmoke(streamText.includes('toolName: "bulkCloseBugs"'), "批量关闭 Bug 意图没有强制 bulkCloseBugs。");
  assertSmoke(streamText.includes('toolName: "bulkCompleteTasks"'), "批量完成任务意图没有强制 bulkCompleteTasks。");
  assertSmoke(streamText.includes("prepareStep"), "助手流没有在首步准备强制工具。");
  assertSmoke(streamText.includes("activeTools: [forcedActionToolChoice.toolName]"), "强制工具没有限制 activeTools。");

  // 百炼推理模型、tool 参数修复和步数上限是生产稳定性边界，防止普通对话卡顿或工具循环。
  assertSmoke(streamText.includes("enable_thinking: false"), "百炼 qwen3 推理模型没有默认关闭 thinking。");
  assertSmoke(streamText.includes("experimental_repairToolCall"), "助手流缺少 tool 参数修复。");
  assertSmoke(streamText.includes("extractJsonObjectText"), "助手流缺少 JSON 外壳修复逻辑。");
  assertSmoke(streamText.includes("stopWhen: stepCountIs(8)"), "助手流缺少最大工具步数限制。");
  assertSmoke(streamText.includes("maxOutputTokens: 1800"), "助手流缺少输出 token 上限。");
  assertSmoke(streamText.includes("createAssistantTools(dataSource, messages, actionRuntime)"), "助手流没有挂统一 tools。");

  return {
    forceActionTools: 4,
    historyWindow: 16,
    repairToolCall: true,
    stepLimit: 8
  };
}

function verifyAssistantToolsAndPromptContract() {
  const toolsText = readText(assistantToolsPath);
  const systemPrompt = createAssistantSystemPrompt();
  const toolNames = [
    "conversation",
    "knowledge",
    "account",
    "mywork",
    "projects",
    "risks",
    "versions",
    "workload",
    "weekly",
    "bulkCreateTasks",
    "bulkAssignTasks",
    "bulkCompleteTasks",
    "bulkCloseBugs",
    "operations"
  ];
  const missingTools = toolNames.filter((toolName) => !toolsText.includes(`${toolName}:`));

  // tools 名称是模型可见能力边界。这里守住对话历史、个人工作、知识索引和批量动作工具都存在。
  assertSmoke(!missingTools.length, `助手 tools 缺失：${missingTools.join(", ")}`);
  assertSmoke(toolsText.includes("createKnowledgeSearchTool(loadData)"), "助手缺少 knowledge 检索工具。");
  assertSmoke(toolsText.includes("sanitizeAssistantFactText"), "助手 tools 返回事实缺少技术路径净化。");
  assertSmoke(toolsText.includes("waitForBulkActionConfirmation"), "助手批量动作没有等待后台确认态。");
  assertSmoke(toolsText.includes("通知入队数"), "助手批量动作结果缺少通知入队状态。");
  assertSmoke(toolsText.includes("ownerMemberId"), "助手批量归属/创建任务缺少负责人身份字段同步。");

  // 系统提示词约束最终可见回复，避免模型把内部工具、接口路径或技术错误暴露给用户。
  assertSmoke(systemPrompt.includes("必须先通过一个或多个可用 tools 读取数据"), "助手提示词缺少业务事实先读取约束。");
  assertSmoke(systemPrompt.includes("必须检索当前工作区知识索引"), "助手提示词缺少知识索引使用约束。");
  assertSmoke(systemPrompt.includes("对话纠错和历史回看优先级最高"), "助手提示词缺少对话回看优先级。");
  assertSmoke(systemPrompt.includes("用户可见回复不得出现 tool 名称"), "助手提示词缺少工具名泄露禁令。");
  assertSmoke(systemPrompt.includes("不要输出 URL、API 路径、接口路径"), "助手提示词缺少技术路径泄露禁令。");
  assertSmoke(systemPrompt.includes("周报下载、导出、本地保存或 Markdown 文件请求必须输出完整 Markdown 周报正文"), "助手提示词缺少周报下载协议。");
  assertSmoke(systemPrompt.includes("动作类回复必须以本轮动作能力返回的执行结果为依据"), "助手提示词缺少动作结果确认约束。");

  return {
    promptLength: systemPrompt.length,
    toolCount: toolNames.length
  };
}

function verifyAssistantFrontendContract() {
  const chatBoxText = readText(assistantChatBoxPath);
  const sessionStoreText = readText(assistantSessionStorePath);

  // 前端 transport 必须解析非 2xx JSON、覆盖整个 SSE body 读取超时，并把失败原因落进会话历史。
  assertSmoke(chatBoxText.includes("const ASSISTANT_CHAT_REQUEST_TIMEOUT_MS = 110 * 1000"), "ChatBox 缺少 110s 客户端超时。");
  assertSmoke(chatBoxText.includes("createAssistantResponseError"), "ChatBox 没有解析非 2xx JSON 错误。");
  assertSmoke(chatBoxText.includes("createResponseWithStreamCleanup"), "ChatBox 没有在 SSE 读取完成后释放 pending 状态。");
  assertSmoke(chatBoxText.includes("fetchWithAuthRedirect(input"), "ChatBox transport 没有复用统一认证请求封装。");
  assertSmoke(chatBoxText.includes("redirectOnUnauthorized: false"), "ChatBox 401 不应直接打断当前对话跳转。");
  assertSmoke(chatBoxText.includes("sanitizeAssistantErrorMessage(chatError)"), "ChatBox onError 没有净化错误。");
  assertSmoke(chatBoxText.includes("createLocalTextMessage(\"assistant\", sanitizedMessage"), "ChatBox 流式错误没有落本地助手消息。");

  // 多会话和重新生成是 ChatBox 最容易状态错乱的地方：这里守住 workspace/session 隔离和 regenerate 裁剪。
  assertSmoke(chatBoxText.includes("new DefaultChatTransport"), "ChatBox 没有使用 AI SDK DefaultChatTransport。");
  assertSmoke(chatBoxText.includes("prepareSendMessagesRequest"), "ChatBox 重新生成缺少请求体裁剪入口。");
  assertSmoke(chatBoxText.includes('trigger === "regenerate-message"'), "ChatBox regenerate 没有识别重试触发。");
  assertSmoke(chatBoxText.includes("messages.slice(0, cutoffIndex)"), "ChatBox regenerate 没有裁掉旧 assistant 回复。");
  assertSmoke(chatBoxText.includes("experimental_throttle: 80"), "ChatBox 缺少流式渲染节流。");
  assertSmoke(chatBoxText.includes("id: `ai-pm-assistant-${currentWorkspaceId}-${sessionState.activeSessionId}`"), "ChatBox useChat id 没有按工作区和会话隔离。");
  assertSmoke(chatBoxText.includes("isWeeklyReportDownloadIntent"), "ChatBox 缺少周报下载分流。");
  assertSmoke(chatBoxText.includes("/api/assistant/weekly-report"), "ChatBox 周报下载未调用专用接口。");
  assertSmoke(chatBoxText.includes("onCancel={handleStopGeneration}"), "ChatBox Sender 没有绑定停止生成。");
  assertSmoke(chatBoxText.includes("value.slice(0, 300)"), "ChatBox 输入长度上限缺失。");

  // 会话首帧必须 SSR 安全，真实历史只能 mount 后读取 localStorage，避免 hydration mismatch。
  assertSmoke(sessionStoreText.includes("SSR_SESSION_ID"), "助手会话缺少 SSR 安全会话。");
  assertSmoke(sessionStoreText.includes("createHydrationSafeAssistantSessionState"), "助手会话缺少 hydration 安全入口。");
  assertSmoke(sessionStoreText.includes("typeof window === \"undefined\""), "助手会话服务端路径不应读取 localStorage。");
  assertSmoke(sessionStoreText.includes("ai-pm-assistant-sessions:v1"), "助手会话没有按版本化 key 持久化。");
  assertSmoke(sessionStoreText.includes("getStorageKey(SESSION_PREFIX, workspaceId)"), "助手会话没有按 workspace 隔离。");
  assertSmoke(sessionStoreText.includes("MAX_SESSION_COUNT = 12"), "助手会话数量上限缺失。");

  return {
    clientTimeoutMs: 110_000,
    inputLimit: 300,
    sessionLimit: 12
  };
}

function verifyAssistantErrorSanitizer() {
  const cases = [
    {
      expected: "AI 助手的模型服务暂时不可用，请稍后重试。",
      input: "<html><body>502 Bad Gateway upstream</body></html>",
      name: "html gateway"
    },
    {
      expected: "AI 助手响应超时，请稍后重试。",
      input: new Error("AbortError: request timeout"),
      name: "timeout"
    },
    {
      expected: "AI 助手连接中断，请稍后重试。",
      input: "net::ERR_HTTP2_PROTOCOL_ERROR",
      name: "network"
    },
    {
      expected: "AI 助手本次动作参数生成失败，请缩小要处理的记录范围后重试。",
      input: "function.arguments invalidToolInput",
      name: "tool arguments"
    },
    {
      expected: "登录状态已失效，请重新登录后继续使用 AI 项目助手。",
      input: "session expired 未登录",
      name: "session"
    },
    {
      expected: "AI 助手配置暂不可用，请联系管理员检查模型服务配置。",
      input: "API_KEY unauthorized",
      name: "api key"
    },
    {
      expected: "AI 助手暂时无法完成回复，请稍后重试。",
      input: "x".repeat(200),
      name: "long unknown"
    },
    {
      expected: "业务错误",
      input: "业务错误",
      name: "short business error"
    }
  ];

  // 错误净化是用户体验和安全边界：模型网关 HTML、网络错误、tool 参数错误和配置错误都不能原样进入气泡。
  for (const item of cases) {
    const actual = sanitizeAssistantErrorMessage(item.input);

    assertSmoke(actual === item.expected, `${item.name} 错误净化不符合预期：${actual}`);
  }

  return {
    checkedCases: cases.length
  };
}

const results = [
  runCheck("assistant route contract", verifyAssistantRouteContract),
  runCheck("assistant stream contract", verifyAssistantStreamContract),
  runCheck("assistant tools and prompt contract", verifyAssistantToolsAndPromptContract),
  runCheck("assistant frontend contract", verifyAssistantFrontendContract),
  runCheck("assistant error sanitizer", verifyAssistantErrorSanitizer)
];
const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  checked: results.length,
  failed: failed.length,
  results
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
