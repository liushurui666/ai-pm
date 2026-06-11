import { Button, Popconfirm, Select, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { AssistantChatSession } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-session-store";

type AssistantSessionBarProps = {
  activeSessionId: string;
  disabled: boolean;
  sessions: AssistantChatSession[];
  onCreateSession: () => void;
  onDeleteSession: () => void;
  onSelectSession: (sessionId: string) => void;
};

// 会话栏只处理历史会话的可见操作，真正的消息持久化仍在父组件中统一完成，避免子组件改写会话状态。
// 这里使用紧凑 Select 而不是 Conversations：全屏 ChatBox 的主视觉必须留给 Bubble.List 消息区，
// 否则历史会话标题会像截图那样被放大成页面主内容，挤掉真实聊天输入和回复区域。
export function AssistantSessionBar({
  activeSessionId,
  disabled,
  sessions,
  onCreateSession,
  onDeleteSession,
  onSelectSession
}: AssistantSessionBarProps) {
  const sessionOptions = sessions.map((session) => ({
    label: session.title,
    value: session.id
  }));

  return (
    <div className="assistant-session-bar">
      <Tooltip title="新建对话">
        <Button
          aria-label="新建对话"
          icon={<PlusOutlined />}
          disabled={disabled}
          onClick={onCreateSession}
        />
      </Tooltip>
      <Select
        aria-label="选择历史对话"
        className="assistant-session-select"
        disabled={disabled}
        options={sessionOptions}
        popupMatchSelectWidth={false}
        value={activeSessionId}
        onChange={onSelectSession}
      />
      <Popconfirm
        title="删除当前对话？"
        description="删除后将切换到最近一条历史对话。"
        okText="删除"
        cancelText="取消"
        disabled={disabled}
        onConfirm={onDeleteSession}
      >
        <Tooltip title="删除当前对话">
          <Button
            aria-label="删除当前对话"
            danger
            icon={<DeleteOutlined />}
            disabled={disabled}
          />
        </Tooltip>
      </Popconfirm>
    </div>
  );
}
