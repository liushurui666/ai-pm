import dayjs from "dayjs";
import type { RequirementVersion, Risk, Task } from "@/types/dashboard";

export const allProjectCalendarVersionsValue = "__all_versions__";

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
  versionId?: string;
  versionName?: string;
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

export type ProjectDelayRiskItem = {
  id: string;
  title: string;
  owner: string;
  versionName: string;
  date: string;
  days: number;
  reason: "任务已逾期" | "超出版本发布日期" | "版本发布日期已过";
};

export type ProjectDelaySummary = {
  total: number;
  overdueTasks: ProjectDelayRiskItem[];
  scheduleOverflowTasks: ProjectDelayRiskItem[];
  delayedVersions: ProjectDelayRiskItem[];
};

function normalizeProjectName(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function getVersionScopeIds(versions: RequirementVersion[], selectedVersionId?: string | null) {
  if (!selectedVersionId) {
    return null;
  }

  const scopeIds = new Set<string>([selectedVersionId]);
  let hasNewChild = true;

  // 父版本视角需要自然包含子版本，避免 1.4 和 1.4.2 的交付任务被拆开看。
  while (hasNewChild) {
    hasNewChild = false;
    versions.forEach((version) => {
      if (version.parentVersionId && scopeIds.has(version.parentVersionId) && !scopeIds.has(version.id)) {
        scopeIds.add(version.id);
        hasNewChild = true;
      }
    });
  }

  return scopeIds;
}

function getScopedVersions(versions: RequirementVersion[], selectedVersionId?: string | null) {
  const scopeIds = getVersionScopeIds(versions, selectedVersionId);

  return scopeIds ? versions.filter((version) => scopeIds.has(version.id)) : versions;
}

export function getVersionScopeProjects(versions: RequirementVersion[], selectedVersionId?: string | null) {
  // 版本日历的风险仍来自项目风险表，只把当前版本范围关联到的项目拿出来做过滤和展示。
  return Array.from(new Set(getScopedVersions(versions, selectedVersionId).map((version) => version.project).filter(Boolean)));
}

function inSelectedVersion(task: Task, versions: RequirementVersion[], selectedVersionId?: string | null) {
  const scopeIds = getVersionScopeIds(versions, selectedVersionId);

  return !scopeIds || Boolean(task.versionId && scopeIds.has(task.versionId));
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

function getDelayDays(later: dayjs.Dayjs, earlier: dayjs.Dayjs) {
  return Math.max(1, later.startOf("day").diff(earlier.startOf("day"), "day"));
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

export function getProjectCalendarFallbackMonth(items: ProjectCalendarItem[], preferredMonth: dayjs.Dayjs) {
  const preferred = preferredMonth.startOf("month");
  const ranges = items
    .map((item) => getProjectCalendarItemRange(item))
    .sort((left, right) => {
      const leftDistance = Math.abs(left.start.startOf("month").diff(preferred, "month"));
      const rightDistance = Math.abs(right.start.startOf("month").diff(preferred, "month"));

      // 优先跳到离当前月份最近的任务月份，避免子版本筛选后看起来像没有同步任务。
      return leftDistance - rightDistance || left.start.valueOf() - right.start.valueOf();
    });

  return ranges[0]?.start.startOf("month") ?? preferredMonth;
}

// 项目交付日历只展示任务，避免 Bug、版本和里程碑混入后干扰排期判断。
export function createProjectCalendarItems({
  selectedVersionId,
  tasks,
  versions
}: {
  selectedVersionId?: string | null;
  tasks: Task[];
  versions: RequirementVersion[];
}) {
  const taskItems = tasks
    .filter((task) => inSelectedVersion(task, versions, selectedVersionId))
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
        versionId: task.versionId,
        versionName: task.versionName,
        status: task.stage,
        progress,
        riskTone: getRiskTone(progress, task.stage !== "已完成" && isPast(task.dueDate))
      };
    });

  return taskItems.sort(
    (left, right) => dayjs(left.date).valueOf() - dayjs(right.date).valueOf() || right.progress - left.progress
  );
}

