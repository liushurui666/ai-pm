export type ProjectStatus = "进行中" | "有风险" | "已完成" | "暂停";
export type ProjectMilestoneStatus = "未开始" | "进行中" | "已完成" | "延期";

export type ProjectMilestone = {
  id: string;
  title: string;
  status: ProjectMilestoneStatus;
  dueDate: string;
  owner: string;
  ownerMemberId?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  note: string;
};

export type Project = {
  id: string;
  workspaceId?: string;
  name: string;
  owner: string;
  ownerMemberId?: string;
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
export type BugAttachment = {
  id: string;
  key: string;
  name: string;
  url: string;
  type: "image" | "video";
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type BugFlowAction = "created" | "statusChanged" | "ownerChanged" | "severityChanged" | "versionChanged" | "updated";

export type BugFlowRecord = {
  id: string;
  action: BugFlowAction;
  at: string;
  operator: string;
  from?: string;
  to?: string;
  note?: string;
};

export type GitProvider = "github" | "gitlab";

export type ProjectRepositoryStatus = "active" | "disabled";

export type ProjectRepository = {
  id: string;
  workspaceId: string;
  projectId?: string;
  provider: GitProvider;
  repoFullName: string;
  cloneUrl: string;
  defaultBranch: string;
  packageManager: "pnpm" | "npm" | "yarn";
  installCommand: string;
  lintCommand?: string;
  testCommand?: string;
  buildCommand?: string;
  allowedPaths: string[];
  blockedPaths: string[];
  defaultReviewers: string[];
  status: ProjectRepositoryStatus;
  createdAt: string;
  updatedAt: string;
};

export type BugFixJobStatus =
  | "queued"
  | "preparing"
  | "analyzing"
  | "coding"
  | "testing"
  | "pushing"
  | "mr_created"
  | "failed"
  | "canceled";

export type BugFixCheckStatus = "passed" | "failed" | "skipped";
export type BugFixLogLevel = "info" | "warn" | "error";

export type BugFixCheckResult = {
  id: string;
  jobId: string;
  name: string;
  command: string;
  status: BugFixCheckStatus;
  durationMs?: number;
  outputTail?: string;
  createdAt: string;
};

export type BugFixJobLog = {
  id: string;
  jobId: string;
  level: BugFixLogLevel;
  message: string;
  createdAt: string;
};

export type BugFixJob = {
  id: string;
  workspaceId: string;
  bugId: string;
  repositoryId: string;
  status: BugFixJobStatus;
  baseBranch: string;
  fixBranch?: string;
  commitSha?: string;
  mrUrl?: string;
  mrNumber?: string;
  mrState?: string;
  summary?: string;
  changedFiles: string[];
  error?: string;
  requestedBy?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  logs?: BugFixJobLog[];
  checks?: BugFixCheckResult[];
};

export type BugAiFixBrief = {
  latestJobId?: string;
  status?: BugFixJobStatus;
  branch?: string;
  mrUrl?: string;
  summary?: string;
  error?: string;
  updatedAt?: string;
};

export type Task = {
  id: string;
  workspaceId?: string;
  title: string;
  stage: TaskStage;
  owner: string;
  ownerMemberId?: string;
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
  workspaceId?: string;
  title: string;
  level: "高" | "中" | "低";
  owner: string;
  ownerMemberId?: string;
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
  workspaceId?: string;
  title: string;
  status: BugStatus;
  severity: BugSeverity;
  project: string;
  versionId?: string;
  versionName?: string;
  reporter: string;
  owner: string;
  ownerMemberId?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  environment: string;
  reproduction: string;
  expected: string;
  actual: string;
  attachments?: BugAttachment[];
  flowRecords?: BugFlowRecord[];
  aiFix?: BugAiFixBrief;
  createdAt: string;
};

export type Requirement = {
  id: string;
  workspaceId?: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  status: "待评审" | "评审中" | "待排期" | "设计中" | "开发中" | "待上线" | "已上线" | "已关闭" | "已驳回";
  project: string;
  versionId?: string;
  versionName?: string;
  owner: string;
  ownerMemberId?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerAvatarUrl?: string;
  uiLink?: string;
  documentLink?: string;
  acceptance: string;
  aiSummary?: string;
  aiRisks?: string[];
  aiMissingItems?: string[];
  aiFrontendNotes?: string[];
  aiBackendNotes?: string[];
  aiTestingNotes?: string[];
  aiCompletenessScore?: number;
};

export type RequirementVersion = {
  id: string;
  workspaceId?: string;
  parentVersionId?: string;
  parentVersionName?: string;
  name: string;
  project: string;
  status: "规划中" | "进行中" | "已发布" | "已归档";
  startDate: string;
  releaseDate: string;
  goal: string;
  productOwner?: string;
  productOwnerMemberId?: string;
  productOwnerOpenId?: string;
  productOwnerUnionId?: string;
  productOwnerUserId?: string;
  productOwnerEmail?: string;
  productOwnerAvatarUrl?: string;
  uiOwner?: string;
  uiOwnerMemberId?: string;
  uiOwnerOpenId?: string;
  uiOwnerUnionId?: string;
  uiOwnerUserId?: string;
  uiOwnerEmail?: string;
  uiOwnerAvatarUrl?: string;
  devOwner?: string;
  devOwnerMemberId?: string;
  devOwnerOpenId?: string;
  devOwnerUnionId?: string;
  devOwnerUserId?: string;
  devOwnerEmail?: string;
  devOwnerAvatarUrl?: string;
  milestones: ProjectMilestone[];
};

export type DocumentItem = {
  id: string;
  workspaceId?: string;
  title: string;
  type: "PRD" | "会议纪要" | "技术方案" | "复盘";
  updatedAt: string;
  aiSummary: string;
};

export type FeishuUser = {
  authProvider?: MemberIdentityProvider;
  authUserId?: string;
  openId: string;
  unionId?: string;
  userId?: string;
  name: string;
  enName?: string;
  avatarUrl?: string;
  email?: string;
};

export type FeishuPerson = FeishuUser;

export type MemberRole =
  | "owner"
  | "admin"
  | "productAdmin"
  | "productMember"
  | "frontend"
  | "backend"
  | "qa"
  | "viewer";

export type MemberStatus = "active" | "disabled";

export type MemberIdentityProvider = "feishu" | "email" | "google" | "github";

export type DashboardWorkspaceStatus = "active" | "archived";

export type DashboardWorkspace = {
  id: string;
  name: string;
  description?: string;
  status: DashboardWorkspaceStatus;
  createdAt: string;
  updatedAt: string;
};

export type MemberIdentity = {
  provider: MemberIdentityProvider;
  providerUserId: string;
  providerUnionId?: string;
  providerTenantUserId?: string;
  email?: string;
};

export type MemberNotificationChannelProvider = "feishu" | "email" | "webhook" | "telegram";
export type MemberNotificationScene = "taskAssigned" | "requirementChanged" | "bugFlowChanged";

export type MemberNotificationChannel = {
  id: string;
  provider: MemberNotificationChannelProvider;
  enabled: boolean;
  name?: string;
  target?: string;
  feishuOpenId?: string;
  feishuUnionId?: string;
  feishuUserId?: string;
  email?: string;
  webhookUrl?: string;
  telegramChatId?: string;
  scenes: MemberNotificationScene[];
};

export type MemberNotificationSettings = {
  channels: MemberNotificationChannel[];
  feishuEnabled: boolean;
  feishuOpenId?: string;
  feishuUnionId?: string;
  feishuUserId?: string;
  taskAssigned: boolean;
  requirementChanged: boolean;
};

export type DashboardMember = {
  id: string;
  workspaceId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  registrationChannel: MemberIdentityProvider;
  role: MemberRole;
  status: MemberStatus;
  identities: MemberIdentity[];
  notification: MemberNotificationSettings;
  createdAt: string;
  updatedAt: string;
};

export type DashboardPermissions = {
  canManageMembers: boolean;
  canCreateRequirements: boolean;
  canEditRequirements: boolean;
  canDeleteRequirements: boolean;
  canEditBugs: boolean;
  canEditBugsFully: boolean;
  canDeleteBugs: boolean;
  canDeleteRecords: boolean;
  deniedReason?: string;
};

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
  workspaces: DashboardWorkspace[];
  members: DashboardMember[];
  repositories?: ProjectRepository[];
  weeklyInsight: string[];
  meta?: {
    source: "database" | "local" | "mock";
    user?: FeishuUser;
    currentWorkspace?: DashboardWorkspace;
    currentMember?: DashboardMember;
    permissions?: DashboardPermissions;
    storage?: string;
    message?: string;
  };
};
