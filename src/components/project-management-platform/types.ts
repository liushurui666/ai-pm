
import type { DashboardMember } from "@/types/dashboard";
import type { DashboardEntityType } from "@/types/records";

export type AppView =
  | "overview"
  | "projects"
  | "versionDashboard"
  | "tasks"
  | "bugs"
  | "bugEdit"
  | "requirements"
  | "assistant"
  | "members";

export type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type ScheduleItem = {
  id: string;
  type: "里程碑" | "任务" | "Bug";
  title: string;
  project: string;
  date: string;
  owner: string;
  ownerAvatarUrl?: string;
  ownerEmail?: string;
  ownerMemberId?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  status: string;
  color: string;
};

export type SearchResult = {
  entity: DashboardEntityType;
  id: string;
  title: string;
  description: string;
  meta: string;
  owner?: string;
  ownerAvatarUrl?: string;
  type: string;
  view: AppView;
};

export type RequirementVersionOption = {
  value: string;
  label: string;
  versionName: string;
  project: string;
  parentVersionId?: string;
};

export type OwnerSelectableMember = {
  id: string;
  name: string;
  role: DashboardMember["role"];
  email?: string;
  avatarUrl?: string;
  feishuOpenId?: string;
  feishuUnionId?: string;
  feishuUserId?: string;
};
