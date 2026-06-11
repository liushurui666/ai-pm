import { App } from "antd";
import { Conversations, type ConversationItemType } from "@ant-design/x";
import { DeleteOutlined, MessageOutlined, PlusOutlined } from "@ant-design/icons";
import type { AssistantChatSession } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-session-store";

type AssistantSessionBarProps = {
  activeSessionId: string;
  disabled: boolean;
  sessions: AssistantChatSession[];
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
};

// 会话栏只处理历史会话的可见操作，并使用 Ant Design X Conversations 统一 Chat 模式组件语义；
// 真正的消息持久化仍在父组件中完成，避免子组件直接改写本地 session 数据。
export function AssistantSessionBar({
  activeSessionId,
  disabled,
  sessions,
  onCreateSession,
  onDeleteSession,
  onSelectSession
}: AssistantSessionBarProps) {
  const { modal } = App.useApp();
  const conversationItems: ConversationItemType[] = sessions.map((session) => ({
    disabled,
    icon: <MessageOutlined />,
    key: session.id,
    label: session.title,
    title: session.title
  }));

  return (
    <div className="assistant-session-bar">
      <Conversations
        aria-label="选择历史对话"
        activeKey={activeSessionId}
        className="assistant-session-conversations"
        creation={{
          disabled,
          icon: <PlusOutlined />,
          label: "新建对话",
          onClick: onCreateSession
        }}
        items={conversationItems}
        menu={(conversation) => ({
          items: [
            {
              danger: true,
              disabled,
              icon: <DeleteOutlined />,
              key: "delete",
              label: "删除对话"
            }
          ],
          // 删除是本地会话级破坏操作，先确认再交给父组件统一更新 active 会话和消息水位。
          onClick: ({ domEvent, key }) => {
            domEvent.stopPropagation();

            if (disabled || key !== "delete") {
              return;
            }

            modal.confirm({
              cancelText: "取消",
              content: "删除后无法恢复，会自动切换到最近一条可用对话。",
              okText: "删除",
              okType: "danger",
              title: "删除这条对话？",
              onOk: () => onDeleteSession(String(conversation.key))
            });
          }
        })}
        onActiveChange={(sessionId) => onSelectSession(String(sessionId))}
      />
    </div>
  );
}
