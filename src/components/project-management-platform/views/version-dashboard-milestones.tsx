"use client";

import { Empty, Tag, Typography } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import { PanelHeader } from "@/components/project-management-platform/views/version-dashboard-panels";
import { createVersionMilestoneSignals } from "@/components/project-management-platform/views/version-dashboard-utils";

const { Text } = Typography;

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
