"use client";

import "./index.less";
import { Button, Empty, Popconfirm, Progress, Space, Table, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, RightOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { ProjectDeliveryLabel, Risk } from "@/types/dashboard";
import type {
  ProjectManagementRequirement,
  ProjectManagementTask,
  ProjectManagementVersion
} from "@/components/project-management-platform/views/projects-view/types";
import {
  getDeliveryNodes,
  getDisplayDate,
  getHealthColor,
  getHealthLabel,
  getNodePlannedDate,
  getVersionActualEndDate,
  getVersionDisplayHealth,
  getVersionOwner,
  getVersionProgress,
  getVersionRequirements,
  getVersionTasks,
  getVersionTypeLabel,
  isTaskDone,
  projectStatusColors,
  riskColors
} from "@/components/project-management-platform/views/projects-view/utils";
import { getVersionDeliveryLabelCatalog } from "@/data/project-delivery-labels";

const { Text } = Typography;

export function ProjectDeliveryTable({
  requirements,
  legacyProjectLabelCatalog,
  risks,
  tasks,
  versions,
  canEditVersion,
  onDeleteVersion,
  onEditVersion,
  onOpenVersion
}: {
  requirements: ProjectManagementRequirement[];
  legacyProjectLabelCatalog: ProjectDeliveryLabel[];
  risks: Risk[];
  tasks: ProjectManagementTask[];
  versions: ProjectManagementVersion[];
  canEditVersion?: (version: ProjectManagementVersion) => boolean;
  onDeleteVersion?: (version: ProjectManagementVersion) => void;
  onEditVersion?: (version: ProjectManagementVersion) => void;
  onOpenVersion: (version: ProjectManagementVersion) => void;
}) {
  const columns: ColumnsType<ProjectManagementVersion> = [
    {
      title: "名称 / 目标",
      key: "name",
      fixed: "left",
      width: 220,
      render: (_, version) => (
        <button type="button" className="project-delivery-name" onClick={() => onOpenVersion(version)}>
          <strong>{version.name}</strong>
          <Text type="secondary" ellipsis={{ tooltip: version.goal }}>{version.goal || "暂未填写版本目标"}</Text>
        </button>
      )
    },
    {
      title: "类型",
      width: 82,
      render: (_, version) => <Tag>{getVersionTypeLabel(version)}</Tag>
    },
    {
      title: "负责人",
      width: 112,
      ellipsis: true,
      render: (_, version) => getVersionOwner(version)
    },
    {
      title: "状态",
      width: 100,
      render: (_, version) => <Tag color={projectStatusColors[version.status]}>{version.status}</Tag>
    },
    {
      title: "计划日期",
      width: 184,
      render: (_, version) => (
        <span className="project-delivery-date-range">
          <Text>{getDisplayDate(version.startDate)}</Text>
          <Text type="secondary">→</Text>
          <Text>{getDisplayDate(version.releaseDate)}</Text>
        </span>
      )
    },
    {
      title: "交付节点",
      width: 300,
      render: (_, version) => {
        const versionLabelCatalog = getVersionDeliveryLabelCatalog(version, legacyProjectLabelCatalog);
        const nodes = getDeliveryNodes(version, versionLabelCatalog);

        return nodes.length ? (
          <div className="project-delivery-node-list">
            {nodes.slice(0, 4).map((node, index) => (
              <Tooltip
                key={node.id || `${node.label}-${index}`}
                title={`${node.owner || "未分配"} · 实际 ${getDisplayDate(node.actualCompletedDate)}`}
              >
                <span>
                  <strong>{node.label}</strong>
                  <em>{getDisplayDate(getNodePlannedDate(node))} · {node.owner || "未分配"}</em>
                </span>
              </Tooltip>
            ))}
            {nodes.length > 4 ? <Tag>+{nodes.length - 4}</Tag> : null}
          </div>
        ) : <Text type="secondary">暂无节点</Text>;
      }
    },
    {
      title: "实际日期",
      width: 184,
      render: (_, version) => (
        <span className="project-delivery-date-range">
          <Text>{getDisplayDate(version.actualStartDate)}</Text>
          <Text type="secondary">→</Text>
          <Text>{getDisplayDate(getVersionActualEndDate(version))}</Text>
        </span>
      )
    },
    {
      title: "进度",
      width: 150,
      render: (_, version) => {
        const versionTasks = getVersionTasks(tasks, version, versions);
        const progress = getVersionProgress(version, versionTasks);
        const completedCount = versionTasks.filter(isTaskDone).length;

        return (
          <div className="project-delivery-progress">
            <Progress percent={progress} size="small" />
            <Text type="secondary">任务 {completedCount}/{versionTasks.length}</Text>
          </div>
        );
      }
    },
    {
      title: "需求 / 任务",
      width: 112,
      render: (_, version) => {
        const versionRequirements = getVersionRequirements(requirements, version, versions);
        const versionTasks = getVersionTasks(tasks, version, versions);

        return `${versionRequirements.length} / ${versionTasks.length}`;
      }
    },
    {
      title: "风险",
      width: 82,
      render: (_, version) => <Tag color={riskColors[version.riskLevel]}>{version.riskLevel || "未评估"}</Tag>
    },
    {
      title: "健康",
      width: 104,
      render: (_, version) => {
        const versionTasks = getVersionTasks(tasks, version, versions);
        const versionLabelCatalog = getVersionDeliveryLabelCatalog(version, legacyProjectLabelCatalog);
        const health = getVersionDisplayHealth(version, versionTasks, risks, versionLabelCatalog);

        return (
          <Tooltip title={health.healthReason}>
            <Tag color={getHealthColor(health.healthStatus)}>
              {getHealthLabel(health.healthStatus)}
            </Tag>
          </Tooltip>
        );
      }
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 126,
      render: (_, version) => (
        <Space size={2} onClick={(event) => event.stopPropagation()}>
          <Tooltip title="进入详情">
            <Button type="text" icon={<RightOutlined />} onClick={() => onOpenVersion(version)} />
          </Tooltip>
          {onEditVersion && (!canEditVersion || canEditVersion(version)) ? (
            <Tooltip title="编辑">
              <Button type="text" icon={<EditOutlined />} onClick={() => onEditVersion(version)} />
            </Tooltip>
          ) : null}
          {onDeleteVersion ? (
            <Popconfirm
              title={`删除${getVersionTypeLabel(version)}“${version.name}”？`}
              description={`关联的 ${getVersionRequirements(requirements, version, versions).length} 个需求和 ${getVersionTasks(tasks, version, versions).length} 个任务将安全迁移到兜底版本。`}
              okText="确认删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDeleteVersion(version)}
            >
              <Tooltip title="删除"><Button danger type="text" icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          ) : null}
        </Space>
      )
    }
  ];

  return (
    <Table<ProjectManagementVersion>
      className="project-delivery-table"
      rowKey="id"
      columns={columns}
      dataSource={versions}
      pagination={false}
      scroll={{ x: 1760 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目集还没有项目或版本" /> }}
      onRow={(version) => ({ onClick: () => onOpenVersion(version) })}
    />
  );
}
