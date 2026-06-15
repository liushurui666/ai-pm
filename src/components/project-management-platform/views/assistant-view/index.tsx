"use client";

import "./index.less";
import type { ReactNode } from "react";
import {
  AssistantChatBox,
  type AssistantSessionSidebarRenderProps
} from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box";

type AssistantViewProps = {
  currentWorkspaceId: string;
  isMobile: boolean;
  onInteractionSettled?: () => void | Promise<void>;
  onSessionSidebarChange?: (node: ReactNode | null) => void;
  sessionSidebarRender?: (props: AssistantSessionSidebarRenderProps) => ReactNode;
};

// 一级菜单的 AI 助手是完整工作区页面，不再通过右侧抽屉承载；
// 页面本身只负责全屏布局，所有多轮会话、流式输出和工具调用仍由共享 ChatBox 统一管理。
export function AssistantView({
  currentWorkspaceId,
  isMobile,
  onInteractionSettled,
  onSessionSidebarChange,
  sessionSidebarRender
}: AssistantViewProps) {
  return (
    <div className="assistant-view">
      <AssistantChatBox
        currentWorkspaceId={currentWorkspaceId}
        isMobile={isMobile}
        onInteractionSettled={onInteractionSettled}
        onSessionSidebarChange={onSessionSidebarChange}
        sessionSidebarRender={sessionSidebarRender}
        variant="workspace"
      />
    </div>
  );
}
