"use client";

import "./index.less";
import { AssistantChatBox } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box";

type AssistantViewProps = {
  currentWorkspaceId: string;
  isMobile: boolean;
};

// 一级菜单的 AI 助手是完整工作区页面，不再通过右侧抽屉承载；
// 页面本身只负责全屏布局，所有多轮会话、流式输出和工具调用仍由共享 ChatBox 统一管理。
export function AssistantView({ currentWorkspaceId, isMobile }: AssistantViewProps) {
  return (
    <div className="assistant-view">
      <AssistantChatBox
        currentWorkspaceId={currentWorkspaceId}
        isMobile={isMobile}
        variant="workspace"
      />
    </div>
  );
}
