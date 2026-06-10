"use client";

import "./index.less";
import { Alert, Button, Drawer, Input, Space, Spin, Tag, Tooltip, Typography } from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  RedoOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined
} from "@ant-design/icons";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { initialAssistantMessages, assistantQuickSuggestions } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-constants";
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

type AssistantDrawerProps = {
  assistantApiPath?: string;
  currentWorkspaceId: string;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
};

// AI 助手抽屉现在自持 AI SDK 多轮会话状态，主容器只负责传入当前工作区上下文。
export function AssistantDrawer({
  assistantApiPath = "/api/assistant",
  currentWorkspaceId,
  isMobile,
  onClose,
  open
}: AssistantDrawerProps) {
  const [sessionState, setSessionState] = useState<AssistantSessionState>(() =>
    loadAssistantSessionState(currentWorkspaceId, initialAssistantMessages)
  );
  const [input, setInput] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const activeSession = sessionState.sessions.find((session) => session.id === sessionState.activeSessionId);
  const sessionStateRef = useRef(sessionState);
  const activeSessionIdRef = useRef(sessionState.activeSessionId);
  const latestMessagesRef = useRef<UIMessage[]>(activeSession?.messages ?? initialAssistantMessages);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TextAreaRef>(null);
  const submitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const transport = useMemo(() => new DefaultChatTransport({
    api: assistantApiPath,
    body: {
      chatSessionId: sessionState.activeSessionId,
      workspaceId: currentWorkspaceId
    },
    credentials: "same-origin",
    prepareSendMessagesRequest: ({ body, headers, id, messageId, messages, trigger }) => ({
      body: {
        ...body,
        id,
        messageId,
        messages,
        trigger
      },
      headers
    })
  }), [assistantApiPath, currentWorkspaceId, sessionState.activeSessionId]);
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
    onError: () => {
      persistActiveSessionMessages(latestMessagesRef.current);
    },
    onFinish: ({ messages: finishedMessages }) => {
      persistActiveSessionMessages(finishedMessages);
    },
    transport
  });
  const generating = status === "submitted" || status === "streaming";
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const canRegenerate = Boolean(lastAssistantMessage) && !generating && messages.length > 1;
  const hasUserMessages = messages.some((message) => message.role === "user");
  const statusText = generating
    ? "正在读取项目数据并生成结构化回复..."
    : "支持多轮上下文，Enter 发送，Shift+Enter 换行";

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
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, status]);

  useEffect(
    () => () => {
      if (submitDebounceRef.current !== null) {
        clearTimeout(submitDebounceRef.current);
      }
    },
    []
  );

  function focusInput() {
    window.setTimeout(() => {
      inputRef.current?.focus({
        cursor: "end"
      });
    }, 0);
  }

  function handleSuggestionClick(suggestion: string) {
    if (generating) {
      return;
    }

    setInput((current) => current.trim() ? `${current.trim()}\n${suggestion}` : suggestion);
    focusInput();
  }

  async function handleSend() {
    const message = input.trim();

    if (!message || generating || submitDebounceRef.current !== null) {
      return;
    }

    submitDebounceRef.current = setTimeout(() => {
      submitDebounceRef.current = null;
    }, 300);
    clearError();
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
    setInput("");
    focusInput();
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
    setMessages(initialAssistantMessages);
    latestMessagesRef.current = initialAssistantMessages;
    setInput("");
    focusInput();
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

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          <span>AI 项目助手</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size={isMobile ? "large" : "default"}
      extra={
        <Space className="assistant-history-tools" size={4}>
          <Tooltip title="导出对话记录">
            <Button
              aria-label="导出对话记录"
              icon={<DownloadOutlined />}
              disabled={!hasUserMessages}
              onClick={handleExportConversation}
            />
          </Tooltip>
          <Tooltip title="清空当前对话">
            <Button
              aria-label="清空当前对话"
              icon={<DeleteOutlined />}
              disabled={generating || !hasUserMessages}
              onClick={handleClearConversation}
            />
          </Tooltip>
          <Tag color="blue">实时分析</Tag>
        </Space>
      }
    >
      <div className="assistant-panel">
        <AssistantSessionBar
          activeSessionId={sessionState.activeSessionId}
          disabled={generating}
          sessions={sessionState.sessions}
          onCreateSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onSelectSession={handleSessionChange}
        />
        <div className="assistant-messages" ref={messagesRef}>
          {messages.map((message) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={message.id}>
              <div className="assistant-message-meta">
                <span>{message.role === "user" ? "你" : "AI 项目助手"}</span>
                <span>{getCachedMessageTime(message.id)}</span>
              </div>
              {message.parts.map((part, index) => (
                <AssistantMessagePart
                  key={`${message.id}-part-${index}`}
                  part={part}
                  role={message.role}
                />
              ))}
              {message.role === "assistant" && message.id !== "assistant-welcome" && (!generating || message.id !== lastAssistantMessage?.id) ? (
                <div className="assistant-message-actions">
                  <Tooltip title={copiedMessageId === message.id ? "已复制" : "复制回复"}>
                    <Button
                      aria-label="复制回复"
                      icon={<CopyOutlined />}
                      onClick={() => void handleCopyMessage(message)}
                    />
                  </Tooltip>
                  {message.id === lastAssistantMessage?.id ? (
                    <Tooltip title="重新生成这条回复">
                      <Button
                        aria-label="重新生成这条回复"
                        icon={<RedoOutlined />}
                        disabled={!canRegenerate}
                        onClick={() => {
                          clearError();
                          void regenerate({
                            messageId: message.id
                          });
                        }}
                      />
                    </Tooltip>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {status === "submitted" ? (
            <div className="assistant-message assistant-message-assistant">
              <Spin size="small" /> <Text>正在选择项目工具...</Text>
            </div>
          ) : null}
          {error ? (
            <Alert
              className="assistant-error"
              type="error"
              showIcon
              title="AI 助手暂时无法完成回复"
              description={error.message}
            />
          ) : null}
        </div>

        <div className="assistant-chatbox">
          <div className="assistant-suggestions" aria-label="快捷提问">
            {assistantQuickSuggestions.map((suggestion) => (
              <Button
                className="assistant-suggestion"
                key={suggestion}
                disabled={generating}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
          <Input.TextArea
            ref={inputRef}
            value={input}
            rows={3}
            placeholder="例如：帮我分析当前最大风险"
            maxLength={300}
            disabled={generating}
            onChange={(event) => setInput(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="assistant-chatbox-footer">
            <Text type="secondary">{statusText}</Text>
          </div>
          <div className="assistant-actions">
            <Tooltip title="重新生成上一条回复">
              <Button
                icon={<RedoOutlined />}
                disabled={!canRegenerate}
                onClick={() => {
                  clearError();
                  void regenerate({
                    messageId: lastAssistantMessage?.id
                  });
                }}
              />
            </Tooltip>
            {generating ? (
              <Button icon={<StopOutlined />} onClick={stop}>
                停止
              </Button>
            ) : null}
            <Button
              className="assistant-send"
              type="primary"
              icon={<SendOutlined />}
              disabled={!input.trim()}
              loading={generating}
              onClick={() => void handleSend()}
            >
              发送
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
