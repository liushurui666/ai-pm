"use client";

import { Card, Col, Flex, Space, Statistic, Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

const { Text } = Typography;

export function MetricCard({
  description,
  help,
  icon,
  title,
  value,
  suffix,
  tone
}: {
  description?: string;
  help?: string;
  icon: ReactNode;
  title: string;
  value: number;
  suffix: string;
  tone: "blue" | "green" | "orange" | "violet";
}) {
  return (
    <Col xs={24} sm={12} xl={6}>
      <Card className={`metric-card metric-card-${tone}`}>
        <Flex justify="space-between" align="center">
          <Space orientation="vertical" size={4}>
            <Statistic
              title={
                help ? (
                  <Space size={4}>
                    <span>{title}</span>
                    <Tooltip title={help}>
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                ) : (
                  title
                )
              }
              value={value}
              suffix={suffix}
            />
            {description ? (
              <Text className="metric-description" type="secondary">
                {description}
              </Text>
            ) : null}
          </Space>
          <div className="metric-icon">{icon}</div>
        </Flex>
      </Card>
    </Col>
  );
}
