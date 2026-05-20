
"use client";

import { Button, Popconfirm, Progress, Space, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Requirement } from "@/types/dashboard";
import { priorityColor } from "@/components/project-management-platform/constants";
import { RequirementLinkActions } from "@/components/project-management-platform/requirements/requirement-link-actions";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import { getRequirementCompleteness, requirementStatusColor } from "@/lib/requirements/requirement-quality";

const { Text } = Typography;

type RequirementColumnsOptions = {
  canDeleteRequirements: boolean;
  canEditRequirements: boolean;
  permissionDeniedReason: string;
  onDelete: (requirementId: string) => void | Promise<unknown>;
  onEdit: (requirement: Requirement) => void;
};

// 需求列需要权限、链接和质量检查状态，集中生成可以让需求视图保持轻量。
export function createRequirementColumns({
  canDeleteRequirements,
  canEditRequirements,
  onDelete,
  onEdit,
  permissionDeniedReason
}: RequirementColumnsOptions): ColumnsType<Requirement> {
  return [
    {
      title: "需求",
      dataIndex: "title",
      key: "title",
      width: 260,
      render: (_, requirement) => (
        <Space orientation="vertical" size={2} className="requirement-title-cell">
          <Tooltip title={requirement.title} placement="topLeft">
            <span className="requirement-title-tooltip-trigger">
              <Text className="requirement-title-primary" strong>
                {requirement.title}
              </Text>
            </span>
          </Tooltip>
          {requirement.aiSummary ? (
            <Tooltip title={requirement.aiSummary} placement="topLeft">
              <span className="requirement-title-tooltip-trigger">
                <Text className="requirement-title-summary" type="secondary">
                  AI：{requirement.aiSummary}
                </Text>
              </span>
            </Tooltip>
          ) : null}
          <Tooltip title={requirement.acceptance} placement="topLeft">
            <span className="requirement-title-tooltip-trigger">
              <Text className="requirement-title-acceptance" type="secondary">
                {requirement.acceptance}
              </Text>
            </span>
          </Tooltip>
        </Space>
      )
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 72,
      render: (priority: Requirement["priority"]) => <Tag color={priorityColor[priority]}>{priority}</Tag>
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 92,
      render: (status: Requirement["status"]) => <Tag color={requirementStatusColor[status]}>{status}</Tag>
    },
    {
      title: "版本",
      dataIndex: "versionName",
      key: "versionName",
      width: 150,
      render: (_, requirement) => (requirement.versionName ? <Tag color="blue">{requirement.versionName}</Tag> : <Tag>未规划</Tag>)
    },
    {
      title: "负责人",
      dataIndex: "owner",
      key: "owner",
      width: 140,
      render: (_, requirement) => <OwnerInline name={requirement.owner} avatarUrl={requirement.ownerAvatarUrl} />
    },
    {
      title: "完整度",
      key: "completeness",
      width: 150,
      render: (_, requirement) => {
        const quality = getRequirementCompleteness(requirement);

        return (
          <Space orientation="vertical" size={2} className="requirement-quality-cell">
            <Progress percent={quality.score} size="small" status={quality.score >= 80 ? "success" : "active"} />
            {quality.issues.length ? (
              <Text type="secondary">{quality.issues.slice(0, 2).join("、")}</Text>
            ) : (
              <Text type="success">资料完整</Text>
            )}
          </Space>
        );
      }
    },
    {
      title: "资料链接",
      key: "links",
      width: 132,
      render: (_, requirement) => <RequirementLinkActions requirement={requirement} />
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      render: (_, requirement) => (
        <Space className="requirement-row-actions" size={2} wrap={false}>
          {canEditRequirements ? (
            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(requirement)}>
              编辑
            </Button>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button size="small" type="link" disabled icon={<EditOutlined />}>
                  编辑
                </Button>
              </span>
            </Tooltip>
          )}
          {canDeleteRequirements ? (
            <Popconfirm
              title="删除需求"
              description="删除后不会影响任务和 Bug，但该需求记录会从版本中移除。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(requirement.id)}
            >
              <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button size="small" type="link" danger disabled icon={<DeleteOutlined />}>
                  删除
                </Button>
              </span>
            </Tooltip>
          )}
        </Space>
      )
    }
  ];
}
