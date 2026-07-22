"use client";

import "./index.less";
import { Alert, Button, Empty, Input, Popconfirm, Progress, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import type { DashboardMember } from "@/types/dashboard";
import type {
  ProjectManagementRequirement,
  ProjectManagementTask
} from "@/components/project-management-platform/views/projects-view/types";
import { getRequirementTaskProgress, getRequirementTasks } from "@/components/project-management-platform/views/projects-view/utils";
import { getSafeExternalUrl } from "@/components/project-management-platform/forms/form-utils";

const { Text } = Typography;

const statusColors: Record<string, string> = {
  待评审: "default",
  评审中: "gold",
  待排期: "default",
  待梳理: "default",
  梳理中: "gold",
  设计中: "cyan",
  开发中: "processing",
  验收中: "cyan",
  待上线: "purple",
  已上线: "success",
  已完成: "success",
  已关闭: "default",
  已驳回: "error"
};

const priorityColors: Record<string, string> = {
  P0: "error",
  P1: "warning",
  P2: "default",
  紧急: "error",
  高: "warning",
  普通: "processing",
  低: "default"
};

function RequirementTaskProgress({
  requirement,
  tasks
}: {
  requirement: ProjectManagementRequirement;
  tasks: ProjectManagementTask[];
}) {
  const progress = getRequirementTaskProgress(requirement, tasks);

  return (
    <div className="project-requirement-task-progress">
      <Progress percent={progress.percent} size="small" />
      <Text type="secondary">待处理 {progress.todo} · 活跃 {progress.active} · 完成 {progress.done}</Text>
      {progress.mismatch === "requirement_done_first" ? (
        <Tooltip title="需求已完成，但仍有任务未关闭">
          <Tag color="warning">需求/任务状态不一致</Tag>
        </Tooltip>
      ) : progress.mismatch === "tasks_done_first" ? (
        <Tooltip title="所有任务已完成，需求仍等待验收或关闭">
          <Tag color="processing">等待需求验收</Tag>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function ProjectRequirements({
  members,
  requirements,
  tasks,
  canDeleteRequirement,
  canEditRequirement,
  onCreateRequirement,
  onDeleteRequirement,
  onEditRequirement,
  onOpenRequirement
}: {
  members: DashboardMember[];
  requirements: ProjectManagementRequirement[];
  tasks: ProjectManagementTask[];
  canDeleteRequirement?: (requirement: ProjectManagementRequirement) => boolean;
  canEditRequirement?: (requirement: ProjectManagementRequirement) => boolean;
  onCreateRequirement?: () => void;
  onDeleteRequirement?: (requirement: ProjectManagementRequirement) => void;
  onEditRequirement?: (requirement: ProjectManagementRequirement) => void;
  onOpenRequirement?: (requirement: ProjectManagementRequirement) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<string>();
  const [priority, setPriority] = useState<string>();
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const statusOptions = useMemo(
    () => Array.from(new Set(requirements.map((requirement) => requirement.status))).map((value) => ({ value, label: value })),
    [requirements]
  );
  const priorityOptions = useMemo(
    () => Array.from(new Set(requirements.map((requirement) => requirement.priority))).map((value) => ({ value, label: value })),
    [requirements]
  );
  const visibleRequirements = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();

    return requirements.filter((requirement) => {
      const matchesKeyword = !normalizedKeyword || [
        requirement.title,
        requirement.description,
        requirement.acceptance,
        requirement.versionName
      ].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedKeyword));

      return matchesKeyword && (!status || requirement.status === status) && (!priority || requirement.priority === priority);
    });
  }, [keyword, priority, requirements, status]);

  const columns: ColumnsType<ProjectManagementRequirement> = [
    {
      title: "需求",
      key: "title",
      fixed: "left",
      width: 260,
      render: (_, requirement) => (
        <button
          type="button"
          className="project-requirement-title"
          onClick={() => onOpenRequirement?.(requirement)}
          disabled={!onOpenRequirement}
        >
          <strong>{requirement.title}</strong>
          <Text type="secondary" ellipsis={{ tooltip: requirement.description }}>
            {requirement.description || "暂无需求描述"}
          </Text>
        </button>
      )
    },
    {
      title: "版本",
      dataIndex: "versionName",
      width: 130,
      ellipsis: true,
      render: (value?: string) => value || "--"
    },
    {
      title: "优先级",
      dataIndex: "priority",
      width: 86,
      render: (value: string) => <Tag color={priorityColors[value]}>{value}</Tag>
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 96,
      render: (value: string) => <Tag color={statusColors[value]}>{value}</Tag>
    },
    {
      title: "任务进度",
      width: 218,
      render: (_, requirement) => <RequirementTaskProgress requirement={requirement} tasks={tasks} />
    },
    {
      title: "产品负责人",
      dataIndex: "owner",
      width: 120,
      ellipsis: true,
      render: (value?: string) => value || "未分配"
    },
    {
      title: "设计负责人",
      dataIndex: "designOwner",
      width: 120,
      ellipsis: true,
      render: (value?: string) => value || "未分配"
    },
    {
      title: "开发负责人",
      width: 180,
      render: (_, requirement) => {
        const memberNames = (requirement.developerMemberIds ?? requirement.developerOwnerMemberIds ?? [])
          .map((memberId) => memberById.get(memberId)?.name)
          .filter(Boolean) as string[];
        const names = memberNames.length ? memberNames : requirement.developerOwners ?? [];

        return names.length ? names.map((name) => <Tag key={name}>{name}</Tag>) : <Text type="secondary">未分配</Text>;
      }
    },
    {
      title: "文档",
      width: 92,
      render: (_, requirement) => {
        const documentUrl = getSafeExternalUrl(requirement.documentLink);
        const designUrl = getSafeExternalUrl(requirement.uiLink);

        return (
          <Space size={4}>
            {documentUrl ? <a href={documentUrl} target="_blank" rel="noreferrer"><LinkOutlined /> PRD</a> : null}
            {designUrl ? <a href={designUrl} target="_blank" rel="noreferrer"><LinkOutlined /> UI</a> : null}
            {!documentUrl && !designUrl ? "--" : null}
          </Space>
        );
      }
    },
    {
      title: "验收标准",
      dataIndex: "acceptance",
      width: 220,
      ellipsis: { showTitle: false },
      render: (value?: string) => <Tooltip title={value}><Text>{value || "暂未填写"}</Text></Tooltip>
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 92,
      render: (_, requirement) => (
        <Space size={2}>
          {onEditRequirement && (canEditRequirement?.(requirement) ?? true) ? (
            <Tooltip title="编辑">
              <Button type="text" icon={<EditOutlined />} onClick={() => onEditRequirement(requirement)} />
            </Tooltip>
          ) : null}
          {onDeleteRequirement && (canDeleteRequirement?.(requirement) ?? true) ? (
            <Popconfirm
              title={`删除需求“${requirement.title}”？`}
              description={`当前关联 ${getRequirementTasks(tasks, requirement).length} 个任务；存在任务时服务端将阻止删除，请先迁移或解除关联。`}
              okText="确认删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDeleteRequirement(requirement)}
            >
              <Tooltip title="删除"><Button danger type="text" icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          ) : null}
        </Space>
      )
    }
  ];

  return (
    <div className="project-requirements">
      <div className="project-requirements-toolbar">
        <Space wrap>
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined />}
            placeholder="搜索标题、描述、验收标准"
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select allowClear value={status} placeholder="全部状态" options={statusOptions} onChange={setStatus} />
          <Select allowClear value={priority} placeholder="全部优先级" options={priorityOptions} onChange={setPriority} />
        </Space>
        {onCreateRequirement ? <Button type="primary" icon={<PlusOutlined />} onClick={onCreateRequirement}>新建需求</Button> : null}
      </div>
      {requirements.length > 0 && !visibleRequirements.length ? (
        <Alert showIcon type="info" title="没有匹配筛选条件的需求" />
      ) : null}
      <Table<ProjectManagementRequirement>
        rowKey="id"
        columns={columns}
        dataSource={visibleRequirements}
        pagination={false}
        scroll={{ x: 1740 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目/版本暂无需求" /> }}
      />
    </div>
  );
}
