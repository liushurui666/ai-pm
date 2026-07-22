import dayjs from "dayjs";
import type { BugReport, ProjectActivity, ProjectDeliveryLabel, ProjectHealthStatus, Risk } from "@/types/dashboard";
import type {
  ProjectDeliveryNode,
  ProjectManagementProject,
  ProjectManagementRequirement,
  ProjectManagementTask,
  ProjectManagementVersion,
  ProjectRiskBlocker
} from "@/components/project-management-platform/views/projects-view/types";
import { getVersionDeliveryLabelCatalog } from "@/data/project-delivery-labels";

export const projectStatusColors: Record<string, string> = {
  进行中: "processing",
  有风险: "warning",
  已完成: "success",
  暂停: "default",
  规划中: "default",
  评审中: "gold",
  开发中: "processing",
  验收中: "cyan",
  已发布: "success",
  已归档: "default"
};

export const riskColors: Record<string, string> = {
  高: "error",
  中: "warning",
  低: "success",
  high: "error",
  medium: "warning",
  low: "success"
};

function normalize(value?: string) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function getRecordProjectId(record: unknown) {
  if (!record || typeof record !== "object") {
    return "";
  }

  const projectId = (record as { projectId?: unknown }).projectId;

  return typeof projectId === "string" ? projectId : "";
}

function getRecordProjectName(record: unknown) {
  if (!record || typeof record !== "object") {
    return "";
  }

  const project = (record as { project?: unknown }).project;

  return typeof project === "string" ? project : "";
}

export function resolveProjectIdForRecord(
  record: unknown,
  projects: ProjectManagementProject[]
) {
  const recordProjectId = getRecordProjectId(record);

  if (recordProjectId) {
    // 新数据的 projectId 是权威关联；ID 不在当前工作区项目集时直接拒绝，不能再降级按名称串权。
    return projects.some((project) => project.id === recordProjectId) ? recordProjectId : undefined;
  }

  const projectName = normalize(getRecordProjectName(record));
  const sameNameProjects = projects.filter((project) => normalize(project.name) === projectName);

  // 历史名称只在当前工作区恰好唯一时回退；0 个或重名都保持未解析，由上层保守只读。
  return projectName && sameNameProjects.length === 1 ? sameNameProjects[0]?.id : undefined;
}

// 新数据以 projectId 为权威归属；历史项目名只在工作区项目列表中唯一时兜底，避免同名项目同时展示一条 Bug/任务。
export function belongsToProject(
  record: unknown,
  project: ProjectManagementProject,
  projects?: ProjectManagementProject[]
) {
  const recordProjectId = getRecordProjectId(record);

  if (recordProjectId) {
    return projects
      ? resolveProjectIdForRecord(record, projects) === project.id
      : recordProjectId === project.id;
  }

  if (projects) {
    const sameNameProjects = projects.filter((item) => normalize(item.name) === normalize(project.name));

    if (sameNameProjects.length !== 1) {
      return false;
    }
  }

  return normalize(getRecordProjectName(record)) === normalize(project.name);
}

export function getProjectVersions(
  versions: ProjectManagementVersion[],
  project: ProjectManagementProject,
  projects?: ProjectManagementProject[]
) {
  return versions.filter((version) => belongsToProject(version, project, projects));
}

export function getProjectRequirements(
  requirements: ProjectManagementRequirement[],
  project: ProjectManagementProject,
  projects?: ProjectManagementProject[]
) {
  return requirements.filter((requirement) => belongsToProject(requirement, project, projects));
}

export function getProjectTasks(
  tasks: ProjectManagementTask[],
  project: ProjectManagementProject,
  projects?: ProjectManagementProject[]
) {
  return tasks.filter((task) => belongsToProject(task, project, projects));
}

export function getProjectRisks(
  risks: Risk[],
  project: ProjectManagementProject,
  projects?: ProjectManagementProject[]
) {
  return risks.filter((risk) => belongsToProject(risk, project, projects));
}

export function getProjectBugs(
  bugs: BugReport[],
  project: ProjectManagementProject,
  projects?: ProjectManagementProject[]
) {
  return bugs.filter((bug) => belongsToProject(bug, project, projects));
}

