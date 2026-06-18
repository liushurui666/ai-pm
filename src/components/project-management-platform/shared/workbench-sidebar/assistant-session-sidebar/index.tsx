"use client";

import "./index.less";
import { Button, Popconfirm, Tooltip, Typography } from "antd";
import { DeleteOutlined, DownloadOutlined, MessageOutlined, PlusOutlined } from "@ant-design/icons";
import type { AssistantSessionSidebarRenderProps } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box";

const { Text } = Typography;

// 左侧 Chat 历史栏是助手工作模式的主要导航；这里单独承载导出、清空、删除，避免主平台容器混入会话列表展示细节。
export function AssistantSessionSidebar(props: AssistantSessionSidebarRenderProps) {
  return (
    <div className="pm-chat-session-menu">
      <Button
        block
        className="pm-chat-new-button"
        disabled={props.disabled}
        icon={<PlusOutlined />}
        type="primary"
        onClick={props.onCreateSession}
      >
        新建聊天
      </Button>
      <div className="pm-chat-session-actions" aria-label="当前对话操作">
        <Tooltip title="导出当前对话">
          <Button
            aria-label="导出当前对话"
            disabled={!props.hasUserMessages}
            icon={<DownloadOutlined />}
            type="text"
            onClick={props.onExportConversation}
          />
        </Tooltip>
        <Popconfirm
          title="清空当前对话？"
          okText="清空"
          cancelText="取消"
          disabled={props.disabled || !props.hasUserMessages}
          onConfirm={props.onClearConversation}
        >
          <Tooltip title="清空当前对话">
            <Button
              aria-label="清空当前对话"
              disabled={props.disabled || !props.hasUserMessages}
              icon={<DeleteOutlined />}
              type="text"
            />
          </Tooltip>
        </Popconfirm>
      </div>
      <div className="pm-chat-history">
        <Text className="pm-chat-history-title">历史对话</Text>
        <div className="pm-chat-history-list">
          {props.sessions.map((session) => {
            const isActive = session.id === props.activeSessionId;
            const updatedAt = session.updatedAt > 0
              ? new Date(session.updatedAt).toLocaleDateString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit"
                })
              : "刚刚";

            return (
              <div className={isActive ? "pm-chat-history-item is-active" : "pm-chat-history-item"} key={session.id}>
                <button
                  className="pm-chat-history-main"
                  disabled={props.disabled}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => props.onSelectSession(session.id)}
                >
                  <MessageOutlined />
                  <span className="pm-chat-history-copy">
                    <span>{session.title || "新对话"}</span>
                    <em>{updatedAt}</em>
                  </span>
                </button>
                <Popconfirm
                  title="删除这条对话？"
                  okText="删除"
                  cancelText="取消"
                  disabled={props.disabled}
                  onConfirm={() => props.onDeleteSession(session.id)}
                >
                  <Tooltip title="删除对话">
                    <Button
                      aria-label="删除对话"
                      className="pm-chat-history-delete"
                      disabled={props.disabled}
                      icon={<DeleteOutlined />}
                      type="text"
                    />
                  </Tooltip>
                </Popconfirm>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
