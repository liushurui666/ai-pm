"use client";

import { Button, Drawer, Form, Input, Space, Typography } from "antd";
import type { BugReport } from "@/types/dashboard";
import "./index.less";

const { Text } = Typography;

// AI 修复确认抽屉用于阻止误触，真实仓库匹配和安全范围由服务端按数据库配置校验。
export function BugAiFixDrawer({
  bug,
  loading,
  onClose,
  onConfirm,
  open
}: {
  bug: BugReport;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  return (
    <Drawer
      className="bug-ai-fix-drawer"
      title="确认 AI 生成修复 MR"
      open={open}
      width={460}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Text type="secondary">不会自动合并</Text>
        </Space>
      }
      footer={
        <Space className="bug-ai-fix-drawer-footer">
          <Button onClick={onClose}>
            取消
          </Button>
          <Button type="primary" loading={loading} onClick={onConfirm}>
            确认创建任务
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <Form.Item label="目标 Bug">
          <Input value={bug.title} readOnly />
        </Form.Item>
        <Form.Item label="目标仓库">
          <Input value="按 Bug 所属项目自动匹配项目仓库配置" readOnly />
        </Form.Item>
        <Form.Item label="基准分支">
          <Input value="使用仓库默认分支" readOnly />
        </Form.Item>
        <Form.Item label="执行结果">
          <Input value="AI 直接改代码、提交分支并自动创建 MR/PR" readOnly />
        </Form.Item>
        <Form.Item label="安全边界">
          <Input.TextArea
            value="禁止修改密钥、CI 权限、部署和基础设施文件；diff 越权会直接失败，不会 push。"
            autoSize={{ minRows: 3, maxRows: 4 }}
            readOnly
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
