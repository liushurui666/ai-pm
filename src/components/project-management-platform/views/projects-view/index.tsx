"use client";

import "./index.less";
import { Button, Empty, Popconfirm, Space, Tabs, Tag, Tooltip, Typography } from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import type { ProjectDetailTab } from "@/components/project-management-platform/project-deep-link";
import { getVersionDeliveryLabelCatalog } from "@/data/project-delivery-labels";
import { TableView } from "@/components/project-management-platform/shared/page-shell";
import { allProjectCalendarVersionsValue } from "@/components/project-management-platform/views/project-calendar-utils";
import { ProjectSetNavigation } from "@/components/project-management-platform/views/projects-view/project-set-navigation";
import { ProjectDeliveryTable } from "@/components/project-management-platform/views/projects-view/project-delivery-table";
import { ProjectOverview } from "@/components/project-management-platform/views/projects-view/project-overview";
import { ProjectRequirements } from "@/components/project-management-platform/views/projects-view/project-requirements";
import { ProjectMembers } from "@/components/project-management-platform/views/projects-view/project-members";
import { ProjectActivities } from "@/components/project-management-platform/views/projects-view/project-activities";
import { ProjectSchedule } from "@/components/project-management-platform/views/projects-view/project-schedule";
import type {
  ProjectManagementProject,
  ProjectManagementVersion,
  ProjectsViewProps
} from "@/components/project-management-platform/views/projects-view/types";
import {
  belongsToProject,
  getDisplayDate,
  getHealthColor,
  getHealthLabel,
  getProjectBugs,
  getProjectRequirements,
  getProjectRisks,
  getProjectTasks,
  getProjectVersions,
  getVersionActivities,
  getVersionBugs,
  getVersionDisplayHealth,
  getVersionOwner,
  getVersionRequirements,
  getVersionTasks,
  getVersionTypeLabel,
  projectStatusColors,
  riskColors
} from "@/components/project-management-platform/views/projects-view/utils";

export type {
  ProjectActivity,
  ProjectEffectivePermission,
  ProjectOwnerTransferInput,
  ProjectPermission,
  ProjectPermissionInput,
  ProjectsViewProps
} from "@/components/project-management-platform/views/projects-view/types";

const { Text, Title } = Typography;

