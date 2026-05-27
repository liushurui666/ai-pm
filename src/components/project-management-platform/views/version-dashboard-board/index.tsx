"use client";

import "./index.less";
import type { VersionDashboardSnapshot, VersionOwnerLoad } from "@/components/project-management-platform/views/version-dashboard-utils";
import {
  KpiWidget,
  OwnerBoardWidget,
  ProgressFunnelWidget,
  RiskDistributionWidget,
  VersionRankWidget
} from "@/components/project-management-platform/views/version-dashboard-board-widgets";
import { VersionHealthWidget } from "@/components/project-management-platform/views/version-dashboard-health-widget";

// 版本仪表盘只负责网格排版，具体指标和图表拆到 widgets 文件保持职责清晰。
export function VersionDashboardBoard({
  ownerLoads,
  snapshots,
  onOpenVersion
}: {
  ownerLoads: VersionOwnerLoad[];
  snapshots: VersionDashboardSnapshot[];
  onOpenVersion: (versionId: string) => void;
}) {
  const delayedTaskCount = snapshots.reduce((sum, snapshot) => sum + snapshot.overdueTaskCount, 0);
  const rankSnapshots = [...snapshots].sort((left, right) => right.taskCount - left.taskCount || right.deliveryScore - left.deliveryScore);
  const taskCount = snapshots.reduce((sum, snapshot) => sum + snapshot.taskCount, 0);

  return (
    <div className="version-board-grid">
      <div className="version-board-lane">
        <KpiWidget
          id="metric-total"
          label="任务总数"
          value={taskCount}
        />
        <RiskDistributionWidget
          snapshots={snapshots}
        />
      </div>
      <div className="version-board-lane">
        <KpiWidget
          danger
          id="metric-delayed"
          label="延期任务"
          value={delayedTaskCount}
        />
        <VersionRankWidget
          snapshots={rankSnapshots.slice(0, 8)}
          onOpenVersion={onOpenVersion}
        />
      </div>
      <div className="version-board-lane version-board-lane-wide">
        <VersionHealthWidget snapshots={snapshots} />
        <OwnerBoardWidget
          ownerLoads={ownerLoads}
        />
        <ProgressFunnelWidget
          snapshots={snapshots}
        />
      </div>
    </div>
  );
}