export function getVersionScopeIds(
  versions: ProjectManagementVersion[],
  versionId: string
) {
  const scopeIds = new Set<string>([versionId]);
  let addedChild = true;

  // 计划单元详情代表整棵交付子树；循环展开所有后代，不能只包含一层子版本。
  while (addedChild) {
    addedChild = false;
    versions.forEach((candidate) => {
      if (candidate.parentVersionId && scopeIds.has(candidate.parentVersionId) && !scopeIds.has(candidate.id)) {
        scopeIds.add(candidate.id);
        addedChild = true;
      }
    });
  }

  return scopeIds;
}

export function getVersionRequirements(
  requirements: ProjectManagementRequirement[],
  version: ProjectManagementVersion,
  versions: ProjectManagementVersion[] = [version]
) {
  const scopeIds = getVersionScopeIds(versions, version.id);
  const scopeNames = new Set(
    versions.filter((candidate) => scopeIds.has(candidate.id)).map((candidate) => normalize(candidate.name))
  );

  return requirements.filter((requirement) =>
    requirement.versionId
      ? scopeIds.has(requirement.versionId)
      : scopeNames.has(normalize(requirement.versionName))
  );
}

export function getVersionTasks(
  tasks: ProjectManagementTask[],
  version: ProjectManagementVersion,
  versions: ProjectManagementVersion[] = [version]
) {
  const scopeIds = getVersionScopeIds(versions, version.id);
  const scopeNames = new Set(
    versions.filter((candidate) => scopeIds.has(candidate.id)).map((candidate) => normalize(candidate.name))
  );

  return tasks.filter((task) =>
    task.versionId ? scopeIds.has(task.versionId) : scopeNames.has(normalize(task.versionName))
  );
}

export function getVersionBugs(
  bugs: BugReport[],
  version: ProjectManagementVersion,
  versions: ProjectManagementVersion[] = [version]
) {
  const scopeIds = getVersionScopeIds(versions, version.id);

  // Bug 已有稳定 versionId 后只按版本子树过滤；没有版本归属的项目级 Bug 留在项目集视角，
  // 不混进任意一个计划单元详情造成指标重复。
  return bugs.filter((bug) => Boolean(bug.versionId && scopeIds.has(bug.versionId)));
}

export function getVersionActivities({
  activities,
  bugs,
  requirements,
  tasks,
  version,
  versions
}: {
  activities: ProjectActivity[];
  bugs: BugReport[];
  requirements: ProjectManagementRequirement[];
  tasks: ProjectManagementTask[];
  version: ProjectManagementVersion;
  versions: ProjectManagementVersion[];
}) {
  const scopeIds = getVersionScopeIds(versions, version.id);
  const requirementIds = new Set(getVersionRequirements(requirements, version, versions).map((item) => item.id));
  const taskIds = new Set(getVersionTasks(tasks, version, versions).map((item) => item.id));
  const bugIds = new Set(getVersionBugs(bugs, version, versions).map((item) => item.id));

  // 动态本身只记录实体 ID，因此按实体类型关联到当前子树；项目集治理、项目级风险和无版本 Bug
  // 继续留在项目集“动态”页，避免计划单元详情展示无法解释的全项目事件。
  return activities.filter((activity) => {
    if (activity.entityType === "requirementVersion") return scopeIds.has(activity.entityId);
    if (activity.entityType === "requirement") return requirementIds.has(activity.entityId);
    if (activity.entityType === "task") return taskIds.has(activity.entityId);
    if (activity.entityType === "bug") return bugIds.has(activity.entityId);

    return false;
  });
}

export function getRequirementTasks(
  tasks: ProjectManagementTask[],
  requirement: ProjectManagementRequirement
) {
  return tasks.filter((task) =>
    task.requirementId
      ? task.requirementId === requirement.id
      : normalize(task.requirementTitle) === normalize(requirement.title)
  );
}

export function isTaskDone(task: ProjectManagementTask) {
  return task.stage === "已完成" || String((task as { status?: string }).status ?? "") === "done";
}

