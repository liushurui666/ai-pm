"use client";

import { DashboardOutlined } from "@ant-design/icons";
import { Flex, Typography } from "antd";
import type { ReactNode } from "react";
import type { VersionDashboardSnapshot } from "@/components/project-management-platform/views/version-dashboard-utils";
import { VersionDashboardWidget } from "@/components/project-management-platform/views/version-dashboard-widget";

const { Text } = Typography;

// 平均值用于聚合多个版本，单版本时也能复用同一套健康概览结构。
function getAverage(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

// 右上角展示真实版本健康信息，替代无数据占位，让看板第一屏有可判断的结论。
export function VersionHealthWidget({ snapshots }: { snapshots: VersionDashboardSnapshot[] }) {
  const readiness = getAverage(snapshots.map((snapshot) => snapshot.readiness));
  const taskCompletion = getAverage(snapshots.map((snapshot) => snapshot.taskCompletion));
  const milestoneCompletion = getAverage(snapshots.map((snapshot) => snapshot.milestoneCompletion));
  const openBugCount = snapshots.reduce((sum, snapshot) => sum + snapshot.openBugCount, 0);
  const blockerBugCount = snapshots.reduce((sum, snapshot) => sum + snapshot.blockerBugCount, 0);
  const overdueTaskCount = snapshots.reduce((sum, snapshot) => sum + snapshot.overdueTaskCount, 0);
  const nearestRelease = snapshots
    .filter((snapshot) => snapshot.daysToRelease >= 0)
    .sort((left, right) => left.daysToRelease - right.daysToRelease)[0];
  const releaseText = nearestRelease ? `${nearestRelease.daysToRelease} 天后发布` : "暂无近期发布";

  return (
    <VersionDashboardWidget className="version-board-card version-board-health-card" id="version-health" title="版本健康概览">
      <PanelTitle icon={<DashboardOutlined />} title="版本健康概览" />
      <div className="version-board-health-summary">
        <span>
          <Text type="secondary">当前范围</Text>
          <strong>{snapshots.length}</strong>
          <Text type="secondary">个版本</Text>
        </span>
        <span>
          <Text type="secondary">未关缺陷</Text>
          <strong className={openBugCount ? "version-board-health-warning" : ""}>{openBugCount}</strong>
          <Text type="secondary">阻塞 {blockerBugCount}</Text>
        </span>
        <span>
          <Text type="secondary">延期任务</Text>
          <strong className={overdueTaskCount ? "version-board-health-danger" : ""}>{overdueTaskCount}</strong>
          <Text type="secondary">{releaseText}</Text>
        </span>
      </div>
      <div className="version-board-health-progress">
        <ProgressLine label="需求就绪" value={readiness} />
        <ProgressLine label="任务完成" value={taskCompletion} />
        <ProgressLine label="里程碑" value={milestoneCompletion} />
      </div>
    </VersionDashboardWidget>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Flex align="center" gap={8} className="version-board-panel-title">
      {icon}
      <Text strong>{title}</Text>
    </Flex>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="version-board-health-progress-row">
      <span className="version-board-health-progress-heading">
        <Text type="secondary">{label}</Text>
        <strong>{value}%</strong>
      </span>
      <span className="version-board-health-progress-bar">
        <i style={{ width: `${Math.max(4, value)}%` }} />
      </span>
    </div>
  );
}
