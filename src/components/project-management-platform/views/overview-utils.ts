import dayjs from "dayjs";
import type { BugReport, FeishuUser, Task } from "@/types/dashboard";
import { isMyOwnerRecord, normalizeIdentity } from "@/components/project-management-platform/identity";

export const overviewTaskPriorityColor: Record<Task["priority"], string> = {
  高: "red",
  中: "gold",
  低: "green"
};

export const overviewBugSeverityColor: Record<BugReport["severity"], string> = {
  阻塞: "red",
  严重: "volcano",
  一般: "gold",
  轻微: "blue"
};

export const overviewBugStatusColor: Record<BugReport["status"], string> = {
  新建: "red",
  定位中: "gold",
  修复中: "blue",
  待验证: "purple",
  已关闭: "green"
};

// Bug 的“个人相关”同时看修复负责人和提交人，避免工作台漏掉我提交但还未闭环的问题。
export function isMyOverviewBug(bug: BugReport, currentUser?: FeishuUser) {
  if (!currentUser) {
    return false;
  }

  if (isMyOwnerRecord(bug, currentUser)) {
    return true;
  }

  const reporter = normalizeIdentity(bug.reporter);

  return [currentUser.name, currentUser.enName, currentUser.email].some((value) => reporter && reporter === normalizeIdentity(value));
}

export function isOverdueOverviewTask(task: Task) {
  return task.stage !== "已完成" && dayjs(task.dueDate).isBefore(dayjs().startOf("day"));
}

export function formatOverviewBugCreatedAt(createdAt: string) {
  return dayjs(createdAt).isValid() ? dayjs(createdAt).format("MM/DD HH:mm") : createdAt || "-";
}

export function sortTasksForPersonalFocus(left: Task, right: Task) {
  const priorityWeight: Record<Task["priority"], number> = { 高: 3, 中: 2, 低: 1 };
  const overdueWeight = Number(isOverdueOverviewTask(right)) - Number(isOverdueOverviewTask(left));

  if (overdueWeight !== 0) {
    return overdueWeight;
  }

  return priorityWeight[right.priority] - priorityWeight[left.priority] || dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf();
}

export function sortBugsForPersonalFocus(left: BugReport, right: BugReport) {
  const severityWeight: Record<BugReport["severity"], number> = { 阻塞: 4, 严重: 3, 一般: 2, 轻微: 1 };
  const statusWeight: Record<BugReport["status"], number> = { 新建: 4, 定位中: 3, 修复中: 2, 待验证: 1, 已关闭: 0 };

  return (
    severityWeight[right.severity] - severityWeight[left.severity] ||
    statusWeight[right.status] - statusWeight[left.status] ||
    dayjs(left.createdAt).valueOf() - dayjs(right.createdAt).valueOf()
  );
}