export function getVersionDateRange(versions: RequirementVersion[], selectedVersionId?: string | null) {
  const scopedVersions = getScopedVersions(versions, selectedVersionId);
  const dates = scopedVersions.flatMap((version) => [
    version.startDate,
    version.releaseDate,
    ...version.milestones.map((milestone) => milestone.dueDate)
  ]);

  if (!dates.length) {
    return "";
  }

  const sortedDates = dates.map((date) => dayjs(date)).sort((left, right) => left.valueOf() - right.valueOf());

  return `${sortedDates[0]?.format("MM/DD") ?? "--"} - ${sortedDates.at(-1)?.format("MM/DD") ?? "--"}`;
}

export function createProjectDelaySummary({
  items,
  selectedVersionId,
  versions
}: {
  items: ProjectCalendarItem[];
  selectedVersionId?: string | null;
  versions: RequirementVersion[];
}): ProjectDelaySummary {
  const today = dayjs().startOf("day");
  const scopedVersions = getScopedVersions(versions, selectedVersionId);
  const versionById = new Map(scopedVersions.map((version) => [version.id, version]));
  const unfinishedItems = items.filter((item) => item.status !== "已完成");
  const overdueTasks = unfinishedItems
    .filter((item) => dayjs(item.endDate).isBefore(today, "day"))
    .map<ProjectDelayRiskItem>((item) => ({
      id: item.id,
      title: item.title,
      owner: item.owner,
      versionName: item.versionName || item.project,
      date: item.endDate,
      days: getDelayDays(today, dayjs(item.endDate)),
      reason: "任务已逾期"
    }));
  const scheduleOverflowTasks = unfinishedItems
    .filter((item) => {
      const version = item.versionId ? versionById.get(item.versionId) : undefined;

      return Boolean(version && !dayjs(item.endDate).isBefore(today, "day") && dayjs(item.endDate).isAfter(version.releaseDate, "day"));
    })
    .map<ProjectDelayRiskItem>((item) => {
      const version = item.versionId ? versionById.get(item.versionId) : undefined;

      return {
        id: item.id,
        title: item.title,
        owner: item.owner,
        versionName: item.versionName || item.project,
        date: item.endDate,
        days: version ? getDelayDays(dayjs(item.endDate), dayjs(version.releaseDate)) : 1,
        reason: "超出版本发布日期"
      };
    });
  const delayedVersions = scopedVersions
    .filter((version) => version.status !== "已发布" && version.status !== "已归档" && dayjs(version.releaseDate).isBefore(today, "day"))
    .map<ProjectDelayRiskItem>((version) => {
      const unfinishedCount = unfinishedItems.filter((item) => item.versionId === version.id).length;

      // 版本级延期用未完成任务数补充判断依据，项目经理能马上知道延期影响面。
      return {
        id: version.id,
        title: `${version.name}${unfinishedCount ? ` · ${unfinishedCount} 项未完成` : ""}`,
        owner: version.devOwner || version.productOwner || version.uiOwner || "未配置",
        versionName: version.name,
        date: version.releaseDate,
        days: getDelayDays(today, dayjs(version.releaseDate)),
        reason: "版本发布日期已过"
      };
    });

  return {
    total: overdueTasks.length + scheduleOverflowTasks.length + delayedVersions.length,
    overdueTasks,
    scheduleOverflowTasks,
    delayedVersions
  };
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
        projects: Array.from(new Set(ownerItems.map((item) => item.versionName || item.project))),
        items: ownerItems,
        progress,
        doneCount: ownerItems.filter((item) => item.progress >= 100).length,
        riskCount: ownerItems.filter((item) => item.riskTone === "danger").length
      };
    })
    .sort((left, right) => right.riskCount - left.riskCount || left.progress - right.progress || right.items.length - left.items.length);
}

export function createProjectRiskHints(risks: Risk[], versions: RequirementVersion[], selectedVersionId?: string | null) {
  const scopedProjects = new Set(getVersionScopeProjects(versions, selectedVersionId).map(normalizeProjectName));

  return risks
    .filter((risk) => !selectedVersionId || scopedProjects.has(normalizeProjectName(risk.project)))
    .sort((left, right) => {
      const levelWeight: Record<Risk["level"], number> = { 高: 3, 中: 2, 低: 1 };

      return levelWeight[right.level] - levelWeight[left.level];
    });
}
