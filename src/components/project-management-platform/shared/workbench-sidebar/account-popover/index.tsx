"use client";

import "./index.less";
import { Avatar, Button, Popover, Select, Space, Tooltip, Typography } from "antd";
import { LogoutOutlined, PlusOutlined } from "@ant-design/icons";
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

// 账号弹层同时承担身份确认和工作区切换；保持在侧栏模块内，避免桌面底部入口和移动头像入口出现两套结构。
export function AccountPopoverContent({
  canCreateWorkspace,
  currentWorkspace,
  logoutHref,
  permissionDeniedReason,
  showLogout,
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
      {workspaces?.length ? (
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

// 移动端顶部头像和桌面侧栏底部账号入口共用同一弹层内容，只把触发器位置交给调用方决定。
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
