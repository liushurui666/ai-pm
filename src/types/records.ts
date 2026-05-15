import type { DocumentItem, Project, Requirement, Risk, Task } from "@/types/dashboard";

export type DashboardEntityType = "project" | "task" | "risk" | "requirement" | "document";

export type DashboardEntityMap = {
  project: Project;
  task: Task;
  risk: Risk;
  requirement: Requirement;
  document: DocumentItem;
};

export type CreateRecordResult<T extends DashboardEntityType = DashboardEntityType> = {
  type: T;
  record: DashboardEntityMap[T];
  persisted: boolean;
  message: string;
};