export function isRequirementDone(requirement: ProjectManagementRequirement) {
  return ["已上线", "已完成", "已关闭", "done"].includes(requirement.status);
}

export function isHighPriorityRequirement(requirement: ProjectManagementRequirement) {
  return ["P0", "高", "紧急", "high", "urgent"].includes(requirement.priority);
}

export function getVersionProgress(_version: ProjectManagementVersion, tasks: ProjectManagementTask[]) {
  if (!tasks.length) {
    return 0;
  }

  return Math.round((tasks.filter(isTaskDone).length / tasks.length) * 100);
}

export function getVersionOwner(version: ProjectManagementVersion) {
  return version.owner || version.productOwner || version.devOwner || version.uiOwner || "未分配";
}

export function getDisplayDate(value?: string) {
  if (!value || !dayjs(value).isValid()) {
    return "--";
  }

  return dayjs(value).format("YYYY-MM-DD");
}

export function getHealthLabel(value?: number | string) {
  if (typeof value === "string") {
    const labels: Record<string, string> = {
      on_track: "正常",
      at_risk: "有风险",
      off_track: "已偏离",
      not_assessed: "未评估"
    };

    return labels[value] ?? value;
  }

  if (typeof value !== "number") {
    return "未评估";
  }

  if (value >= 80) {
    return "正常";
  }

  if (value >= 60) {
    return "有风险";
  }

  return "已偏离";
}

export function getHealthColor(value?: number | string) {
  const label = getHealthLabel(value);

  return label === "正常" ? "success" : label === "有风险" ? "warning" : ["未评估", "待评估"].includes(label) ? "default" : "error";
}

// 新模型使用 deliveryNodes，老版本依旧只有 milestones；统一成路线图节点后上层无需分支渲染。
export function getDeliveryNodes(
  version: ProjectManagementVersion,
  legacyProjectCatalog: ProjectDeliveryLabel[] = []
): ProjectDeliveryNode[] {
  const labelCatalog = getVersionDeliveryLabelCatalog(version, legacyProjectCatalog);
  const currentLabelNames = new Map(
    labelCatalog.filter((label) => label.active && !label.deleted).map((label) => [label.id, label.name])
  );
  const catalogById = new Map(labelCatalog.map((label) => [label.id, label]));
  const resolveLabel = (node: { labelId?: string; label?: string; type?: string }) => {
    const currentName = node.labelId ? currentLabelNames.get(node.labelId) : undefined;

    if (currentName) {
      return currentName;
    }

    const snapshot = node.type || node.label || "未命名节点";
    const catalogLabel = node.labelId ? catalogById.get(node.labelId) : undefined;

    if (catalogLabel?.deleted || (node.labelId && !catalogLabel)) {
      return `${snapshot}（已删除）`;
    }

    return catalogLabel && !catalogLabel.active ? `${snapshot}（已停用）` : snapshot;
  };

  if (version.deliveryNodes?.length) {
    return version.deliveryNodes.map((node) => ({
      ...node,
      // 目录改名后展示当前名称；目录已删除时回退 type/label 历史快照。
      label: resolveLabel(node)
    }));
  }

  return version.milestones.map((milestone) => ({
    id: milestone.id,
    label: resolveLabel({ labelId: milestone.labelId, label: milestone.title, type: milestone.type }),
    labelId: milestone.labelId,
    type: milestone.type,
    plannedDate: milestone.dueDate,
    // 没有真实完成日时保持为空；计划截止日不能冒充实际完成日。
    actualCompletedDate: milestone.actualCompletedDate,
    status: milestone.status,
    owner: milestone.owner,
    ownerMemberId: milestone.ownerMemberId
  }));
}

export function getNodePlannedDate(node: ProjectDeliveryNode) {
  return node.plannedDate || node.dueDate;
}

export function getNodeScheduleState(node: ProjectDeliveryNode) {
  const plannedDate = getNodePlannedDate(node);

  if (node.actualCompletedDate) {
    return plannedDate && dayjs(node.actualCompletedDate).isAfter(plannedDate, "day") ? "late_done" : "done";
  }

  if (node.status === "已完成") {
    return "done";
  }

  if (plannedDate && dayjs(plannedDate).isBefore(dayjs().startOf("day"), "day")) {
    return "overdue";
  }

  return plannedDate ? "upcoming" : "unscheduled";
}

