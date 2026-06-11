"use client";

import "./index.less";
import { Alert, Button, Tooltip, Typography } from "antd";
import { Bubble, Sender, XProvider, type BubbleItemType } from "@ant-design/x";
import { CopyOutlined, RedoOutlined } from "@ant-design/icons";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SenderRef } from "@ant-design/x/es/sender";
import { fetchWithAuthRedirect, isSessionExpiredError, redirectToLogin } from "@/components/project-management-platform/api";
import { initialAssistantMessages } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-constants";
import { AssistantChatBoxHeader } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box/assistant-chat-box-header";
import { AssistantEmptyState } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box/assistant-empty-state";
import { AssistantSuggestions } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box/assistant-suggestions";
import { AssistantMessagePart } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-message-part";
import {
  buildConversationMarkdown,
  downloadTextFile,
  getCachedMessageTime,
  getMessagePlainText
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

const { Text } = Typography;

const ASSISTANT_CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;

type AssistantChatBoxVariant = "drawer" | "workspace";

type AssistantChatBoxProps = {
  assistantApiPath?: string;
  currentWorkspaceId: string;
  isMobile?: boolean;
  onInteractionSettled?: () => void | Promise<void>;
  variant?: AssistantChatBoxVariant;
};

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
  const [hasPendingResponse, setHasPendingResponse] = useState(false);
  const [userStopped, setUserStopped] = useState(false);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const activeSession = sessionState.sessions.find((session) => session.id === sessionState.activeSessionId);
  const sessionStateRef = useRef(sessionState);
  const activeSessionIdRef = useRef(sessionState.activeSessionId);
  const latestMessagesRef = useRef<UIMessage[]>(activeSession?.messages ?? initialAssistantMessages);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<SenderRef>(null);
  const submitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWorkspace = variant === "workspace";
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
      return await fetchWithAuthRedirect(input, {
        ...init,
        signal: timeoutController.signal
      }, {
        redirectOnUnauthorized: false
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);
  const transport = useMemo(() => new DefaultChatTransport({
    api: assistantApiPath,
    body: {
      chatSessionId: sessionState.activeSessionId,
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
  }), [assistantApiPath, assistantFetch, currentWorkspaceId, sessionState.activeSessionId]);
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
      setHasPendingResponse(false);
      setUserStopped(false);
      if (isSessionExpiredError(chatError)) {
        setSessionExpired(true);
      }

      persistActiveSessionMessages(latestMessagesRef.current);
    },
    onFinish: ({ messages: finishedMessages }) => {
      setHasPendingResponse(false);
      setUserStopped(false);
      persistActiveSessionMessages(finishedMessages);
      // 助手现在可以通过服务端动作 tool 修改项目数据；流式回复完成后静默刷新一次父级数据，
      // 让 Bug 状态、成员信息等页面内容尽快和数据库对齐，而不会打断当前对话。
      void onInteractionSettled?.();
    },
    transport
  });
  const chatInFlight = (status === "submitted" || status === "streaming") && !userStopped;
  const generating = !userStopped && (chatInFlight || hasPendingResponse);
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const canRegenerate = Boolean(lastAssistantMessage) && !generating && messages.length > 1;
  const hasUserMessages = messages.some((message) => message.role === "user");
  const sessionError = isSessionExpiredError(error);
  const statusText = generating
    ? "正在读取项目数据并生成回复..."
    : "支持多轮上下文，Enter 发送，Shift+Enter 换行";
  const onlyWelcomeMessage = messages.length === 1 && messages[0]?.id === "assistant-welcome";

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
    if (sessionExpired || isSessionExpiredError(error)) {
      redirectToLogin();
    }
  }, [error, sessionExpired]);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

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

  async function handleSend(submittedInput = input) {
    const message = submittedInput.trim();

    if (!message || generating || submitDebounceRef.current !== null) {
      return;
    }

    submitDebounceRef.current = setTimeout(() => {
      submitDebounceRef.current = null;
    }, 300);
    clearError();
    setHasPendingResponse(true);
    setUserStopped(false);
    setInput("");
    persistActiveSessionMessages([
      ...latestMessagesRef.current,
      {
        id: `local-user-${Date.now()}`,
        parts: [
          {
            text: message,
            type: "text"
          }
        ],
        role: "user"
      }
    ]);
    await sendMessage({
      text: message
    });
  }

  function hydrateSessionMessages(sessionId: string) {
    const session = sessionStateRef.current.sessions.find((item) => item.id === sessionId);

    if (!session) {
      return;
    }

    latestMessagesRef.current = session.messages;
    setMessages(session.messages);
    clearError();
    setHasPendingResponse(false);
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
    setHasPendingResponse(false);
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
    setHasPendingResponse(false);
    setUserStopped(true);
  }

  function handleRegenerateMessage(messageId?: string) {
    clearError();
    setHasPendingResponse(true);
    setUserStopped(false);
    void regenerate({
      messageId
    });
  }

  const bubbleItems: BubbleItemType[] = messages.map((message) => {
    const isAssistant = message.role === "assistant";
    const isLastAssistant = message.id === lastAssistantMessage?.id;
    const shouldShowActions = isAssistant && message.id !== "assistant-welcome" && (!generating || !isLastAssistant);

    return {
      content: (
        <div className="assistant-message-content">
          {message.parts.map((part, index) => (
            <AssistantMessagePart
              key={`${message.id}-part-${index}`}
              part={part}
              role={message.role}
            />
          ))}
        </div>
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
                  handleRegenerateMessage(message.id);
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
              description={sessionError ? "登录状态已失效，请重新登录后继续使用 AI 项目助手。" : error.message}
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
            className="assistant-sender"
            disabled={generating}
            loading={generating}
            placeholder="例如：帮我分析当前最大风险"
            submitType="enter"
            value={input}
            footer={(
              <div className="assistant-chatbox-footer">
                <Text type="secondary">{statusText}</Text>
                <div className="assistant-actions">
                  <Text type="secondary">{input.length}/300</Text>
                  <Tooltip title="重新生成上一条回复">
                    <Button
                      icon={<RedoOutlined />}
                      disabled={!canRegenerate}
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
