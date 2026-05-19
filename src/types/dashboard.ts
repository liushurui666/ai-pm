export type ProjectStatus = "进行中" | "有风险" | "已完成" | "暂停";
export type ProjectMilestoneStatus = "未开始" | "进行中" | "已完成" | "延期";

export type ProjectMilestone = {
  id: string;
  title: string;
  status: ProjectMilestoneStatus;
  dueDate: string;
  owner: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  note: string;
};

export type Project = {
  id: string;
  name: string;
  owner: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  status: ProjectStatus;
  progress: number;
  health: number;
  dueDate: string;
  team: number;
  riskCount: number;
  summary: string;
  milestones: ProjectMilestone[];
};

export type TaskStage = "待处理" | "进行中" | "评审中" | "已完成";
export type BugSeverity = "阻塞" | "严重" | "一般" | "轻微";
export type BugStatus = "新建" | "定位中" | "修复中" | "待验证" | "已关闭";

export type Task = {
  id: string;
  title: string;
  stage: TaskStage;
  owner: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  project: string;
  versionId?: string;
  versionName?: string;
  priority: "高" | "中" | "低";
  startDate: string;
  dueDate: string;
  aiHint: string;
};

export type Risk = {
  id: string;
  title: string;
  level: "高" | "中" | "低";
  owner: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  project: string;
  mitigation: string;
};

export type BugReport = {
  id: string;
  title: string;
  status: BugStatus;
  severity: BugSeverity;
  project: string;
  versionId?: string;
  versionName?: string;
  reporter: string;
  owner: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  environment: string;
  reproduction: string;
  expected: string;
  actual: string;
  dueDate: string;
};

export type Requirement = {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  status: "评审中" | "设计中" | "开发中" | "待上线";
  project: string;
  versionId?: string;
  versionName?: string;
  uiLink?: string;
  documentLink?: string;
  acceptance: string;
};

export type RequirementVersion = {
  id: string;
  name: string;
  project: string;
  status: "规划中" | "进行中" | "已发布" | "已归档";
  startDate: string;
  releaseDate: string;
  goal: string;
};

export type DocumentItem = {
  id: string;
  title: string;
  type: "PRD" | "会议纪要" | "技术方案" | "复盘";
  updatedAt: string;
  aiSummary: string;
};

export type FeishuUser = {
  openId: string;
  unionId?: string;
  userId?: string;
  name: string;
  enName?: string;
  avatarUrl?: string;
  email?: string;
};

export type FeishuPerson = FeishuUser;

export type DashboardData = {
  metrics: {
    activeProjects: number;
    deliveryRate: number;
    overdueTasks: number;
    aiSavedHours: number;
  };
  projects: Project[];
  tasks: Task[];
  bugs: BugReport[];
  risks: Risk[];
  requirementVersions: RequirementVersion[];
  requirements: Requirement[];
  documents: DocumentItem[];
  weeklyInsight: string[];
  meta?: {
    source: "local" | "mock";
    user?: FeishuUser;
    storage?: string;
    message?: string;
  };
};