// ProjectsView 只组合管理台状态和用户交互；所有数据写入通过 props 回调交给主容器。
export function ProjectsView(props: ProjectsViewProps) {
  const {
    projects,
    versions,
    requirements = [],
    tasks,
    risks = [],
    bugs = [],
    members = [],
    projectPermissions = [],
    activities = [],
    currentMemberId,
    activeProjectId,
    activeVersionId,
    activeDetailTab,
    onActiveProjectChange,
    onActiveVersionChange,
    onActiveDetailTabChange,
    onCreateProject,
    onEditProject,
    onDeleteProject,
    onCreateVersion,
    onEditVersion,
    canEditVersion,
    onDeleteVersion,
    onUpdateVersionDeliveryNodes,
    onCreateRequirement,
    canCreateRequirementForVersion,
    canUpdateVersionDeliveryNodes,
    canDeleteRequirement,
    canEditRequirement,
    canEditTask,
    onEditRequirement,
    onDeleteRequirement,
    onOpenRequirement,
    onSaveProjectPermission,
    onRemoveProjectPermission,
    onLoadEffectivePermission,
    onTransferProjectOwner,
    onOpenCalendarItem,
    onRescheduleCalendarItem,
    onVersionFilterChange
  } = props;
  const initialVersionId = activeVersionId || (
    props.versionFilter !== allProjectCalendarVersionsValue && versions.some((version) => version.id === props.versionFilter)
      ? props.versionFilter
      : undefined
  );
  const initialVersion = initialVersionId ? versions.find((version) => version.id === initialVersionId) : undefined;
  const initialProject = activeProjectId
    ? projects.find((project) => project.id === activeProjectId)
    : initialVersion
      ? projects.find((project) => belongsToProject(initialVersion, project, projects))
      : projects[0];
  const [localProjectId, setLocalProjectId] = useState(initialProject?.id);
  const [localVersionId, setLocalVersionId] = useState(initialVersionId);
  const [localActiveTab, setLocalActiveTab] = useState(activeDetailTab ?? "overview");
  const activeTab = activeDetailTab ?? localActiveTab;
  const selectedProjectId = activeProjectId ?? (
    localProjectId && projects.some((project) => project.id === localProjectId) ? localProjectId : projects[0]?.id
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedVersionId = activeVersionId ?? (
    localVersionId && versions.some((version) => version.id === localVersionId) ? localVersionId : undefined
  );
  const selectedVersion = selectedVersionId
    ? versions.find((version) => version.id === selectedVersionId)
    : undefined;

  const scopedVersions = useMemo(
    () => selectedProject ? getProjectVersions(versions, selectedProject, projects) : [],
    [projects, selectedProject, versions]
  );
  const scopedRequirements = useMemo(
    () => selectedProject ? getProjectRequirements(requirements, selectedProject, projects) : [],
    [projects, requirements, selectedProject]
  );
  const scopedTasks = useMemo(
    () => selectedProject ? getProjectTasks(tasks, selectedProject, projects) : [],
    [projects, selectedProject, tasks]
  );

  function selectProject(projectId: string) {
    setLocalProjectId(projectId);
    setLocalVersionId(undefined);
    setLocalActiveTab("overview");
    onActiveProjectChange?.(projectId);
  }

  function openVersion(version: ProjectManagementVersion) {
    setLocalVersionId(version.id);
    setLocalActiveTab("overview");
    onActiveVersionChange?.(version.id);
    onVersionFilterChange(version.id);
  }

  function closeVersionDetail() {
    setLocalVersionId(undefined);
    setLocalActiveTab("overview");
    onActiveVersionChange?.(undefined);
  }

  if (!selectedProject) {
    return (
      <TableView
        title="项目管理"
        subtitle="统一管理项目集、项目/版本、需求、交付节点和成员权限。"
        icon={<FolderOpenOutlined />}
        extra={onCreateProject ? <Button type="primary" icon={<PlusOutlined />} onClick={onCreateProject}>新建项目集</Button> : undefined}
      >
        <Empty description="暂无项目集，请先新建项目。" />
      </TableView>
    );
  }

  const projectRequirements = getProjectRequirements(requirements, selectedProject, projects);
  const projectTasks = getProjectTasks(tasks, selectedProject, projects);
  const projectRisks = getProjectRisks(risks, selectedProject, projects);
  const projectBugs = getProjectBugs(bugs, selectedProject, projects);
  const versionRequirements = selectedVersion ? getVersionRequirements(projectRequirements, selectedVersion, scopedVersions) : [];
  const versionTasks = selectedVersion ? getVersionTasks(projectTasks, selectedVersion, scopedVersions) : [];
  const versionBugs = selectedVersion ? getVersionBugs(projectBugs, selectedVersion, scopedVersions) : [];
  const projectActivities = activities.filter((activity) => activity.projectId === selectedProject.id);
  const versionActivities = selectedVersion ? getVersionActivities({
    activities: projectActivities,
    bugs: projectBugs,
    requirements: projectRequirements,
    tasks: projectTasks,
    version: selectedVersion,
    versions: scopedVersions
  }) : [];

  return (
    <TableView
      title="项目管理"
      subtitle="以项目集为入口，聚合项目/版本、需求、任务、交付节点、权限与排期。"
      icon={<FolderOpenOutlined />}
      extra={
        <Space wrap>
          {onCreateProject ? <Button icon={<PlusOutlined />} onClick={onCreateProject}>新建项目集</Button> : null}
          {onCreateVersion ? <Button type="primary" icon={<PlusOutlined />} onClick={onCreateVersion}>新建项目/版本</Button> : null}
        </Space>
      }
    >
      {selectedVersion ? (
        <ProjectVersionDetail
          activeTab={activeTab}
          activities={versionActivities}
          bugs={versionBugs}
          canDeleteRequirement={canDeleteRequirement}
          canEditRequirement={canEditRequirement}
          canEditTask={canEditTask}
          currentMemberId={currentMemberId}
          members={members}
          permissions={projectPermissions}
          project={selectedProject}
          requirements={versionRequirements}
          risks={projectRisks}
          tasks={versionTasks}
          version={selectedVersion}
          versions={scopedVersions}
          onActiveTabChange={(tab) => {
            setLocalActiveTab(tab);
            onActiveDetailTabChange?.(tab);
          }}
          onBack={closeVersionDetail}
          onCreateRequirement={onCreateRequirement && (!canCreateRequirementForVersion || canCreateRequirementForVersion(selectedVersion))
            ? () => onCreateRequirement(selectedVersion)
            : undefined}
          onDeleteRequirement={onDeleteRequirement}
          onEditRequirement={onEditRequirement}
          onEditVersion={onEditVersion && (!canEditVersion || canEditVersion(selectedVersion))
            ? () => onEditVersion(selectedVersion)
            : undefined}
          onLoadEffectivePermission={onLoadEffectivePermission}
          onOpenCalendarItem={onOpenCalendarItem}
          onOpenRequirement={onOpenRequirement}
          onRemoveProjectPermission={onRemoveProjectPermission}
          onRescheduleCalendarItem={onRescheduleCalendarItem}
          onSaveProjectPermission={onSaveProjectPermission}
          onTransferProjectOwner={onTransferProjectOwner}
          onUpdateDeliveryNodes={onUpdateVersionDeliveryNodes && (!canUpdateVersionDeliveryNodes || canUpdateVersionDeliveryNodes(selectedVersion))
            ? onUpdateVersionDeliveryNodes
            : undefined}
        />
      ) : (
        <div className="project-management-console">
          <ProjectSetNavigation
            activeProjectId={selectedProject.id}
            projects={projects}
            requirements={requirements}
            tasks={tasks}
            versions={versions}
            onCreateProject={onCreateProject}
            onSelectProject={selectProject}
          />
          <section className="project-management-delivery">
            <ProjectSetSummary
              project={selectedProject}
              versions={scopedVersions}
              bugs={projectBugs.length}
              requirements={scopedRequirements.length}
              risks={projectRisks.length}
              tasks={scopedTasks.length}
              onDeleteProject={onDeleteProject}
              onEditProject={onEditProject}
              onCreateVersion={onCreateVersion}
            />
            <ProjectDeliveryTable
              canEditVersion={canEditVersion}
              legacyProjectLabelCatalog={selectedProject.deliveryLabelCatalog}
              requirements={projectRequirements}
              risks={projectRisks}
              tasks={projectTasks}
              versions={scopedVersions}
              onDeleteVersion={onDeleteVersion}
              onEditVersion={onEditVersion}
              onOpenVersion={openVersion}
            />
            <Tabs
              className="project-set-governance-tabs"
              items={[
                {
                  key: "members",
                  label: "成员与权限",
                  children: (
                    <ProjectMembers
                      currentMemberId={currentMemberId}
                      members={members}
                      permissions={projectPermissions}
                      project={selectedProject}
                      requirements={projectRequirements}
                      versions={scopedVersions}
                      onLoadEffectivePermission={onLoadEffectivePermission}
                      onRemoveProjectPermission={onRemoveProjectPermission}
                      onSaveProjectPermission={onSaveProjectPermission}
                      onTransferProjectOwner={onTransferProjectOwner}
                    />
                  )
                },
                {
                  key: "activities",
                  label: "动态",
                  children: <ProjectActivities activities={projectActivities} members={members} />
                }
              ]}
            />
          </section>
        </div>
      )}
    </TableView>
  );
}

function ProjectSetSummary({
  project,
  bugs,
  requirements,
  risks,
  tasks,
  versions,
  onCreateVersion,
  onDeleteProject,
  onEditProject
}: {
  project: ProjectManagementProject;
  bugs: number;
  requirements: number;
  risks: number;
  tasks: number;
  versions: ProjectManagementVersion[];
  onCreateVersion?: () => void;
  onDeleteProject?: (project: ProjectManagementProject) => void;
  onEditProject?: (project: ProjectManagementProject) => void;
}) {
  return (
    <header className="project-set-summary">
      <div>
        <Space size={6} wrap>
          <Tag color={projectStatusColors[project.status]}>{project.status}</Tag>
          <Tag color={getHealthColor(project.healthStatus ?? project.health)}>{getHealthLabel(project.healthStatus ?? project.health)}</Tag>
          <Tag color={riskColors[project.riskLevel]}>{project.riskLevel || "未评估风险"}</Tag>
        </Space>
        <Title level={4}>{project.name}</Title>
        <Text type="secondary">{project.summary || "暂未填写项目目标和范围。"}</Text>
        <Space size={14} wrap className="project-set-summary-meta">
          <Text>编码 {project.code || "--"}</Text>
          <Text>负责人 {project.owner || "未分配"}</Text>
          <Text>计划 {getDisplayDate(project.startDate)} → {getDisplayDate(project.dueDate)}</Text>
          <Text>{versions.length} 版本 · {requirements} 需求 · {tasks} 任务</Text>
        </Space>
      </div>
      <Space wrap>
        {onEditProject ? <Button icon={<EditOutlined />} onClick={() => onEditProject(project)}>编辑项目</Button> : null}
        {onDeleteProject ? (
          <Popconfirm
            title="删除整个项目集？"
            description={`当前关联 ${versions.length} 个项目/版本、${requirements} 个需求、${tasks} 个任务、${risks} 条风险和 ${bugs} 个 Bug；关联代码仓库也会阻止删除，请先迁移或解除关联。非空项目集可改为归档。`}
            okText="确认删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDeleteProject(project)}
          >
            <Button danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        ) : null}
        {onCreateVersion ? <Button type="primary" icon={<PlusOutlined />} onClick={onCreateVersion}>新建项目/版本</Button> : null}
      </Space>
    </header>
  );
}

function ProjectVersionDetail({
  activeTab,
  activities,
  bugs,
  canDeleteRequirement,
  canEditRequirement,
  canEditTask,
  currentMemberId,
  members,
  permissions,
  project,
  requirements,
  risks,
  tasks,
  version,
  versions,
  onActiveTabChange,
  onBack,
  onCreateRequirement,
  onDeleteRequirement,
  onEditRequirement,
  onEditVersion,
  onLoadEffectivePermission,
  onOpenCalendarItem,
  onOpenRequirement,
  onRemoveProjectPermission,
  onRescheduleCalendarItem,
  onSaveProjectPermission,
  onTransferProjectOwner,
  onUpdateDeliveryNodes
}: {
  activeTab: ProjectDetailTab;
  activities: ProjectsViewProps["activities"] extends infer T ? NonNullable<T> : never;
  bugs: NonNullable<ProjectsViewProps["bugs"]>;
  canDeleteRequirement: ProjectsViewProps["canDeleteRequirement"];
  canEditRequirement: ProjectsViewProps["canEditRequirement"];
  canEditTask: ProjectsViewProps["canEditTask"];
  currentMemberId?: string;
  members: NonNullable<ProjectsViewProps["members"]>;
  permissions: NonNullable<ProjectsViewProps["projectPermissions"]>;
  project: ProjectManagementProject;
  requirements: NonNullable<ProjectsViewProps["requirements"]>;
  risks: NonNullable<ProjectsViewProps["risks"]>;
  tasks: ProjectsViewProps["tasks"];
  version: ProjectManagementVersion;
  versions: ProjectsViewProps["versions"];
  onActiveTabChange: (tab: ProjectDetailTab) => void;
  onBack: () => void;
  onCreateRequirement?: () => void;
  onDeleteRequirement: ProjectsViewProps["onDeleteRequirement"];
  onEditRequirement: ProjectsViewProps["onEditRequirement"];
  onEditVersion?: () => void;
  onLoadEffectivePermission: ProjectsViewProps["onLoadEffectivePermission"];
  onOpenCalendarItem: ProjectsViewProps["onOpenCalendarItem"];
  onOpenRequirement: ProjectsViewProps["onOpenRequirement"];
  onRemoveProjectPermission: ProjectsViewProps["onRemoveProjectPermission"];
  onRescheduleCalendarItem: ProjectsViewProps["onRescheduleCalendarItem"];
  onSaveProjectPermission: ProjectsViewProps["onSaveProjectPermission"];
  onTransferProjectOwner: ProjectsViewProps["onTransferProjectOwner"];
  onUpdateDeliveryNodes: ProjectsViewProps["onUpdateVersionDeliveryNodes"];
}) {
  const deliveryLabelCatalog = getVersionDeliveryLabelCatalog(version, project.deliveryLabelCatalog);
  const displayHealth = getVersionDisplayHealth(
    version,
    tasks,
    risks,
    deliveryLabelCatalog
  );

  return (
    <div className="project-version-detail">
      <header className="project-version-detail-header">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>返回项目/版本列表</Button>
        <div>
          <span>
            <Space wrap>
              <Tag>{getVersionTypeLabel(version)}</Tag>
              <Tag color={projectStatusColors[version.status]}>{version.status}</Tag>
              <Tag color={riskColors[version.riskLevel]}>{version.riskLevel || "未评估风险"}</Tag>
              <Tooltip title={displayHealth.healthReason}>
                <Tag color={getHealthColor(displayHealth.healthStatus)}>
                  {getHealthLabel(displayHealth.healthStatus)}
                </Tag>
              </Tooltip>
            </Space>
            <Title level={3}>{version.name}</Title>
            <Text type="secondary">{version.goal || "暂未填写项目/版本目标。"}</Text>
            <Space wrap className="project-version-detail-meta">
              <Text>{project.name}</Text>
              <Text>{getVersionOwner(version)}</Text>
              <Text>{getDisplayDate(version.startDate)} → {getDisplayDate(version.releaseDate)}</Text>
            </Space>
          </span>
          {onEditVersion ? <Button icon={<EditOutlined />} onClick={onEditVersion}>编辑项目/版本</Button> : null}
        </div>
      </header>
      <Tabs
        activeKey={activeTab}
        onChange={(tab) => onActiveTabChange(tab as ProjectDetailTab)}
        items={[
          {
            key: "overview",
            label: "概览",
            children: (
              <ProjectOverview
                bugs={bugs}
                members={members}
                project={project}
                requirements={requirements}
                risks={risks}
                tasks={tasks}
                version={version}
                onUpdateDeliveryNodes={onUpdateDeliveryNodes}
              />
            )
          },
          {
            key: "requirements",
            label: `需求 ${requirements.length}`,
            children: (
              <ProjectRequirements
                canDeleteRequirement={canDeleteRequirement}
                canEditRequirement={canEditRequirement}
                members={members}
                requirements={requirements}
                tasks={tasks}
                onCreateRequirement={onCreateRequirement}
                onDeleteRequirement={onDeleteRequirement}
                onEditRequirement={onEditRequirement}
                onOpenRequirement={onOpenRequirement}
              />
            )
          },
          {
            key: "members",
            label: "成员与权限",
            children: (
              <ProjectMembers
                currentMemberId={currentMemberId}
                members={members}
                permissions={permissions}
                project={project}
                requirements={requirements}
                versions={versions}
                onLoadEffectivePermission={onLoadEffectivePermission}
                onRemoveProjectPermission={onRemoveProjectPermission}
                onSaveProjectPermission={onSaveProjectPermission}
                onTransferProjectOwner={onTransferProjectOwner}
              />
            )
          },
          {
            key: "activities",
            label: "动态",
            children: <ProjectActivities activities={activities} members={members} scopeLabel={`${version.name}（含子版本）`} />
          },
          {
            key: "schedule",
            label: "排期",
            children: (
              <ProjectSchedule
                canEditTask={canEditTask}
                tasks={tasks}
                version={version}
                versions={versions}
                onOpenCalendarItem={onOpenCalendarItem}
                onRescheduleCalendarItem={onRescheduleCalendarItem}
              />
            )
          }
        ]}
      />
    </div>
  );
}
