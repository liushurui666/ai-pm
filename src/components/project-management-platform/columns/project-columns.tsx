
"use client";

import { Badge, Button, Progress, Space, Tag, Typography } from "antd";
import { EditOutlined, FlagOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Project, ProjectMilestone } from "@/types/dashboard";
import { statusColor } from "@/components/project-management-platform/constants";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";

const { Text } = Typography;

// 项目表格列集中生成，主容器只注入编辑行为，避免列定义和状态逻辑混写。
export function createProjectColumns({ onEdit }: { onEdit: (project: Project) => void }): ColumnsType<Project> {
  return [
    {
      title: "项目",
      dataIndex: "name",
      key: "name",
      render: (_, project) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{project.name}</Text>
          <Text type="secondary">{project.summary}</Text>
        </Space>
      )
    },
    {
      title: "负责人",
      dataIndex: "owner",
      key: "owner",
      width: 110,
      render: (_, project) => <OwnerInline name={project.owner} avatarUrl={project.ownerAvatarUrl} />
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (status: Project["status"]) => <Badge status={statusColor[status]} text={status} />
    },
    {
      title: "进度",
      dataIndex: "progress",
      key: "progress",
      width: 180,
      render: (progress: number) => <Progress percent={progress} size="small" />
    },
    {
      title: "健康度",
      dataIndex: "health",
      key: "health",
      width: 120,
      render: (health: number) => <Tag color={health >= 85 ? "green" : health >= 70 ? "gold" : "red"}>{health}</Tag>
    },
    {
      title: "里程碑",
      dataIndex: "milestones",
      key: "milestones",
      width: 130,
      render: (milestones: ProjectMilestone[] = []) => {
        const finishedCount = milestones.filter((milestone) => milestone.status === "已完成").length;

        return (
          <Tag icon={<FlagOutlined />} color={finishedCount === milestones.length && milestones.length ? "green" : "blue"}>
            {finishedCount}/{milestones.length}
          </Tag>
        );
      }
    },
    {
      title: "截止",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 130
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 90,
      render: (_, project) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(project)}>
          编辑
        </Button>
      )
    }
  ];
}
