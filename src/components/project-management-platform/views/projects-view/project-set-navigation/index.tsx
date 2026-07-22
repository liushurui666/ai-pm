"use client";

import "./index.less";
import { Avatar, Button, Empty, Input, Progress, Tag, Tooltip, Typography } from "antd";
import { FolderAddOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { useMemo, useState } from "react";
import type {
  ProjectManagementProject,
  ProjectManagementRequirement,
  ProjectManagementTask,
  ProjectManagementVersion
} from "@/components/project-management-platform/views/projects-view/types";
import {
  getHealthColor,
  getHealthLabel,
  getProjectRequirements,
  getProjectTasks,
  getProjectVersions,
  isTaskDone,
  projectStatusColors
} from "@/components/project-management-platform/views/projects-view/utils";

const { Text, Title } = Typography;

export function ProjectSetNavigation({
  activeProjectId,
  projects,
  requirements,
  tasks,
  versions,
  onCreateProject,
  onSelectProject
}: {
  activeProjectId?: string;
  projects: ProjectManagementProject[];
  requirements: ProjectManagementRequirement[];
  tasks: ProjectManagementTask[];
  versions: ProjectManagementVersion[];
  onCreateProject?: () => void;
  onSelectProject: (projectId: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const visibleProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();

    if (!normalizedKeyword) {
      return projects;
    }

    return projects.filter((project) =>
      [project.name, project.code, project.summary, project.owner]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedKeyword))
    );
  }, [keyword, projects]);

  return (
    <aside className="project-set-navigation" aria-label="项目集列表">
      <div className="project-set-navigation-header">
        <span>
          <Title level={4}>项目集</Title>
          <Text type="secondary">{projects.length} 个交付单元</Text>
        </span>
        {onCreateProject ? (
          <Tooltip title="新建项目集">
            <Button type="text" icon={<FolderAddOutlined />} onClick={onCreateProject} aria-label="新建项目集" />
          </Tooltip>
        ) : null}
      </div>
      <Input
        allowClear
        value={keyword}
        prefix={<SearchOutlined />}
        placeholder="搜索项目名、编码或负责人"
        onChange={(event) => setKeyword(event.target.value)}
      />
      <div className="project-set-navigation-list">
        {visibleProjects.length ? visibleProjects.map((project) => {
          const projectVersions = getProjectVersions(versions, project, projects);
          const projectRequirements = getProjectRequirements(requirements, project, projects);
          const projectTasks = getProjectTasks(tasks, project, projects);
          const completedTaskCount = projectTasks.filter(isTaskDone).length;
          const taskProgress = projectTasks.length ? Math.round((completedTaskCount / projectTasks.length) * 100) : 0;

          return (
            <button
              type="button"
              key={project.id}
              className={`project-set-navigation-item${activeProjectId === project.id ? " is-active" : ""}`}
              onClick={() => onSelectProject(project.id)}
            >
              <div className="project-set-navigation-title-row">
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.code || project.summary || `PM-${project.id.slice(-6).toUpperCase()}`}</small>
                </span>
                <Tag color={projectStatusColors[project.status]}>{project.status}</Tag>
              </div>
              <div className="project-set-navigation-owner-row">
                <span className="project-set-navigation-owner">
                  <Avatar size={22} src={project.ownerAvatarUrl} icon={<UserOutlined />} />
                  <Text ellipsis>{project.owner || "未分配"}</Text>
                </span>
                <Tag color={getHealthColor(project.health)}>{getHealthLabel(project.health)}</Tag>
              </div>
              <div className="project-set-navigation-counts">
                <span><strong>{project.versionCount ?? projectVersions.length}</strong>版本</span>
                <span><strong>{project.requirementCount ?? projectRequirements.length}</strong>需求</span>
                <span><strong>{project.taskCount ?? projectTasks.length}</strong>任务</span>
              </div>
              <div className="project-set-navigation-progress">
                <span>
                  <Text type="secondary">项目进度</Text>
                  <Text strong>{Math.round(project.progress)}%</Text>
                </span>
                <Progress percent={Math.round(project.progress)} showInfo={false} size="small" />
                <span>
                  <Text type="secondary">任务完成</Text>
                  <Text>{project.completedTaskCount ?? completedTaskCount}/{project.taskCount ?? projectTasks.length}</Text>
                </span>
                <Progress percent={taskProgress} showInfo={false} size="small" strokeColor="var(--success)" />
              </div>
            </button>
          );
        }) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword ? "没有匹配的项目集" : "暂无项目集"} />
        )}
      </div>
    </aside>
  );
}
