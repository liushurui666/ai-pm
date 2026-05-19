"use client";

import { Button, Empty, Segmented, Space, Table, Tag, Timeline, Typography } from "antd";
import { CalendarOutlined, FolderOpenOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Project, ProjectMilestone } from "@/types/dashboard";
import { TableView } from "@/components/project-management-platform/shared/page-shell";

const { Text } = Typography;

const milestoneColor: Record<ProjectMilestone["status"], string> = {
  未开始: "default",
  进行中: "blue",
  已完成: "green",
  延期: "red"
};

export function ProjectsView({
  columns,
  projects,
  projectFilter,
  onFilterChange,
  onCreate
}: {
  columns: ColumnsType<Project>;
  projects: Project[];
  projectFilter: string;
  onFilterChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <TableView
      title="项目管理"
      subtitle="面向研发执行视角，统一查看项目状态、版本交付、健康度和里程碑进展。"
      icon={<FolderOpenOutlined />}
      extra={
        <Space wrap>
          <Segmented
            value={projectFilter}
            onChange={(value) => onFilterChange(String(value))}
            options={["全部", "进行中", "有风险", "暂停"]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建项目
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={projects}
        pagination={false}
        scroll={{ x: 1120 }}
        expandable={{
          expandedRowRender: (project) => <ProjectMilestoneTimeline project={project} />
        }}
      />
    </TableView>
  );
}

function ProjectMilestoneTimeline({ project }: { project: Project }) {
  const milestones = [...project.milestones].sort(
    (left, right) => dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf()
  );

  if (!milestones.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无里程碑" />;
  }

  return (
    <div className="project-milestone-panel">
      <Timeline
        items={milestones.map((milestone) => ({
          color: milestoneColor[milestone.status] === "default" ? "gray" : milestoneColor[milestone.status],
          content: (
            <Space orientation="vertical" size={4}>
              <Space wrap>
                <Text strong>{milestone.title}</Text>
                <Tag color={milestoneColor[milestone.status]}>{milestone.status}</Tag>
                <Tag icon={<CalendarOutlined />}>{milestone.dueDate}</Tag>
                <Tag>{milestone.owner || project.owner}</Tag>
              </Space>
              <Text type="secondary">{milestone.note}</Text>
            </Space>
          )
        }))}
      />
    </div>
  );
}
