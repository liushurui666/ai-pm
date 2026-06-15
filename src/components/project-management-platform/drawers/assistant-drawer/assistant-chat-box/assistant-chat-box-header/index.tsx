"use client";

import { Button, Space, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, DownloadOutlined, PlusOutlined, RobotOutlined } from "@ant-design/icons";

const { Text } = Typography;

type AssistantChatBoxHeaderProps = {
  generating: boolean;
  hasUserMessages: boolean;
  isWorkspace: boolean;
  onClearConversation: () => void;
  onExportConversation: () => void;
  onNewSession: () => void;
  showNewSession?: boolean;
};

// ChatBox 顶栏只承载页面身份和会话级操作；具体 AI 对话状态仍由父级共享组件统一控制。
export function AssistantChatBoxHeader({
  generating,
  hasUserMessages,
  isWorkspace,
  onClearConversation,
  onExportConversation,
  onNewSession,
  showNewSession = true
}: AssistantChatBoxHeaderProps) {
  return (
    <div className="assistant-chat-box-header">
      <Space size={12} className="assistant-chat-box-title">
        <span className="assistant-chat-box-icon">
          <RobotOutlined />
        </span>
        <Space orientation="vertical" size={0}>
          <Text strong>AI 项目助手</Text>
          <Text type="secondary">
            {isWorkspace ? "围绕当前工作区做多轮项目分析" : "实时读取项目上下文并结构化输出"}
          </Text>
        </Space>
      </Space>
      <Space className="assistant-history-tools" size={6}>
        {showNewSession ? (
          <Tooltip title="新建对话">
            <Button
              aria-label="新建对话"
              icon={<PlusOutlined />}
              disabled={generating}
              onClick={onNewSession}
            />
          </Tooltip>
        ) : null}
        <Tooltip title="导出对话记录">
          <Button
            aria-label="导出对话记录"
            icon={<DownloadOutlined />}
            disabled={!hasUserMessages}
            onClick={onExportConversation}
          />
        </Tooltip>
        <Tooltip title="清空当前对话">
          <Button
            aria-label="清空当前对话"
            icon={<DeleteOutlined />}
            disabled={generating || !hasUserMessages}
            onClick={onClearConversation}
          />
        </Tooltip>
        <Tag color="blue">实时分析</Tag>
      </Space>
    </div>
  );
}
