"use client";

import { Typography } from "antd";
import { RobotOutlined } from "@ant-design/icons";

const { Text } = Typography;

// 全屏助手的初始态比气泡欢迎语更接近独立工作区，避免页面中央显得像打开了空抽屉。
export function AssistantEmptyState() {
  return (
    <div className="assistant-empty-state">
      <span className="assistant-empty-icon">
        <RobotOutlined />
      </span>
      <Text strong>开始分析项目</Text>
      <Text type="secondary">
        输入你的问题，或使用上方快捷问题。助手会基于当前工作区数据给出结论、依据和建议行动。
      </Text>
    </div>
  );
}
