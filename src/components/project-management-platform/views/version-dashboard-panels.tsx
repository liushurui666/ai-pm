"use client";

import { Avatar, Button, Empty, Flex, Progress, Space, Statistic, Tag, Tooltip, Typography } from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  FireOutlined,
  NodeIndexOutlined,
  RocketOutlined,
  UserOutlined
} from "@ant-design/icons";
import type { CSSProperties, ReactNode } from "react";
import type { RequirementVersion, Task } from "@/types/dashboard";
import { taskStages } from "@/components/project-management-platform/constants";
import {
  createVersionMilestoneSignals,
  createVersionOwnerLoads,
  type VersionDashboardSnapshot
} from "@/components/project-management-platform/views/version-dashboard-utils";

const { Text } = Typography;

export const versionStatuses: RequirementVersion["status"][] = ["规划中", "进行中", "已发布", "已归档"];

const versionStatusColor: Record<RequirementVersion["status"], string> = {
  规划中: "blue",
  进行中: "cyan",
  已发布: "green",
  已归档: "default"
};

type BarStyle = CSSProperties & {
  "--version-dashboard-bar": string;
};

function getBarStyle(percent: number): BarStyle {
  return {
    "--version-dashboard-bar": `${Math.max(2, Math.min(100, percent))}%`
  };
}

function getReleaseTone(snapshot: VersionDashboardSnapshot) {
  if (snapshot.status === "已发布" || snapshot.status === "已归档") {
    return "success";
  }

  if (snapshot.daysToRelease < 0) {
    return "danger";
  }

  if (snapshot.daysToRelease <= 7) {
    return "warning";
  }

  return "processing";
}

function getReleaseText(snapshot: VersionDashboardSnapshot) {
  if (snapshot.status === "已发布" || snapshot.status === "已归档") {
    return snapshot.releaseDate;
  }

  if (snapshot.daysToRelease < 0) {
    return `延期 ${Math.abs(snapshot.daysToRelease)} 天`;
  }

  return `${snapshot.daysToRelease} 天后发布`;
}

// 指标块保持轻量，不复用 Card，避免大屏里出现层层嵌套的面板感。
export function MetricTile({
  icon,
  label,
  suffix,
  tone,
  value
}: {
  icon: ReactNode;
  label: string;
  suffix?: string;
  tone: "brand" | "teal" | "violet" | "amber";
  value: number;
}) {
  return (
    <div className={`version-dashboard-metric version-dashboard-metric-${tone}`}>
      <div className="version-dashboard-metric-icon">{icon}</div>
      <Statistic title={label} value={value} suffix={suffix} />
    </div>
  );
}