// 父版本的持久化健康度只基于直接任务；详情和交付表在展示层用完整子树重新派生。
export function getVersionDisplayHealth(
  version: ProjectManagementVersion,
  tasks: ProjectManagementTask[],
  risks: Risk[] = [],
  labelCatalog: ProjectDeliveryLabel[] = []
): { healthStatus: ProjectHealthStatus; healthReason: string } {
  const today = dayjs().startOf("day");
  const plannedStart = dayjs(version.startDate).startOf("day");
  const plannedEnd = dayjs(version.releaseDate).startOf("day");
  const progress = getVersionProgress(version, tasks);
  const overdueTasks = tasks.filter((task) => {
    const dueDate = dayjs(task.dueDate).startOf("day");

    return !isTaskDone(task) && dueDate.isValid() && dueDate.isBefore(today);
  });
  const delayedNodes = getDeliveryNodes(version, labelCatalog).filter((node) =>
    ["overdue", "late_done"].includes(getNodeScheduleState(node))
  );
  const hasValidCycle = plannedStart.isValid() && plannedEnd.isValid() && plannedEnd.isAfter(plannedStart, "day");
  const totalCycleDays = hasValidCycle ? Math.max(1, plannedEnd.diff(plannedStart, "day")) : 0;
  const expectedProgress = !hasValidCycle || !today.isAfter(plannedStart, "day")
    ? 0
    : !today.isBefore(plannedEnd, "day")
      ? 100
      : Math.min(100, Math.max(0, (today.diff(plannedStart, "day") / totalCycleDays) * 100));
  const behind = Math.max(0, expectedProgress - progress);
  const riskLevels = [version.riskLevel, ...risks.map((risk) => risk.level)];
  const riskLevel = riskLevels.includes("高") ? "高" : riskLevels.includes("中") ? "中" : "低";
  const actualStart = version.actualStartDate ? dayjs(version.actualStartDate).startOf("day") : null;
  const actualCompleted = getVersionActualEndDate(version)
    ? dayjs(getVersionActualEndDate(version)).startOf("day")
    : null;
  const deviationReasons = [
    overdueTasks.length ? `${overdueTasks.length} 项子树任务逾期` : "",
    plannedEnd.isValid() && plannedEnd.isBefore(today) && progress < 100 ? "计划交付日已过但子树任务未全部完成" : "",
    behind >= 20 ? `子树实际进度落后线性计划 ${Math.round(behind)} 个百分点` : "",
    actualStart?.isValid() && actualStart.isAfter(plannedStart, "day") ? "实际开始日晚于计划开始日" : "",
    actualCompleted?.isValid() && actualCompleted.isAfter(plannedEnd, "day") ? "实际完成日晚于计划交付日" : "",
    delayedNodes.length ? `${delayedNodes.length} 个交付节点发生偏差` : ""
  ].filter(Boolean);

  if (progress >= 100) {
    return { healthStatus: "正常", healthReason: "当前版本子树的全部关联任务均已完成。" };
  }

  if (riskLevel === "高") {
    deviationReasons.unshift("当前项目存在高风险项");
  }

  if (deviationReasons.length) {
    return { healthStatus: "已偏离", healthReason: deviationReasons.join("；") };
  }

  if (riskLevel === "中" || behind >= 10) {
    return {
      healthStatus: "有风险",
      healthReason: [
        riskLevel === "中" ? "当前项目存在中风险项" : "",
        behind >= 10 ? `子树实际进度落后线性计划 ${Math.round(behind)} 个百分点` : ""
      ].filter(Boolean).join("；")
    };
  }

  if (!tasks.length || !hasValidCycle) {
    return {
      healthStatus: "待评估",
      healthReason: !tasks.length
        ? "当前版本子树暂无关联任务，不具备交付评估条件。"
        : "计划周期无效，暂无法计算线性预期进度。"
    };
  }

  return {
    healthStatus: "正常",
    healthReason: `子树实际进度 ${progress}%，线性预期进度 ${Math.round(expectedProgress)}%，风险与排期均在正常范围。`
  };
}

