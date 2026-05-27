
import type { BadgeProps } from "antd";
import type { DashboardMember, Project, ProjectMilestone, Requirement, Task, TaskStage } from "@/types/dashboard";
import type { DashboardEntityType } from "@/types/records";
import type { AppView } from "@/components/project-management-platform/types";

export const taskStages: TaskStage[] = ["待处理", "进行中", "评审中", "已完成"];

export const ownerRoleLabels: Record<DashboardMember["role"], string> = {
  owner: "所有者",
  admin: "管理员",
  productAdmin: "产品管理员",
  productMember: "产品成员",
  frontend: "前端",
  backend: "后端",
  qa: "测试",
  viewer: "只读成员"
};

export const entityLabels: Record<DashboardEntityType, string> = {
  project: "项目",
  task: "任务",
  bug: "Bug",
  risk: "风险",
  requirementVersion: "需求版本",
  requirement: "需求",
  document: "文档"
};

export const fallbackRequirementVersionId = "rv-backlog";

export const validViews = new Set<AppView>([
  "overview",
  "projects",
  "versionDashboard",
  "tasks",
  "bugs",
  "bugEdit",
  "requirements",
  "members"
]);

export const statusColor: Record<Project["status"], NonNullable<BadgeProps["status"]>> = {
  进行中: "processing",
  有风险: "error",
  已完成: "success",
  暂停: "default"
};

export const milestoneColor: Record<ProjectMilestone["status"], string> = {
  未开始: "default",
  进行中: "blue",
  已完成: "green",
  延期: "red"
};

export const priorityColor: Record<Task["priority"] | Requirement["priority"], string> = {
  高: "red",
  中: "gold",
  低: "green",
  P0: "red",
  P1: "blue",
  P2: "default"
};

export const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
