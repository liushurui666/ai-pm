import dayjs from "dayjs";
import type { BugReport, Project, RequirementVersion, Risk, Task } from "@/types/dashboard";

export type ProjectRiskFilter = "全部" | "高风险" | "今日Bug" | "延期风险";

export type ProjectRiskSummary = {
  blockerBugs: number;
  delayedVersions: RequirementVersion[];
  delayDays: number;
  highRisks: number;
  openBugs: number;
  overdueTasks: number;
  project: Project;
  riskLevel: "高风险" | "中风险" | "稳定";
  riskScore: number;
  risks: Risk[];
  todayOpenBugs: BugReport[];
  unresolvedBugs: BugReport[];
  versions: RequirementVersion[];
};

function normalizeProjectName(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isSameProject(project: Project, value?: string) {
  return Boolean(value && normalizeProjectName(project.name) === normalizeProjectName(value));
}

function getDelayDays(date?: string) {
  if (!date) {
    return 0;
  }

  const today = dayjs().startOf("day");
  const target = dayjs(date).startOf("day");

  return target.isBefore(today) ? today.diff(target, "day") : 0;
}

function getRiskLevel(score: number): ProjectRiskSummary["riskLevel"] {
  if (score >= 70) {
    return "高风险";
  }

  return score >= 35 ? "中风险" : "稳定";
}

export function getRiskColor(level: ProjectRiskSummary["riskLevel"]) {
  return level === "高风险" ? "red" : level === "中风险" ? "gold" : "green";
}

export function getRiskStrokeColor(level: ProjectRiskSummary["riskLevel"]) {
  return level === "高风险" ? "#dc2626" : level === "中风险" ? "#d97706" : "#16a34a";
}

// 风险分把 Bug、延期和显式风险项合并成一个排序口径，方便项目页聚焦最该处理的项目。
export function createProjectRiskSummary({
  bugs,
  project,
  risks,
  tasks,
  versions
}: {
  bugs: BugReport[];
  project: Project;
  risks: Risk[];
  tasks: Task[];
  versions: RequirementVersion[];
}): ProjectRiskSummary {
  const projectBugs = bugs.filter((bug) => isSameProject(project, bug.project));
  const unresolvedBugs = projectBugs.filter((bug) => bug.status !== "已关闭");
  const todayOpenBugs = unresolvedBugs.filter((bug) => dayjs(bug.createdAt).isSame(dayjs(), "day"));
  const blockerBugs = unresolvedBugs.filter((bug) => bug.severity === "阻塞" || bug.severity === "严重").length;
  const projectTasks = tasks.filter((task) => isSameProject(project, task.project));
  const overdueTasks = projectTasks.filter(
    (task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(dayjs().startOf("day"))
  ).length;
  const projectVersions = versions.filter((version) => isSameProject(project, version.project));
  const delayedVersions = projectVersions.filter(
    (version) => !["已发布", "已归档"].includes(version.status) && dayjs(version.releaseDate).isBefore(dayjs().startOf("day"))
  );
  const projectRisks = risks.filter((risk) => isSameProject(project, risk.project));
  const highRisks = projectRisks.filter((risk) => risk.level === "高").length;
  const delayDays = Math.max(
    getDelayDays(project.dueDate),
    ...delayedVersions.map((version) => getDelayDays(version.releaseDate)),
    ...projectTasks.map((task) => task.stage === "已完成" ? 0 : getDelayDays(task.dueDate))
  );
  const riskScore = Math.min(
    100,
    highRisks * 18 + blockerBugs * 16 + todayOpenBugs.length * 12 + overdueTasks * 8 + delayedVersions.length * 14 + delayDays * 2
  );

  return {
    blockerBugs,
    delayedVersions,
    delayDays,
    highRisks,
    openBugs: unresolvedBugs.length,
    overdueTasks,
    project,
    riskLevel: getRiskLevel(riskScore),
    riskScore,
    risks: projectRisks,
    todayOpenBugs,
    unresolvedBugs,
    versions: projectVersions
  };
}

export function filterRiskSummaries(summaries: ProjectRiskSummary[], filter: ProjectRiskFilter) {
  if (filter === "高风险") {
    return summaries.filter((summary) => summary.riskLevel === "高风险" || summary.highRisks || summary.blockerBugs);
  }

  if (filter === "今日Bug") {
    return summaries.filter((summary) => summary.todayOpenBugs.length > 0);
  }

  if (filter === "延期风险") {
    return summaries.filter((summary) => summary.delayDays > 0 || summary.overdueTasks > 0 || summary.delayedVersions.length > 0);
  }

  return summaries;
}
