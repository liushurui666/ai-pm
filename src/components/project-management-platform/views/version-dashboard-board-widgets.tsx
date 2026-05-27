"use client";

import { Avatar, Badge, Empty, Flex, Space, Typography } from "antd";
import { BarChartOutlined, DashboardOutlined, TrophyOutlined, UserOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import type { VersionDashboardSnapshot, VersionOwnerLoad } from "@/components/project-management-platform/views/version-dashboard-utils";
import { VersionDashboardWidget } from "@/components/project-management-platform/views/version-dashboard-widget";

const { Text } = Typography;

// 百分比统一四舍五入，保证柱图和漏斗的文本口径一致。
function getPercent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

// 图表最小值兜底，避免空数据或全 0 时出现不可见的坐标。
function getMaxValue(values: number[]) {
  return Math.max(1, ...values);
}

// 风险分布模拟截图里的正常/延期/阻塞堆叠口径，便于后续换成真实枚举。
function getVersionRiskStats(snapshots: VersionDashboardSnapshot[]) {
  const delayed = snapshots.reduce((sum, snapshot) => sum + snapshot.overdueTaskCount, 0);
  const blocked = snapshots.reduce((sum, snapshot) => sum + snapshot.blockerBugCount, 0);
  const totalTasks = snapshots.reduce((sum, snapshot) => sum + snapshot.taskCount, 0);
  const normal = Math.max(0, totalTasks - delayed);

  return [
    { color: "var(--version-board-orange)", label: "已延期", value: delayed },
    { color: "var(--danger)", label: "阻塞缺陷", value: blocked },
    { color: "var(--version-board-green)", label: "正常", value: normal }
  ];
}

// 漏斗按任务阶段聚合，版本切换后仍然能看到该版本内部的推进情况。
function getStatusCounts(snapshots: VersionDashboardSnapshot[]) {
  const counts = snapshots.reduce(
    (currentCounts, snapshot) => {
      currentCounts.待处理 += snapshot.taskStageCounts.待处理;
      currentCounts.进行中 += snapshot.taskStageCounts.进行中;
      currentCounts.评审中 += snapshot.taskStageCounts.评审中;
      currentCounts.已完成 += snapshot.taskStageCounts.已完成;

      return currentCounts;
    },
    {
      待处理: 0,
      进行中: 0,
      评审中: 0,
      已完成: 0
    }
  );

  return [
    { color: "var(--version-board-orange)", label: "待处理", value: counts.待处理 },
    { color: "var(--version-board-green)", label: "进行中", value: counts.进行中 },
    { color: "var(--version-board-yellow)", label: "评审中", value: counts.评审中 },
    { color: "var(--brand)", label: "已完成", value: counts.已完成 }
  ];
}

// 大数字卡片保持极简，只展示标题和核心指标，贴近截图里的左上 KPI。
export function KpiWidget({
  danger = false,
  id,
  label,
  value
}: {
  danger?: boolean;
  id: string;
  label: string;
  value: number;
}) {
  return (
    <VersionDashboardWidget className="version-board-card version-board-kpi-card" id={id} title={label}>
      <Text className={danger ? "version-board-card-title version-board-card-title-danger" : "version-board-card-title"}>{label}</Text>
      <strong className={danger ? "version-board-kpi-value version-board-kpi-value-danger" : "version-board-kpi-value"}>{value}</strong>
    </VersionDashboardWidget>
  );
}

// 紧急程度分布用手绘式柱图表达，当前只依赖快照统计不引入图表库。
export function RiskDistributionWidget({
  snapshots
}: {
  snapshots: VersionDashboardSnapshot[];
}) {
  const stats = getVersionRiskStats(snapshots);
  const maxValue = getMaxValue(stats.map((item) => item.value));

  return (
    <VersionDashboardWidget className="version-board-card version-board-risk-card" id="risk-distribution" title="任务紧急程度分布">
      <PanelTitle icon={<BarChartOutlined />} title="任务紧急程度分布" />
      <LegendItems items={stats} />
      <div className="version-board-column-chart">
        {stats.map((item) => (
          <div className="version-board-column" key={item.label}>
            <span className="version-board-column-count" style={{ color: item.color }}>{item.value}</span>
            <i style={{ height: `${Math.max(6, (item.value / maxValue) * 100)}%`, background: item.color }} />
            <Text type="secondary">{item.label}</Text>
          </div>
        ))}
      </div>
    </VersionDashboardWidget>
  );
}

// 版本数排行把前三名做成头像榜，剩余项用紧凑列表承接。
export function VersionRankWidget({
  snapshots,
  onOpenVersion
}: {
  snapshots: VersionDashboardSnapshot[];
  onOpenVersion: (versionId: string) => void;
}) {
  return (
    <VersionDashboardWidget className="version-board-card version-board-rank-card" id="version-rank" title="版本任务数排行">
      <PanelTitle icon={<TrophyOutlined />} title="版本任务数排行" />
      {snapshots.length ? (
        <>
          <div className="version-board-rank-podium">
            {snapshots.slice(0, 3).map((snapshot, index) => (
              <button className="version-board-rank-leader" key={snapshot.id} onClick={() => onOpenVersion(snapshot.id)}>
                <Avatar className="version-board-rank-avatar">{snapshot.name.slice(0, 1)}</Avatar>
                <Badge count={index + 1} color="var(--version-board-yellow)" />
                <Text>{snapshot.name}</Text>
                <strong>{snapshot.taskCount}</strong>
              </button>
            ))}
          </div>
          <div className="version-board-rank-list">
            {snapshots.slice(3).map((snapshot, index) => (
              <button className="version-board-rank-row" key={snapshot.id} onClick={() => onOpenVersion(snapshot.id)}>
                <span>{index + 4}</span>
                <Text>{snapshot.name}</Text>
                <strong>{snapshot.taskCount}</strong>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无排行数据" />
      )}
    </VersionDashboardWidget>
  );
}

// 负责人看板复刻横向条形图，橙色表示延期或缺陷负载，绿色表示正常工作量。
export function OwnerBoardWidget({
  ownerLoads
}: {
  ownerLoads: VersionOwnerLoad[];
}) {
  const visibleOwners = ownerLoads.slice(0, 9);
  const maxValue = getMaxValue(visibleOwners.map((owner) => owner.openTaskCount + owner.bugCount));

  return (
    <VersionDashboardWidget className="version-board-card version-board-owner-card" id="owner-board" title="版本负责人看板">
      <PanelTitle icon={<UserOutlined />} title="版本负责人看板" />
      <LegendItems items={[{ color: "var(--version-board-orange)", label: "已延期", value: 0 }, { color: "var(--version-board-green)", label: "正常", value: 0 }]} showValues={false} />
      {visibleOwners.length ? (
        <div className="version-board-owner-bars">
          {visibleOwners.map((owner) => {
            const total = owner.openTaskCount + owner.bugCount;
            const delayedPercent = getPercent(owner.bugCount, Math.max(1, total));
            const normalPercent = Math.max(0, 100 - delayedPercent);

            return (
              <div className="version-board-owner-row" key={owner.name}>
                <Text type="secondary">{owner.name}</Text>
                <span className="version-board-owner-stack" style={{ width: `${Math.max(8, (total / maxValue) * 100)}%` }}>
                  {owner.bugCount ? <i className="version-board-owner-delay" style={{ width: `${delayedPercent}%` }} /> : null}
                  <i className="version-board-owner-normal" style={{ width: `${normalPercent}%` }} />
                </span>
                <strong>{total}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无负责人数据" />
      )}
    </VersionDashboardWidget>
  );
}

// 进展看板用漏斗表达任务阶段转换率，和截图的横向漏斗保持一致。
export function ProgressFunnelWidget({
  snapshots
}: {
  snapshots: VersionDashboardSnapshot[];
}) {
  const statusCounts = getStatusCounts(snapshots);
  const total = Math.max(1, statusCounts.reduce((sum, item) => sum + item.value, 0));

  return (
    <VersionDashboardWidget className="version-board-card version-board-progress-card" id="progress-funnel" title="任务进展看板">
      <PanelTitle icon={<DashboardOutlined />} title="任务进展看板" />
      <div className="version-board-funnel">
        {statusCounts.map((item, index) => {
          const percent = getPercent(item.value, total);
          const width = `${Math.max(12, 96 - index * 14)}%`;

          return (
            <div className="version-board-funnel-row" key={item.label}>
              <Text type="secondary">{item.label}</Text>
              <span style={{ width }}>
                <em style={{ width: `${Math.max(4, percent)}%`, background: item.color }} />
                <strong>{item.value}</strong>
              </span>
              <Text>{percent}%</Text>
            </div>
          );
        })}
      </div>
    </VersionDashboardWidget>
  );
}

// 面板标题只保留图表语义图标，避免出现没有动作的小按钮。
function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Flex align="center" gap={8} className="version-board-panel-title">
      {icon}
      <Text strong>{title}</Text>
    </Flex>
  );
}

// 图例统一小圆点样式，避免每个组件重复写结构。
function LegendItems({
  items,
  showValues = true
}: {
  items: Array<{ color: string; label: string; value: number }>;
  showValues?: boolean;
}) {
  return (
    <Space wrap size={[10, 6]} className="version-board-legend">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} />
          {showValues ? `${item.label} ${item.value}` : item.label}
        </span>
      ))}
    </Space>
  );
}