// 交付排行用横向条形图表达，便于投屏时快速比较版本健康度。
export function VersionScoreboard({
  snapshots,
  onOpenVersion
}: {
  snapshots: VersionDashboardSnapshot[];
  onOpenVersion: (versionId: string) => void;
}) {
  return (
    <section className="version-dashboard-panel version-dashboard-panel-wide">
      <PanelHeader icon={<FireOutlined />} title="版本交付排行" subtitle="交付分越高，版本范围越接近可发布状态" />
      <div className="version-dashboard-rank-list">
        {snapshots.map((snapshot, index) => (
          <button className="version-dashboard-rank-row" key={snapshot.id} onClick={() => onOpenVersion(snapshot.id)}>
            <span className="version-dashboard-rank-index">{index + 1}</span>
            <span className="version-dashboard-rank-main">
              <strong>{snapshot.name}</strong>
              <em>{snapshot.project} · {getReleaseText(snapshot)}</em>
            </span>
            <span className="version-dashboard-bar" style={getBarStyle(snapshot.deliveryScore)}>
              <i />
            </span>
            <strong className="version-dashboard-score">{snapshot.deliveryScore}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

// 状态分布面板直接使用版本状态枚举，避免额外图表库带来的重量。
export function VersionDistribution({ snapshots }: { snapshots: VersionDashboardSnapshot[] }) {
  return (
    <section className="version-dashboard-panel">
      <PanelHeader icon={<NodeIndexOutlined />} title="状态分布" subtitle="版本生命周期占比" />
      <div className="version-dashboard-status-list">
        {versionStatuses.map((status) => {
          const count = snapshots.filter((snapshot) => snapshot.status === status).length;
          const percent = snapshots.length ? Math.round((count / snapshots.length) * 100) : 0;

          return (
            <div className="version-dashboard-status-row" key={status}>
              <Flex justify="space-between" align="center">
                <Tag color={versionStatusColor[status]}>{status}</Tag>
                <Text strong>{count}</Text>
              </Flex>
              <span className="version-dashboard-bar" style={getBarStyle(percent)}>
                <i />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// 阶段漏斗帮助看出版本范围内任务卡在哪个流转阶段。
export function TaskStageFunnel({ tasks }: { tasks: Task[] }) {
  const stageCounts = taskStages.map((stage) => ({
    count: tasks.filter((task) => task.stage === stage).length,
    stage
  }));
  const maxCount = Math.max(1, ...stageCounts.map((item) => item.count));

  return (
    <section className="version-dashboard-panel">
      <PanelHeader icon={<CheckCircleOutlined />} title="任务阶段" subtitle="全部版本任务流转" />
      <div className="version-dashboard-funnel">
        {stageCounts.map((item) => (
          <div className="version-dashboard-funnel-row" key={item.stage}>
            <Text type="secondary">{item.stage}</Text>
            <span className="version-dashboard-bar" style={getBarStyle((item.count / maxCount) * 100)}>
              <i />
            </span>
            <Text strong>{item.count}</Text>
          </div>
        ))}
      </div>
    </section>
  );
}

// 负责人面板突出跨版本负载，便于项目经理判断谁需要拆分职责。
export function OwnerLoadBoard({ loads }: { loads: ReturnType<typeof createVersionOwnerLoads> }) {
  return (
    <section className="version-dashboard-panel">
      <PanelHeader icon={<UserOutlined />} title="负责人负载" subtitle="角色、任务和 Bug 聚合" />
      <div className="version-dashboard-owner-list">
        {loads.length ? loads.map((owner) => (
          <div className="version-dashboard-owner-row" key={owner.name}>
            <Avatar src={owner.avatarUrl}>{owner.name.slice(0, 1)}</Avatar>
            <span>
              <Text strong>{owner.name}</Text>
              <Text type="secondary">{owner.versionCount} 个版本 · {owner.roleCount} 个角色</Text>
            </span>
            <Tag color={owner.openTaskCount ? "blue" : "green"}>{owner.openTaskCount} 任务</Tag>
            <Tag color={owner.bugCount ? "red" : "default"}>{owner.bugCount} Bug</Tag>
          </div>
        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无负责人负载" />}
      </div>
    </section>
  );
}

// 版本矩阵用紧凑卡片承载明细指标，是大屏下钻到需求版本详情的入口。
export function VersionMatrix({
  snapshots,
  onOpenVersion
}: {
  snapshots: VersionDashboardSnapshot[];
  onOpenVersion: (versionId: string) => void;
}) {
  return (
    <section className="version-dashboard-section">
      <PanelHeader icon={<RocketOutlined />} title="版本明细矩阵" subtitle="需求、任务、缺陷和里程碑一屏横看" />
      <div className="version-dashboard-card-grid">
        {snapshots.map((snapshot) => (
          <div className={`version-dashboard-version-card version-dashboard-release-${getReleaseTone(snapshot)}`} key={snapshot.id}>
            <Flex justify="space-between" align="start" gap={12}>
              <Space orientation="vertical" size={4}>
                <Text strong>{snapshot.name}</Text>
                <Text type="secondary">{snapshot.project}</Text>
                {snapshot.parentVersionName ? <Tag>上级：{snapshot.parentVersionName}</Tag> : null}
              </Space>
              <Tag color={versionStatusColor[snapshot.status]}>{snapshot.status}</Tag>
            </Flex>
            <Progress percent={snapshot.deliveryScore} size="small" />
            <div className="version-dashboard-card-metrics">
              <span><Text type="secondary">需求</Text><strong>{snapshot.requirementCount}</strong></span>
              <span><Text type="secondary">任务</Text><strong>{snapshot.doneTaskCount}/{snapshot.taskCount}</strong></span>
              <span><Text type="secondary">Bug</Text><strong>{snapshot.openBugCount}/{snapshot.bugCount}</strong></span>
              <span><Text type="secondary">里程碑</Text><strong>{snapshot.doneMilestoneCount}/{snapshot.milestoneCount}</strong></span>
            </div>
            <Space wrap size={[6, 6]}>
              <Tooltip title="版本发布时间">
                <Tag icon={<CalendarOutlined />}>{getReleaseText(snapshot)}</Tag>
              </Tooltip>
              {snapshot.overdueTaskCount ? <Tag color="red">{snapshot.overdueTaskCount} 延期任务</Tag> : null}
              {snapshot.blockerBugCount ? <Tag color="red">{snapshot.blockerBugCount} 阻塞 Bug</Tag> : null}
            </Space>
            <Button block onClick={() => onOpenVersion(snapshot.id)}>
              进入版本
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

// 里程碑信号把版本检查点抽出来，方便投屏时看最近交付节点。
export function MilestoneSignals({ signals }: { signals: ReturnType<typeof createVersionMilestoneSignals> }) {
  return (
    <section className="version-dashboard-section">
      <PanelHeader icon={<CalendarOutlined />} title="近期里程碑" subtitle="按日期排序的版本交付检查点" />
      {signals.length ? (
        <div className="version-dashboard-milestone-list">
          {signals.map((signal) => (
            <div className="version-dashboard-milestone-row" key={`${signal.versionId}-${signal.title}-${signal.date}`}>
              <Tag icon={<CalendarOutlined />}>{signal.date}</Tag>
              <span>
                <Text strong>{signal.title}</Text>
                <Text type="secondary">{signal.versionName} · {signal.owner || "未配置负责人"}</Text>
              </span>
              <Tag>{signal.status}</Tag>
            </div>
          ))}
        </div>
      ) : (
        <div className="version-dashboard-empty-inline">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前版本范围暂无里程碑" />
        </div>
      )}
    </section>
  );
}

function PanelHeader({
  icon,
  subtitle,
  title
}: {
  icon: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <Flex justify="space-between" align="start" gap={12} className="version-dashboard-panel-header">
      <Space align="start" size={10}>
        <span className="version-dashboard-panel-icon">{icon}</span>
        <span>
          <Text strong>{title}</Text>
          <Text type="secondary">{subtitle}</Text>
        </span>
      </Space>
    </Flex>
  );
}
