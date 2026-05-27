"use client";

import "./index.less";
import type { ReactNode } from "react";

// 大屏组件外壳只提供统一卡片语义和样式，避免出现没有真实动作的搭建态控件。
export function VersionDashboardWidget({
  children,
  className = "",
  title
}: {
  children: ReactNode;
  className?: string;
  id: string;
  title: string;
}) {
  return (
    <section className={`version-dashboard-widget ${className}`.trim()} aria-label={title}>
      {children}
    </section>
  );
}
