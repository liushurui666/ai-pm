import dayjs from "dayjs";
import type { BugReport, Project, ProjectMilestone, RequirementVersion, Risk, Task } from "@/types/dashboard";

export type ProjectCalendarItemType = "任务" | "里程碑" | "Bug" | "版本";

export type ProjectCalendarItem = {
  id: string;
  type: ProjectCalendarItemType;
  title: string;
  date: string;
  startDate: string;
  endDate: string;
  owner: string;
  ownerAvatarUrl?: string;
  project: string;
  status: string;
  progress: number;
  riskTone: "success" | "processing" | "warning" | "danger";
};

export type ProjectPersonProgress = {
  owner: string;
  avatarUrl?: string;
  projects: string[];
  items: ProjectCalendarItem[];
  progress: number;
  doneCount: number;
  riskCount: number;
};

function normalizeProjectName(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isSameProject(projectName: string, value?: string) {
  return Boolean(value && normalizeProjectName(projectName) === normalizeProjectName(value));
}

function inSelectedProject(projectName: string, selectedProject: string) {
  return selectedProject === "全部" || isSameProject(selectedProject, projectName);
}

function getTaskProgress(stage: Task["stage"]) {
  const progressMap: Record<Task["stage"], number> = {
    待处理: 12,
    进行中: 55,
    评审中: 82,
    已完成: 100
  };

  return progressMap[stage];
}

function getMilestoneProgress(status: ProjectMilestone["status"]) {
  const progressMap: Record<ProjectMilestone["status"], number> = {
    未开始: 10,
    进行中: 58,
    已完成: 100,
    延期: 32
  };

  return progressMap[status];
}

function getBugProgress(status: BugReport["status"]) {
  const progressMap: Record<BugReport["status"], number> = {
    新建: 8,
    定位中: 35,
    修复中: 62,
    待验证: 86,
    已关闭: 100
  };

  return progressMap[status];
}

function getVersionProgress(status: RequirementVersion["status"]) {
  const progressMap: Record<RequirementVersion["status"], number> = {
    规划中: 18,
    进行中: 62,
    已发布: 100,
    已归档: 100
  };

  return progressMap[status];
}

function getRiskTone(progress: number, isRisky: boolean): ProjectCalendarItem["riskTone"] {
  if (isRisky) {
    return "danger";
  }

  if (progress >= 100) {
    return "success";
  }

  return progress >= 70 ? "processing" : "warning";
}

function isPast(date: string) {
  return dayjs(date).isBefore(dayjs().startOf("day"), "day");
}

function toDate(value: string) {
  return dayjs(value).format("YYYY-MM-DD");
}

// 项目日历把任务、里程碑、版本和 Bug 统一转换成按人展示的进度条目。
export function createProjectCalendarItems({
  bugs,
  projects,
  selectedProject,
  tasks,
  versions
}: {
  bugs: BugReport[];
  projects: Project[];
  selectedProject: string;
  tasks: Task[];
  versions: RequirementVersion[];
}) {
  const projectMilestones = projects
    .filter((project) => inSelectedProject(project.name, selectedProject))
    .flatMap((project) =>
      project.milestones.map<ProjectCalendarItem>((milestone) => {
        const progress = getMilestoneProgress(milestone.status);

        return {
          id: milestone.id,
          type: "里程碑",
          title: milestone.title,
          date: toDate(milestone.dueDate),
          startDate: toDate(milestone.dueDate),
          endDate: toDate(milestone.dueDate),
          owner: milestone.owner || project.owner || "未分配",
          ownerAvatarUrl: milestone.ownerAvatarUrl || project.ownerAvatarUrl,
          project: project.name,
          status: milestone.status,
          progress,
          riskTone: getRiskTone(progress, milestone.status === "延期" || (progress < 100 && isPast(milestone.dueDate)))
        };
      })
    );

  const taskItems = tasks
    .filter((task) => inSelectedProject(task.project, selectedProject))
    .map<ProjectCalendarItem>((task) => {
      const progress = getTaskProgress(task.stage);

      return {
        id: task.id,
        type: "任务",
        title: task.title,
        date: toDate(task.dueDate),
        startDate: toDate(task.startDate),
        endDate: toDate(task.dueDate),
        owner: task.owner || "未分配",
        ownerAvatarUrl: task.ownerAvatarUrl,
        project: task.project,
        status: task.stage,
        progress,
        riskTone: getRiskTone(progress, task.stage !== "已完成" && isPast(task.dueDate))
      };
    });

  const bugItems = bugs
    .filter((bug) => inSelectedProject(bug.project, selectedProject))
    .map<ProjectCalendarItem>((bug) => {
      const progress = getBugProgress(bug.status);
      const isSevere = bug.severity === "阻塞" || bug.severity === "严重";

      return {
        id: bug.id,
        type: "Bug",
        title: bug.title,
        date: toDate(bug.createdAt),
        startDate: toDate(bug.createdAt),
        endDate: toDate(bug.createdAt),
        owner: bug.owner || "未分配",
        ownerAvatarUrl: bug.ownerAvatarUrl,
        project: bug.project,
        status: `${bug.severity} / ${bug.status}`,
        progress,
        riskTone: getRiskTone(progress, bug.status !== "已关闭" && isSevere)
      };
    });

  const versionItems = versions
    .filter((version) => inSelectedProject(version.project, selectedProject))
    .map<ProjectCalendarItem>((version) => {
      const progress = getVersionProgress(version.status);

      return {
        id: version.id,
        type: "版本",
        title: version.name,
        date: toDate(version.releaseDate),
        startDate: toDate(version.releaseDate),
        endDate: toDate(version.releaseDate),
        owner: version.productOwner || version.devOwner || version.uiOwner || "未分配",
        ownerAvatarUrl: version.productOwnerAvatarUrl || version.devOwnerAvatarUrl || version.uiOwnerAvatarUrl,
        project: version.project,
        status: version.status,
        progress,
        riskTone: getRiskTone(progress, !["已发布", "已归档"].includes(version.status) && isPast(version.releaseDate))
      };
    });

  return [...projectMilestones, ...taskItems, ...bugItems, ...versionItems].sort(
    (left, right) => dayjs(left.date).valueOf() - dayjs(right.date).valueOf() || right.progress - left.progress
  );
}

export function getCalendarDays(month: dayjs.Dayjs) {
  const start = month.startOf("month").startOf("week");

  return Array.from({ length: 42 }, (_, index) => start.add(index, "day"));
}

export function groupCalendarItemsByDate(items: ProjectCalendarItem[]) {
  return items.reduce<Record<string, ProjectCalendarItem[]>>((groups, item) => {
    groups[item.date] = [...(groups[item.date] ?? []), item];

    return groups;
  }, {});
}

export function getProjectDateRange(projects: Project[], selectedProject: string) {
  const scopedProjects = projects.filter((project) => inSelectedProject(project.name, selectedProject));
  const dates = scopedProjects.flatMap((project) => [
    project.dueDate,
    ...project.milestones.map((milestone) => milestone.dueDate)
  ]);

  if (!dates.length) {
    return "";
  }

  const sortedDates = dates.map((date) => dayjs(date)).sort((left, right) => left.valueOf() - right.valueOf());

  return `${sortedDates[0]?.format("MM/DD") ?? "--"} - ${sortedDates.at(-1)?.format("MM/DD") ?? "--"}`;
}

export function createPersonProgress(items: ProjectCalendarItem[]) {
  const groups = items.reduce<Record<string, ProjectCalendarItem[]>>((nextGroups, item) => {
    nextGroups[item.owner] = [...(nextGroups[item.owner] ?? []), item];

    return nextGroups;
  }, {});

  return Object.entries(groups)
    .map<ProjectPersonProgress>(([owner, ownerItems]) => {
      const progress = Math.round(ownerItems.reduce((sum, item) => sum + item.progress, 0) / ownerItems.length);

      return {
        owner,
        avatarUrl: ownerItems.find((item) => item.ownerAvatarUrl)?.ownerAvatarUrl,
        projects: Array.from(new Set(ownerItems.map((item) => item.project))),
        items: ownerItems,
        progress,
        doneCount: ownerItems.filter((item) => item.progress >= 100).length,
        riskCount: ownerItems.filter((item) => item.riskTone === "danger").length
      };
    })
    .sort((left, right) => right.riskCount - left.riskCount || left.progress - right.progress || right.items.length - left.items.length);
}

export function createProjectRiskHints(risks: Risk[], selectedProject: string) {
  return risks
    .filter((risk) => inSelectedProject(risk.project, selectedProject))
    .sort((left, right) => {
      const levelWeight: Record<Risk["level"], number> = { 高: 3, 中: 2, 低: 1 };

      return levelWeight[right.level] - levelWeight[left.level];
    });
}
