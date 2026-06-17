"use client";

import "./index.less";
import { Card, Space, Typography } from "antd";
import type { ReactNode } from "react";

const { Title, Text } = Typography;

export function PageTitle({
  icon,
  title,
  subtitle,
  extra
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  extra?: ReactNode;
}) {
  return (
    <div className="page-title">
      <Space align="start" size={14}>
        <div className="page-title-icon">{icon}</div>
        <div className="page-title-copy">
          <Title level={2}>{title}</Title>
          <Text type="secondary">{subtitle}</Text>
        </div>
      </Space>
      {extra ? <div className="page-title-extra">{extra}</div> : null}
    </div>
  );
}

export function TableView({
  title,
  subtitle,
  icon,
  extra,
  children
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle icon={icon} title={title} subtitle={subtitle} extra={extra} />
      {/* 表格页共用同一个容器层级，避免各业务页自己散落阴影、边框和内边距。 */}
      <Card className="pm-table-card">{children}</Card>
    </Space>
  );
}
