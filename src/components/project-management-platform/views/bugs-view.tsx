"use client";

import { Button, Card, Drawer, Empty, Popconfirm, Row, Segmented, Select, Space, Switch, Table, Tag, Timeline, Tooltip, Typography } from "antd";
import {
  AlertOutlined,
  BugOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PaperClipOutlined,
  PlusOutlined,
  UserOutlined
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import type { BugAttachment, BugReport, FeishuUser } from "@/types/dashboard";
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

const bugFlowActionLabel: Record<NonNullable<BugReport["flowRecords"]>[number]["action"], string> = {
  created: "创建 Bug",
  statusChanged: "状态流转",
  ownerChanged: "负责人变更",
  severityChanged: "严重程度变更",
  versionChanged: "关联版本变更",
  updated: "更新信息"
};

const bugFlowActionColor: Record<NonNullable<BugReport["flowRecords"]>[number]["action"], string> = {
  created: "blue",
  statusChanged: "purple",
  ownerChanged: "cyan",
  severityChanged: "orange",
  versionChanged: "geekblue",
  updated: "gray"
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

function getBugEmptyText(onlyMine: boolean, versionFilter: string) {
  if (onlyMine && versionFilter !== "全部") {
    return "该版本暂无与你相关的 Bug";
  }

  if (onlyMine) {
    return "暂无与你相关的 Bug";
  }

  if (versionFilter !== "全部") {
    return "该版本暂无 Bug";
  }

  return "暂无 Bug，点击右上角提 Bug";
}

function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function getAttachmentLabel(attachment: BugAttachment) {
  return `${attachment.type === "video" ? "视频" : "图片"} · ${formatAttachmentSize(attachment.size)}`;
}

function isBugOverdue(bug: BugReport) {
  return bug.status !== "已关闭" && dayjs(bug.dueDate).isBefore(dayjs().startOf("day"));
}

function getBugFlowRecords(bug: BugReport) {
  return [...(bug.flowRecords ?? [])].sort((left, right) => dayjs(right.at).valueOf() - dayjs(left.at).valueOf());
}

function getBugFlowDescription(record: NonNullable<BugReport["flowRecords"]>[number]) {
  if (record.from && record.to) {
    return `${record.from} -> ${record.to}`;
  }

  if (record.to) {
    return record.to;
  }

  return record.note ?? "已记录流转";
}

export function BugsView({
  bugs,
  canDeleteBugs,
  currentUser,
  permissionDeniedReason,
  versionOptions,
  onCreate,
  onDelete,
  onEdit
}: {
  bugs: BugReport[];
  canDeleteBugs: boolean;
  currentUser?: FeishuUser;
  permissionDeniedReason: string;
  versionOptions: RequirementVersionOption[];
  onCreate: () => void;
  onDelete: (bug: BugReport) => void;
  onEdit: (bug: BugReport) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"全部" | BugReport["status"]>("全部");
  const [versionFilter, setVersionFilter] = useState("全部");
  const [onlyMine, setOnlyMine] = useState(false);
  const [detailBugId, setDetailBugId] = useState<string | null>(null);
  const scopedBugs = useMemo(
    () => (onlyMine ? bugs.filter((bug) => isMyBug(bug, currentUser)) : bugs),
    [bugs, currentUser, onlyMine]
  );
  const versionScopedBugs = useMemo(
    () => (versionFilter === "全部" ? scopedBugs : scopedBugs.filter((bug) => bug.versionId === versionFilter)),
    [scopedBugs, versionFilter]
  );
  const visibleBugs = useMemo(() => {
    const statusScopedBugs =
      statusFilter === "全部" ? versionScopedBugs : versionScopedBugs.filter((bug) => bug.status === statusFilter);

    return statusScopedBugs;
  }, [statusFilter, versionScopedBugs]);
  const detailBug = useMemo(() => bugs.find((bug) => bug.id === detailBugId) ?? null, [bugs, detailBugId]);
  const detailFlowRecords = useMemo(() => detailBug ? getBugFlowRecords(detailBug) : [], [detailBug]);
  const openBugCount = versionScopedBugs.filter((bug) => bug.status !== "已关闭").length;
  const blockerCount = versionScopedBugs.filter((bug) => bug.severity === "阻塞" && bug.status !== "已关闭").length;
  const bugColumns: ColumnsType<BugReport> = [
    {
      title: "Bug",
      dataIndex: "title",
      key: "title",
      width: 360,
      render: (_, bug) => (
        <Space orientation="vertical" size={6} className="bug-title-cell">
          <Space size={8} wrap>
            <Text strong>{bug.title}</Text>
            {isBugOverdue(bug) ? <Tag color="red">已逾期</Tag> : null}
          </Space>
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
    {
      title: "材料",
      dataIndex: "attachments",
      key: "attachments",
      width: 90,
      render: (_, bug) =>
        bug.attachments?.length ? (
          <Tag icon={<PaperClipOutlined />} color="blue">
            {bug.attachments.length}
          </Tag>
        ) : (
          <Text type="secondary">无</Text>
        )
    },
    {
      title: "版本",
      dataIndex: "versionName",
      key: "versionName",
      width: 180,
      render: (_, bug) => bug.versionName ? <Tag color="blue">{bug.versionName}</Tag> : <Tag>未规划</Tag>
    },
    {
      title: "负责人",
      dataIndex: "owner",
      key: "owner",
      width: 140,
      render: (_, bug) => <OwnerInline name={bug.owner} avatarUrl={bug.ownerAvatarUrl} />
    },
    {
      title: "截止日期",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 130,
      sorter: (left, right) => dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf(),
      render: (dueDate: string, bug) => (
        <Text type={isBugOverdue(bug) ? "danger" : "secondary"}>
          {dueDate}
        </Text>
      )
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      align: "center",
      render: (_, bug) => (
        <Space size={2} className="bug-row-actions">
          <Tooltip title="查看详情">
            <Button
              aria-label="查看 Bug 详情"
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                setDetailBugId(bug.id);
              }}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<BugOutlined />}
        title="Bug 管理"
        subtitle="按版本追踪缺陷，保留复现步骤、材料、环境、预期和实际结果。"
        extra={
          <Space wrap>
            <Segmented
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as "全部" | BugReport["status"])}
              options={["全部", "新建", "定位中", "修复中", "待验证", "已关闭"]}
            />
            <Select
              className="bug-version-filter"
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
          value={versionScopedBugs.filter((bug) => bug.status === "待验证").length}
          suffix="个"
          tone="blue"
        />
        <MetricCard
          icon={<UserOutlined />}
          title="已关闭"
          value={versionScopedBugs.filter((bug) => bug.status === "已关闭").length}
          suffix="个"
          tone="green"
        />
      </Row>

      <Card>
        <Table
          rowKey="id"
          columns={bugColumns}
          dataSource={visibleBugs}
          locale={{ emptyText: getBugEmptyText(onlyMine, versionFilter) }}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          scroll={{ x: 1120 }}
          onRow={(bug) => ({
            onClick: () => setDetailBugId(bug.id)
          })}
          rowClassName="bug-table-row"
        />
      </Card>

      <Drawer
        className="bug-detail-drawer"
        title={
          <Space>
            <BugOutlined />
            <span>Bug 详情</span>
          </Space>
        }
        open={Boolean(detailBug)}
        onClose={() => setDetailBugId(null)}
        size="large"
        destroyOnClose
      >
        {detailBug ? (
          <Space orientation="vertical" size={18} className="bug-detail-panel">
            <div className="bug-detail-hero">
              <Space orientation="vertical" size={12} className="bug-detail-hero-main">
                <Space size={8} wrap>
                  <Tag color={bugSeverityColor[detailBug.severity]}>{detailBug.severity}</Tag>
                  <Tag color={bugStatusColor[detailBug.status]}>{detailBug.status}</Tag>
                  {isBugOverdue(detailBug) ? <Tag color="red">已逾期</Tag> : null}
                </Space>
                <Typography.Title level={3}>{detailBug.title}</Typography.Title>
                <Text type="secondary">{detailBug.versionName ?? "未规划需求池"}</Text>
              </Space>
              <Space wrap className="bug-detail-actions">
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setDetailBugId(null);
                    onEdit(detailBug);
                  }}
                >
                  编辑
                </Button>
                {canDeleteBugs ? (
                  <Popconfirm
                    title="删除 Bug"
                    description="删除后该 Bug 记录会从当前版本中移除。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => {
                      onDelete(detailBug);
                      setDetailBugId(null);
                    }}
                  >
                    <Button danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                ) : (
                  <Tooltip title={permissionDeniedReason}>
                    <span>
                      <Button danger disabled icon={<DeleteOutlined />}>删除</Button>
                    </span>
                  </Tooltip>
                )}
              </Space>
            </div>

            <div className="bug-detail-meta-grid">
              <div className="bug-detail-meta-item">
                <Text type="secondary">负责人</Text>
                <OwnerInline name={detailBug.owner} avatarUrl={detailBug.ownerAvatarUrl} />
              </div>
              <div className="bug-detail-meta-item">
                <Text type="secondary">提交人</Text>
                <Text>{detailBug.reporter}</Text>
              </div>
              <div className="bug-detail-meta-item">
                <Text type="secondary">截止日期</Text>
                <Text type={isBugOverdue(detailBug) ? "danger" : undefined}>{detailBug.dueDate}</Text>
              </div>
              <div className="bug-detail-meta-item">
                <Text type="secondary">环境</Text>
                <Text>{detailBug.environment}</Text>
              </div>
            </div>

            <div className="bug-detail-section">
              <Text strong>复现信息</Text>
              <div className="bug-detail-copy-grid">
                <div className="bug-detail-copy-block">
                  <Text type="secondary">复现步骤</Text>
                  <Paragraph>{detailBug.reproduction}</Paragraph>
                </div>
                <div className="bug-detail-copy-block">
                  <Text type="secondary">预期结果</Text>
                  <Paragraph>{detailBug.expected}</Paragraph>
                </div>
                <div className="bug-detail-copy-block">
                  <Text type="secondary">实际结果</Text>
                  <Paragraph>{detailBug.actual}</Paragraph>
                </div>
              </div>
            </div>

            <div className="bug-detail-section">
              <Text strong>复现材料</Text>
              {detailBug.attachments?.length ? (
                <div className="bug-attachment-list">
                  {detailBug.attachments.map((attachment) => (
                    <Button
                      href={attachment.url}
                      icon={<PaperClipOutlined />}
                      key={attachment.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {attachment.name}
                      <Text type="secondary"> {getAttachmentLabel(attachment)}</Text>
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="bug-detail-empty">暂无复现材料</div>
              )}
            </div>

            <div className="bug-detail-section">
              <Space orientation="vertical" size={4}>
                <Text strong>流转记录</Text>
                <Text type="secondary">记录创建、状态、负责人、严重程度和版本变化。</Text>
              </Space>
              {detailFlowRecords.length ? (
                <Timeline
                  className="bug-flow-timeline"
                  items={detailFlowRecords.map((record) => ({
                    color: bugFlowActionColor[record.action],
                    content: (
                      <Space orientation="vertical" size={4}>
                        <Space size={8} wrap>
                          <Text strong>{bugFlowActionLabel[record.action]}</Text>
                          <Tag>{getBugFlowDescription(record)}</Tag>
                          <Text type="secondary">{dayjs(record.at).format("YYYY-MM-DD HH:mm")}</Text>
                        </Space>
                        <Text type="secondary">
                          {record.operator}
                          {record.note ? ` · ${record.note}` : ""}
                        </Text>
                      </Space>
                    )
                  }))}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无流转记录" />
              )}
            </div>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
