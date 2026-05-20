"use client";

import { Button, Card, Popconfirm, Row, Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import {
  AlertOutlined,
  BugOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
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

const { Text } = Typography;

type RequirementVersionOption = {
  value: string;
  label: string;
  versionName: string;
  project: string;
};

export const bugSeverityColor: Record<BugReport["severity"], string> = {
  阻塞: "red",
  严重: "volcano",
  一般: "gold",
  轻微: "blue"
};

export const bugStatusColor: Record<BugReport["status"], string> = {
  新建: "red",
  定位中: "gold",
  修复中: "blue",
  待验证: "purple",
  已关闭: "green"
};

export const bugFlowActionLabel: Record<NonNullable<BugReport["flowRecords"]>[number]["action"], string> = {
  created: "创建 Bug",
  statusChanged: "状态流转",
  ownerChanged: "负责人变更",
  severityChanged: "严重程度变更",
  versionChanged: "关联版本变更",
  updated: "更新信息"
};

export const bugFlowActionColor: Record<NonNullable<BugReport["flowRecords"]>[number]["action"], string> = {
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

export function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

export function getAttachmentLabel(attachment: BugAttachment) {
  return `${attachment.type === "video" ? "视频" : "图片"} · ${formatAttachmentSize(attachment.size)}`;
}

export function formatBugCreatedAt(createdAt: string) {
  return dayjs(createdAt).isValid() ? dayjs(createdAt).format("YYYY-MM-DD HH:mm") : createdAt || "-";
}

export function getBugFlowRecords(bug: BugReport) {
  return [...(bug.flowRecords ?? [])].sort((left, right) => dayjs(right.at).valueOf() - dayjs(left.at).valueOf());
}

export function getBugFlowDescription(record: NonNullable<BugReport["flowRecords"]>[number]) {
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
  canEditBugs,
  canDeleteBugs,
  currentUser,
  editDeniedReason,
  permissionDeniedReason,
  versionOptions,
  onCreate,
  onDelete,
  onEdit
}: {
  bugs: BugReport[];
  canEditBugs: boolean;
  canDeleteBugs: boolean;
  currentUser?: FeishuUser;
  editDeniedReason: string;
  permissionDeniedReason: string;
  versionOptions: RequirementVersionOption[];
  onCreate: () => void;
  onDelete: (bug: BugReport) => void;
  onEdit: (bug: BugReport) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"全部" | BugReport["status"]>("全部");
  const [versionFilter, setVersionFilter] = useState("全部");
  const [onlyMine, setOnlyMine] = useState(false);
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
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      sorter: (left, right) => dayjs(left.createdAt).valueOf() - dayjs(right.createdAt).valueOf(),
      render: (createdAt: string) => <Text type="secondary">{formatBugCreatedAt(createdAt)}</Text>
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      align: "center",
      render: (_, bug) => (
        <Space size={2} className="bug-row-actions">
          {canEditBugs ? (
            <Tooltip title="编辑 Bug">
              <Button
                aria-label="编辑 Bug"
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(bug);
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip title={editDeniedReason}>
              <span>
                <Button disabled aria-label="编辑 Bug" type="link" size="small" icon={<EditOutlined />} />
              </span>
            </Tooltip>
          )}
          {canDeleteBugs ? (
            <Popconfirm
              title="删除 Bug"
              description="删除后该 Bug 记录会从当前版本中移除。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(bug)}
            >
              <Tooltip title="删除 Bug">
                <Button danger aria-label="删除 Bug" type="link" size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button danger disabled aria-label="删除 Bug" type="link" size="small" icon={<DeleteOutlined />} />
              </span>
            </Tooltip>
          )}
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
        />
      </Card>
    </Space>
  );
}
