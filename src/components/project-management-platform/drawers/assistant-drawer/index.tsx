"use client";

import "./index.less";
import { Drawer, Space, Tag } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { AssistantChatBox } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box";

type AssistantDrawerProps = {
  assistantApiPath?: string;
  currentWorkspaceId: string;
  isMobile: boolean;
  onInteractionSettled?: () => void | Promise<void>;
  open: boolean;
  onClose: () => void;
};

// 抽屉只保留历史兼容外壳；真实 AI SDK 会话能力统一由 AssistantChatBox 承担，避免全屏菜单和抽屉分裂状态。
export function AssistantDrawer({
  assistantApiPath = "/api/assistant",
  currentWorkspaceId,
  isMobile,
  onClose,
  onInteractionSettled,
  open
}: AssistantDrawerProps) {
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
      <AssistantChatBox
        assistantApiPath={assistantApiPath}
        currentWorkspaceId={currentWorkspaceId}
        isMobile={isMobile}
        onInteractionSettled={onInteractionSettled}
        variant="drawer"
      />
    </Drawer>
  );
}
