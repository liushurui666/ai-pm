"use client";

import { Button, Card, Col, Row, Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { AlertOutlined, BugOutlined, CheckCircleOutlined, EditOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import type { BugReport, FeishuUser } from "@/types/dashboard";
import { MetricCard } from "@/components/project-management-platform/shared/metric-card";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import { PageTitle } from "@/components/project-management-platform/shared/page-shell";

const { Text, Paragraph } = Typography;

type RequirementVersionOption = {
  value: string;
  label: string;
  versionName: string;
  project: string;
};

const bugSeverityColor: Record<BugReport["severity"], string> = {
  阻塞: "red",
  严重: "volcano",
  一般: "gold",
  轻微: "blue"
};

const bugStatusColor: Record<BugReport["status"], string> = {
  新建: "red",
  定位中: "gold",
  修复中: "blue",
  待验证: "purple",
  已关闭: "green"
};

function normalizeIdentity(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isMyBug(bug: BugReport, currentUser?: FeishuUser) {
  if (!currentUser) {
    return false;
  }

  const strictMatches = [
    [bug.ownerOpenId, currentUser.openId],
    [bug.ownerUnionId, currentUser.unionId],
    [bug.ownerUserId, currentUser.userId],
    [bug.ownerEmail, currentUser.email]
  ];

  if (strictMatches.some(([left, right]) => normalizeIdentity(left) && normalizeIdentity(left) === normalizeIdentity(right))) {
    return true;
  }

  const owner = normalizeIdentity(bug.owner);
  const reporter = normalizeIdentity(bug.reporter);
  const userIdentities = [currentUser.name, currentUser.enName, currentUser.email].map(normalizeIdentity).filter(Boolean);

  return userIdentities.some((identity) => owner === identity || reporter === identity);
}

function getBugEmptyText(onlyMine: boolean, projectFilter: string) {
  if (onlyMine && projectFilter !== "全部") {
    return "该项目暂无与你相关的 Bug";
  }

  if (onlyMine) {
    return "暂无与你相关的 Bug";
  }

  if (projectFilter !== "全部") {
    return "该项目暂无 Bug";
  }

  return "暂无 Bug，点击右上角提 Bug";
}

export function BugsView({
  bugs,
  currentUser,
  projectOptions,
  versionOptions,
  onCreate,
  onEdit
}: {
  bugs: BugReport[];
  currentUser?: FeishuUser;
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  onCreate: () => void;
  onEdit: (bug: BugReport) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"全部" | BugReport["status"]>("全部");
  const [projectFilter, setProjectFilter] = useState("全部");
  const [versionFilter, setVersionFilter] = useState("全部");
  const [onlyMine, setOnlyMine] = useState(false);
  const bugProjectOptions = useMemo(
    () => Array.from(new Set([...projectOptions, ...bugs.map((bug) => bug.project).filter(Boolean)])),
    [bugs, projectOptions]
  );
  const scopedBugs = useMemo(
    () => (onlyMine ? bugs.filter((bug) => isMyBug(bug, currentUser)) : bugs),
    [bugs, currentUser, onlyMine]
  );
  const projectScopedBugs = useMemo(
    () => (projectFilter === "全部" ? scopedBugs : scopedBugs.filter((bug) => bug.project === projectFilter)),
    [projectFilter, scopedBugs]
  );
  const visibleBugs = useMemo(() => {
    const statusScopedBugs =
      statusFilter === "全部" ? projectScopedBugs : projectScopedBugs.filter((bug) => bug.status === statusFilter);

    return versionFilter === "全部" ? statusScopedBugs : statusScopedBugs.filter((bug) => bug.versionId === versionFilter);
  }, [projectScopedBugs, statusFilter, versionFilter]);
  const openBugCount = projectScopedBugs.filter((bug) => bug.status !== "已关闭").length;
  const blockerCount = projectScopedBugs.filter((bug) => bug.severity === "阻塞" && bug.status !== "已关闭").length;
  const bugColumns: ColumnsType<BugReport> = [
    {
      title: "Bug",
      dataIndex: "title",
      key: "title",
      fixed: "left",
      width: 320,
      render: (_, bug) => (
        <Space orientation="vertical" size={4}>
          <Text strong>{bug.title}</Text>
          <Text type="secondary" ellipsis>{bug.reproduction}</Text>
        </Space>
      )
    },
    {
      title: "严重程度",
      dataIndex: "severity",
      key: "severity",
      width: 110,
      filters: ["阻塞", "严重", "一般", "轻微"].map((severity) => ({ text: severity, value: severity })),
      onFilter: (value, bug) => bug.severity === value,
      render: (severity: BugReport["severity"]) => <Tag color={bugSeverityColor[severity]}>{severity}</Tag>
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      filters: ["新建", "定位中", "修复中", "待验证", "已关闭"].map((status) => ({ text: status, value: status })),
      onFilter: (value, bug) => bug.status === value,
      render: (status: BugReport["status"]) => <Tag color={bugStatusColor[status]}>{status}</Tag>
    },
    { title: "项目", dataIndex: "project", key: "project", width: 190 },
    {
      title: "版本",
      dataIndex: "versionName",
      key: "versionName",
      width: 180,
      render: (_, bug) => bug.versionName ? <Tag color="blue">{bug.versionName}</Tag> : <Tag>未规划</Tag>
    },
    { title: "提交人", dataIndex: "reporter", key: "reporter", width: 120 },
    {
      title: "负责人",
      dataIndex: "owner",
      key: "owner",
      width: 140,
      render: (_, bug) => <OwnerInline name={bug.owner} avatarUrl={bug.ownerAvatarUrl} />
    },
    { title: "环境", dataIndex: "environment", key: "environment", width: 180 },
    {
      title: "截止日期",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 130,
      sorter: (left, right) => dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf(),
      render: (dueDate: string, bug) => (
        <Text type={bug.status !== "已关闭" && dayjs(dueDate).isBefore(dayjs().startOf("day")) ? "danger" : "secondary"}>
          {dueDate}
        </Text>
      )
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 90,
      render: (_, bug) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(bug)}>
          编辑
        </Button>
      )
    }
  ];

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<BugOutlined />}
        title="Bug 管理"
        subtitle="给测试、产品和业务同学提 Bug，保留复现步骤、环境、预期和实际结果。"
        extra={
          <Space wrap>
            <Segmented
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as "全部" | BugReport["status"])}
              options={["全部", "新建", "定位中", "修复中", "待验证", "已关闭"]}
            />
            <Select
              className="bug-project-filter"
              showSearch
              value={projectFilter}
              onChange={setProjectFilter}
              optionFilterProp="label"
              options={[{ value: "全部", label: "全部项目" }, ...bugProjectOptions.map((project) => ({ value: project, label: project }))]}
            />
            <Select
              className="bug-project-filter"
              showSearch
              value={versionFilter}
              onChange={setVersionFilter}
              optionFilterProp="label"
              options={[{ value: "全部", label: "全部版本" }, ...versionOptions.map((version) => ({ value: version.value, label: version.label }))]}
            />
            <Tooltip title={currentUser ? `匹配提交人或修复负责人：${currentUser.name}` : "未获取到登录用户"}>
              <Space className="task-mine-filter">
                <Text type="secondary">只看我的</Text>
                <Switch checked={onlyMine} disabled={!currentUser} onChange={setOnlyMine} />
              </Space>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
              提 Bug
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <MetricCard icon={<BugOutlined />} title="未关闭 Bug" value={openBugCount} suffix="个" tone="orange" />
        <MetricCard icon={<AlertOutlined />} title="阻塞 Bug" value={blockerCount} suffix="个" tone="violet" />
        <MetricCard
          icon={<CheckCircleOutlined />}
          title="待验证"
          value={projectScopedBugs.filter((bug) => bug.status === "待验证").length}
          suffix="个"
          tone="blue"
        />
        <MetricCard
          icon={<UserOutlined />}
          title="已关闭"
          value={projectScopedBugs.filter((bug) => bug.status === "已关闭").length}
          suffix="个"
          tone="green"
        />
      </Row>

      <Card>
        <Table
          rowKey="id"
          columns={bugColumns}
          dataSource={visibleBugs}
          locale={{ emptyText: getBugEmptyText(onlyMine, projectFilter) }}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          scroll={{ x: 1580 }}
          expandable={{
            expandedRowRender: (bug) => (
              <Row gutter={[16, 12]} className="bug-detail-row">
                <Col xs={24} md={8}>
                  <Text strong>复现步骤</Text>
                  <Paragraph>{bug.reproduction}</Paragraph>
                </Col>
                <Col xs={24} md={8}>
                  <Text strong>预期结果</Text>
                  <Paragraph>{bug.expected}</Paragraph>
                </Col>
                <Col xs={24} md={8}>
                  <Text strong>实际结果</Text>
                  <Paragraph>{bug.actual}</Paragraph>
                </Col>
              </Row>
            )
          }}
        />
      </Card>
    </Space>
  );
}
