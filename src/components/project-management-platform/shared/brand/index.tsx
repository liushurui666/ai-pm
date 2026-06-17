"use client";

import "./index.less";
import { Typography } from "antd";

const { Text } = Typography;

// 侧边栏品牌区独立出来，避免主容器同时维护导航结构和品牌展示细节。
export function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="pm-brand">
      <div className="pm-brand-mark" aria-hidden="true">
        <span className="pm-brand-board">
          <span className="pm-brand-board-card pm-brand-board-card--one" />
          <span className="pm-brand-board-card pm-brand-board-card--two" />
          <span className="pm-brand-board-card pm-brand-board-card--three" />
          <span className="pm-brand-board-node" />
        </span>
      </div>
      {!collapsed ? (
        <div>
          <Text className="pm-brand-title">AI PM</Text>
          <Text className="pm-brand-subtitle">智能项目管理平台</Text>
        </div>
      ) : null}
    </div>
  );
}
