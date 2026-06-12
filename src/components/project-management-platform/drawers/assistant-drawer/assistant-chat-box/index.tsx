"use client";

import "./index.less";
import { Alert, Button, Select, Tooltip, Typography } from "antd";
import { Bubble, Sender, XProvider, type BubbleItemType } from "@ant-design/x";
import {
  CopyOutlined,
  DownloadOutlined,
  PlusOutlined,
  RedoOutlined,
  SettingOutlined
} from "@ant-design/icons";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SenderRef } from "@ant-design/x/es/sender";
import { fetchWithAuthRedirect, isSessionExpiredError, redirectToLogin } from "@/components/project-management-platform/api";
import { initialAssistantMessages } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-constants";
import { AssistantChatBoxHeader } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box/assistant-chat-box-header";
import { AssistantEmptyState } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box/assistant-empty-state";
import { AssistantSuggestions } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box/assistant-suggestions";
import { AssistantMessageContent } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-message-content";
import {
  buildConversationMarkdown,
  downloadTextFile,
  getCachedMessageTime,
  getMessagePlainText,
  isWeeklyReportDownloadIntent
} from "@/components/project-management-platform/drawers/assistant-drawer/assistant-message-utils";
import {
  createAssistantSession,
  loadAssistantSessionState,
  normalizeAssistantSessionState,
  saveAssistantSessionState,
  updateSessionMessages,
  type AssistantSessionState
} from "@/components/project-management-platform/drawers/assistant-drawer/assistant-session-store";
import { AssistantSessionBar } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-session-bar";
import { sanitizeAssistantErrorMessage } from "@/lib/ai/assistant-error-message";

const { Text } = Typography;

const ASSISTANT_CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;
const ASSISTANT_MODEL_STORAGE_PREFIX = "ai-pm-assistant-model";

type AssistantChatBoxVariant = "drawer" | "workspace";

type AssistantChatBoxProps = {
  assistantApiPath?: string;
  currentWorkspaceId: string;
  isMobile?: boolean;
  onInteractionSettled?: () => void | Promise<void>;
  variant?: AssistantChatBoxVariant;
};

type AssistantModelsResponse = {
  defaultModel?: string;
  error?: string;
  models?: string[];
};

type WeeklyReportResponse = {
  error?: string;
  generatedAt?: string;
  reply?: string;
  source?: string;
  warning?: string;
};

type PendingResponseSource = "sdk" | "weekly";

type AssistantDisplayMessage = UIMessage & {
  regenerateMessageId?: string;
  sourceMessageIds: string[];
};

async function createAssistantResponseError(response: Response) {
  const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
  const fallbackMessage = response.status >= 500
    ? "AI 助手服务暂时不可用，请稍后重试。"
    : "AI 助手请求失败，请稍后重试。";

  // AI SDK transport 对非 2xx 流式响应会倾向抛成泛化 network error；这里提前解析服务端 JSON，
  // 让认证、模型网关、服务端异常都能显示成可读中文，并确保 pending 状态能正常释放。
  return new Error(payload?.error || fallbackMessage);
}

function createLocalTextMessage(role: UIMessage["role"], text: string, prefix: string): UIMessage {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parts: [
      {
        text,
        type: "text"
      }
    ],
    role
  };
}

function hasCompletedMutationTool(messages: UIMessage[]) {
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");

  // 只有 operations tool 会写业务数据；普通分析、风险读取、周报上下文读取都只是查询。
  // 过去每条回复结束都刷新 dashboard，会让连续对话被大量数据库读请求拖慢，并增加输入框生成态交错的概率。
  return Boolean(lastAssistantMessage?.parts.some((part) =>
    part.type === "tool-operations" && "state" in part && part.state === "output-available"
  ));
}

function resolveEffectiveModel(rawModel: string, models: string[], defaultModel: string) {
  const normalizedModel = rawModel.trim();

  // 和 ai-interview 保持同一个取舍：模型列表未加载时不抢跑用户选择；
  // 列表到达后，展示、localStorage 和请求体都走同一套兜底，避免“看见 A，发出 B”。
  if (models.length === 0) {
    return normalizedModel || defaultModel;
  }

  if (normalizedModel && models.includes(normalizedModel)) {
    return normalizedModel;
  }

  if (defaultModel && models.includes(defaultModel)) {
    return defaultModel;
  }

  return models[0] ?? normalizedModel;
}

