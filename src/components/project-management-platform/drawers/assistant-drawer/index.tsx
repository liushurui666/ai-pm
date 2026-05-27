"use client";

import "./index.less";
import { Button, Drawer, Form, Input, Space, Spin, Tag, Typography } from "antd";
import { RobotOutlined, SendOutlined } from "@ant-design/icons";
import type { ChatMessage } from "@/components/project-management-platform/types";

const { Text } = Typography;

type AssistantDrawerProps = {
  chatLoading: boolean;
  form: ReturnType<typeof Form.useForm<{ message: string }>>[0];
  isMobile: boolean;
  messages: ChatMessage[];
  open: boolean;
  onClose: () => void;
  onSubmit: (values: { message: string }) => void;
};

// AI 助手抽屉只负责消息展示和输入提交，分析请求仍由主容器掌握工作区上下文。
export function AssistantDrawer({
  chatLoading,
  form,
  isMobile,
  messages,
  onClose,
  onSubmit,
  open
}: AssistantDrawerProps) {
  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          <span>AI 项目助手</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size={isMobile ? "large" : "default"}
      extra={<Tag color="blue">实时分析</Tag>}
    >
      <div className="assistant-panel">
        <div className="assistant-messages">
          {messages.map((message, index) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={`${message.role}-${index}`}>
              <Text>{message.content}</Text>
            </div>
          ))}
          {chatLoading ? (
            <div className="assistant-message assistant-message-assistant">
              <Spin size="small" /> <Text>正在分析项目数据...</Text>
            </div>
          ) : null}
        </div>

        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="message" noStyle>
            <Input.TextArea rows={3} placeholder="例如：帮我分析当前最大风险" maxLength={200} />
          </Form.Item>
          <Button className="assistant-send" type="primary" htmlType="submit" icon={<SendOutlined />} loading={chatLoading}>
            发送
          </Button>
        </Form>
      </div>
    </Drawer>
  );
}
