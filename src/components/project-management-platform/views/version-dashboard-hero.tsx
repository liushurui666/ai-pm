"use client";

import { Space, Tag, Typography } from "antd";
import { BugOutlined, CheckCircleOutlined, NodeIndexOutlined, RocketOutlined, WarningOutlined } from "@ant-design/icons";
import { MetricTile } from "@/components/project-management-platform/views/version-dashboard-panels";
import { VersionDashboardMark } from "@/components/project-management-platform/views/version-dashboard-visuals";
import { VersionDashboardWidget } from "@/components/project-management-platform/views/version-dashboard-widget";

const { Text, Title } = Typography;

type VersionDashboardMetrics = {
  activeVersions: number;
  averageReadiness: number;
  openBugs: number;
  riskVersions: number;
  totalTasks: number;
  totalVersions: number;
};

// 顶部区域按截图的组件交互拆出，主视图只需要传入统计和选中态。
export function VersionDashboardHero({
  metrics,
  selectedWidgetId,
  onAnalyze,
  onSelect
}: {
  metrics: VersionDashboardMetrics;
  selectedWidgetId: string;
  onAnalyze: (widgetId: string) => void;
  onSelect: (widgetId: string) => void;
}) {
  return (
    <div className="version-dashboard-hero">
      <VersionDashboardWidget
        active={selectedWidgetId === "hero"}
        className="version-dashboard-widget-hero"
        id="hero"
        title="版本交付态势"
        onAnalyze={onAnalyze}
        onSelect={onSelect}
      >
        <div className="version-dashboard-hero-copy">
          <VersionDashboardMark />
          <div className="version-dashboard-hero-text">
            <Space wrap size={[8, 8]}>
              <Tag icon={<RocketOutlined />}>{metrics.totalVersions} 个版本</Tag>
              <Tag icon={<CheckCircleOutlined />}>{metrics.totalTasks} 个任务</Tag>
              <Tag icon={<BugOutlined />}>{metrics.openBugs} 个未关闭 Bug</Tag>
            </Space>
            <Title level={3}>版本交付态势</Title>
            <Text type="secondary">
              汇总父子版本范围，把需求就绪、任务完成、里程碑完成和缺陷健康合成一个可对比的交付分。
            </Text>
          </div>
        </div>
      </VersionDashboardWidget>
      <div className="version-dashboard-metrics">
        <VersionDashboardWidget
          active={selectedWidgetId === "metric-total"}
          className="version-dashboard-widget-metric"
          id="metric-total"
          title="版本总数"
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        >
          <MetricTile icon={<NodeIndexOutlined />} label="版本总数" tone="brand" value={metrics.totalVersions} />
        </VersionDashboardWidget>
        <VersionDashboardWidget
          active={selectedWidgetId === "metric-active"}
          className="version-dashboard-widget-metric"
          id="metric-active"
          title="进行中版本"
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        >
          <MetricTile icon={<RocketOutlined />} label="进行中" tone="teal" value={metrics.activeVersions} />
        </VersionDashboardWidget>
        <VersionDashboardWidget
          active={selectedWidgetId === "metric-readiness"}
          className="version-dashboard-widget-metric"
          id="metric-readiness"
          title="平均就绪"
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        >
          <MetricTile icon={<CheckCircleOutlined />} label="平均就绪" suffix="%" tone="violet" value={metrics.averageReadiness} />
        </VersionDashboardWidget>
        <VersionDashboardWidget
          active={selectedWidgetId === "metric-risk"}
          className="version-dashboard-widget-metric"
          id="metric-risk"
          title="风险版本"
          onAnalyze={onAnalyze}
          onSelect={onSelect}
        >
          <MetricTile icon={<WarningOutlined />} label="风险版本" tone="amber" value={metrics.riskVersions} />
        </VersionDashboardWidget>
      </div>
    </div>
  );
}
