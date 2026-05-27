"use client";

import { Button, Card, Col, Empty, Flex, Row, Space, Tag, Typography } from "antd";
import { AlertOutlined, BugOutlined, CheckCircleOutlined, ClockCircleOutlined, RobotOutlined } from "@ant-design/icons";
import type { DashboardData } from "@/types/dashboard";
import { isMyOwnerRecord } from "@/components/project-management-platform/identity";
import { MetricCard } from "@/components/project-management-platform/shared/metric-card";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import {
  formatOverviewBugCreatedAt,
  isMyOverviewBug,
  isOverdueOverviewTask,
  overviewBugSeverityColor,
  overviewBugStatusColor,
  overviewTaskPriorityColor,
  sortBugsForPersonalFocus,
  sortTasksForPersonalFocus
} from "@/components/project-management-platform/views/overview-utils";

const { Title, Text, Paragraph } = Typography;

export function OverviewView({
  data,
  onGenerateReport,
  onViewBugs,
  onViewTasks,
  onOpenAssistant
}: {
  data: DashboardData;
  onGenerateReport: () => void;
  onViewBugs: () => void;
  onViewTasks: () => void;
  onOpenAssistant: () => void;
}) {
  const currentUser = data.meta?.user;
  const personalTasks = currentUser ? data.tasks.filter((task) => isMyOwnerRecord(task, currentUser)) : data.tasks;
  const personalBugs = currentUser ? data.bugs.filter((bug) => isMyOverviewBug(bug, currentUser)) : data.bugs;
  const unresolvedTasks = personalTasks.filter((task) => task.stage !== "已完成");
  const unresolvedBugs = personalBugs.filter((bug) => bug.status !== "已关闭");
  const overdueTasks = unresolvedTasks.filter(isOverdueOverviewTask);
  const reviewBugs = unresolvedBugs.filter((bug) => bug.status === "待验证");
  const severeBugs = unresolvedBugs.filter((bug) => ["阻塞", "严重"].includes(bug.severity));
  const taskList = [...unresolvedTasks].sort(sortTasksForPersonalFocus).slice(0, 6);
  const bugList = [...unresolvedBugs].sort(sortBugsForPersonalFocus).slice(0, 6);
  const perspectiveName = currentUser ? currentUser.name : "团队";
  const focusTotal = unresolvedTasks.length + unresolvedBugs.length;

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <section className="overview-command">
        <div className="overview-command-main overview-personal-main">
          {/* 顶部信息区收拢身份、标题和总数，避免形成只有标签的空横栏。 */}
          <div className="overview-personal-header">
            <div className="overview-personal-heading">
              <div className="overview-personal-kicker">
                <span>{currentUser ? "个人待处理" : "团队待处理"}</span>
                <em>未关闭 Bug / 未完成任务 / 逾期项</em>
              </div>
              <Title level={2}>{perspectiveName}工作台</Title>
            </div>
            <div className="overview-focus-total">
              <strong>{focusTotal}</strong>
              <span>未解决项</span>
            </div>
          </div>
          <Paragraph>
            优先聚焦未关闭 Bug、未完成任务和已经逾期的执行项，把今天真正需要推进的事情放在第一屏。
          </Paragraph>
          <div className="overview-focus-summary">
            <div className="overview-focus-chip overview-focus-chip-task">
              <span>待办任务</span>
              <strong>{unresolvedTasks.length}</strong>
              <em>{overdueTasks.length} 个逾期</em>
            </div>
            <div className="overview-focus-chip overview-focus-chip-bug">
              <span>未关闭 Bug</span>
              <strong>{unresolvedBugs.length}</strong>
              <em>{severeBugs.length} 个阻塞/严重</em>
            </div>
            <div className="overview-focus-chip overview-focus-chip-review">
              <span>待验证 Bug</span>
              <strong>{reviewBugs.length}</strong>
              <em>需要确认是否闭环</em>
            </div>
          </div>
          <Space wrap>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={onViewTasks}>
              去任务看板
            </Button>
            <Button icon={<BugOutlined />} onClick={onViewBugs}>
              去 Bug 管理
            </Button>
            <Button icon={<RobotOutlined />} onClick={onOpenAssistant}>
              询问 AI 助手
            </Button>
            <Button icon={<RobotOutlined />} onClick={onGenerateReport}>
              导出周报
            </Button>
          </Space>
        </div>
      </section>

      <Row gutter={[16, 16]}>
        <MetricCard icon={<CheckCircleOutlined />} title={currentUser ? "我的待办任务" : "待办任务"} value={unresolvedTasks.length} suffix="个" tone="blue" />
        <MetricCard icon={<BugOutlined />} title={currentUser ? "我的未关闭 Bug" : "未关闭 Bug"} value={unresolvedBugs.length} suffix="个" tone="orange" />
        <MetricCard icon={<ClockCircleOutlined />} title="已逾期任务" value={overdueTasks.length} suffix="个" tone="violet" />
        <MetricCard icon={<AlertOutlined />} title="阻塞/严重 Bug" value={severeBugs.length} suffix="个" tone="green" />
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            className="overview-work-card"
            title={<Space><BugOutlined />未解决 Bug</Space>}
            extra={<Button type="link" onClick={onViewBugs}>查看全部</Button>}
          >
            {bugList.length ? (
              <div className="overview-work-list">
                {bugList.map((bug) => (
                  <div className="overview-work-item overview-work-item-bug" key={bug.id}>
                    <Flex justify="space-between" align="start" gap={12}>
                      <Text strong className="overview-work-title">{bug.title}</Text>
                      <Space size={4}>
                        <Tag color={overviewBugSeverityColor[bug.severity]}>{bug.severity}</Tag>
                        <Tag color={overviewBugStatusColor[bug.status]}>{bug.status}</Tag>
                      </Space>
                    </Flex>
                    <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                      <OwnerInline name={bug.owner || "未分配"} avatarUrl={bug.ownerAvatarUrl} secondary={bug.versionName || bug.project} />
                      <Text type="secondary">{formatOverviewBugCreatedAt(bug.createdAt)}</Text>
                    </Flex>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无未关闭 Bug" />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            className="overview-work-card"
            title={<Space><ClockCircleOutlined />待办任务</Space>}
            extra={<Button type="link" onClick={onViewTasks}>查看全部</Button>}
          >
            {taskList.length ? (
              <div className="overview-work-list">
                {taskList.map((task) => (
                  <div className="overview-work-item overview-work-item-task" key={task.id}>
                    <Flex justify="space-between" align="start" gap={12}>
                      <Text strong className="overview-work-title">{task.title}</Text>
                      <Space size={4}>
                        <Tag color={overviewTaskPriorityColor[task.priority]}>{task.priority}</Tag>
                        <Tag>{task.stage}</Tag>
                      </Space>
                    </Flex>
                    <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                      <OwnerInline name={task.owner || "未分配"} avatarUrl={task.ownerAvatarUrl} secondary={task.versionName || task.project} />
                      <Text type={isOverdueOverviewTask(task) ? "danger" : "secondary"}>截止 {task.dueDate}</Text>
                    </Flex>
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
