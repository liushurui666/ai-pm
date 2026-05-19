"use client";

import { Alert, Button, Card, Col, Flex, Row, Space, Tag, Typography } from "antd";
import { AlertOutlined, PlusOutlined } from "@ant-design/icons";
import type { Risk } from "@/types/dashboard";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import { PageTitle } from "@/components/project-management-platform/shared/page-shell";

const { Title, Text } = Typography;

const riskColor: Record<Risk["level"], string> = {
  高: "red",
  中: "gold",
  低: "green"
};

export function RisksView({ risks, onCreate }: { risks: Risk[]; onCreate: () => void }) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<AlertOutlined />}
        title="风险中心"
        subtitle="集中管理 AI 自动发现和人工登记的项目风险。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            登记风险
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        {risks.map((risk) => (
          <Col xs={24} lg={8} key={risk.id}>
            <Card className="risk-card">
              <Space orientation="vertical" size={12} className="pm-wide">
                <Flex justify="space-between" align="center">
                  <Tag color={riskColor[risk.level]}>{risk.level}风险</Tag>
                  <OwnerInline name={risk.owner} avatarUrl={risk.ownerAvatarUrl} />
                </Flex>
                <Title level={4}>{risk.title}</Title>
                <Text type="secondary">{risk.project}</Text>
                <Alert type={risk.level === "高" ? "error" : "warning"} showIcon title={risk.mitigation} />
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
