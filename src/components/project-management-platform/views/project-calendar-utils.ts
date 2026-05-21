import dayjs from "dayjs";
import type { Project, Risk, Task } from "@/types/dashboard";

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

export type ProjectCalendarScheduleChange = {
  startDate: string;
  endDate: string;
  owner: string;
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

export function getProjectCalendarItemRange(item: ProjectCalendarItem) {
  const start = dayjs(item.startDate || item.date).startOf("day");
  const end = dayjs(item.endDate || item.date).startOf("day");

  // 历史数据可能出现起止日期反向，先归一化，避免统计和排期轴各算各的。
  return end.isBefore(start) ? { start: end, end: start } : { start, end };
}

export function isCalendarItemVisibleInMonth(item: ProjectCalendarItem, month: dayjs.Dayjs) {
  const { start, end } = getProjectCalendarItemRange(item);
  const monthStart = month.startOf("month");
  const monthEnd = month.endOf("month");

  // 跨月任务只要和当前月份有重叠，就应该进入统计和 Scheduler 排期。
  return start.isSame(month, "month") || end.isSame(month, "month") || (start.isBefore(monthStart) && end.isAfter(monthEnd));
}

// 项目交付日历只展示任务，避免 Bug、版本和里程碑混入后干扰排期判断。
export function createProjectCalendarItems({
  selectedProject,
  tasks
}: {
  selectedProject: string;
  tasks: Task[];
}) {
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

  return taskItems.sort(
    (left, right) => dayjs(left.date).valueOf() - dayjs(right.date).valueOf() || right.progress - left.progress
  );
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
