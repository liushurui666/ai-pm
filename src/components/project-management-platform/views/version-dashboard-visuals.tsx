"use client";

import { BranchesOutlined, CheckCircleOutlined, ClockCircleOutlined, NodeIndexOutlined, RocketOutlined } from "@ant-design/icons";
import type { CSSProperties, ReactNode } from "react";
import type { RequirementVersion, TaskStage } from "@/types/dashboard";

type PercentStyle = CSSProperties & {
  "--version-dashboard-percent": string;
};

type StatusStyle = CSSProperties & {
  "--version-status-archived": string;
  "--version-status-planning": string;
  "--version-status-progress": string;
  "--version-status-released": string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getPercentStyle(percent: number): PercentStyle {
  return {
    "--version-dashboard-percent": `${clampPercent(percent)}%`
  };
}

// 大屏顶部的专属版本徽标，用已有 Ant 图标组合出入口级视觉识别。
export function VersionDashboardMark() {
  return (
    <div className="version-dashboard-mark" aria-hidden="true">
      <span className="version-dashboard-mark-orbit version-dashboard-mark-orbit-top">
        <NodeIndexOutlined />
      </span>
      <span className="version-dashboard-mark-core">
        <RocketOutlined />
      </span>
      <span className="version-dashboard-mark-orbit version-dashboard-mark-orbit-bottom">
        <BranchesOutlined />
      </span>
    </div>
  );
}

// 交付分环形图比单条进度条更适合投屏场景，用 CSS 变量承载分数。
export function VersionScoreGauge({ percent, label }: { percent: number; label: string }) {
  return (
    <span className="version-dashboard-gauge" style={getPercentStyle(percent)} aria-label={`${label} ${percent} 分`}>
      <span className="version-dashboard-gauge-inner">
        <strong>{percent}</strong>
        <em>{label}</em>
      </span>
    </span>
  );
}

// 状态甜甜圈把版本生命周期分布做成真正的图形，而不只是列表数字。
export function VersionStatusDonut({
  counts,
  total
}: {
  counts: Record<RequirementVersion["status"], number>;
  total: number;
}) {
  const planning = total ? (counts.规划中 / total) * 100 : 0;
  const progress = total ? (counts.进行中 / total) * 100 : 0;
  const released = total ? (counts.已发布 / total) * 100 : 0;
  const archived = Math.max(0, 100 - planning - progress - released);
  const style: StatusStyle = {
    "--version-status-archived": `${archived}%`,
    "--version-status-planning": `${planning}%`,
    "--version-status-progress": `${planning + progress}%`,
    "--version-status-released": `${planning + progress + released}%`
  };

  return (
    <div className="version-dashboard-donut" style={style} aria-label={`版本状态共 ${total} 个`}>
      <span>
        <strong>{total}</strong>
        <em>版本</em>
      </span>
    </div>
  );
}

function getStageIcon(stage: TaskStage): ReactNode {
  if (stage === "已完成") {
    return <CheckCircleOutlined />;
  }

  if (stage === "进行中") {
    return <RocketOutlined />;
  }

  if (stage === "评审中") {
    return <BranchesOutlined />;
  }

  return <ClockCircleOutlined />;
}

// 阶段节点图给任务流转加上清晰图标节点，和横向数量条互相补充。
export function TaskStageNode({ active, stage }: { active: boolean; stage: TaskStage }) {
  return (
    <span className={`version-dashboard-stage-node${active ? " version-dashboard-stage-node-active" : ""}`}>
      {getStageIcon(stage)}
    </span>
  );
}
