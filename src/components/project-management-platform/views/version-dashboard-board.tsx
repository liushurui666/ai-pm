"use client";

import type { VersionDashboardSnapshot, VersionOwnerLoad } from "@/components/project-management-platform/views/version-dashboard-utils";
import {
  KpiWidget,
  OwnerBoardWidget,
  PlaceholderWidget,
  ProgressFunnelWidget,
  RiskDistributionWidget,
  VersionRankWidget
} from "@/components/project-management-platform/views/version-dashboard-board-widgets";

type WidgetAction = (widgetId: string) => void;

// 截图式版本仪表盘只负责网格排版，具体组件拆到 widgets 文件保持职责清晰。
export function VersionDashboardBoard({
  ownerLoads,
  selectedWidgetId,
  snapshots,
  onAnalyze,
  onOpenVersion,
  onSelect
}: {
  ownerLoads: VersionOwnerLoad[];
  selectedWidgetId: string;
  snapshots: VersionDashboardSnapshot[];
  onAnalyze: WidgetAction;
  onOpenVersion: (versionId: string) => void;
  onSelect: WidgetAction;
}) {
  const delayedTaskCount = snapshots.reduce((sum, snapshot) => sum + snapshot.overdueTaskCount, 0);
  const rankSnapshots = [...snapshots].sort((left, right) => right.taskCount - left.taskCount || right.deliveryScore - left.deliveryScore);
  const taskCount = snapshots.reduce((sum, snapshot) => sum + snapshot.taskCount, 0);

  return (
    <div className="version-board-grid">
      <div className="version-board-lane">
        <KpiWidget
          active={selectedWidgetId === "metric-total"}
          id="metric-total"
          label="任务总数"
          value={taskCount}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        />
        <RiskDistributionWidget
          active={selectedWidgetId === "risk-distribution"}
          snapshots={snapshots}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        />
      </div>
      <div className="version-board-lane">
        <KpiWidget
          active={selectedWidgetId === "metric-delayed"}
          danger
          id="metric-delayed"
          label="延期任务"
          value={delayedTaskCount}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        />
        <VersionRankWidget
          active={selectedWidgetId === "version-rank"}
          snapshots={rankSnapshots.slice(0, 8)}
          onAnalyze={onAnalyze}
          onOpenVersion={onOpenVersion}
          onSelect={onSelect}
        />
      </div>
      <div className="version-board-lane version-board-lane-wide">
        <PlaceholderWidget
          active={selectedWidgetId === "version-trend"}
          id="version-trend"
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        />
        <OwnerBoardWidget
          active={selectedWidgetId === "owner-board"}
          ownerLoads={ownerLoads}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        />
        <ProgressFunnelWidget
          active={selectedWidgetId === "progress-funnel"}
          snapshots={snapshots}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
