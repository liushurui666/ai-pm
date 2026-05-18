export type ProjectStatus = "进行中" | "有风险" | "已完成" | "暂停";

export type Project = {
  id: string;
  name: string;
  owner: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  status: ProjectStatus;
  progress: number;
  health: number;
  dueDate: string;
  team: number;
  riskCount: number;
  summary: string;
};

export type TaskStage = "待处理" | "进行中" | "评审中" | "已完成";

export type Task = {
  id: string;
  title: string;
  stage: TaskStage;
  owner: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  project: string;
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
  project: string;
  mitigation: string;
};

export type Requirement = {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  status: "评审中" | "设计中" | "开发中" | "待上线";
  project: string;
  acceptance: string;
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
  risks: Risk[];
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