function createDisplayMessages(messages: UIMessage[]): AssistantDisplayMessage[] {
  return messages.reduce<AssistantDisplayMessage[]>((displayMessages, message) => {
    const previous = displayMessages.at(-1);
    const shouldMergeAssistantMessage = (
      message.role === "assistant" &&
      message.id !== "assistant-welcome" &&
      previous?.role === "assistant" &&
      !previous.sourceMessageIds.includes("assistant-welcome")
    );

    if (shouldMergeAssistantMessage && previous) {
      displayMessages[displayMessages.length - 1] = {
        ...previous,
        parts: [...previous.parts, ...message.parts],
        regenerateMessageId: message.id,
        sourceMessageIds: [...previous.sourceMessageIds, message.id]
      };

      return displayMessages;
    }

    displayMessages.push({
      ...message,
      parts: [...message.parts],
      regenerateMessageId: message.role === "assistant" ? message.id : undefined,
      sourceMessageIds: [message.id]
    });

    return displayMessages;
  }, []);
}

// 这是 AI 助手唯一的前端对话编排入口：AI SDK transport、会话持久化、消息渲染和输入控制都集中在这里。
// 抽屉和一级菜单全屏页只切换外层布局，避免复制两套 ChatBox 状态导致多轮上下文或本地 session 不一致。
export function AssistantChatBox({
  assistantApiPath = "/api/assistant",
  currentWorkspaceId,
  isMobile = false,
  onInteractionSettled,
  variant = "drawer"
}: AssistantChatBoxProps) {
  const [sessionState, setSessionState] = useState<AssistantSessionState>(() =>
    loadAssistantSessionState(currentWorkspaceId, initialAssistantMessages)
  );
  const [input, setInput] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [pendingResponseSource, setPendingResponseSource] = useState<PendingResponseSource | null>(null);
  const [userStopped, setUserStopped] = useState(false);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [modelLoading, setModelLoading] = useState(true);
  const activeSession = sessionState.sessions.find((session) => session.id === sessionState.activeSessionId);
  const selectedModelRef = useRef(selectedModel);
  const availableModelsRef = useRef<string[]>(availableModels);
  const defaultModelRef = useRef(defaultModel);
  const sessionStateRef = useRef(sessionState);
  const activeSessionIdRef = useRef(sessionState.activeSessionId);
  const latestMessagesRef = useRef<UIMessage[]>(activeSession?.messages ?? initialAssistantMessages);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<SenderRef>(null);
  const submitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWorkspace = variant === "workspace";
  const modelStorageKey = `${ASSISTANT_MODEL_STORAGE_PREFIX}:${currentWorkspaceId}`;
  const commitSessionState = useCallback((nextState: AssistantSessionState) => {
    const normalizedState = normalizeAssistantSessionState(nextState, initialAssistantMessages);

    sessionStateRef.current = normalizedState;
    activeSessionIdRef.current = normalizedState.activeSessionId;
    setSessionState(normalizedState);
    saveAssistantSessionState(currentWorkspaceId, normalizedState);

    return normalizedState;
  }, [currentWorkspaceId]);
  const persistActiveSessionMessages = useCallback((nextMessages: UIMessage[]) => {
    const activeSessionId = activeSessionIdRef.current;

    if (!activeSessionId) {
      return;
    }

    commitSessionState(updateSessionMessages(sessionStateRef.current, activeSessionId, nextMessages));
  }, [commitSessionState]);
  const assistantFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      timeoutController.abort(new Error("AI 助手请求超过 8 分钟仍未完成，请稍后重试。"));
    }, ASSISTANT_CHAT_REQUEST_TIMEOUT_MS);

    // AI SDK 会把“停止生成”的 abort signal 放在 init.signal 里；这里再叠加本地超时，
    // 既能保留用户主动停止，也能避免网络或模型流异常时让输入框永久卡在生成态。
    if (init?.signal) {
      if (init.signal.aborted) {
        timeoutController.abort(init.signal.reason);
      } else {
        init.signal.addEventListener(
          "abort",
          () => timeoutController.abort(init.signal?.reason),
          { once: true }
        );
      }
    }

    try {
      const response = await fetchWithAuthRedirect(input, {
        ...init,
        signal: timeoutController.signal
      }, {
        redirectOnUnauthorized: false
      });

      if (!response.ok) {
        throw await createAssistantResponseError(response);
      }

      return response;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);
  const transport = useMemo(() => new DefaultChatTransport({
    api: assistantApiPath,
    body: {
      workspaceId: currentWorkspaceId
    },
    credentials: "same-origin",
    // ChatBox 走 AI SDK transport，不能复用普通 JSON 请求封装的 response 解析；
    // 但鉴权语义必须和工作台一致：始终携带同源 Cookie，401 时回登录页并给出可读错误。
    fetch: assistantFetch,
    prepareSendMessagesRequest: ({ body, headers, id, messageId, messages, trigger }) => {
      let outgoingMessages = messages;

      // 参考 ai-interview 的 ChatBox：重新生成时必须把被替换的 assistant 消息裁掉，
      // 否则 SDK 本地看似删除了旧回复，服务端仍可能收到包含旧回复的上下文，导致回答重复或历史恢复后出现孤儿消息。
      if (trigger === "regenerate-message" && messageId) {
        const cutoffIndex = messages.findIndex((message) => message.id === messageId);

        if (cutoffIndex !== -1) {
          outgoingMessages = messages.slice(0, cutoffIndex);
        }
      }

      return {
        body: {
          ...body,
          id,
          messageId,
          messages: outgoingMessages,
          trigger
        },
        headers
      };
    }
  }), [assistantApiPath, assistantFetch, currentWorkspaceId]);
  const {
    clearError,
    error,
    messages,
    regenerate,
    sendMessage,
    setMessages,
    status,
    stop
  } = useChat({
    experimental_throttle: 80,
    id: `ai-pm-assistant-${currentWorkspaceId}-${sessionState.activeSessionId}`,
    messages: activeSession?.messages ?? initialAssistantMessages,
    onError: (chatError) => {
      setPendingResponseSource(null);
      setUserStopped(false);
      if (isSessionExpiredError(chatError)) {
        setSessionExpired(true);
      }

      persistActiveSessionMessages(latestMessagesRef.current);
    },
    onFinish: ({ messages: finishedMessages }) => {
      setPendingResponseSource(null);
      setUserStopped(false);
      persistActiveSessionMessages(finishedMessages);
      if (hasCompletedMutationTool(finishedMessages)) {
        // 助手只有在执行内部写操作后才需要刷新父级数据；纯聊天和分析不刷新，避免输入区被无关数据加载拖慢。
        void onInteractionSettled?.();
      }
    },
    transport
  });
  const chatInFlight = (status === "submitted" || status === "streaming") && !userStopped;
  const generating = !userStopped && (chatInFlight || pendingResponseSource !== null);
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const canRegenerate = Boolean(lastAssistantMessage) && !generating && messages.length > 1;
  const hasUserMessages = messages.some((message) => message.role === "user");
  const displayMessages = useMemo(() => createDisplayMessages(messages), [messages]);
  const sessionError = isSessionExpiredError(error);
  const visibleErrorMessage = sessionError
    ? "登录状态已失效，请重新登录后继续使用 AI 项目助手。"
    : sanitizeAssistantErrorMessage(error);
  const statusText = generating
    ? "正在读取项目数据并生成回复..."
    : "支持多轮上下文，Enter 发送，Shift+Enter 换行";
  const onlyWelcomeMessage = messages.length === 1 && messages[0]?.id === "assistant-welcome";
  const effectiveSelectedModel = resolveEffectiveModel(selectedModel, availableModels, defaultModel);
  const modelSwitchDisabled = generating || modelLoading || availableModels.length === 0;
  const modelSwitchTooltip = modelLoading
    ? "正在校验可用模型"
    : availableModels.length <= 1
      ? "当前环境只开放已验证可用的模型"
      : "切换本次回复使用的模型";

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextState = loadAssistantSessionState(currentWorkspaceId, initialAssistantMessages);
      const normalizedState = commitSessionState(nextState);
      const nextActiveSession = normalizedState.sessions.find((session) => session.id === normalizedState.activeSessionId);
      const nextMessages = nextActiveSession?.messages ?? initialAssistantMessages;

      latestMessagesRef.current = nextMessages;
      setMessages(nextMessages);
      setInput("");
      clearError();
    }, 0);

    return () => clearTimeout(timer);
  }, [clearError, commitSessionState, currentWorkspaceId, setMessages]);

  useEffect(() => {
    let ignore = false;

    async function loadModels() {
      setModelLoading(true);

      try {
        const response = await fetchWithAuthRedirect("/api/assistant/models", undefined, {
          redirectOnUnauthorized: false
        });
        const payload = (await response.json()) as AssistantModelsResponse;

        if (!response.ok) {
          throw new Error(payload.error || "读取模型列表失败");
        }

        const nextModels = Array.isArray(payload.models)
          ? payload.models.filter((model): model is string => typeof model === "string" && model.length > 0)
          : [];
        const storedModel = window.localStorage.getItem(modelStorageKey);
        const nextModel = storedModel && nextModels.includes(storedModel)
          ? storedModel
          : nextModels.includes(payload.defaultModel ?? "")
            ? payload.defaultModel ?? ""
            : nextModels[0] ?? "";

        if (!ignore) {
          setAvailableModels(nextModels);
          availableModelsRef.current = nextModels;
          defaultModelRef.current = payload.defaultModel ?? "";
          setDefaultModel(payload.defaultModel ?? "");
          selectedModelRef.current = nextModel;
          setSelectedModel(nextModel);

          if (nextModel) {
            window.localStorage.setItem(modelStorageKey, nextModel);
          }
        }
      } catch (modelError) {
        if (!ignore) {
          if (isSessionExpiredError(modelError)) {
            setSessionExpired(true);
          }

          setAvailableModels([]);
          availableModelsRef.current = [];
          setDefaultModel("");
          defaultModelRef.current = "";
          setSelectedModel("");
          selectedModelRef.current = "";
        }
      } finally {
        if (!ignore) {
          setModelLoading(false);
        }
      }
    }

    void loadModels();

    return () => {
      ignore = true;
    };
  }, [modelStorageKey]);

  useEffect(() => {
    if (sessionExpired || isSessionExpiredError(error)) {
      redirectToLogin();
    }
  }, [error, sessionExpired]);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    availableModelsRef.current = availableModels;
  }, [availableModels]);

  useEffect(() => {
    defaultModelRef.current = defaultModel;
  }, [defaultModel]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, status]);

  useEffect(() => {
    if (focusRequestId === 0) {
      return;
    }

    // React 19 的 refs lint 要求 ref 读取只发生在 effect 或事件真正执行阶段；
    // 这里用一个轻量请求计数把“需要聚焦输入框”的意图从会话切换/快捷问题里解耦出来。
    const timer = window.setTimeout(() => {
      inputRef.current?.focus({
        cursor: "end"
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusRequestId]);

  useEffect(
    () => () => {
      if (submitDebounceRef.current !== null) {
        clearTimeout(submitDebounceRef.current);
      }
    },
    []
  );

  function requestInputFocus() {
    setFocusRequestId((current) => current + 1);
  }

  function handleSuggestionClick(suggestion: string) {
    if (generating) {
      return;
    }

    setInput((current) => current.trim() ? `${current.trim()}\n${suggestion}` : suggestion);
    requestInputFocus();
  }

  function handleModelChange(model: string) {
    if (generating) {
      return;
    }

    const nextModel = resolveEffectiveModel(model, availableModelsRef.current, defaultModelRef.current);

    selectedModelRef.current = nextModel;
    setSelectedModel(nextModel);
    window.localStorage.setItem(modelStorageKey, nextModel);
    requestInputFocus();
  }

  function createAssistantRequestBody() {
    const model = resolveEffectiveModel(
      selectedModelRef.current,
      availableModelsRef.current,
      defaultModelRef.current
    );

    return {
      chatSessionId: activeSessionIdRef.current,
      model: model || undefined,
      workspaceId: currentWorkspaceId
    };
  }

  function commitActiveMessages(nextMessages: UIMessage[]) {
    latestMessagesRef.current = nextMessages;
    setMessages(nextMessages);
    persistActiveSessionMessages(nextMessages);
  }

  async function handleWeeklyReportDownload(message: string) {
    const userMessage = createLocalTextMessage("user", message, "local-user");
    const nextMessages = [...latestMessagesRef.current, userMessage];

    try {
      commitActiveMessages(nextMessages);
      // 周报下载是明确的 UI 动作：直接复用周报生成接口产出 Markdown，
      // 前端再由 Ant Design X FileCard 生成本地 Blob 下载，避免模型回答“当前环境不支持下载”。
      const response = await fetchWithAuthRedirect("/api/assistant/weekly-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId
        })
      }, {
        redirectOnUnauthorized: false
      });
      const payload = (await response.json().catch(() => null)) as WeeklyReportResponse | null;

      if (!response.ok || !payload?.reply) {
        throw new Error(payload?.error || "周报生成暂时不可用，请稍后重试。");
      }

      commitActiveMessages([
        ...nextMessages,
        createLocalTextMessage("assistant", payload.reply, "local-assistant-weekly")
      ]);
    } catch (weeklyReportError) {
      if (isSessionExpiredError(weeklyReportError)) {
        setSessionExpired(true);
      } else {
        commitActiveMessages([
          ...nextMessages,
          createLocalTextMessage("assistant", sanitizeAssistantErrorMessage(weeklyReportError), "local-assistant-error")
        ]);
      }
    } finally {
      setPendingResponseSource(null);
      setUserStopped(false);
    }
  }

  async function handleSend(submittedInput = input) {
    const message = submittedInput.trim();

    if (!message || generating || submitDebounceRef.current !== null) {
      return;
    }

    submitDebounceRef.current = setTimeout(() => {
      submitDebounceRef.current = null;
    }, 300);
    clearError();
    setUserStopped(false);
    setInput("");

    if (isWeeklyReportDownloadIntent(message, latestMessagesRef.current)) {
      setPendingResponseSource("weekly");
      try {
        await handleWeeklyReportDownload(message);
      } finally {
        setPendingResponseSource(null);
        setUserStopped(false);
      }
      return;
    }

    setPendingResponseSource("sdk");
    try {
      persistActiveSessionMessages([
        ...latestMessagesRef.current,
        createLocalTextMessage("user", message, "local-user")
      ]);
      await sendMessage({
        text: message
      }, {
        body: createAssistantRequestBody()
      });
    } catch (sendError) {
      setPendingResponseSource(null);
      setUserStopped(false);

      if (isSessionExpiredError(sendError)) {
        setSessionExpired(true);
      } else {
        commitActiveMessages([
          ...latestMessagesRef.current,
          createLocalTextMessage("assistant", sanitizeAssistantErrorMessage(sendError), "local-assistant-error")
        ]);
      }
    }
  }

  function hydrateSessionMessages(sessionId: string) {
    const session = sessionStateRef.current.sessions.find((item) => item.id === sessionId);

    if (!session) {
      return;
    }

    latestMessagesRef.current = session.messages;
    setMessages(session.messages);
    clearError();
    setPendingResponseSource(null);
    setUserStopped(false);
    setInput("");
    requestInputFocus();
  }

  function handleNewSession() {
    if (generating) {
      return;
    }

    const session = createAssistantSession(initialAssistantMessages);
    const nextState = commitSessionState({
      activeSessionId: session.id,
      sessions: [session, ...sessionStateRef.current.sessions]
    });

    hydrateSessionMessages(nextState.activeSessionId);
  }

  function handleSessionChange(sessionId: string) {
    if (generating || sessionId === sessionStateRef.current.activeSessionId) {
      return;
    }

    commitSessionState({
      activeSessionId: sessionId,
      sessions: sessionStateRef.current.sessions
    });
    hydrateSessionMessages(sessionId);
  }

  function handleDeleteSession() {
    if (generating) {
      return;
    }

    const currentState = sessionStateRef.current;
    const remainingSessions = currentState.sessions.filter((session) => session.id !== currentState.activeSessionId);
    const nextSession = remainingSessions[0] ?? createAssistantSession(initialAssistantMessages);

    const nextState = commitSessionState({
      activeSessionId: nextSession.id,
      sessions: remainingSessions.length > 0 ? remainingSessions : [nextSession]
    });

    hydrateSessionMessages(nextState.activeSessionId);
  }

  function handleClearConversation() {
    if (generating) {
      return;
    }

    const currentState = sessionStateRef.current;
    const nextSessions = currentState.sessions.map((session) => {
      if (session.id !== currentState.activeSessionId) {
        return session;
      }

      return {
        ...session,
        messages: initialAssistantMessages,
        title: "新对话",
        updatedAt: Date.now()
      };
    });

    commitSessionState({
      activeSessionId: currentState.activeSessionId,
      sessions: nextSessions
    });
    clearError();
    setPendingResponseSource(null);
    setUserStopped(false);
    setMessages(initialAssistantMessages);
    latestMessagesRef.current = initialAssistantMessages;
    setInput("");
    requestInputFocus();
  }

  function handleExportConversation() {
    downloadTextFile("ai-project-assistant-chat.md", buildConversationMarkdown(messages));
  }

  async function handleCopyMessage(message: UIMessage) {
    const text = getMessagePlainText(message);

    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(null), 1400);
  }

  function handleStopGeneration() {
    stop();
    setPendingResponseSource(null);
    setUserStopped(true);
  }

  function handleRegenerateMessage(messageId?: string) {
    clearError();
    setPendingResponseSource("sdk");
    setUserStopped(false);
    void regenerate({
      body: createAssistantRequestBody(),
      messageId
    });
  }

  const bubbleItems: BubbleItemType[] = displayMessages.map((message) => {
    const isAssistant = message.role === "assistant";
    const isLastAssistant = Boolean(lastAssistantMessage && message.sourceMessageIds.includes(lastAssistantMessage.id));
    const shouldShowActions = isAssistant && !message.sourceMessageIds.includes("assistant-welcome") && (!generating || !isLastAssistant);

    return {
      content: (
        <AssistantMessageContent message={message} />
      ),
      footer: shouldShowActions ? (
        <div className="assistant-message-actions">
          <Tooltip title={copiedMessageId === message.id ? "已复制" : "复制回复"}>
            <Button
              aria-label="复制回复"
              icon={<CopyOutlined />}
              onClick={() => void handleCopyMessage(message)}
            />
          </Tooltip>
          {isLastAssistant ? (
            <Tooltip title="重新生成这条回复">
              <Button
                aria-label="重新生成这条回复"
                icon={<RedoOutlined />}
                disabled={!canRegenerate}
                onClick={() => {
                  handleRegenerateMessage(message.regenerateMessageId);
                }}
              />
            </Tooltip>
          ) : null}
        </div>
      ) : null,
      header: (
        <div className="assistant-message-meta">
          <span>{message.role === "user" ? "你" : "AI 项目助手"}</span>
          <span>{getCachedMessageTime(message.id)}</span>
        </div>
      ),
      key: message.id,
      role: message.role === "user" ? "user" : "assistant",
      streaming: isAssistant && isLastAssistant && generating
    };
  });

  if (status === "submitted") {
    bubbleItems.push({
      content: "正在选择项目工具...",
      header: (
        <div className="assistant-message-meta">
          <span>AI 项目助手</span>
        </div>
      ),
      key: "assistant-loading",
      loading: true,
      role: "assistant"
    });
  }

  return (
    <XProvider>
      <section className={`assistant-chat-box assistant-chat-box--${variant}`}>
        <AssistantChatBoxHeader
          generating={generating}
          hasUserMessages={hasUserMessages}
          isWorkspace={isWorkspace}
          onClearConversation={handleClearConversation}
          onExportConversation={handleExportConversation}
          onNewSession={handleNewSession}
        />

        {isWorkspace && !hasUserMessages ? (
          <AssistantSuggestions
            className="assistant-suggestions assistant-suggestions--top"
            disabled={generating}
            onSelectSuggestion={handleSuggestionClick}
          />
        ) : null}

        <AssistantSessionBar
          activeSessionId={sessionState.activeSessionId}
          disabled={generating}
          sessions={sessionState.sessions}
          onCreateSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onSelectSession={handleSessionChange}
        />

        <div className="assistant-messages" ref={messagesRef}>
          {isWorkspace && onlyWelcomeMessage ? (
            <AssistantEmptyState />
          ) : (
            <Bubble.List
              autoScroll
              className="assistant-bubble-list"
              items={bubbleItems}
              // Ant Design X 只负责消息视图角色和视觉语义；消息内容仍来自 AI SDK UIMessage，
              // 避免为了换样式重新封装对话结构，导致多轮上下文和 tool 调用链路分叉。
              role={{
                assistant: {
                  className: "assistant-x-bubble assistant-x-bubble-assistant",
                  placement: "start",
                  variant: isWorkspace ? "borderless" : "outlined"
                },
                user: {
                  className: "assistant-x-bubble assistant-x-bubble-user",
                  placement: "end",
                  shape: isWorkspace ? "round" : "default",
                  variant: "filled"
                }
              }}
            />
          )}
          {error ? (
            <Alert
              className="assistant-error"
              type="error"
              showIcon
              title="AI 助手暂时无法完成回复"
              description={visibleErrorMessage}
              action={sessionError ? (
                <Button size="small" danger onClick={redirectToLogin}>
                  重新登录
                </Button>
              ) : undefined}
            />
          ) : null}
        </div>

        <div className="assistant-chatbox">
          {!isWorkspace ? (
            <AssistantSuggestions
              disabled={generating}
              onSelectSuggestion={handleSuggestionClick}
            />
          ) : null}
          <Sender
            ref={inputRef}
            autoSize={{
              maxRows: isWorkspace && !isMobile ? 6 : 4,
              minRows: isWorkspace && !isMobile ? 4 : 3
            }}
            className={`assistant-sender${generating ? " assistant-sender--generating" : ""}`}
            disabled={generating}
            loading={generating}
            placeholder="例如：帮我分析当前最大风险"
            submitType="enter"
            value={input}
            footer={(
              <div className="assistant-chatbox-footer">
                <div className="assistant-composer-tools">
                  <Tooltip title="新建对话">
                    <Button
                      aria-label="新建对话"
                      className="assistant-composer-tool-button"
                      disabled={generating}
                      icon={<PlusOutlined />}
                      type="text"
                      onClick={handleNewSession}
                    />
                  </Tooltip>
                  <Tooltip title="清空当前对话">
                    <Button
                      aria-label="清空当前对话"
                      className="assistant-composer-tool-button"
                      disabled={generating || onlyWelcomeMessage}
                      icon={<SettingOutlined />}
                      type="text"
                      onClick={handleClearConversation}
                    />
                  </Tooltip>
                  <Tooltip title="导出聊天记录">
                    <Button
                      aria-label="导出聊天记录"
                      className="assistant-composer-tool-button"
                      disabled={!hasUserMessages}
                      icon={<DownloadOutlined />}
                      type="text"
                      onClick={handleExportConversation}
                    />
                  </Tooltip>
                  <Tooltip title={modelSwitchTooltip}>
                    <span
                      className="assistant-model-select-wrap"
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <Select
                        aria-label="切换 AI 模型"
                        className="assistant-model-select"
                        disabled={modelSwitchDisabled}
                        loading={modelLoading}
                        optionFilterProp="label"
                        options={availableModels.map((model) => ({
                          label: model,
                          value: model
                        }))}
                        popupMatchSelectWidth={false}
                        showSearch
                        size="small"
                        value={effectiveSelectedModel || undefined}
                        onChange={handleModelChange}
                      />
                    </span>
                  </Tooltip>
                </div>
                <div className="assistant-actions">
                  <Text className="assistant-status-text" type="secondary">{statusText}</Text>
                  <Text className="assistant-character-count" type="secondary">{input.length}/300</Text>
                  <Tooltip title="重新生成上一条回复">
                    <Button
                      aria-label="重新生成上一条回复"
                      className="assistant-composer-tool-button"
                      disabled={!canRegenerate}
                      icon={<RedoOutlined />}
                      type="text"
                      onClick={() => {
                        handleRegenerateMessage(lastAssistantMessage?.id);
                      }}
                    />
                  </Tooltip>
                </div>
              </div>
            )}
            onCancel={handleStopGeneration}
            onChange={(value) => setInput(value.slice(0, 300))}
            onSubmit={(message) => void handleSend(message)}
          />
        </div>
      </section>
    </XProvider>
  );
}
