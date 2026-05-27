"use client";

import { LinkOutlined, RobotOutlined } from "@ant-design/icons";
import { Button, Space, Tag, Tooltip, Typography } from "antd";
import type { BugReport, BugFixJobStatus } from "@/types/dashboard";
import "./index.less";

const { Text } = Typography;

const statusText: Record<BugFixJobStatus, string> = {
  queued: "排队中",
  preparing: "准备中",
  analyzing: "分析中",
  coding: "修复中",
  testing: "校验中",
  pushing: "提交中",
  mr_created: "MR 已创建",
  failed: "修复失败",
  canceled: "已取消"
};

const statusColor: Record<BugFixJobStatus, string> = {
  queued: "default",
  preparing: "processing",
  analyzing: "processing",
  coding: "blue",
  testing: "geekblue",
  pushing: "purple",
  mr_created: "green",
  failed: "red",
  canceled: "default"
};

// Bug AI 修复状态组件只负责展示快照，具体创建和轮询由外层卡片处理。
export function BugAiFixStatus({ bug, compact = false }: { bug: BugReport; compact?: boolean }) {
  const aiFix = bug.aiFix;

  if (!aiFix?.status) {
    return compact ? <Text type="secondary">未触发</Text> : <Tag icon={<RobotOutlined />}>未触发 AI 修复</Tag>;
  }

  return (
    <Space size={8} wrap className={compact ? "bug-ai-fix-status compact" : "bug-ai-fix-status"}>
      <Tag icon={<RobotOutlined />} color={statusColor[aiFix.status]}>
        {statusText[aiFix.status]}
      </Tag>
      {aiFix.mrUrl ? (
        <Tooltip title="查看 AI 自动创建的 MR/PR">
          <Button size="small" type="link" href={aiFix.mrUrl} target="_blank" rel="noreferrer" icon={<LinkOutlined />}>
            查看 MR
          </Button>
        </Tooltip>
      ) : null}
      {!compact && aiFix.summary ? <Text type="secondary">{aiFix.summary}</Text> : null}
      {!compact && aiFix.error ? <Text type="danger">{aiFix.error}</Text> : null}
    </Space>
  );
}