export function getVersionTypeLabel(version: ProjectManagementVersion) {
  return ["project", "项目"].includes(version.type ?? "") ? "项目" : "版本";
}

export function getVersionActualEndDate(version: ProjectManagementVersion) {
  return version.actualCompletedDate || version.actualReleaseDate || version.actualEndDate;
}

export function getRequirementTaskProgress(
  requirement: ProjectManagementRequirement,
  tasks: ProjectManagementTask[]
) {
  const requirementTasks = getRequirementTasks(tasks, requirement);
  const done = requirementTasks.filter(isTaskDone).length;
  const active = requirementTasks.filter((task) => !isTaskDone(task) && task.stage !== "待处理").length;
  const todo = Math.max(0, requirementTasks.length - done - active);

  return {
    active,
    done,
    todo,
    total: requirementTasks.length,
    percent: requirementTasks.length ? Math.round((done / requirementTasks.length) * 100) : 0,
    mismatch: isRequirementDone(requirement) && done < requirementTasks.length
      ? "requirement_done_first"
      : !isRequirementDone(requirement) && requirementTasks.length > 0 && done === requirementTasks.length
        ? "tasks_done_first"
        : undefined
  } as const;
}

// 风险区不重复罗列每条任务，而是把同类阻塞聚合成可执行的处理信号。
export function createProjectRiskBlockers({
  labelCatalog = [],
  requirements,
  tasks,
  version
}: {
  labelCatalog?: ProjectDeliveryLabel[];
  requirements: ProjectManagementRequirement[];
  tasks: ProjectManagementTask[];
  version: ProjectManagementVersion;
}): ProjectRiskBlocker[] {
  const delayedNodes = getDeliveryNodes(version, labelCatalog).filter((node) => getNodeScheduleState(node) === "overdue");
  const unfinishedHighPriorityRequirements = requirements.filter(
    (requirement) => isHighPriorityRequirement(requirement) && !isRequirementDone(requirement)
  );
  const unfinishedTasks = tasks.filter((task) => !isTaskDone(task));
  const unassignedTasks = unfinishedTasks.filter((task) => !task.ownerMemberId && !task.owner?.trim());
  const overdueTasks = unfinishedTasks.filter((task) => dayjs(task.dueDate).isBefore(dayjs().startOf("day"), "day"));
  const requirementsWithoutTasks = requirements.filter(
    (requirement) => !isRequirementDone(requirement) && getRequirementTasks(tasks, requirement).length === 0
  );
  const blockers: ProjectRiskBlocker[] = [];

  if (delayedNodes.length) {
    blockers.push({
      id: "delayed-nodes",
      tone: "danger",
      title: `${delayedNodes.length} 个交付节点已逾期`,
      detail: delayedNodes.slice(0, 3).map((node) => node.label).join("、")
    });
  }

  if (unfinishedHighPriorityRequirements.length) {
    blockers.push({
      id: "high-priority-requirements",
      tone: "warning",
      title: `${unfinishedHighPriorityRequirements.length} 个高优需求未完成`,
      detail: unfinishedHighPriorityRequirements.slice(0, 3).map((item) => item.title).join("、")
    });
  }

  if (unassignedTasks.length) {
    blockers.push({
      id: "unassigned-tasks",
      tone: "warning",
      title: `${unassignedTasks.length} 个任务尚未指派`,
      detail: "未确定责任人的任务无法进入稳定交付节奏。"
    });
  }

  if (overdueTasks.length) {
    blockers.push({
      id: "overdue-tasks",
      tone: "danger",
      title: `${overdueTasks.length} 个未完成任务已逾期`,
      detail: overdueTasks.slice(0, 3).map((task) => task.title).join("、")
    });
  }

  if (requirementsWithoutTasks.length) {
    blockers.push({
      id: "requirements-without-tasks",
      tone: "info",
      title: `${requirementsWithoutTasks.length} 个需求尚未拆分任务`,
      detail: requirementsWithoutTasks.slice(0, 3).map((item) => item.title).join("、")
    });
  }

  return blockers;
}
