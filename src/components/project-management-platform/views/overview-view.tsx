"use client";

import { Alert, Button, Card, Col, Divider, Empty, Flex, Progress, Row, Space, Statistic, Tag, Typography } from "antd";
import { AlertOutlined, CheckCircleOutlined, ClockCircleOutlined, ProjectOutlined, RobotOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { DashboardData, Requirement, Task } from "@/types/dashboard";
import { MetricCard } from "@/components/project-management-platform/shared/metric-card";
import { OwnerAvatar, OwnerInline } from "@/components/project-management-platform/shared/owner-inline";

const { Title, Text, Paragraph } = Typography;

const priorityColor: Record<Task["priority"] | Requirement["priority"], string> = {
  高: "red",
  中: "gold",
  低: "green",
  P0: "red",
  P1: "blue",
  P2: "default"
};

export function OverviewView({
  data,
  onGenerateReport,
  onOpenAssistant,
  onViewProjects,
  onViewRisks
}: {
  data: DashboardData;
  onGenerateReport: () => void;
  onOpenAssistant: () => void;
  onViewProjects: () => void;
  onViewRisks: () => void;
}) {
  const topRiskProject = data.projects.length
    ? [...data.projects].sort((left, right) => left.health - right.health || right.riskCount - left.riskCount)[0]
    : null;
  const focusProjects = [...data.projects]
    .sort((left, right) => left.health - right.health || right.riskCount - left.riskCount)
    .slice(0, 3);
  const urgentTasks = data.tasks
    .filter((task) => task.stage !== "已完成")
    .sort((left, right) => dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf())
    .slice(0, 4);
  const aiSavedFormula = `估算口径：需求 ${data.requirements.length} 条 × 3h + 文档 ${data.documents.length} 份 × 2h + 任务 ${data.tasks.length} 条 × 1h + Bug ${data.bugs.length} 条 × 1h。`;

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      {data.meta?.message ? (
        <Alert
          className="pm-source-alert"
          type={data.meta.source === "local" ? "success" : "warning"}
          showIcon
          title={data.meta.message}
          description={
            <Space orientation="vertical" size={4}>
              {data.meta.storage ? <Text>数据存储：{data.meta.storage}</Text> : null}
              <Text>飞书用于登录、负责人选择和机器人通知，不作为项目主数据源。</Text>
            </Space>
          }
        />
      ) : null}
      <section className="overview-command">
        <div className="overview-command-main">
          <Tag color="blue">AI 项目运营中枢</Tag>
          <Title level={2}>今天优先关注 {focusProjects.filter((project) => project.status === "有风险").length} 个风险项目</Title>
          <Paragraph>
            系统已按项目健康度、逾期任务、Bug 严重程度和里程碑状态重新排序，优先处理健康度最低的项目。
          </Paragraph>
          <Space wrap>
            <Button type="primary" icon={<RobotOutlined />} onClick={onGenerateReport}>
              生成本周汇报
            </Button>
            <Button icon={<AlertOutlined />} onClick={onViewRisks}>
              查看风险清单
            </Button>
            <Button icon={<RobotOutlined />} onClick={onOpenAssistant}>
              询问 AI 助手
            </Button>
          </Space>
        </div>

        <div className="overview-risk-panel">
          {topRiskProject ? (
            <Space orientation="vertical" size={12} className="pm-wide">
              <Flex justify="space-between" align="center">
                <Text strong>最高风险项目</Text>
                <Tag color={topRiskProject.health < 70 ? "red" : "gold"}>{topRiskProject.status}</Tag>
              </Flex>
              <Title level={4}>{topRiskProject.name}</Title>
              <OwnerInline name={topRiskProject.owner} avatarUrl={topRiskProject.ownerAvatarUrl} />
              <Text type="secondary">{topRiskProject.summary}</Text>
              <Divider />
              <Row gutter={12}>
                <Col span={12}>
                  <Statistic title="健康度" value={topRiskProject.health} suffix="/ 100" />
                </Col>
                <Col span={12}>
                  <Statistic title="风险数" value={topRiskProject.riskCount} />
                </Col>
              </Row>
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目" />
          )}
        </div>
      </section>

      <Row gutter={[16, 16]}>
        <MetricCard icon={<ProjectOutlined />} title="活跃项目" value={data.metrics.activeProjects} suffix="个" tone="blue" />
        <MetricCard icon={<CheckCircleOutlined />} title="交付达成率" value={data.metrics.deliveryRate} suffix="%" tone="green" />
        <MetricCard icon={<ClockCircleOutlined />} title="逾期任务" value={data.metrics.overdueTasks} suffix="个" tone="orange" />
        <MetricCard
          icon={<RobotOutlined />}
          title="AI 节省工时"
          value={data.metrics.aiSavedHours}
          suffix="小时"
          tone="violet"
          description={aiSavedFormula}
          help={aiSavedFormula}
        />
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title={<Space><ProjectOutlined />项目健康度</Space>} extra={<Button type="link" onClick={onViewProjects}>查看全部</Button>}>
            <Space orientation="vertical" size={16} className="pm-wide">
              {focusProjects.map((project) => (
                <div className="project-health-row" key={project.id}>
                  <div>
                    <Text strong>{project.name}</Text>
                    <div>
                      <Space size={6}>
                        <OwnerAvatar name={project.owner} avatarUrl={project.ownerAvatarUrl} size="small" />
                        <Text type="secondary">{project.owner} · 截止 {project.dueDate}</Text>
                      </Space>
                    </div>
                  </div>
                  <div className="project-health-progress">
                    <Progress percent={project.progress} strokeColor={project.health >= 85 ? "var(--teal)" : "var(--amber)"} />
                  </div>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title={<Space><ClockCircleOutlined />近期任务</Space>}>
            {urgentTasks.length ? (
              <div className="pm-list-stack">
                {urgentTasks.map((task) => (
                  <div className="pm-list-item" key={task.id}>
                    <Space orientation="vertical" size={4} className="pm-wide">
                      <Flex justify="space-between" align="start" gap={12}>
                        <Text strong>{task.title}</Text>
                        <Tag color={priorityColor[task.priority]}>{task.priority}</Tag>
                      </Flex>
                      <Text type="secondary">{task.project} · {task.owner || "未分配"} · {task.dueDate}</Text>
                    </Space>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办任务" />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
