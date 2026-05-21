"use client";

import { Alert, Flex, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, WarningOutlined } from "@ant-design/icons";
import type { ProjectDelayRiskItem, ProjectDelaySummary as ProjectDelaySummaryData } from "@/components/project-management-platform/views/project-calendar-utils";

const { Text } = Typography;

function DelayRiskTag({ item }: { item: ProjectDelayRiskItem }) {
  return (
    <div className="project-delay-risk-tag">
      <Tag color={item.reason === "任务已逾期" ? "red" : item.reason === "版本发布日期已过" ? "volcano" : "orange"}>
        {item.reason}
      </Tag>
      <span>{item.title}</span>
      <em>{item.owner} · {item.date} · {item.days} 天</em>
    </div>
  );
}

// 延期汇总放在项目视图顶部，优先暴露需要项目经理调整版本计划的任务和版本。
export function ProjectDelaySummary({ summary }: { summary: ProjectDelaySummaryData }) {
  const visibleRisks = [
    ...summary.overdueTasks,
    ...summary.scheduleOverflowTasks,
    ...summary.delayedVersions
  ].slice(0, 5);

  if (!summary.total) {
    return (
      <div className="project-delay-summary project-delay-summary-stable">
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Space>
            <CheckCircleOutlined />
            <Text strong>延期汇总</Text>
          </Space>
          <Text type="secondary">当前版本范围暂无需要延期处理的任务或版本。</Text>
        </Flex>
      </div>
    );
  }

  return (
    <div className="project-delay-summary project-delay-summary-risk">
      <Flex align="flex-start" justify="space-between" gap={16} wrap>
        <Space align="start" size={12}>
          <WarningOutlined className="project-delay-summary-icon" />
          <span>
            <Text strong>延期汇总</Text>
            <Text type="secondary">
              已识别 {summary.total} 项需要调整计划，优先处理逾期任务和超出版本发布日期的任务。
            </Text>
          </span>
        </Space>
        <Space size={8} wrap>
          <Tag color="red">逾期任务 {summary.overdueTasks.length}</Tag>
          <Tag color="orange">排期超版本 {summary.scheduleOverflowTasks.length}</Tag>
          <Tag color="volcano">延期版本 {summary.delayedVersions.length}</Tag>
        </Space>
      </Flex>
      <div className="project-delay-risk-list">
        {visibleRisks.map((item) => (
          <DelayRiskTag item={item} key={`${item.reason}-${item.id}`} />
        ))}
      </div>
      {summary.total > visibleRisks.length ? (
        <Alert
          className="project-delay-summary-more"
          type="warning"
          showIcon
          icon={<ClockCircleOutlined />}
          title={`还有 ${summary.total - visibleRisks.length} 项延期风险，请在任务看板或版本详情继续处理。`}
        />
      ) : null}
    </div>
  );
}
