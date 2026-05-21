"use client";

import { Alert, Badge, Button, Card, Flex, Progress, Segmented, Space, Statistic, Table, Tag, Typography } from "antd";
import { AlertOutlined, BugOutlined, ClockCircleOutlined, EditOutlined, FolderOpenOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { BugReport, Project, RequirementVersion, Risk, Task } from "@/types/dashboard";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import { TableView } from "@/components/project-management-platform/shared/page-shell";
import {
  createProjectRiskSummary,
  filterRiskSummaries,
  getRiskColor,
  getRiskStrokeColor,
  type ProjectRiskFilter,
  type ProjectRiskSummary
} from "@/components/project-management-platform/views/project-risk-utils";

const { Text } = Typography;

// 项目管理页聚焦风险态势，项目本身只作为版本、任务、Bug 和风险的聚合维度。
export function ProjectsView({
  bugs,
  projects,
  projectFilter,
  risks,
  tasks,
  versions,
  onFilterChange,
  onCreate,
  onEdit
}: {
  bugs: BugReport[];
  projects: Project[];
  projectFilter: string;
  risks: Risk[];
  tasks: Task[];
  versions: RequirementVersion[];
  onFilterChange: (value: string) => void;
  onCreate: () => void;
  onEdit: (project: Project) => void;
}) {
  const activeFilter = (["全部", "高风险", "今日Bug", "延期风险"].includes(projectFilter)
    ? projectFilter
    : "全部") as ProjectRiskFilter;
  const summaries = projects
    .map((project) => createProjectRiskSummary({ bugs, project, risks, tasks, versions }))
    .sort((left, right) => right.riskScore - left.riskScore || right.todayOpenBugs.length - left.todayOpenBugs.length);
  const visibleSummaries = filterRiskSummaries(summaries, activeFilter);
  const totalTodayOpenBugs = summaries.reduce((sum, summary) => sum + summary.todayOpenBugs.length, 0);
  const totalOpenBugs = summaries.reduce((sum, summary) => sum + summary.openBugs, 0);
  const totalDelayRisks = summaries.filter(
    (summary) => summary.delayDays > 0 || summary.overdueTasks > 0 || summary.delayedVersions.length > 0
  ).length;
  const highRiskProjects = summaries.filter((summary) => summary.riskLevel === "高风险").length;
  const columns: ColumnsType<ProjectRiskSummary> = [
    {
      title: "项目",
      key: "project",
      fixed: "left",
      width: 260,
      render: (_, summary) => (
        <Space orientation="vertical" size={4}>
          <Text strong>{summary.project.name}</Text>
          <OwnerInline name={summary.project.owner} avatarUrl={summary.project.ownerAvatarUrl} />
          <Text type="secondary">{summary.project.summary}</Text>
        </Space>
      )
    },
    {
      title: "风险等级",
      key: "riskLevel",
      width: 150,
      sorter: (left, right) => left.riskScore - right.riskScore,
      render: (_, summary) => (
        <Space orientation="vertical" size={4} className="pm-wide">
          <Tag color={getRiskColor(summary.riskLevel)}>{summary.riskLevel}</Tag>
          <Progress percent={summary.riskScore} size="small" strokeColor={getRiskStrokeColor(summary.riskLevel)} />
        </Space>
      )
    },
    {
      title: "今日未解决 Bug",
      key: "todayBugs",
      width: 150,
      render: (_, summary) => (
        <Tag color={summary.todayOpenBugs.length ? "red" : "green"}>{summary.todayOpenBugs.length}</Tag>
      )
    },
    {
      title: "未关闭 Bug",
      key: "openBugs",
      width: 140,
      render: (_, summary) => (
        <Space size={4}>
          <Tag color={summary.openBugs ? "gold" : "green"}>{summary.openBugs}</Tag>
          {summary.blockerBugs ? <Tag color="red">阻塞/严重 {summary.blockerBugs}</Tag> : null}
        </Space>
      )
    },
    {
      title: "延期风险",
      key: "delay",
      width: 190,
      render: (_, summary) => (
        <Space orientation="vertical" size={2}>
          <Text type={summary.delayDays ? "danger" : "secondary"}>
            {summary.delayDays ? `最长延期 ${summary.delayDays} 天` : "暂无延期"}
          </Text>
          <Text type="secondary">
            任务 {summary.overdueTasks} / 版本 {summary.delayedVersions.length}
          </Text>
        </Space>
      )
    },
    {
      title: "风险项",
      key: "risks",
      width: 130,
      render: (_, summary) => (
        <Space size={4}>
          <Tag color={summary.highRisks ? "red" : "default"}>高 {summary.highRisks}</Tag>
          <Tag>{summary.risks.length}</Tag>
        </Space>
      )
    },
    {
      title: "关联版本",
      key: "versions",
      width: 120,
      render: (_, summary) => <Tag color="blue">{summary.versions.length}</Tag>
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 90,
      render: (_, summary) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(summary.project)}>
          编辑
        </Button>
      )
    }
  ];

  return (
    <TableView
      title="项目风险"
      subtitle="聚焦项目风险、今日未解决 Bug 和延期风险，项目只作为版本交付的聚合视角。"
      icon={<FolderOpenOutlined />}
      extra={
        <Space wrap>
          <Segmented
            value={activeFilter}
            onChange={(value) => onFilterChange(String(value))}
            options={["全部", "高风险", "今日Bug", "延期风险"]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建项目
          </Button>
        </Space>
      }
    >
      <div className="project-risk-metrics">
        <Card>
          <Statistic title="高风险项目" value={highRiskProjects} prefix={<AlertOutlined />} />
        </Card>
        <Card>
          <Statistic title="今日未解决 Bug" value={totalTodayOpenBugs} prefix={<BugOutlined />} />
        </Card>
        <Card>
          <Statistic title="未关闭 Bug" value={totalOpenBugs} prefix={<BugOutlined />} />
        </Card>
        <Card>
          <Statistic title="存在延期风险" value={totalDelayRisks} suffix="个项目" prefix={<ClockCircleOutlined />} />
        </Card>
      </div>
      <div className="project-risk-focus-grid">
        {visibleSummaries.slice(0, 3).map((summary) => (
          <Card
            className="project-risk-focus-card"
            key={summary.project.id}
            title={
              <Flex justify="space-between" align="center" gap={12}>
                <Text strong>{summary.project.name}</Text>
                <Badge color={getRiskColor(summary.riskLevel)} text={summary.riskLevel} />
              </Flex>
            }
          >
            <Space orientation="vertical" size={10} className="pm-wide">
              <Flex justify="space-between">
                <Text type="secondary">今日未解决 Bug</Text>
                <Text strong>{summary.todayOpenBugs.length}</Text>
              </Flex>
              <Flex justify="space-between">
                <Text type="secondary">未关闭 Bug</Text>
                <Text strong>{summary.openBugs}</Text>
              </Flex>
              <Flex justify="space-between">
                <Text type="secondary">延期风险</Text>
                <Text strong>{summary.delayDays ? `${summary.delayDays} 天` : "暂无"}</Text>
              </Flex>
              <Alert
                type={summary.riskLevel === "高风险" ? "error" : summary.riskLevel === "中风险" ? "warning" : "success"}
                showIcon
                message={
                  summary.riskLevel === "稳定"
                    ? "当前未发现明显交付风险"
                    : `优先处理 ${summary.blockerBugs} 个阻塞/严重 Bug、${summary.overdueTasks} 个逾期任务`
                }
              />
            </Space>
          </Card>
        ))}
      </div>
      <Table
        rowKey={(summary) => summary.project.id}
        columns={columns}
        dataSource={visibleSummaries}
        pagination={{ pageSize: 8, showSizeChanger: true }}
        scroll={{ x: 1280 }}
        locale={{ emptyText: "暂无符合筛选条件的项目风险" }}
        expandable={{
          expandedRowRender: (summary) => (
            <Space orientation="vertical" size={12} className="pm-wide project-risk-expand">
              {summary.todayOpenBugs.length ? (
                <Alert
                  type="error"
                  showIcon
                  message="今日未解决 Bug"
                  description={summary.todayOpenBugs.map((bug) => `${bug.title}（${bug.severity} / ${bug.status}）`).join("；")}
                />
              ) : null}
              {summary.delayedVersions.length ? (
                <Alert
                  type="warning"
                  showIcon
                  message="延期版本"
                  description={summary.delayedVersions.map((version) => `${version.name} 原计划 ${version.releaseDate}`).join("；")}
                />
              ) : null}
              {summary.risks.length ? (
                <Alert
                  type="info"
                  showIcon
                  message="风险项"
                  description={summary.risks.map((risk) => `${risk.title}：${risk.mitigation}`).join("；")}
                />
              ) : null}
            </Space>
          )
        }}
      />
    </TableView>
  );
}
