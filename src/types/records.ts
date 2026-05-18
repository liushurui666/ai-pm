import type { BugReport, DocumentItem, Project, Requirement, Risk, Task } from "@/types/dashboard";

export type DashboardEntityType = "project" | "task" | "bug" | "risk" | "requirement" | "document";

export type DashboardEntityMap = {
  project: Project;
  task: Task;
  bug: BugReport;
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

export type DocumentTaskDraft = {
  title: string;
  owner?: string;
  priority: Task["priority"];
  startDate?: string;
  dueDate?: string;
  aiHint: string;
};

export type DocumentTaskBreakdown = {
  documentTitle: string;
  documentType: DocumentItem["type"];
  summary: string;
  tasks: DocumentTaskDraft[];
};

export type DocumentAnalyzeResult = {
  document: DocumentItem;
  tasks: Task[];
  source: "ai" | "fallback";
  extractedChars: number;
  message: string;
  warning?: string;
};
