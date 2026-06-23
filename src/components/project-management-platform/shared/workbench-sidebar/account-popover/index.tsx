"use client";

import "./index.less";
import { Avatar, Button, Popover, Select, Space, Tooltip, Typography } from "antd";
import { DownOutlined, LogoutOutlined, PlusOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import type { DashboardWorkspace } from "@/types/dashboard";

const { Text } = Typography;

type WorkspaceOption = {
  value: string;
  label: string;
};

type AccountPopoverContentProps = {
  canCreateWorkspace: boolean;
  currentWorkspace?: DashboardWorkspace;
  logoutHref: string;
  permissionDeniedReason: string;
  showLogout: boolean;
  showWorkspaceControls?: boolean;
  userAvatarUrl?: string;
  userInitial: string;
  userName: string;
  workspaceOptions: WorkspaceOption[];
  workspaces?: DashboardWorkspace[];
  workspaceSelectOpen: boolean;
  onCreateWorkspace: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onWorkspaceSelectOpenChange: (open: boolean) => void;
};

type AccountAvatarPopoverProps = {
  content: ReactNode;
  placement: "bottomRight" | "topLeft";
  popoverClassName?: string;
  userAvatarUrl?: string;
  userInitial: string;
};

type AccountWorkspacePopoverProps = {
  content: ReactNode;
  currentWorkspaceName: string;
};

// 账号弹层同时服务顶部工作区入口和左下角身份入口；左下角只承担身份确认与退出登录，
// 工作区切换保留在顶部入口，避免两个位置出现重复的工作区 Select 干扰日常退出操作。
export function AccountPopoverContent({
  canCreateWorkspace,
  currentWorkspace,
  logoutHref,
  permissionDeniedReason,
  showLogout,
  showWorkspaceControls = true,
  userAvatarUrl,
  userInitial,
  userName,
  workspaceOptions,
  workspaces,
  workspaceSelectOpen,
  onCreateWorkspace,
  onSwitchWorkspace,
  onWorkspaceSelectOpenChange
}: AccountPopoverContentProps) {
  return (
    <Space className="pm-avatar-menu" orientation="vertical" size={12}>
      <Space className="pm-avatar-profile" size={10}>
        <Avatar className="pm-avatar" src={userAvatarUrl}>
          {userInitial}
        </Avatar>
        <Space className="pm-avatar-profile-copy" orientation="vertical" size={0}>
          <Text strong>{userName}</Text>
          <Text type="secondary">{currentWorkspace?.name ?? "当前工作区"}</Text>
        </Space>
      </Space>
      {showWorkspaceControls && workspaces?.length ? (
        <div className="pm-workspace-control">
          <Text className="pm-avatar-menu-label" type="secondary">
            工作区
          </Text>
          <Select
            aria-label="切换工作区"
            className="pm-workspace-select"
            getPopupContainer={(triggerNode) =>
              (triggerNode.closest(".pm-avatar-popover") as HTMLElement | null) ??
              triggerNode.parentElement ??
              document.body
            }
            open={workspaceSelectOpen}
            value={currentWorkspace?.id}
            options={workspaceOptions}
            popupMatchSelectWidth={220}
            popupRender={(menu) => (
              <>
                {menu}
                <div className="pm-workspace-popup-divider" />
                {canCreateWorkspace ? (
                  <Button
                    block
                    className="pm-workspace-popup-action"
                    icon={<PlusOutlined />}
                    type="text"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onCreateWorkspace}
                  >
                    新建工作区
                  </Button>
                ) : (
                  <Tooltip title={permissionDeniedReason}>
                    <span className="pm-workspace-popup-disabled">
                      <PlusOutlined />
                      新建工作区
                    </span>
                  </Tooltip>
                )}
              </>
            )}
            onOpenChange={onWorkspaceSelectOpenChange}
            onChange={onSwitchWorkspace}
          />
        </div>
      ) : null}
      {showLogout ? (
        <Button block className="pm-account-logout-button" href={logoutHref} icon={<LogoutOutlined />}>
          退出登录
        </Button>
      ) : null}
    </Space>
  );
}

// 顶栏工作区入口承接原左下角入口的切换能力，并和主题切换一起组成全局控制区。
export function AccountWorkspacePopover({ content, currentWorkspaceName }: AccountWorkspacePopoverProps) {
  return (
    <Popover
      arrow={false}
      classNames={{ root: "pm-avatar-popover pm-account-popover" }}
      content={content}
      placement="bottomRight"
      trigger="click"
    >
      <button className="pm-header-workspace-trigger" type="button" aria-label="打开账号与工作区菜单">
        <span className="pm-header-workspace-trigger-label" title={currentWorkspaceName}>
          {currentWorkspaceName}
        </span>
        <DownOutlined className="pm-header-workspace-trigger-chevron" />
      </button>
    </Popover>
  );
}

// 移动端空间更紧，保留头像入口，但仍复用同一套账号与工作区弹层。
export function AccountAvatarPopover({
  content,
  placement,
  popoverClassName,
  userAvatarUrl,
  userInitial
}: AccountAvatarPopoverProps) {
  return (
    <Popover
      arrow={false}
      classNames={{ root: popoverClassName ?? "pm-avatar-popover" }}
      content={content}
      placement={placement}
      trigger="click"
    >
      <button className="pm-avatar-trigger" type="button" aria-label="打开账户菜单">
        <Avatar className="pm-avatar" src={userAvatarUrl}>
          {userInitial}
        </Avatar>
      </button>
    </Popover>
  );
}
