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
import { useEffect, useMemo, useRef, useState } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { AssistantMarkdown } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-markdown";

const { Paragraph, Text } = Typography;

type AssistantDrawerProps = {
  currentWorkspaceId: string;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
};

const initialMessages: UIMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "我会持续观察项目进度、任务阻塞和风险变化。你可以问我：本周风险、生成周报、版本范围。"
      }
    ]
  }
];

const quickSuggestions = [
  "我现在还有哪些待办？",
  "本周最大的交付风险是什么？",
  "未关闭 Bug 先处理哪些？",
  "生成本周项目周报摘要",
  "总结这轮对话关键结论"
];

const messageTimeCache = new Map<string, string>();

function formatMessageTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function getCachedMessageTime(messageId: string) {
  const cachedTime = messageTimeCache.get(messageId);

  if (cachedTime) {
    return cachedTime;
  }

  const nextTime = formatMessageTime();

  messageTimeCache.set(messageId, nextTime);
  return nextTime;
}

function getMessagePlainText(message: UIMessage) {
  return message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }

      if (part.type.startsWith("tool-")) {
        return "[正在读取项目数据]";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildConversationMarkdown(messages: UIMessage[]) {
  const lines = [
    "# AI 项目助手对话记录",
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    ""
  ];

  messages.forEach((message) => {
    const text = getMessagePlainText(message);

    if (!text) {
      return;
    }

    lines.push(`## ${message.role === "user" ? "你" : "AI 项目助手"}`, "", text, "");
  });

  return lines.join("\n");
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], {
    type: "text/markdown;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function renderMessagePart(part: UIMessage["parts"][number], index: number, role: UIMessage["role"]) {
  if (part.type === "text") {
    if (role === "assistant") {
      return <AssistantMarkdown content={part.text} key={`text-${index}`} />;
    }

    return (
      <Paragraph className="assistant-message-text" key={`text-${index}`}>
        {part.text}
      </Paragraph>
    );
  }

  if (part.type.startsWith("tool-")) {
    return (
      <Tag className="assistant-tool-tag" color="processing" key={`tool-${index}`}>
        正在读取项目数据
      </Tag>
    );
  }

  return null;
}

// AI 助手抽屉现在自持 AI SDK 多轮会话状态，主容器只负责传入当前工作区上下文。
export function AssistantDrawer({
  currentWorkspaceId,
  isMobile,
  onClose,
  open
}: AssistantDrawerProps) {
  const [input, setInput] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TextAreaRef>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/assistant",
    body: {
      workspaceId: currentWorkspaceId
    },
    credentials: "same-origin"
  }), [currentWorkspaceId]);
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
    id: `ai-pm-assistant-${currentWorkspaceId}`,
    messages: initialMessages,
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
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, status]);

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

    if (!message || generating) {
      return;
    }

    clearError();
    setInput("");
    await sendMessage({
      text: message
    });
  }

  function handleClearConversation() {
    if (generating) {
      return;
    }

    clearError();
    setMessages(initialMessages);
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
        <div className="assistant-messages" ref={messagesRef}>
          {messages.map((message) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={message.id}>
              <div className="assistant-message-meta">
                <span>{message.role === "user" ? "你" : "AI 项目助手"}</span>
                <span>{getCachedMessageTime(message.id)}</span>
              </div>
              {message.parts.map((part, index) => renderMessagePart(part, index, message.role))}
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
                          void regenerate();
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
            {quickSuggestions.map((suggestion) => (
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
                  void regenerate();
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
