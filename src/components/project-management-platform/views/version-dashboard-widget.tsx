"use client";

import { Button, Space, Tooltip } from "antd";
import { MoreOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

const selectionHandles = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

// 大屏组件外壳模拟截图里的搭建态交互：选中、角点、拖拽手柄和组件级工具条。
export function VersionDashboardWidget({
  active,
  children,
  className = "",
  id,
  onAnalyze,
  onSelect,
  title
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  id: string;
  onAnalyze: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  title: string;
}) {
  return (
    <section
      className={`version-dashboard-widget${active ? " version-dashboard-widget-active" : ""} ${className}`.trim()}
      aria-label={title}
      tabIndex={0}
      onClick={() => onSelect(id)}
      onFocus={() => onSelect(id)}
    >
      <span className="version-dashboard-widget-drag" aria-hidden="true" />
      <Space className="version-dashboard-widget-tools" size={6}>
        <Tooltip title={`智能分析：${title}`}>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              onAnalyze(id, title);
            }}
          >
            智能分析
          </Button>
        </Tooltip>
        <Tooltip title="更多组件操作">
          <Button
            size="small"
            icon={<MoreOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(id);
            }}
          />
        </Tooltip>
      </Space>
      {active ? (
        <span className="version-dashboard-widget-handles" aria-hidden="true">
          {selectionHandles.map((handle) => (
            <i className={`version-dashboard-widget-handle version-dashboard-widget-handle-${handle}`} key={handle} />
          ))}
        </span>
      ) : null}
      {children}
    </section>
  );
}
