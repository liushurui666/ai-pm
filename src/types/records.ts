import type { BugReport, DocumentItem, Project, Requirement, RequirementVersion, Risk, Task } from "@/types/dashboard";

export type DashboardEntityType =
  | "project"
  | "task"
  | "bug"
  | "risk"
  | "requirementVersion"
  | "requirement"
  | "document";

export type DashboardEntityMap = {
  project: Project;
  task: Task;
  bug: BugReport;
  risk: Risk;
  requirementVersion: RequirementVersion;
  requirement: Requirement;
  document: DocumentItem;
};

export type CreateRecordResult<T extends DashboardEntityType = DashboardEntityType> = {
  type: T;
  record: DashboardEntityMap[T];
  persisted: boolean;
  message: string;
};

export type DeleteRecordResult<T extends DashboardEntityType = DashboardEntityType> = {
  type: T;
  id: string;
  persisted: boolean;
  message: string;
  fallbackVersion?: RequirementVersion;
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

export type RequirementAnalyzeResult = {
  title: string;
  summary: string;
  acceptance: string;
  suggestedPriority: Requirement["priority"];
  suggestedStatus: Requirement["status"];
  risks: string[];
  missingItems: string[];
  frontendNotes: string[];
  backendNotes: string[];
  testingNotes: string[];
  completenessScore: number;
  source: "ai" | "fallback";
  documentTitle: string;
  extractedChars: number;
  message: string;
  warning?: string;
};
