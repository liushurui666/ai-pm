"use client";

import "./index.less";
import { Button, Segmented, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import {
  AccountAvatarPopover,
  AccountPopoverContent,
  AccountWorkspacePopover
} from "@/components/project-management-platform/shared/workbench-sidebar/account-popover";
import { AssistantSessionSidebar } from "@/components/project-management-platform/shared/workbench-sidebar/assistant-session-sidebar";
import { Brand } from "@/components/project-management-platform/shared/brand";
import type { AppView } from "@/components/project-management-platform/types";

const { Text } = Typography;

export { AccountAvatarPopover, AccountPopoverContent, AccountWorkspacePopover, AssistantSessionSidebar };

export type StudioMenuItem = {
  key: Exclude<AppView, "assistant" | "bugEdit">;
  icon: ReactNode;
  label: string;
};

export type StudioMenuGroup = {
  title: string;
  items: StudioMenuItem[];
};

type WorkbenchSidebarProps = {
  assistantSessionSidebar: ReactNode | null;
  collapsed: boolean;
  navigationView: AppView;
  studioMenuGroups: StudioMenuGroup[];
  onSwitchView: (view: AppView) => void;
};

// 桌面侧栏只负责 Chat/Studio 模式切换和 Studio 导航，账号与工作区入口统一上移到顶栏右侧。
export function WorkbenchSidebar({
  assistantSessionSidebar,
  collapsed,
  navigationView,
  studioMenuGroups,
  onSwitchView
}: WorkbenchSidebarProps) {
  return (
    <div className="pm-mode-sidebar">
      <Brand collapsed={collapsed} />
      <Segmented
        block
        className="pm-mode-switch"
        value={navigationView === "assistant" ? "chat" : "studio"}
        options={[
          { label: "Chat", value: "chat" },
          { label: "Studio", value: "studio" }
        ]}
        onChange={(value) => {
          // Chat 是独立对话模式；从 Chat 回到 Studio 时默认落在个人工作台，
          // 避免用户停留在助手页却看到 Studio 被选中的错位状态。
          if (value === "chat") {
            onSwitchView("assistant");
            return;
          }

          if (navigationView === "assistant") {
            onSwitchView("overview");
          }
        }}
      />
      {navigationView === "assistant" ? (
        assistantSessionSidebar ?? (
          <div className="pm-chat-session-menu pm-chat-session-menu-loading">
            <Button block className="pm-chat-new-button" disabled icon={<PlusOutlined />}>
              新建聊天
            </Button>
            <Text className="pm-chat-history-title">历史对话加载中...</Text>
          </div>
        )
      ) : (
        <nav className="pm-studio-menu" aria-label="工作台导航">
          {studioMenuGroups.map((group) => (
            <section className="pm-studio-menu-section" key={group.title} aria-label={group.title}>
              <Text className="pm-studio-menu-title">{group.title}</Text>
              <div className="pm-studio-menu-list">
                {group.items.map((item) => (
                  <button
                    className={navigationView === item.key ? "pm-studio-menu-item is-active" : "pm-studio-menu-item"}
                    key={item.key}
                    type="button"
                    aria-current={navigationView === item.key ? "page" : undefined}
                    onClick={() => onSwitchView(item.key)}
                  >
                    <span className="pm-studio-menu-icon">{item.icon}</span>
                    <span className="pm-studio-menu-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>
      )}
    </div>
  );
}
