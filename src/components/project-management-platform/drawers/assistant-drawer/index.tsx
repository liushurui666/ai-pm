"use client";

import "./index.less";
import { Alert, Button, Drawer, Input, Space, Spin, Tag, Tooltip, Typography } from "antd";
import { RedoOutlined, RobotOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const messagesRef = useRef<HTMLDivElement>(null);
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
    status,
    stop
  } = useChat({
    messages: initialMessages,
    transport
  });
  const generating = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, status]);

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
      extra={<Tag color="blue">实时分析</Tag>}
    >
      <div className="assistant-panel">
        <div className="assistant-messages" ref={messagesRef}>
          {messages.map((message) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={message.id}>
              {message.parts.map((part, index) => renderMessagePart(part, index, message.role))}
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
              message="AI 助手暂时无法完成回复"
              description={error.message}
            />
          ) : null}
        </div>

        <div className="assistant-chatbox">
          <Input.TextArea
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
          <div className="assistant-actions">
            <Tooltip title="重新生成上一条回复">
              <Button
                icon={<RedoOutlined />}
                disabled={generating || messages.length <= 1}
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
