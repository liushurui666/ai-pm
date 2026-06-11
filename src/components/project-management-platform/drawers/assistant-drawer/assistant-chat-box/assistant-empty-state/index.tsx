"use client";

import { Welcome } from "@ant-design/x";
import { RobotOutlined } from "@ant-design/icons";

// 全屏助手的初始态使用 Ant Design X 的 Welcome，和 Bubble/Sender/Prompts 保持同一套 Chat 组件语义。
export function AssistantEmptyState() {
  return (
    <Welcome
      className="assistant-empty-state"
      description="输入你的问题，或使用上方快捷问题。助手会基于当前工作区数据给出结论、依据和建议行动。"
      icon={(
        <span className="assistant-empty-icon">
          <RobotOutlined />
        </span>
      )}
      title="开始分析项目"
      variant="borderless"
    />
  );
}
