"use client";

import { Button, Card, Col, Flex, Progress, Row, Space, Typography } from "antd";
import { BarChartOutlined, FileTextOutlined } from "@ant-design/icons";
import type { DashboardData } from "@/types/dashboard";
import { PageTitle } from "@/components/project-management-platform/shared/page-shell";

const { Text, Paragraph } = Typography;

export function ReportsView({ data, onGenerateReport }: { data: DashboardData; onGenerateReport: () => void }) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<BarChartOutlined />}
        title="报表驾驶舱"
        subtitle="为管理层提供进度、质量、风险和 AI 解释。"
        extra={
          <Button type="primary" icon={<FileTextOutlined />} onClick={onGenerateReport}>
            导出周报 MD
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="项目健康分布">
            <Space orientation="vertical" size={16} className="pm-wide">
              {data.projects.map((project) => (
                <div key={project.id}>
                  <Flex justify="space-between">
                    <Text>{project.name}</Text>
                    <Text strong>{project.health}</Text>
                  </Flex>
                  <Progress percent={project.health} showInfo={false} />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="交付预测">
            <div className="report-focus">
              <Progress type="dashboard" percent={data.metrics.deliveryRate} strokeColor="var(--teal)" />
              <Paragraph>
                AI 判断当前交付趋势稳定。若知识库增强项目风险在 3 天内关闭，本月达成率预计可提升到 91%。
              </Paragraph>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="资源负载">
            <div className="pm-list-stack">
              {[
                { team: "产品组", load: 82 },
                { team: "前端组", load: 76 },
                { team: "后端组", load: 91 },
                { team: "测试组", load: 88 }
              ].map((item) => (
                <div className="pm-list-item" key={item.team}>
                  <Space orientation="vertical" size={4} className="pm-wide">
                    <Flex justify="space-between">
                      <Text>{item.team}</Text>
                      <Text>{item.load}%</Text>
                    </Flex>
                    <Progress percent={item.load} showInfo={false} />
                  </Space>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
