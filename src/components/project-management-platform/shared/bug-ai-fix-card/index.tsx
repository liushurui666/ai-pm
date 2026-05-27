"use client";

import { BranchesOutlined, RobotOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Space, Typography } from "antd";
import { useState } from "react";
import type { BugReport } from "@/types/dashboard";
import { BugAiFixDrawer } from "@/components/project-management-platform/forms/bug-ai-fix-drawer";
import { BugAiFixStatus } from "@/components/project-management-platform/shared/bug-ai-fix-status";
import "./index.less";

const { Text } = Typography;

// Bug AI 修复卡片是 Bug 详情页的执行入口，成功结果必须是后台任务自动创建 MR/PR。
export function BugAiFixCard({
  bug,
  canCreate,
  disabledReason,
  onCreate
}: {
  bug: BugReport;
  canCreate: boolean;
  disabledReason: string;
  onCreate: (bug: BugReport) => Promise<void>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const aiFix = bug.aiFix;
  const active = aiFix?.status && !["mr_created", "failed", "canceled"].includes(aiFix.status);

  async function handleCreate() {
    setSubmitting(true);

    try {
      await onCreate(bug);
      setDrawerOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      className="bug-ai-fix-card"
      title={
        <Space>
          <RobotOutlined />
          <span>AI 修复 MR</span>
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={submitting}
          disabled={!canCreate || Boolean(active)}
          onClick={() => setDrawerOpen(true)}
        >
          AI 生成修复 MR
        </Button>
      }
    >
      <Space orientation="vertical" size={14} className="bug-ai-fix-card-body">
        <BugAiFixStatus bug={bug} />
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="目标结果">自动改代码、提交分支并创建 MR/PR</Descriptions.Item>
          <Descriptions.Item label="合并策略">不自动合并，必须人工 Review</Descriptions.Item>
          {aiFix?.branch ? <Descriptions.Item label="修复分支">{aiFix.branch}</Descriptions.Item> : null}
          {aiFix?.updatedAt ? <Descriptions.Item label="更新时间">{aiFix.updatedAt}</Descriptions.Item> : null}
        </Descriptions>
        {!canCreate ? <Text type="secondary">{disabledReason}</Text> : null}
        {active ? <Text type="secondary">当前 Bug 已有 AI 修复任务在执行，请等待任务完成。</Text> : null}
        <Text type="secondary">
          <BranchesOutlined /> Worker 会从 PostgreSQL 领取任务，执行校验后回写 MR 链接。
        </Text>
      </Space>
      <BugAiFixDrawer
        bug={bug}
        loading={submitting}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onConfirm={handleCreate}
      />
    </Card>
  );
}
