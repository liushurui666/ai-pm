import dayjs from "dayjs";
import {
  createDashboardWorkspaceDatabase,
  DASHBOARD_DATABASE_STORAGE,
  deleteDashboardBugDatabase,
  deleteDashboardDocumentDatabase,
  deleteDashboardProjectDatabase,
  deleteDashboardRequirementDatabase,
  deleteDashboardRequirementVersionDatabase,
  deleteDashboardRiskDatabase,
  deleteDashboardTaskDatabase,
  readDashboardBugDatabase,
  readDashboardMemberDatabase,
  readDashboardMembersDatabase,
  readDashboardDatabase,
  readDashboardRequirementVersionDatabase,
  readDashboardTaskDatabase,
  readDashboardWorkspacesDatabase,
  updateDashboardTaskDatabase,
  upsertDashboardBugDatabase,
  upsertDashboardProjectDatabase,
  upsertDashboardProjectScopeDatabase,
  upsertDashboardRequirementVersionDatabase,
  upsertDashboardRequirementVersionScopeDatabase,
  upsertDashboardRequirementDatabase,
  upsertDashboardTaskDatabase,
  upsertDashboardMemberDatabase,
  writeDashboardDatabase,
  writeDashboardIdentityDatabase
} from "@/data/database-dashboard";
import { dashboardData } from "@/data/dashboard";
import {
  findDuplicateDeliveryMilestoneLabelId,
  normalizeProjectDeliveryLabelCatalog,
  remapVersionDeliveryMilestones,
  scopeDeliveryLabelCatalogToVersion
} from "@/data/project-delivery-labels";
import { createDashboardSideEffectQueue, createNotificationPayload } from "@/lib/dashboard-side-effects";
import { getEmailNotificationSettings } from "@/lib/notifications/email/settings";
import { findWorkspaceMemberForUser, getDashboardPermissions } from "@/lib/access/permissions";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import {
  requiresRequirementVersionFallback,
  selectAutomaticRequirementVersionFallback
} from "@/lib/project-management/deletion-policy";
import { selectUniqueProjectNameCandidate } from "@/lib/project-management/record-scope-core";
import { normalizeTaskPriority } from "@/lib/tasks/priority";
import {
  resolveVisibleProjectIds,
  resolveVisibleRecordProjectId,
  uniqueProjectIdByName
} from "@/lib/project-management/visibility";
import type {
  BugReport,
  BugAttachment,
  DashboardData,
  DashboardMember,
  DashboardWorkspace,
  DashboardWorkspaceStatus,
  DocumentItem,
  FeishuUser,
  MemberIdentityProvider,
  MemberNotificationChannel,
  MemberNotificationChannelProvider,
  MemberNotificationScene,
  MemberRole,
  MemberStatus,
  Project,
  ProjectHealthStatus,
  ProjectMilestone,
  ProjectMilestoneStatus,
  ProjectRiskLevel,
  ProjectStatus,
  Requirement,
  RequirementVersion,
  Risk,
  Task,
  TaskStage
} from "@/types/dashboard";
import type { CreateRecordResult, DashboardEntityMap, DashboardEntityType } from "@/types/records";

const DEFAULT_WORKSPACE: DashboardWorkspace = {
  id: "ws-default",
  name: "默认工作区",
  description: "承载当前 AI PM 项目、需求和成员权限配置。",
  status: "active",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};
const DEFAULT_REQUIREMENT_VERSION: RequirementVersion = {
  id: "rv-backlog",
  workspaceId: DEFAULT_WORKSPACE.id,
  name: "未规划需求池",
  project: "跨项目",
  type: "版本",
  status: "规划中",
  startDate: "2026-05-01",
  releaseDate: "2026-06-30",
  progress: 0,
  riskLevel: "低",
  healthStatus: "待评估",
  healthReason: "需求池暂无可评估的交付任务。",
  goal: "收纳尚未进入明确版本的需求，评审后再绑定到目标版本。",
  milestones: [
    {
      id: "rv-backlog-m-1",
      title: "需求池梳理",
      labelId: "delivery-product-review",
      type: "产品评审",
      status: "进行中",
      dueDate: "2026-05-15",
      owner: "",
      note: "定期评审未规划需求，确认是否进入明确版本。"
    }
  ]
};
const DEFAULT_REQUIREMENT_VERSION_ID = DEFAULT_REQUIREMENT_VERSION.id;
const defaultNotificationScenes: MemberNotificationScene[] = ["taskAssigned", "requirementChanged", "bugFlowChanged"];
const validNotificationScenes = new Set<MemberNotificationScene>(defaultNotificationScenes);
const validMemberIdentityProviders = new Set<MemberIdentityProvider>(["feishu", "email", "google", "github"]);
const memberLastActiveRefreshIntervalMs = 5 * 60 * 1000;

type LocalDatabase = Omit<DashboardData, "meta"> & {
  updatedAt: string;
};

function cloneSeedData(): LocalDatabase {
  return {
    ...JSON.parse(JSON.stringify(dashboardData)),
    updatedAt: new Date().toISOString()
  } as LocalDatabase;
}

function createNotificationLookupData(workspaceId: string, members: DashboardMember[]): LocalDatabase {
  const now = new Date().toISOString();

  // 任务拖拽轻量更新只需要复用 notifyOwner 的成员匹配和渠道入队逻辑；
  // 这里构造最小 dashboard 形状，避免为了通知读取项目、任务、Bug、需求等大表。
  return {
    metrics: {
      activeProjects: 0,
      aiSavedHours: 0,
      deliveryRate: 0,
      overdueTasks: 0
    },
    projects: [],
    tasks: [],
    bugs: [],
    risks: [],
    requirementVersions: [],
    requirements: [],
    documents: [],
    workspaces: [
      {
        id: workspaceId,
        name: workspaceId,
        status: "active",
        createdAt: now,
        updatedAt: now
      }
    ],
    members,
    repositories: [],
    weeklyInsight: [],
    updatedAt: now
  };
}

function createLocalId(type: DashboardEntityType | "bugFlow" | "member" | "milestone" | "notificationChannel" | "workspace") {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAssignmentPermissionActor(data: LocalDatabase, workspaceId: string, user?: FeishuUser) {
  const member = findWorkspaceMemberForUser(data.members, workspaceId, user);
  const activeMember = member?.status === "active" ? member : undefined;

  return {
    memberId: activeMember?.id,
    name: activeMember?.name || user?.name
  };
}

async function readDatabase(workspaceId?: string, options: { scopeToWorkspace?: boolean } = {}) {
  // 项目进度、健康度和风险数本质上是任务/Bug/风险的派生值；任务拖拽现在只持久化单行任务，读取时统一重算可以保证项目视图不读到旧统计。
  return applyProjectMetrics(await readDashboardDatabase(
    () => applyProjectMetrics(cloneSeedData()),
    {
      scopeToWorkspace: options.scopeToWorkspace,
      workspaceId
    }
  ));
}

async function readWorkspaces() {
  // 工作区创建只需要读取工作区列表做重名校验，拆出轻量读取路径，避免每次打开创建抽屉都扫全量任务与需求数据。
  return readDashboardWorkspacesDatabase(() => applyProjectMetrics(cloneSeedData()));
}

async function writeDatabase(data: LocalDatabase) {
  const derivedData = applyProjectMetrics(data);

  await writeDashboardDatabase({
    ...derivedData,
    metrics: createMetrics(derivedData),
    updatedAt: new Date().toISOString()
  });
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asTextArray(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (Array.isArray(parsed)) {
        return asTextArray(parsed);
      }
    } catch {
      return value
        .split(/[,\n，、]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12);
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function asMemberIdArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    try {
      return asMemberIdArray(JSON.parse(value) as unknown);
    } catch {
      return [...new Set(value.split(/[,\n，、]/).map((item) => item.trim()).filter(Boolean))];
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  // 开发负责人集合必须完整保留，不能复用 AI 摘要列表的 12 项展示上限；去重即可避免重复授权和重复通知。
  return [...new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))];
}

function normalizeMemberIdentityProvider(value: unknown, fallback: MemberIdentityProvider = "email") {
  const provider = asText(value) as MemberIdentityProvider;

  return validMemberIdentityProviders.has(provider) ? provider : fallback;
}

function asBugAttachmentType(value: unknown): BugAttachment["type"] {
  return value === "video" ? "video" : "image";
}

function asBugAttachments(value: unknown): BugAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const attachment = item as Partial<BugAttachment>;
      const id = asText(attachment.id);
      const key = asText(attachment.key);
      const name = asText(attachment.name);
      const url = asText(attachment.url);
      const mimeType = asText(attachment.mimeType);

      if (!id || !key || !name || !url || !mimeType) {
        return null;
      }

      return {
        id,
        key,
        name,
        url,
        type: asBugAttachmentType(attachment.type),
        mimeType,
        size: asNumber(attachment.size, 0),
        uploadedAt: asDateTimeString(attachment.uploadedAt, dayjs().format("YYYY-MM-DD HH:mm"))
      };
    })
    .filter((item): item is BugAttachment => Boolean(item))
    .slice(0, 8);
}

function normalizeBugFlowAction(value: unknown): NonNullable<BugReport["flowRecords"]>[number]["action"] {
  const action = asText(value, "updated");

  if (["created", "statusChanged", "ownerChanged", "severityChanged", "versionChanged", "updated"].includes(action)) {
    return action as NonNullable<BugReport["flowRecords"]>[number]["action"];
  }

  return "updated";
}

function normalizeBugAiFix(value: unknown): BugReport["aiFix"] {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const aiFix = value as NonNullable<BugReport["aiFix"]>;
  const latestJobId = asText(aiFix.latestJobId);

  if (!latestJobId) {
    return undefined;
  }

  return {
    latestJobId,
    status: [
      "queued",
      "preparing",
      "analyzing",
      "coding",
      "testing",
      "pushing",
      "mr_created",
      "failed",
      "canceled"
    ].includes(asText(aiFix.status))
      ? aiFix.status
      : undefined,
    branch: asText(aiFix.branch) || undefined,
    mrUrl: asText(aiFix.mrUrl) || undefined,
    summary: asText(aiFix.summary) || undefined,
    error: asText(aiFix.error) || undefined,
    updatedAt: asText(aiFix.updatedAt) || undefined
  };
}

function getBugFlowOperator(user?: FeishuUser | null, fallback = "系统") {
  return user?.name || user?.enName || user?.email || user?.openId || fallback;
}

function createBugFlowRecord({
  action,
  at = new Date().toISOString(),
  from,
  note,
  operator,
  to
}: {
  action: NonNullable<BugReport["flowRecords"]>[number]["action"];
  at?: string;
  from?: string;
  note?: string;
  operator: string;
  to?: string;
}): NonNullable<BugReport["flowRecords"]>[number] {
  return {
    id: createLocalId("bugFlow"),
    action,
    at,
    operator,
    from,
    to,
    note
  };
}

function getBugCreatedAt(values: Record<string, unknown>) {
  const explicitCreatedAt = asText(values.createdAt);

  if (explicitCreatedAt) {
    return asDateTimeString(explicitCreatedAt);
  }

  return asDateTimeString(new Date().toISOString());
}

function getFallbackBugFlowAt(values: Record<string, unknown>) {
  const explicitAt = asText(values.flowRecordAt);

  if (explicitAt) {
    return explicitAt;
  }

  return getBugCreatedAt(values);
}

function normalizeBugFlowRecords(
  value: unknown,
  fallback: {
    bugId: string;
    operator: string;
    status: BugReport["status"];
    values: Record<string, unknown>;
  }
): NonNullable<BugReport["flowRecords"]> {
  const records = Array.isArray(value)
    ? value
        .map((item, index) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const record = item as Record<string, unknown>;
          const action = normalizeBugFlowAction(record.action);
          const at = asText(record.at) || getFallbackBugFlowAt(fallback.values);
          const operator = asText(record.operator, fallback.operator);

          return {
            id: asText(record.id, `bugFlow-${fallback.bugId}-${index}`),
            action,
            at,
            operator,
            ...(asText(record.from) ? { from: asText(record.from) } : {}),
            ...(asText(record.to) ? { to: asText(record.to) } : {}),
            ...(asText(record.note) ? { note: asText(record.note) } : {})
          };
        })
        .filter(Boolean) as NonNullable<BugReport["flowRecords"]>
    : [];

  if (records.length) {
    return records.slice(-30);
  }

  return [
    {
      id: `bugFlow-${fallback.bugId}-created`,
      action: "created",
      at: getFallbackBugFlowAt(fallback.values),
      operator: fallback.operator,
      to: fallback.status,
      note: "创建 Bug"
    }
  ];
}

function asOwnerName(values: Record<string, unknown>) {
  return asText(values.owner, "未分配");
}

function createOwnerLink(values: Record<string, unknown>) {
  return {
    ownerMemberId: asText(values.ownerMemberId) || undefined,
    ownerOpenId: asText(values.ownerOpenId) || undefined,
    ownerUnionId: asText(values.ownerUnionId) || undefined,
    ownerUserId: asText(values.ownerUserId) || undefined,
    ownerEmail: asText(values.ownerEmail) || undefined,
    ownerAvatarUrl: asText(values.ownerAvatarUrl) || undefined
  };
}

function createVersionRoleOwnerLink(values: Record<string, unknown>, prefix: "product" | "ui" | "dev") {
  const field = `${prefix}Owner`;

  return {
    [`${field}MemberId`]: asText(values[`${field}MemberId`]) || undefined,
    [`${field}OpenId`]: asText(values[`${field}OpenId`]) || undefined,
    [`${field}UnionId`]: asText(values[`${field}UnionId`]) || undefined,
    [`${field}UserId`]: asText(values[`${field}UserId`]) || undefined,
    [`${field}Email`]: asText(values[`${field}Email`]) || undefined,
    [`${field}AvatarUrl`]: asText(values[`${field}AvatarUrl`]) || undefined
  };
}

function createDesignOwnerLink(values: Record<string, unknown>) {
  return {
    designOwnerMemberId: asText(values.designOwnerMemberId) || undefined,
    designOwnerOpenId: asText(values.designOwnerOpenId) || undefined,
    designOwnerUnionId: asText(values.designOwnerUnionId) || undefined,
    designOwnerUserId: asText(values.designOwnerUserId) || undefined,
    designOwnerEmail: asText(values.designOwnerEmail) || undefined,
    designOwnerAvatarUrl: asText(values.designOwnerAvatarUrl) || undefined
  };
}

function asNumber(value: unknown, fallback: number) {
  const nextValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function asOptionalNonNegativeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = asNumber(value, Number.NaN);

  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "on", "开启", "启用"].includes(value.trim().toLowerCase());
  }

  return fallback;
}

function asDateString(value: unknown, fallback = dayjs().format("YYYY-MM-DD")) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  return dayjs(value).isValid() ? dayjs(value).format("YYYY-MM-DD") : fallback;
}

function asDateTimeString(value: unknown, fallback = dayjs().format("YYYY-MM-DD HH:mm")) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  return dayjs(value).isValid() ? dayjs(value).format("YYYY-MM-DD HH:mm") : fallback;
}

function normalizeProjectStatus(value: string): ProjectStatus {
  if (value.includes("归档")) {
    return "已归档";
  }

  if (value.includes("风险") || value.includes("延期")) {
    return "有风险";
  }

  if (value.includes("完成")) {
    return "已完成";
  }

  if (value.includes("暂停")) {
    return "暂停";
  }

  return "进行中";
}

function normalizeMilestoneStatus(value: string): ProjectMilestoneStatus {
  if (value.includes("完成")) {
    return "已完成";
  }

  if (value.includes("延期") || value.includes("风险")) {
    return "延期";
  }

  if (value.includes("进行") || value.includes("处理中")) {
    return "进行中";
  }

  return "未开始";
}

function normalizeTaskStage(value: string): TaskStage {
  if (["待处理", "进行中", "评审中", "验收中", "已完成"].includes(value)) {
    return value as TaskStage;
  }

  if (value.includes("完成")) {
    return "已完成";
  }

  if (value.includes("验收")) {
    return "验收中";
  }

  if (value.includes("评审")) {
    return "评审中";
  }

  if (value.includes("进行") || value.includes("开发") || value.includes("处理中")) {
    return "进行中";
  }

  return "待处理";
}

function normalizeBugSeverity(value: string): BugReport["severity"] {
  if (value.includes("阻塞") || value.includes("P0") || value.toLowerCase().includes("block")) {
    return "阻塞";
  }

  if (value.includes("严重") || value.includes("高") || value.includes("P1")) {
    return "严重";
  }

  if (value.includes("轻") || value.includes("低") || value.includes("P3")) {
    return "轻微";
  }

  return "一般";
}

function normalizeBugStatus(value: string): BugReport["status"] {
  if (value.includes("关闭") || value.includes("完成") || value.includes("已解决")) {
    return "已关闭";
  }

  if (value.includes("验证") || value.includes("验收")) {
    return "待验证";
  }

  if (value.includes("修复") || value.includes("开发")) {
    return "修复中";
  }

  if (value.includes("定位") || value.includes("分析") || value.includes("处理中")) {
    return "定位中";
  }

  return "新建";
}

function normalizeRequirementPriority(value: string): Requirement["priority"] {
  if (["P0", "P1", "P2", "低", "普通", "高", "紧急"].includes(value)) {
    return value as Requirement["priority"];
  }

  if (value.includes("紧急")) {
    return "紧急";
  }

  if (value.includes("P0") || value.includes("高")) {
    return "P0";
  }

  if (value.includes("P2") || value.includes("低")) {
    return "P2";
  }

  return "P1";
}

function normalizeRequirementStatus(value: string): Requirement["status"] {
  const supportedStatuses: Requirement["status"][] = [
    "待评审",
    "评审中",
    "待排期",
    "设计中",
    "开发中",
    "待上线",
    "已上线",
    "已关闭",
    "已驳回",
    "待梳理",
    "梳理中",
    "验收中",
    "已完成"
  ];

  // one2all 与旧 AI PM 使用两套状态枚举；合法精确值必须原样保留，不能在一次编辑后被偷偷降级成旧状态。
  if (supportedStatuses.includes(value as Requirement["status"])) {
    return value as Requirement["status"];
  }

  if (value.includes("驳回")) {
    return "已驳回";
  }

  if (value.includes("关闭") || value.includes("终止")) {
    return "已关闭";
  }

  if (value.includes("已上线") || value.includes("已发布")) {
    return "已上线";
  }

  if (value.includes("开发")) {
    return "开发中";
  }

  if (value.includes("上线")) {
    return "待上线";
  }

  if (value.includes("设计")) {
    return "设计中";
  }

  if (value.includes("排期")) {
    return "待排期";
  }

  if (value.includes("评审")) {
    return "评审中";
  }

  if (value.includes("验收")) {
    return "验收中";
  }

  if (value.includes("梳理")) {
    return value.includes("待") ? "待梳理" : "梳理中";
  }

  if (value.includes("完成")) {
    return "已完成";
  }

  return "待评审";
}

function normalizeRequirementVersionStatus(value: string): RequirementVersion["status"] {
  const supportedStatuses: RequirementVersion["status"][] = [
    "规划中",
    "需求梳理",
    "开发中",
    "验收中",
    "进行中",
    "已发布",
    "已归档"
  ];

  if (supportedStatuses.includes(value as RequirementVersion["status"])) {
    return value as RequirementVersion["status"];
  }

  if (value.includes("发布") || value.includes("上线")) {
    return "已发布";
  }

  if (value.includes("归档") || value.includes("关闭")) {
    return "已归档";
  }

  if (value.includes("需求") || value.includes("梳理")) {
    return "需求梳理";
  }

  if (value.includes("验收") || value.includes("测试")) {
    return "验收中";
  }

  if (value.includes("开发")) {
    return "开发中";
  }

  if (value.includes("进行") || value.includes("开发") || value.includes("执行")) {
    return "进行中";
  }

  return "规划中";
}

function normalizeProjectRiskLevel(value: string): ProjectRiskLevel {
  return normalizeRiskLevel(value);
}

function normalizeProjectHealthStatus(value: string): ProjectHealthStatus {
  if (["待评估", "正常", "有风险", "已偏离"].includes(value)) {
    return value as ProjectHealthStatus;
  }

  if (value.includes("偏离") || value.includes("延期")) {
    return "已偏离";
  }

  if (value.includes("风险")) {
    return "有风险";
  }

  if (value.includes("正常") || value.includes("健康")) {
    return "正常";
  }

  return "待评估";
}

function normalizeRiskLevel(value: string): Risk["level"] {
  if (value.includes("高") || value.includes("P0")) {
    return "高";
  }

  if (value.includes("低") || value.includes("P2")) {
    return "低";
  }

  return "中";
}

function normalizeDocumentType(value: string): DocumentItem["type"] {
  if (value.includes("会议")) {
    return "会议纪要";
  }

  if (value.includes("技术")) {
    return "技术方案";
  }

  if (value.includes("复盘")) {
    return "复盘";
  }

  return "PRD";
}

function normalizeProjectMilestone(
  value: unknown,
  index: number,
  fallback: { dueDate: string; owner: string; ownerMemberId?: string }
): ProjectMilestone {
  const milestone = typeof value === "object" && value ? (value as Record<string, unknown>) : {};

  return {
    id: asText(milestone.id, createLocalId("milestone")),
    title: asText(milestone.title, `里程碑 ${index + 1}`),
    labelId: asText(milestone.labelId) || undefined,
    type: asText(milestone.type) || undefined,
    status: normalizeMilestoneStatus(asText(milestone.status, index === 0 ? "进行中" : "未开始")),
    dueDate: asDateString(milestone.dueDate, fallback.dueDate),
    actualCompletedDate: asText(milestone.actualCompletedDate)
      ? asDateString(milestone.actualCompletedDate, fallback.dueDate)
      : undefined,
    owner: asText(milestone.owner, fallback.owner),
    ownerMemberId: asText(milestone.ownerMemberId, fallback.ownerMemberId) || undefined,
    ownerOpenId: asText(milestone.ownerOpenId) || undefined,
    ownerUnionId: asText(milestone.ownerUnionId) || undefined,
    ownerUserId: asText(milestone.ownerUserId) || undefined,
    ownerEmail: asText(milestone.ownerEmail) || undefined,
    ownerAvatarUrl: asText(milestone.ownerAvatarUrl) || undefined,
    note: asText(milestone.note, "暂无说明。")
  };
}

function normalizeProjectMilestones(
  value: unknown,
  fallback: {
    dueDate: string;
    owner: string;
    ownerMemberId?: string;
    ownerAvatarUrl?: string;
    ownerEmail?: string;
    ownerOpenId?: string;
    ownerUnionId?: string;
    ownerUserId?: string;
    progress: number;
    projectName: string;
  }
) {
  const milestones = Array.isArray(value)
    ? value
        .filter((milestone) => typeof milestone === "object" && milestone)
        .map((milestone, index) => normalizeProjectMilestone(milestone, index, fallback))
        .filter((milestone) => milestone.title)
    : [];

  return milestones;
}

function normalizeCreateProject(values: Record<string, unknown>, id = createLocalId("project")): Project {
  const progress = Math.min(100, Math.max(0, asNumber(values.progress, 0)));
  const health = Math.min(100, Math.max(0, asNumber(values.health, 80)));
  const name = asText(values.name, "未命名项目");
  const owner = asOwnerName(values);
  const ownerLink = createOwnerLink(values);
  const dueDate = asDateString(values.dueDate, dayjs().add(14, "day").format("YYYY-MM-DD"));
  const startDate = asDateString(values.startDate, dayjs(dueDate).subtract(30, "day").format("YYYY-MM-DD"));

  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    name,
    code: asText(values.code) || undefined,
    owner,
    ...ownerLink,
    status: normalizeProjectStatus(asText(values.status, "进行中")),
    startDate,
    progress,
    health,
    riskLevel: normalizeProjectRiskLevel(asText(values.riskLevel, "低")),
    healthStatus: normalizeProjectHealthStatus(asText(values.healthStatus, "待评估")),
    healthReason: asText(values.healthReason) || undefined,
    dueDate,
    team: asNumber(values.team, 1),
    riskCount: asNumber(values.riskCount, 0),
    summary: asText(values.summary, "暂无项目摘要。"),
    deliveryLabelCatalog: normalizeProjectDeliveryLabelCatalog(values.deliveryLabelCatalog),
    milestones: normalizeProjectMilestones(values.milestones, {
      dueDate,
      owner,
      ownerMemberId: ownerLink.ownerMemberId,
      ownerAvatarUrl: ownerLink.ownerAvatarUrl,
      ownerEmail: ownerLink.ownerEmail,
      ownerOpenId: ownerLink.ownerOpenId,
      ownerUnionId: ownerLink.ownerUnionId,
      ownerUserId: ownerLink.ownerUserId,
      progress,
      projectName: name
    })
  };
}

function normalizeCreateTask(values: Record<string, unknown>, id = createLocalId("task")): Task {
  const dueDate = asDateTimeString(values.dueDate, dayjs().add(7, "day").format("YYYY-MM-DD HH:mm"));
  const stage = normalizeTaskStage(asText(values.stage, "待处理"));

  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    title: asText(values.title, "未命名任务"),
    stage,
    owner: asOwnerName(values),
    ...createOwnerLink(values),
    project: asText(values.project, "未关联项目"),
    projectId: asText(values.projectId) || undefined,
    versionId: asText(values.versionId) || DEFAULT_REQUIREMENT_VERSION.id,
    versionName: asText(values.versionName) || DEFAULT_REQUIREMENT_VERSION.name,
    requirementId: asText(values.requirementId) || undefined,
    requirementTitle: asText(values.requirementTitle) || undefined,
    description: asText(values.description) || undefined,
    taskType: asText(values.taskType) || undefined,
    storyPoints: asOptionalNonNegativeNumber(values.storyPoints),
    estimatedMinutes: asOptionalNonNegativeNumber(values.estimatedMinutes),
    priority: normalizeTaskPriority(values.priority),
    startDate: asDateTimeString(values.startDate, dayjs(dueDate).subtract(3, "day").format("YYYY-MM-DD HH:mm")),
    dueDate,
    completedAt:
      stage === "已完成"
        ? asText(values.completedAt) || dayjs().format("YYYY-MM-DD HH:mm")
        : undefined,
    aiHint: asText(values.aiHint, "AI 暂未发现额外风险。")
  };
}

function normalizeCreateBug(values: Record<string, unknown>, id = createLocalId("bug")): BugReport {
  const status = normalizeBugStatus(asText(values.status, "新建"));
  const owner = asOwnerName(values);
  const reporter = asText(values.reporter, "未填写");
  const flowOperator = asText(values.flowRecordOperator, reporter || owner || "系统");

  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    title: asText(values.title, "未命名 Bug"),
    status,
    severity: normalizeBugSeverity(asText(values.severity, "一般")),
    project: asText(values.project, "未关联项目"),
    projectId: asText(values.projectId) || undefined,
    versionId: asText(values.versionId) || DEFAULT_REQUIREMENT_VERSION.id,
    versionName: asText(values.versionName) || DEFAULT_REQUIREMENT_VERSION.name,
    reporter,
    owner,
    ...createOwnerLink(values),
    environment: asText(values.environment, "未填写"),
    reproduction: asText(values.reproduction, "暂无复现步骤。"),
    expected: asText(values.expected, "暂无预期结果。"),
    actual: asText(values.actual, "暂无实际结果。"),
    attachments: asBugAttachments(values.attachments),
    aiFix: normalizeBugAiFix(values.aiFix),
    createdAt: getBugCreatedAt(values),
    flowRecords: normalizeBugFlowRecords(values.flowRecords, {
      bugId: id,
      operator: flowOperator,
      status,
      values
    })
  };
}

function buildBugUpdateFlowRecords(previous: BugReport, next: BugReport, operator: string) {
  const at = new Date().toISOString();
  const records: NonNullable<BugReport["flowRecords"]> = [];

  if (previous.status !== next.status) {
    records.push(createBugFlowRecord({
      action: "statusChanged",
      at,
      from: previous.status,
      operator,
      to: next.status,
      note: "状态流转"
    }));
  }

  if (previous.owner !== next.owner || previous.ownerMemberId !== next.ownerMemberId) {
    records.push(createBugFlowRecord({
      action: "ownerChanged",
      at,
      from: previous.owner,
      operator,
      to: next.owner,
      note: "负责人变更"
    }));
  }

  if (previous.severity !== next.severity) {
    records.push(createBugFlowRecord({
      action: "severityChanged",
      at,
      from: previous.severity,
      operator,
      to: next.severity,
      note: "严重程度变更"
    }));
  }

  if (previous.versionId !== next.versionId || previous.versionName !== next.versionName) {
    records.push(createBugFlowRecord({
      action: "versionChanged",
      at,
      from: previous.versionName ?? "未规划",
      operator,
      to: next.versionName ?? "未规划",
      note: "关联版本变更"
    }));
  }

  if (!records.length) {
    records.push(createBugFlowRecord({
      action: "updated",
      at,
      operator,
      to: next.status,
      note: "更新 Bug 信息"
    }));
  }

  return records;
}

function appendBugUpdateFlowRecords(previous: BugReport, next: BugReport, operator: string) {
  const existingRecords = normalizeBugFlowRecords(previous.flowRecords, {
    bugId: previous.id,
    operator: previous.reporter || operator,
    status: previous.status,
    values: previous as unknown as Record<string, unknown>
  });
  const nextRecords = buildBugUpdateFlowRecords(previous, next, operator);

  return [...existingRecords, ...nextRecords].slice(-30);
}

function normalizeRequirementVersionMilestones(
  value: unknown,
  releaseDate: string
) {
  const milestones = Array.isArray(value)
    ? value
        .filter((milestone) => typeof milestone === "object" && milestone)
        .map((milestone, index) =>
          normalizeProjectMilestone(milestone, index, {
            dueDate: releaseDate,
            owner: "",
            ownerMemberId: undefined
          })
        )
        .filter((milestone) => milestone.title)
    : [];
  const duplicateLabelId = findDuplicateDeliveryMilestoneLabelId(milestones);

  if (duplicateLabelId) {
    throw new Error(`同一版本不能重复使用交付节点标签「${duplicateLabelId}」。`);
  }

  // 空目录保持为空，不再伪造没有 labelId 的兜底节点；新建表单会依项目启用标签生成默认节点。
  return milestones;
}

function normalizeCreateRequirementVersion(
  values: Record<string, unknown>,
  id = createLocalId("requirementVersion"),
  previousCatalog?: unknown
): RequirementVersion {
  const name = asText(values.name, "未命名版本");
  const status = normalizeRequirementVersionStatus(asText(values.status, "规划中"));
  const startDate = asDateString(values.startDate, dayjs().format("YYYY-MM-DD"));
  const releaseDate = asDateString(values.releaseDate, dayjs().add(30, "day").format("YYYY-MM-DD"));
  const parentVersionId = asText(values.parentVersionId);
  const previousLabelIds = new Set(
    normalizeProjectDeliveryLabelCatalog(previousCatalog, { fallbackToDefaults: false })
      .map((label) => label.id)
  );
  const scopedDeliveryLabels = scopeDeliveryLabelCatalogToVersion(
    id,
    values.deliveryLabelCatalog,
    { preserveIds: previousLabelIds }
  );
  const milestones = remapVersionDeliveryMilestones(
    values.milestones,
    scopedDeliveryLabels.catalog,
    scopedDeliveryLabels.idMap
  );

  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    parentVersionId: parentVersionId && parentVersionId !== id ? parentVersionId : undefined,
    parentVersionName: parentVersionId && parentVersionId !== id ? asText(values.parentVersionName) || undefined : undefined,
    name,
    project: asText(values.project, "跨项目"),
    projectId: asText(values.projectId) || undefined,
    type: asText(values.type) === "项目" ? "项目" : "版本",
    status,
    startDate,
    releaseDate,
    actualStartDate: asText(values.actualStartDate)
      ? asDateString(values.actualStartDate, startDate)
      : undefined,
    actualCompletedDate: asText(values.actualCompletedDate)
      ? asDateString(values.actualCompletedDate, releaseDate)
      : undefined,
    progress: Math.min(100, Math.max(0, asNumber(values.progress, 0))),
    riskLevel: normalizeProjectRiskLevel(asText(values.riskLevel, "低")),
    healthStatus: normalizeProjectHealthStatus(asText(values.healthStatus, "待评估")),
    healthReason: asText(values.healthReason) || undefined,
    goal: asText(values.goal, "暂无版本目标。"),
    owner: asText(values.owner) || undefined,
    ...createOwnerLink(values),
    productOwner: asText(values.productOwner) || undefined,
    ...createVersionRoleOwnerLink(values, "product"),
    uiOwner: asText(values.uiOwner) || undefined,
    ...createVersionRoleOwnerLink(values, "ui"),
    devOwner: asText(values.devOwner) || undefined,
    ...createVersionRoleOwnerLink(values, "dev"),
    deliveryLabelCatalog: scopedDeliveryLabels.catalog,
    milestones: normalizeRequirementVersionMilestones(milestones, releaseDate)
  };
}

function normalizeCreateRequirement(
  values: Record<string, unknown>,
  id = createLocalId("requirement")
): Requirement {
  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    title: asText(values.title, "未命名需求"),
    priority: normalizeRequirementPriority(asText(values.priority, "P1")),
    status: normalizeRequirementStatus(asText(values.status, "评审中")),
    project: asText(values.project, "未关联项目"),
    projectId: asText(values.projectId) || undefined,
    versionId: asText(values.versionId) || DEFAULT_REQUIREMENT_VERSION.id,
    versionName: asText(values.versionName) || DEFAULT_REQUIREMENT_VERSION.name,
    description: asText(values.description) || undefined,
    owner: asOwnerName(values),
    ...createOwnerLink(values),
    designOwner: asText(values.designOwner) || undefined,
    ...createDesignOwnerLink(values),
    developerMemberIds: asMemberIdArray(values.developerMemberIds),
    startDate: asText(values.startDate) ? asDateString(values.startDate) : undefined,
    dueDate: asText(values.dueDate) ? asDateString(values.dueDate) : undefined,
    uiLink: asText(values.uiLink),
    documentLink: asText(values.documentLink),
    acceptance: asText(values.acceptance, "暂无验收标准。"),
    aiSummary: asText(values.aiSummary) || undefined,
    aiRisks: asTextArray(values.aiRisks),
    aiMissingItems: asTextArray(values.aiMissingItems),
    aiFrontendNotes: asTextArray(values.aiFrontendNotes),
    aiBackendNotes: asTextArray(values.aiBackendNotes),
    aiTestingNotes: asTextArray(values.aiTestingNotes),
    aiCompletenessScore: Math.max(0, Math.min(100, asNumber(values.aiCompletenessScore, 0))) || undefined
  };
}

function normalizeMemberRole(value: unknown): MemberRole {
  const role = asText(value, "viewer");

  if (["owner", "admin", "productAdmin", "productMember", "frontend", "backend", "qa", "viewer"].includes(role)) {
    return role as MemberRole;
  }

  return "viewer";
}

function normalizeMemberStatus(value: unknown): MemberStatus {
  return asText(value, "active") === "disabled" ? "disabled" : "active";
}

function normalizeNotificationProvider(value: unknown): MemberNotificationChannelProvider {
  const provider = asText(value, "feishu");

  return ["feishu", "email", "webhook", "telegram"].includes(provider) ? provider as MemberNotificationChannelProvider : "feishu";
}

function withDefaultBugFlowScene(scenes: MemberNotificationScene[]): MemberNotificationScene[] {
  const normalizedScenes = Array.from(new Set(scenes));

  return normalizedScenes.includes("taskAssigned") && !normalizedScenes.includes("bugFlowChanged")
    ? [...normalizedScenes, "bugFlowChanged"]
    : normalizedScenes;
}

function normalizeNotificationScenes(
  value: unknown,
  fallback: MemberNotificationScene[] = defaultNotificationScenes
): MemberNotificationScene[] {
  const scenes = Array.isArray(value)
    ? value
        .map((scene) => asText(scene))
        .filter((scene): scene is MemberNotificationScene => validNotificationScenes.has(scene as MemberNotificationScene))
    : [];

  // 旧数据没有 Bug 流转场景；只要渠道仍开启任务通知，就默认补上，避免升级后关键节点不发消息。
  if (scenes.length) {
    return withDefaultBugFlowScene(scenes);
  }

  return withDefaultBugFlowScene(fallback);
}

function getLegacyNotificationScenes(notification: Record<string, unknown>, fallback?: DashboardMember["notification"]) {
  const scenes: MemberNotificationScene[] = [];

  if (asBoolean(notification.taskAssigned, fallback?.taskAssigned ?? true)) {
    scenes.push("taskAssigned");
    scenes.push("bugFlowChanged");
  }

  if (asBoolean(notification.requirementChanged, fallback?.requirementChanged ?? true)) {
    scenes.push("requirementChanged");
  }

  return scenes;
}

function normalizeNotificationChannel(
  value: unknown,
  index: number,
  fallback?: MemberNotificationChannel
): MemberNotificationChannel | null {
  const channel = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const provider = normalizeNotificationProvider(channel.provider ?? fallback?.provider);
  const email = asText(channel.email, fallback?.email) || undefined;
  const webhookUrl = asText(channel.webhookUrl, fallback?.webhookUrl) || undefined;
  const telegramChatId = asText(channel.telegramChatId, fallback?.telegramChatId) || undefined;
  const feishuOpenId = asText(channel.feishuOpenId, fallback?.feishuOpenId) || undefined;
  const feishuUnionId = asText(channel.feishuUnionId, fallback?.feishuUnionId) || undefined;
  const feishuUserId = asText(channel.feishuUserId, fallback?.feishuUserId) || undefined;
  const target = asText(
    channel.target,
    fallback?.target ??
      (provider === "feishu"
        ? feishuOpenId
        : provider === "email"
          ? email
          : provider === "telegram"
            ? telegramChatId
            : webhookUrl)
  ) || undefined;

  if (provider === "feishu" && !feishuOpenId && !target) {
    return null;
  }

  if (provider === "email" && !email && !target) {
    return null;
  }

  if (provider === "webhook" && !webhookUrl && !target) {
    return null;
  }

  if (provider === "telegram" && !telegramChatId && !target) {
    return null;
  }

  return {
    id: asText(channel.id, fallback?.id ?? createLocalId("notificationChannel")),
    provider,
    enabled: asBoolean(channel.enabled, fallback?.enabled ?? true),
    name: asText(channel.name, fallback?.name) || undefined,
    target,
    feishuOpenId,
    feishuUnionId,
    feishuUserId,
    email,
    webhookUrl,
    telegramChatId,
    scenes: normalizeNotificationScenes(channel.scenes, fallback?.scenes)
  };
}

function createLegacyFeishuChannel(
  notification: Record<string, unknown>,
  fallback?: DashboardMember["notification"]
): MemberNotificationChannel | null {
  const feishuOpenId = asText(notification.feishuOpenId, fallback?.feishuOpenId) || undefined;

  if (!feishuOpenId) {
    return null;
  }

  return {
    id: fallback?.channels.find((channel) => channel.provider === "feishu")?.id ?? createLocalId("notificationChannel"),
    provider: "feishu",
    enabled: asBoolean(notification.feishuEnabled, fallback?.feishuEnabled ?? true),
    name: "飞书",
    target: feishuOpenId,
    feishuOpenId,
    feishuUnionId: asText(notification.feishuUnionId, fallback?.feishuUnionId) || undefined,
    feishuUserId: asText(notification.feishuUserId, fallback?.feishuUserId) || undefined,
    scenes: getLegacyNotificationScenes(notification, fallback)
  };
}

function normalizeNotificationChannels(
  value: unknown,
  notification: Record<string, unknown>,
  fallback?: DashboardMember["notification"]
) {
  const fallbackChannels = fallback?.channels ?? [];
  const channels = Array.isArray(value)
    ? value
        .map((channel, index) => normalizeNotificationChannel(channel, index, fallbackChannels[index]))
        .filter((channel): channel is MemberNotificationChannel => Boolean(channel))
    : [];
  const legacyFeishuChannel = createLegacyFeishuChannel(notification, fallback);

  if (!channels.length) {
    return legacyFeishuChannel ? [legacyFeishuChannel] : [];
  }

  if (
    legacyFeishuChannel &&
    !channels.some((channel) => channel.provider === "feishu" && channel.feishuOpenId === legacyFeishuChannel.feishuOpenId)
  ) {
    return [legacyFeishuChannel, ...channels];
  }

  return channels;
}

function getPrimaryFeishuChannel(notification: DashboardMember["notification"]) {
  return notification.channels.find((channel) => channel.provider === "feishu" && (channel.feishuOpenId || channel.target));
}

function normalizeWorkspaceStatus(value: unknown): DashboardWorkspaceStatus {
  return asText(value, "active") === "archived" ? "archived" : "active";
}

function normalizeWorkspace(value: unknown): DashboardWorkspace {
  const workspace = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const now = new Date().toISOString();

  return {
    id: asText(workspace.id, DEFAULT_WORKSPACE.id),
    name: asText(workspace.name, DEFAULT_WORKSPACE.name),
    description: asText(workspace.description, DEFAULT_WORKSPACE.description) || undefined,
    status: normalizeWorkspaceStatus(workspace.status),
    createdAt: asText(workspace.createdAt, now),
    updatedAt: asText(workspace.updatedAt, now)
  };
}

function normalizeWorkspaces(workspaces: unknown[]) {
  const normalizedWorkspaces = (workspaces.length ? workspaces : [DEFAULT_WORKSPACE]).map(normalizeWorkspace);
  const hasDefaultWorkspace = normalizedWorkspaces.some((workspace) => workspace.id === DEFAULT_WORKSPACE.id);

  return hasDefaultWorkspace ? normalizedWorkspaces : [DEFAULT_WORKSPACE, ...normalizedWorkspaces];
}

function resolveWorkspaceFromList(workspaces: DashboardWorkspace[], workspaceId?: string) {
  const normalizedWorkspaces = normalizeWorkspaces(workspaces);

  // 成员创建只需要确认目标工作区是否有效；这里复用和 dashboard 首屏相同的“指定 active 优先，否则第一个 active”规则，
  // 但不读取任务/Bug/需求等业务表，避免成员配置这种轻量动作被全量 dashboard 拖慢。
  return (
    normalizedWorkspaces.find((workspace) => workspace.id === workspaceId && workspace.status === "active") ??
    normalizedWorkspaces.find((workspace) => workspace.status === "active") ??
    DEFAULT_WORKSPACE
  );
}

function normalizeMember(value: unknown, fallbackWorkspaceId = DEFAULT_WORKSPACE.id): DashboardMember {
  const member = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const notification = typeof member.notification === "object" && member.notification
    ? (member.notification as Record<string, unknown>)
    : {};
  const identities = Array.isArray(member.identities)
    ? member.identities
        .map((identity) => (typeof identity === "object" && identity ? (identity as Record<string, unknown>) : null))
        .filter(Boolean)
        .map((identity) => ({
          provider: normalizeMemberIdentityProvider(identity?.provider),
          providerUserId: asText(identity?.providerUserId),
          providerUnionId: asText(identity?.providerUnionId) || undefined,
          providerTenantUserId: asText(identity?.providerTenantUserId) || undefined,
          email: asText(identity?.email) || undefined
        }))
        .filter((identity) => identity.providerUserId)
    : [];
  const channels = normalizeNotificationChannels(notification.channels, notification);
  const primaryFeishuChannel = getPrimaryFeishuChannel({
    channels,
    feishuEnabled: asBoolean(notification.feishuEnabled, Boolean(notification.feishuOpenId)),
    feishuOpenId: asText(notification.feishuOpenId) || undefined,
    feishuUnionId: asText(notification.feishuUnionId) || undefined,
    feishuUserId: asText(notification.feishuUserId) || undefined,
    taskAssigned: asBoolean(notification.taskAssigned, true),
    requirementChanged: asBoolean(notification.requirementChanged, true)
  });
  const legacyScenes = primaryFeishuChannel?.scenes ?? getLegacyNotificationScenes(notification);
  const feishuOpenId = primaryFeishuChannel?.feishuOpenId ?? asText(notification.feishuOpenId);
  const feishuUnionId = primaryFeishuChannel?.feishuUnionId ?? asText(notification.feishuUnionId);
  const feishuUserId = primaryFeishuChannel?.feishuUserId ?? asText(notification.feishuUserId);
  const now = new Date().toISOString();

  return {
    id: asText(member.id, createLocalId("member")),
    workspaceId: asText(member.workspaceId, fallbackWorkspaceId),
    name: asText(member.name, "未命名成员"),
    email: asText(member.email) || undefined,
    avatarUrl: asText(member.avatarUrl) || undefined,
    registrationChannel: normalizeMemberIdentityProvider(member.registrationChannel),
    role: normalizeMemberRole(member.role),
    status: normalizeMemberStatus(member.status),
    identities,
    notification: {
      channels,
      feishuEnabled: primaryFeishuChannel?.enabled ?? asBoolean(notification.feishuEnabled, Boolean(notification.feishuOpenId)),
      feishuOpenId: feishuOpenId || undefined,
      feishuUnionId: feishuUnionId || undefined,
      feishuUserId: feishuUserId || undefined,
      taskAssigned: legacyScenes.includes("taskAssigned"),
      requirementChanged: legacyScenes.includes("requirementChanged")
    },
    lastActiveAt: asText(member.lastActiveAt) || undefined,
    createdAt: asText(member.createdAt, now),
    updatedAt: asText(member.updatedAt, now)
  };
}

function createMemberFromUser(user: FeishuUser, role: MemberRole, workspaceId = DEFAULT_WORKSPACE.id): DashboardMember {
  const now = new Date().toISOString();
  const identities: DashboardMember["identities"] = [];
  const authProvider = getAuthIdentityProvider(user);
  const authUserId = getAuthIdentityUserId(user);
  const feishuNotificationOpenId = getFeishuNotificationOpenId(user);
  const profileEmail = getMemberProfileEmail(user);

  // 登录身份只保存 SDK 的 authUserId；OAuth provider 的原始 id 仅用于飞书通知字段，不再参与运行时成员匹配。
  // 线上已有成员如需和 auth_... 绑定，应通过受控数据修正写入 identities，避免运行时继续猜 openId 或邮箱。
  if (authUserId) {
    identities.push({
      provider: authProvider,
      providerUserId: authUserId,
      providerUnionId: authProvider === "feishu" ? user.unionId : undefined,
      providerTenantUserId: authProvider === "feishu" ? user.userId : undefined,
      email: user.email
    });
  }

  return {
    id: createLocalId("member"),
    workspaceId,
    name: user.name || user.enName || profileEmail || "未命名成员",
    email: profileEmail,
    avatarUrl: user.avatarUrl,
    registrationChannel: authProvider,
    role,
    status: "active",
    identities,
    notification: {
      channels: feishuNotificationOpenId
        ? [
            {
              id: createLocalId("notificationChannel"),
              provider: "feishu",
              enabled: true,
              name: "飞书",
              target: feishuNotificationOpenId,
              feishuOpenId: feishuNotificationOpenId,
              feishuUnionId: user.unionId,
              feishuUserId: user.userId,
              scenes: [...defaultNotificationScenes]
            }
          ]
        : [],
      feishuEnabled: Boolean(feishuNotificationOpenId),
      feishuOpenId: feishuNotificationOpenId,
      feishuUnionId: authProvider === "feishu" ? user.unionId : undefined,
      feishuUserId: authProvider === "feishu" ? user.userId : undefined,
      taskAssigned: true,
      requirementChanged: true
    },
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function getAuthIdentityProvider(user: FeishuUser): MemberIdentityProvider {
  // authProvider 只能来自 SDK 或服务端对 account.providerId 的回查；缺失时说明当前身份来源不可判定，
  // 不能再默认当作飞书，否则 Google/GitHub 用户在成员表里会被误标成飞书注册渠道。
  return user.authProvider ?? "email";
}

function getAuthIdentityUserId(user: FeishuUser) {
  return user.authUserId;
}

function getFeishuNotificationOpenId(user: FeishuUser) {
  // 统一认证 user.openId 可能是 SDK authUserId；只有飞书机器人接口接受的 `ou_...` 才能写入通知渠道。
  // 这里做最后一道防线，避免页面读数据时把不可投递的身份再次同步回成员通知配置。
  return getAuthIdentityProvider(user) === "feishu" && user.openId.startsWith("ou_") ? user.openId : undefined;
}

function normalizeIdentityEmail(value: unknown) {
  return asText(value).trim().toLowerCase();
}

function normalizeIdentityToken(value: unknown) {
  return asText(value).trim().toLowerCase();
}

function uniqueIdentityTokens(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeIdentityToken).filter(Boolean)));
}

function getLegacyFeishuOpenIdFromSyntheticEmail(email?: string) {
  const normalizedEmail = normalizeIdentityEmail(email);
  const suffix = "@feishu.local";

  if (!normalizedEmail.endsWith(suffix)) {
    return "";
  }

  const localPart = normalizedEmail.slice(0, -suffix.length);

  // 统一认证早期会用飞书 open_id 生成本地占位邮箱；只有 `ou_` 这种飞书 open_id
  // 才能作为历史成员桥接线索，普通邮箱或其他 provider 的本地身份不能进入该兼容分支。
  return localPart.startsWith("ou_") ? localPart : "";
}

function getLegacyFeishuUserIdentityTokens(user: FeishuUser) {
  if (getAuthIdentityProvider(user) !== "feishu") {
    return [];
  }

  // 当前 SDK authUserId 是运行时主身份，但历史 owner 行曾把飞书 open_id 写进 providerUserId。
  // 这里仅收集确定来自飞书的旧标识，用于一次性把老成员行和新 SDK 身份重新连起来。
  return uniqueIdentityTokens([
    user.openId?.startsWith("ou_") ? user.openId : "",
    user.unionId,
    user.userId,
    getLegacyFeishuOpenIdFromSyntheticEmail(user.email)
  ]);
}

function getMemberLegacyFeishuIdentityTokens(member: DashboardMember) {
  return uniqueIdentityTokens([
    member.notification.feishuOpenId,
    member.notification.feishuUnionId,
    member.notification.feishuUserId,
    ...member.notification.channels
      .filter((channel) => channel.provider === "feishu")
      .flatMap((channel) => [
        channel.target,
        channel.feishuOpenId,
        channel.feishuUnionId,
        channel.feishuUserId
      ]),
    ...member.identities
      .filter((identity) => identity.provider === "feishu")
      .flatMap((identity) => [
        identity.providerUserId,
        identity.providerUnionId,
        identity.providerTenantUserId
      ])
  ]);
}

function findUniqueWorkspaceMemberByLegacyFeishuIdentity(members: DashboardMember[], workspaceId: string, user: FeishuUser) {
  const userTokens = getLegacyFeishuUserIdentityTokens(user);

  if (!userTokens.length) {
    return undefined;
  }

  const candidates = members.filter((member) => {
    if (member.workspaceId !== workspaceId) {
      return false;
    }

    const memberTokens = getMemberLegacyFeishuIdentityTokens(member);

    return userTokens.some((token) => memberTokens.includes(token));
  });

  // 历史身份桥接必须唯一命中才可自动归并；一旦同一 open_id 被错误配置给多人，
  // 宁可退回正常的 authUserId/email 匹配，也不能在读页面时把登录人合并到错误成员。
  return candidates.length === 1 ? candidates[0] : undefined;
}

function findUniqueWorkspaceMemberByEmail(members: DashboardMember[], workspaceId: string, user: FeishuUser) {
  const email = normalizeIdentityEmail(user.email);

  if (!email) {
    return undefined;
  }

  const candidates = members.filter((member) => member.workspaceId === workspaceId && normalizeIdentityEmail(member.email) === email);

  return candidates.length === 1 ? candidates[0] : undefined;
}

function getMemberProfileEmail(user: FeishuUser, fallback?: string) {
  // `ou_xxx@feishu.local` 是统一认证为了无邮箱飞书用户生成的占位邮箱，只能作为历史身份桥接线索，
  // 不能展示到成员资料里，否则成员页会把 open_id 误当真实邮箱呈现给用户。
  return getLegacyFeishuOpenIdFromSyntheticEmail(user.email) ? fallback : user.email || fallback;
}

function mergeMemberIdentities(
  fallbackIdentities: DashboardMember["identities"] | undefined,
  nextIdentities: DashboardMember["identities"]
) {
  const identities = [...(fallbackIdentities ?? []), ...nextIdentities];
  const seen = new Set<string>();

  // 成员编辑表单只提交通知相关的邮箱/飞书字段，但运行时成员匹配依赖 SDK 写入的 auth_... 身份。
  // 因此保存通知配置时必须保留既有 OAuth 身份，并对完全相同的 provider/id 去重，避免刷新后找不到当前成员。
  return identities.filter((identity) => {
    const key = `${identity.provider}:${normalizeIdentityEmail(identity.providerUserId) || identity.providerUserId}`;

    if (!identity.providerUserId || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function detachAuthIdentityFromDuplicateMembers(
  members: DashboardMember[],
  workspaceId: string,
  currentMemberId: string,
  user: FeishuUser
) {
  const authProvider = getAuthIdentityProvider(user);
  const authUserId = normalizeIdentityToken(getAuthIdentityUserId(user));

  if (!authUserId) {
    return {
      members,
      changed: false
    };
  }

  let changed = false;
  const now = new Date().toISOString();
  const nextMembers = members.map((member) => {
    if (member.workspaceId !== workspaceId || member.id === currentMemberId) {
      return member;
    }

    const identities = member.identities.filter(
      (identity) =>
        identity.provider !== authProvider ||
        normalizeIdentityToken(identity.providerUserId) !== authUserId
    );

    if (identities.length === member.identities.length) {
      return member;
    }

    changed = true;

    // 同一个 SDK authUserId 只能归属一个业务成员；否则后续权限会再次命中旧的只读重复行。
    // 这里只移除重复登录身份，不删除成员记录，避免读取路径顺手改动任务负责人或通知配置。
    return {
      ...member,
      identities,
      updatedAt: now
    };
  });

  return {
    members: nextMembers,
    changed
  };
}

function syncMemberProfile(member: DashboardMember, user: FeishuUser) {
  const channels = [...member.notification.channels];
  const feishuChannelIndex = channels.findIndex((channel) => channel.provider === "feishu");
  const authProvider = getAuthIdentityProvider(user);
  const authUserId = getAuthIdentityUserId(user);
  const feishuNotificationOpenId = getFeishuNotificationOpenId(user);
  const hasAuthProviderIdentity = member.identities.some(
    (identity) => identity.provider === authProvider && identity.providerUserId === authUserId
  );
  const shouldAttachAuthIdentity = Boolean(authUserId && !hasAuthProviderIdentity);

  // 资料同步发生在页面读数据时，只补齐 SDK authUserId 对应的身份；飞书通知通道必须限定飞书来源，
  // 避免 Google/GitHub 登录用户被错误创建机器人通知目标。
  if (feishuNotificationOpenId && feishuChannelIndex >= 0) {
    channels[feishuChannelIndex] = {
      ...channels[feishuChannelIndex],
      target: channels[feishuChannelIndex].target?.startsWith("ou_") ? channels[feishuChannelIndex].target : feishuNotificationOpenId,
      feishuOpenId: channels[feishuChannelIndex].feishuOpenId?.startsWith("ou_") ? channels[feishuChannelIndex].feishuOpenId : feishuNotificationOpenId,
      feishuUnionId: channels[feishuChannelIndex].feishuUnionId || user.unionId,
      feishuUserId: channels[feishuChannelIndex].feishuUserId || user.userId
    };
  } else if (feishuNotificationOpenId) {
    channels.push({
      id: createLocalId("notificationChannel"),
      provider: "feishu",
      enabled: member.notification.feishuEnabled,
      name: "飞书",
      target: feishuNotificationOpenId,
      feishuOpenId: feishuNotificationOpenId,
      feishuUnionId: user.unionId,
      feishuUserId: user.userId,
      scenes: getLegacyNotificationScenes({}, member.notification)
    });
  }

  const nextMember: DashboardMember = {
    ...member,
    name: user.name || member.name,
    email: getMemberProfileEmail(user, member.email),
    avatarUrl: user.avatarUrl || member.avatarUrl,
    // 成员行合并后，registrationChannel 展示的是当前已确认的主登录来源，而不是通知渠道。
    // 当服务端确认本次登录来自 Google/GitHub/飞书时，要覆盖历史误写的 email/feishu 值；
    // 只有邮箱/手动身份不覆盖已有 OAuth 来源，避免弱身份把强身份冲掉。
    registrationChannel: authProvider !== "email" ? authProvider : member.registrationChannel,
    identities: [...member.identities],
    notification: {
      ...member.notification,
      channels,
      feishuOpenId: feishuNotificationOpenId
        ? member.notification.feishuOpenId?.startsWith("ou_") ? member.notification.feishuOpenId : feishuNotificationOpenId
        : member.notification.feishuOpenId,
      feishuUnionId: authProvider === "feishu" ? member.notification.feishuUnionId || user.unionId : member.notification.feishuUnionId,
      feishuUserId: authProvider === "feishu" ? member.notification.feishuUserId || user.userId : member.notification.feishuUserId
    }
  };

  if (authUserId && shouldAttachAuthIdentity) {
    nextMember.identities.push({
      provider: authProvider,
      providerUserId: authUserId,
      providerUnionId: authProvider === "feishu" ? user.unionId : undefined,
      providerTenantUserId: authProvider === "feishu" ? user.userId : undefined,
      email: user.email
    });
  }

  const changed = JSON.stringify(nextMember) !== JSON.stringify(member);

  return changed
    ? {
        ...nextMember,
        updatedAt: new Date().toISOString()
      }
    : member;
}

function shouldRefreshMemberLastActiveAt(member: DashboardMember, nowMs: number) {
  if (!member.lastActiveAt) {
    return true;
  }

  const previousActiveAt = new Date(member.lastActiveAt).getTime();

  // 历史数据可能来自手工导入或旧版本 JSON；遇到不可解析的时间直接刷新成当前 ISO，
  // 避免成员页长期展示一个无效值，也不需要在 UI 层再兜底多套格式。
  if (!Number.isFinite(previousActiveAt)) {
    return true;
  }

  return nowMs - previousActiveAt >= memberLastActiveRefreshIntervalMs;
}

function stampMemberLastActiveAt(member: DashboardMember, now = new Date()) {
  // 最近活跃只表达“该成员最近访问过 AI PM”，和成员资料更新时间不是同一含义；
  // 因此这里只写 lastActiveAt，不改 updatedAt，避免成员管理页把活跃刷新误读成资料被编辑。
  return shouldRefreshMemberLastActiveAt(member, now.getTime())
    ? {
        ...member,
        lastActiveAt: now.toISOString()
      }
    : member;
}

function resolveCurrentWorkspace(data: LocalDatabase, workspaceId?: string) {
  const workspaces = normalizeWorkspaces(data.workspaces);
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId && workspace.status === "active") ??
    workspaces.find((workspace) => workspace.status === "active") ??
    DEFAULT_WORKSPACE;
  const changed = JSON.stringify(workspaces) !== JSON.stringify(data.workspaces);

  return {
    data: {
      ...data,
      workspaces
    },
    changed,
    currentWorkspace
  };
}

function ensureCurrentMember(data: LocalDatabase, workspaceId: string, user?: FeishuUser) {
  if (!user) {
    return {
      data,
      changed: false,
      currentMember: undefined
    };
  }

  const members = data.members.map((member) => normalizeMember(member, workspaceId));
  const authMatchedMember = findWorkspaceMemberForUser(members, workspaceId, user);
  const legacyFeishuMatchedMember = findUniqueWorkspaceMemberByLegacyFeishuIdentity(members, workspaceId, user);
  const existingMember =
    legacyFeishuMatchedMember ??
    authMatchedMember ??
    findUniqueWorkspaceMemberByEmail(members, workspaceId, user);

  if (existingMember) {
    const syncedMember = syncMemberProfile(existingMember, user);
    const activeStampedMember = stampMemberLastActiveAt(syncedMember);
    const membersWithSyncedCurrentMember = members.map((member) => member.id === existingMember.id ? activeStampedMember : member);
    const duplicateIdentityResult = detachAuthIdentityFromDuplicateMembers(
      membersWithSyncedCurrentMember,
      workspaceId,
      activeStampedMember.id,
      user
    );
    // 页面读取阶段会对成员结构做一次兼容性规范化，同时以 5 分钟节流刷新最近活跃；
    // 两者都只写 workspace_members，不触碰任务/Bug/需求，避免普通工作台读取退化成全量数据同步。
    const changed = activeStampedMember !== existingMember || duplicateIdentityResult.changed;

    return {
      data: {
        ...data,
        members: duplicateIdentityResult.members
      },
      changed,
      currentMember: activeStampedMember
    };
  }

  const hasActiveMember = members.some((member) => member.workspaceId === workspaceId && member.status === "active");
  const currentMember = createMemberFromUser(user, hasActiveMember ? "viewer" : "owner", workspaceId);

  return {
    data: {
      ...data,
      members: [currentMember, ...members]
    },
    changed: true,
    currentMember
  };
}

function getWorkspaceId(record: { workspaceId?: string }) {
  return record.workspaceId || DEFAULT_WORKSPACE.id;
}

function filterWorkspaceRecords<T extends { workspaceId?: string }>(records: T[], workspaceId: string) {
  return records.filter((record) => getWorkspaceId(record) === workspaceId);
}

function scopeDataToWorkspace(data: LocalDatabase, workspaceId: string): LocalDatabase {
  return {
    ...data,
    projects: filterWorkspaceRecords(data.projects, workspaceId),
    tasks: filterWorkspaceRecords(data.tasks, workspaceId),
    bugs: filterWorkspaceRecords(data.bugs, workspaceId),
    risks: filterWorkspaceRecords(data.risks, workspaceId),
    requirementVersions: filterWorkspaceRecords(data.requirementVersions, workspaceId),
    requirements: filterWorkspaceRecords(data.requirements, workspaceId),
    documents: filterWorkspaceRecords(data.documents, workspaceId),
    members: data.members.filter((member) => member.workspaceId === workspaceId)
  };
}

function scopeDataToVisibleProjects(data: LocalDatabase, visibleIds: Set<string>): LocalDatabase {
  const allProjectIds = new Set(data.projects.map((project) => project.id));
  const uniqueIdsByName = uniqueProjectIdByName(data.projects);
  const belongsToVisibleProject = (record: { project: string; projectId?: string }) => {
    const projectId = resolveVisibleRecordProjectId(record, allProjectIds, uniqueIdsByName);

    return Boolean(projectId && visibleIds.has(projectId));
  };

  // 项目及关联 PM 记录使用同一个 visibleProjectIds 边界。legacy 只有项目名的行仅在工作区唯一命中时可见，
  // 否则既不归入任何项目，也不能作为“孤儿记录”随 dashboard 泄露。
  return {
    ...data,
    projects: data.projects.filter((project) => visibleIds.has(project.id)),
    requirementVersions: data.requirementVersions.filter(belongsToVisibleProject),
    requirements: data.requirements.filter(belongsToVisibleProject),
    tasks: data.tasks.filter(belongsToVisibleProject),
    risks: data.risks.filter(belongsToVisibleProject),
    bugs: data.bugs.filter(belongsToVisibleProject),
    repositories: (data.repositories ?? []).filter((repository) => Boolean(
      repository.projectId && visibleIds.has(repository.projectId)
    ))
  };
}

function normalizeCreateRisk(values: Record<string, unknown>, id = createLocalId("risk")): Risk {
  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    title: asText(values.title, "未命名风险"),
    level: normalizeRiskLevel(asText(values.level, "中")),
    owner: asOwnerName(values),
    ...createOwnerLink(values),
    project: asText(values.project, "未关联项目"),
    projectId: asText(values.projectId) || undefined,
    mitigation: asText(values.mitigation, "暂无应对措施。")
  };
}

function normalizeCreateDocument(values: Record<string, unknown>, id = createLocalId("document")): DocumentItem {
  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    title: asText(values.title, "未命名文档"),
    type: normalizeDocumentType(asText(values.type, "PRD")),
    updatedAt: asDateTimeString(values.updatedAt),
    aiSummary: asText(values.aiSummary, "暂无 AI 摘要。")
  };
}

function createRecord<T extends DashboardEntityType>(
  type: T,
  values: Record<string, unknown>,
  previousRecord?: DashboardEntityMap[DashboardEntityType]
): DashboardEntityMap[T] {
  if (type === "project") {
    return normalizeCreateProject(values) as DashboardEntityMap[T];
  }

  if (type === "task") {
    return normalizeCreateTask(values) as DashboardEntityMap[T];
  }

  if (type === "bug") {
    return normalizeCreateBug(values) as DashboardEntityMap[T];
  }

  if (type === "risk") {
    return normalizeCreateRisk(values) as DashboardEntityMap[T];
  }

  if (type === "requirementVersion") {
    const previousVersion = previousRecord as RequirementVersion | undefined;

    return normalizeCreateRequirementVersion(
      values,
      previousVersion?.id ?? createLocalId("requirementVersion"),
      previousVersion?.deliveryLabelCatalog
    ) as DashboardEntityMap[T];
  }

  if (type === "requirement") {
    return normalizeCreateRequirement(values) as DashboardEntityMap[T];
  }

  return normalizeCreateDocument(values) as DashboardEntityMap[T];
}

function normalizeProjectName(value: string) {
  return value.trim().toLowerCase();
}

function getProjectMetricKey(workspaceId: string, projectName: string, projectId?: string) {
  return projectId
    ? `${workspaceId}:id:${projectId}`
    : `${workspaceId}:name:${normalizeProjectName(projectName)}`;
}

function groupRecordsByProject<T extends { project?: string; projectId?: string; workspaceId?: string }>(records: T[]) {
  const groupedRecords = new Map<string, T[]>();

  // dashboard 读取会频繁派生项目进度、健康度和风险数；如果每个项目都全量 filter 任务/Bug/风险，
  // 多工作区和长列表下会退化成 `项目数 × 记录数` 的重复扫描。新数据优先按稳定 projectId 分组，
  // 没有 ID 的历史行和 Bug 仍按“工作区 + 项目名”兼容，避免升级期间指标突然归零。
  for (const record of records) {
    const projectName = asText(record.project);

    if (!projectName) {
      continue;
    }

    const metricKey = getProjectMetricKey(getWorkspaceId(record), projectName, asText(record.projectId) || undefined);
    const projectRecords = groupedRecords.get(metricKey);

    if (projectRecords) {
      projectRecords.push(record);
    } else {
      groupedRecords.set(metricKey, [record]);
    }
  }

  return groupedRecords;
}

function getProjectRecords<T>(groupedRecords: Map<string, T[]>, project: Project) {
  const workspaceId = getWorkspaceId(project);

  // 进入指标分组前已对唯一项目名补齐 ID；仍留在名称分组的只可能是同名歧义数据，不应计入任一项目。
  return groupedRecords.get(getProjectMetricKey(workspaceId, project.name, project.id)) ?? [];
}

function getUniqueProjectIdByName(projects: Project[]) {
  const projectIdsByName = new Map<string, string[]>();

  for (const project of projects) {
    const key = getProjectMetricKey(getWorkspaceId(project), project.name);
    const candidateIds = projectIdsByName.get(key) ?? [];

    candidateIds.push(project.id);
    projectIdsByName.set(key, candidateIds);
  }

  // 历史记录只有项目名时，唯一命中才能安全补 ID；同一工作区存在同名项目时保持未归属，等待人工迁移。
  return new Map(
    [...projectIdsByName.entries()]
      .flatMap(([key, candidateIds]) => {
        const uniqueCandidateId = selectUniqueProjectNameCandidate(candidateIds);

        return uniqueCandidateId ? [[key, uniqueCandidateId] as const] : [];
      })
  );
}

function backfillProjectId<T extends { project: string; projectId?: string; workspaceId?: string }>(
  records: T[],
  projects: Project[]
) {
  const projectIdByName = getUniqueProjectIdByName(projects);

  // 迁移会持久化大部分旧行的 projectId；这里仍保留读取期唯一命名兜底，覆盖本地种子、未跑迁移的开发库和旧脚本写入。
  return records.map((record) => ({
    ...record,
    projectId:
      record.projectId ??
      projectIdByName.get(getProjectMetricKey(getWorkspaceId(record), record.project))
  }));
}

function backfillBugProjectId(
  bugs: BugReport[],
  versions: RequirementVersion[],
  projects: Project[]
) {
  const projectIdByVersion = new Map(
    versions
      .filter((version) => Boolean(version.projectId))
      .map((version) => [`${getWorkspaceId(version)}:${version.id}`, version.projectId as string] as const)
  );
  const projectIdByName = getUniqueProjectIdByName(projects);

  // Bug 的 versionId 比可编辑项目名更稳定：先用同工作区版本归属，只在版本无稳定项目时才用唯一项目名兜底。
  return bugs.map((bug) => ({
    ...bug,
    projectId:
      bug.projectId
      ?? (bug.versionId ? projectIdByVersion.get(`${getWorkspaceId(bug)}:${bug.versionId}`) : undefined)
      ?? projectIdByName.get(getProjectMetricKey(getWorkspaceId(bug), bug.project))
  }));
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function calculateTaskCompletionProgress(tasks: Task[]) {
  if (!tasks.length) {
    return 0;
  }

  const completedTaskCount = tasks.filter((task) => task.stage === "已完成").length;

  // one2all 的交付进度是客观完成率，评审中/验收中不再折算部分分值，避免看板显示高进度但实际没有完成项。
  return clampScore((completedTaskCount / tasks.length) * 100);
}

function getHighestProjectRiskLevel(levels: ProjectRiskLevel[]): ProjectRiskLevel {
  const rank: Record<ProjectRiskLevel, number> = { 低: 1, 中: 2, 高: 3 };

  return levels.reduce((highest, level) => (rank[level] > rank[highest] ? level : highest), "低");
}

function deriveProjectRiskLevel(project: Project, risks: Risk[]): ProjectRiskLevel {
  return getHighestProjectRiskLevel([project.riskLevel, ...risks.map((risk) => risk.level)]);
}

function hasMilestoneScheduleDeviation(milestone: ProjectMilestone) {
  const actualCompletedDate = milestone.actualCompletedDate ? dayjs(milestone.actualCompletedDate) : null;
  const dueDate = dayjs(milestone.dueDate);

  return (
    milestone.status === "延期" ||
    (actualCompletedDate !== null &&
      actualCompletedDate.isValid() &&
      dueDate.isValid() &&
      actualCompletedDate.isAfter(dueDate, "day"))
  );
}

function deriveDeliveryHealth({
  actualCompletedDate,
  actualStartDate,
  milestones,
  plannedEndDate,
  plannedStartDate,
  progress,
  riskLevel,
  tasks
}: {
  actualCompletedDate?: string;
  actualStartDate?: string;
  milestones: ProjectMilestone[];
  plannedEndDate: string;
  plannedStartDate: string;
  progress: number;
  riskLevel: ProjectRiskLevel;
  tasks: Task[];
}): { healthStatus: ProjectHealthStatus; healthReason: string } {
  const today = dayjs().startOf("day");
  const plannedStart = dayjs(plannedStartDate).startOf("day");
  const plannedEnd = dayjs(plannedEndDate).startOf("day");
  const actualStart = actualStartDate ? dayjs(actualStartDate).startOf("day") : null;
  const actualCompleted = actualCompletedDate ? dayjs(actualCompletedDate).startOf("day") : null;
  const overdueTasks = tasks.filter((task) => {
    const dueDate = dayjs(task.dueDate).startOf("day");

    return task.stage !== "已完成" && dueDate.isValid() && dueDate.isBefore(today);
  });
  const delayedMilestoneCount = milestones.filter(hasMilestoneScheduleDeviation).length;
  const plannedDeliveryOverdue = plannedEnd.isValid() && plannedEnd.isBefore(today) && progress < 100;
  const startedLate =
    actualStart !== null && actualStart.isValid() && plannedStart.isValid() && actualStart.isAfter(plannedStart, "day");
  const completedLate =
    actualCompleted !== null &&
    actualCompleted.isValid() &&
    plannedEnd.isValid() &&
    actualCompleted.isAfter(plannedEnd, "day");
  const hasValidCycle =
    plannedStart.isValid() && plannedEnd.isValid() && plannedEnd.isAfter(plannedStart, "day");
  const totalCycleDays = hasValidCycle ? Math.max(1, plannedEnd.diff(plannedStart, "day")) : 0;
  const expectedProgress = !hasValidCycle || !today.isAfter(plannedStart, "day")
    ? 0
    : !today.isBefore(plannedEnd, "day")
      ? 100
      : clampScore((today.diff(plannedStart, "day") / totalCycleDays) * 100);
  const behind = Math.max(0, expectedProgress - progress);
  const deviationReasons = [
    overdueTasks.length ? `${overdueTasks.length} 项任务逾期` : "",
    plannedDeliveryOverdue ? "计划交付日已过但任务未全部完成" : "",
    behind >= 20 ? `实际进度落后线性计划 ${Math.round(behind)} 个百分点` : "",
    startedLate ? "实际开始日晚于计划开始日" : "",
    completedLate ? "实际完成日晚于计划交付日" : "",
    delayedMilestoneCount ? `${delayedMilestoneCount} 个交付节点发生偏差` : ""
  ].filter(Boolean);

  if (progress >= 100) {
    return {
      healthStatus: "正常",
      healthReason: "全部关联任务均已完成。"
    };
  }

  if (riskLevel === "高") {
    deviationReasons.unshift("存在高风险项");
  }

  if (deviationReasons.length) {
    return {
      healthStatus: "已偏离",
      healthReason: deviationReasons.join("；")
    };
  }

  if (riskLevel === "中" || behind >= 10) {
    return {
      healthStatus: "有风险",
      healthReason: [
        riskLevel === "中" ? "存在中风险项" : "",
        behind >= 10 ? `实际进度落后线性计划 ${Math.round(behind)} 个百分点` : ""
      ].filter(Boolean).join("；")
    };
  }

  if (!tasks.length || !hasValidCycle) {
    return {
      healthStatus: "待评估",
      healthReason: !tasks.length
        ? "暂无关联任务，暂不具备交付进度与延期评估条件。"
        : "计划开始日、计划结束日无效或未形成有效周期，暂无法计算线性预期进度。"
    };
  }

  return {
    healthStatus: "正常",
    healthReason: `当前进度 ${progress}%，线性预期进度 ${expectedProgress}%，风险与排期均在正常范围。`
  };
}

function calculateProjectHealth({
  bugs,
  progress,
  project,
  risks,
  tasks
}: {
  bugs: BugReport[];
  progress: number;
  project: Project;
  risks: Risk[];
  tasks: Task[];
}) {
  const today = dayjs().startOf("day");
  const overdueTasks = tasks.filter((task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(today));
  const delayedMilestones = project.milestones.filter((milestone) => milestone.status === "延期");
  const openBugs = bugs.filter((bug) => bug.status !== "已关闭");
  const dueDate = dayjs(project.dueDate).startOf("day");
  let health = 100;

  for (const risk of risks) {
    health -= risk.level === "高" ? 18 : risk.level === "中" ? 10 : 4;
  }

  for (const bug of openBugs) {
    health -= bug.severity === "阻塞" ? 14 : bug.severity === "严重" ? 10 : bug.severity === "一般" ? 5 : 2;
  }

  health -= overdueTasks.length * 8;
  health -= delayedMilestones.length * 12;

  const isClosed = project.status === "已完成" || project.status === "已归档";

  if (!isClosed && dueDate.isBefore(today) && progress < 100) {
    health -= 18;
  } else if (!isClosed && dueDate.diff(today, "day") <= 7 && progress < 70) {
    health -= 10;
  }

  if (progress < 30 && project.status === "进行中") {
    health -= 4;
  }

  return clampScore(health);
}

function calculateProjectRiskCount({
  bugs,
  health,
  progress,
  project,
  risks,
  tasks
}: {
  bugs: BugReport[];
  health: number;
  progress: number;
  project: Project;
  risks: Risk[];
  tasks: Task[];
}) {
  const today = dayjs().startOf("day");
  const criticalBugs = bugs.filter((bug) => bug.status !== "已关闭" && ["阻塞", "严重"].includes(bug.severity));
  const overdueTasks = tasks.filter((task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(today));
  const delayedMilestones = project.milestones.filter((milestone) => milestone.status === "延期");
  const isClosed = project.status === "已完成" || project.status === "已归档";
  const scheduleRisk =
    !isClosed && dayjs(project.dueDate).isBefore(today) && progress < 100 ? 1 : 0;
  const healthRisk = health < 70 ? 1 : 0;

  return risks.length + criticalBugs.length + overdueTasks.length + delayedMilestones.length + scheduleRisk + healthRisk;
}

function deriveProjectStatus(project: Project, progress: number): ProjectStatus {
  if (project.status === "暂停" || project.status === "已归档" || project.status === "已完成") {
    return project.status;
  }

  if (progress >= 100) {
    return "已完成";
  }

  return "进行中";
}

function applyProjectMetrics(data: LocalDatabase): LocalDatabase {
  const tasks = backfillProjectId(data.tasks, data.projects);
  const risks = backfillProjectId(data.risks, data.projects);
  const requirements = backfillProjectId(data.requirements, data.projects);
  const versionsWithProjectId = backfillProjectId(data.requirementVersions, data.projects);
  const bugs = backfillBugProjectId(data.bugs, versionsWithProjectId, data.projects);
  const tasksByProject = groupRecordsByProject(tasks);
  const bugsByProject = groupRecordsByProject(bugs);
  const risksByProject = groupRecordsByProject(risks);
  const projects = data.projects.map((project) => {
    const projectTasks = getProjectRecords(tasksByProject, project);
    const projectBugs = getProjectRecords(bugsByProject, project);
    const projectRisks = getProjectRecords(risksByProject, project);
    const progress = calculateTaskCompletionProgress(projectTasks);
    const riskLevel = deriveProjectRiskLevel(project, projectRisks);
    const deliveryHealth = deriveDeliveryHealth({
      milestones: project.milestones,
      plannedEndDate: project.dueDate,
      plannedStartDate: project.startDate,
      progress,
      riskLevel,
      tasks: projectTasks
    });
    const health = calculateProjectHealth({
      bugs: projectBugs,
      progress,
      project,
      risks: projectRisks,
      tasks: projectTasks
    });
    const riskCount = calculateProjectRiskCount({
      bugs: projectBugs,
      health,
      progress,
      project,
      risks: projectRisks,
      tasks: projectTasks
    });

    return {
      ...project,
      progress,
      health,
      riskLevel,
      ...deliveryHealth,
      riskCount,
      status: deriveProjectStatus(project, progress)
    };
  });
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const tasksByVersion = new Map<string, Task[]>();
  const childVersionIdsByParent = new Map<string, string[]>();

  for (const task of tasks) {
    if (!task.versionId) {
      continue;
    }

    const versionKey = `${getWorkspaceId(task)}:${task.versionId}`;
    const versionTasks = tasksByVersion.get(versionKey);

    if (versionTasks) {
      versionTasks.push(task);
    } else {
      tasksByVersion.set(versionKey, [task]);
    }
  }

  for (const version of versionsWithProjectId) {
    if (!version.parentVersionId) {
      continue;
    }

    const parentKey = `${getWorkspaceId(version)}:${version.parentVersionId}`;
    childVersionIdsByParent.set(parentKey, [
      ...(childVersionIdsByParent.get(parentKey) ?? []),
      version.id
    ]);
  }

  const getVersionScopeIds = (version: RequirementVersion) => {
    const workspaceId = getWorkspaceId(version);
    const visited = new Set<string>();
    const pending = [version.id];

    while (pending.length) {
      const versionId = pending.pop();

      if (!versionId || visited.has(versionId)) {
        continue;
      }

      visited.add(versionId);
      pending.push(...(childVersionIdsByParent.get(`${workspaceId}:${versionId}`) ?? []));
    }

    return visited;
  };

  const requirementVersions = versionsWithProjectId.map((version) => {
    const workspaceId = getWorkspaceId(version);
    const versionScopeIds = getVersionScopeIds(version);
    const versionTasks = [...versionScopeIds].flatMap(
      (versionId) => tasksByVersion.get(`${workspaceId}:${versionId}`) ?? []
    );
    const project = version.projectId ? projectById.get(version.projectId) : undefined;
    const riskLevel = project
      ? getHighestProjectRiskLevel([project.riskLevel, version.riskLevel])
      : version.riskLevel;
    const progress = calculateTaskCompletionProgress(versionTasks);
    const deliveryHealth = deriveDeliveryHealth({
      actualCompletedDate: version.actualCompletedDate,
      actualStartDate: version.actualStartDate,
      milestones: version.milestones,
      plannedEndDate: version.releaseDate,
      plannedStartDate: version.startDate,
      progress,
      riskLevel,
      tasks: versionTasks
    });

    // 子版本只聚合自身子树，父版本聚合全部后代任务；visited 可阻断历史脏数据中的父子循环。
    // 这样所有读取入口都与版本详情的子树口径一致，不再出现列表 direct-only、详情 aggregate 的健康度分裂。
    return {
      ...version,
      progress,
      riskLevel,
      ...deliveryHealth
    };
  });

  return {
    ...data,
    bugs,
    projects,
    tasks,
    risks,
    requirements,
    requirementVersions,
    metrics: createMetrics({
      ...data,
      projects,
      tasks
    })
  };
}

function findRecord<T extends DashboardEntityType>(
  data: LocalDatabase,
  type: T,
  id: string
): DashboardEntityMap[T] | undefined {
  if (type === "project") {
    return data.projects.find((project) => project.id === id) as DashboardEntityMap[T] | undefined;
  }

  if (type === "task") {
    return data.tasks.find((task) => task.id === id) as DashboardEntityMap[T] | undefined;
  }

  if (type === "bug") {
    return data.bugs.find((bug) => bug.id === id) as DashboardEntityMap[T] | undefined;
  }

  if (type === "risk") {
    return data.risks.find((risk) => risk.id === id) as DashboardEntityMap[T] | undefined;
  }

  if (type === "requirementVersion") {
    return data.requirementVersions.find((version) => version.id === id) as DashboardEntityMap[T] | undefined;
  }

  if (type === "requirement") {
    return data.requirements.find((requirement) => requirement.id === id) as DashboardEntityMap[T] | undefined;
  }

  return data.documents.find((document) => document.id === id) as DashboardEntityMap[T] | undefined;
}

export async function getDashboardRecordById<T extends DashboardEntityType>(
  type: T,
  id: string
): Promise<DashboardEntityMap[T] | undefined> {
  // 项目级鉴权与删除审计需要在变更前拿到原记录的 projectId；统一复用 dashboard 只读路径，
  // 可以同时获得迁移期按项目名补齐的稳定 ID，并保证该 helper 本身不产生任何写入副作用。
  const data = await readDatabase();

  return findRecord(data, type, id);
}

function findRequirementVersionInWorkspace(data: LocalDatabase, versionId: string, workspaceId: string) {
  return data.requirementVersions.find(
    (item) => item.id === versionId && getWorkspaceId(item) === workspaceId
  );
}

function withRequirementVersionProject(data: LocalDatabase, values: Record<string, unknown>, workspaceId: string) {
  const versionId = asText(values.versionId);
  const version = findRequirementVersionInWorkspace(data, versionId, workspaceId) ?? DEFAULT_REQUIREMENT_VERSION;
  const submittedProject = asText(values.project);
  const submittedProjectId = asText(values.projectId);

  // 任务、需求和 Bug 的项目选择已经在 UI 收敛到版本上下文；服务端仍要用 versionId 二次回填，
  // 因为 API、AI 助手和脚本都可能绕过表单直接提交旧 project/versionName，导致版本大屏和项目视图口径错位。
  // “跨项目”版本允许保留调用方已有项目；明确项目版本则强制覆盖成版本项目。
  return {
    ...values,
    versionId: version.id,
    versionName: version.name,
    project: version.project === "跨项目" && submittedProject ? submittedProject : version.project,
    projectId: version.project === "跨项目" ? submittedProjectId || version.projectId : version.projectId
  };
}

function withResolvedRequirementVersionProject(values: Record<string, unknown>, version: RequirementVersion) {
  const submittedProject = asText(values.project);
  const submittedProjectId = asText(values.projectId);

  // 轻量任务创建不读取完整版本列表，但版本口径必须和完整路径一致：
  // “跨项目”版本保留调用方项目，明确项目版本强制覆盖，避免项目视图和版本大屏统计分叉。
  return {
    ...values,
    versionId: version.id,
    versionName: version.name,
    project: version.project === "跨项目" && submittedProject ? submittedProject : version.project,
    projectId: version.project === "跨项目" ? submittedProjectId || version.projectId : version.projectId
  };
}

async function resolveTaskVersionForCreate(workspaceId: string, values: Record<string, unknown>) {
  const versionId = asText(values.versionId);
  const version = versionId
    ? await readDashboardRequirementVersionDatabase(workspaceId, versionId)
    : undefined;

  return {
    ...DEFAULT_REQUIREMENT_VERSION,
    workspaceId,
    ...(version ?? {})
  };
}

function withRequirementVersionParentProject(data: LocalDatabase, values: Record<string, unknown>, workspaceId: string) {
  const parentVersionId = asText(values.parentVersionId);

  if (!parentVersionId) {
    return values;
  }

  const parentVersion = findRequirementVersionInWorkspace(data, parentVersionId, workspaceId);

  if (!parentVersion) {
    return values;
  }

  // 子版本项目由父版本决定；前端会同步这个隐藏字段，但服务端也必须兜底，
  // 否则通过 API 直接创建子版本时会出现版本树父子项目不一致。
  return {
    ...values,
    parentVersionId: parentVersion.id,
    parentVersionName: parentVersion.name,
    project: parentVersion.project,
    projectId: parentVersion.projectId
  };
}

function withProjectIdFromName(data: LocalDatabase, values: Record<string, unknown>, workspaceId: string) {
  const explicitProjectId = asText(values.projectId);
  const projectName = asText(values.project);
  const sameNameProjects = data.projects.filter(
    (project) => (
      normalizeProjectName(project.name) === normalizeProjectName(projectName)
      && getWorkspaceId(project) === workspaceId
    )
  );
  const matchedProject = explicitProjectId
    ? data.projects.find((project) => project.id === explicitProjectId && getWorkspaceId(project) === workspaceId)
    : selectUniqueProjectNameCandidate(sameNameProjects);

  // 新客户端直接提交稳定 projectId；旧 UI 只提交项目名时仅在工作区内唯一命中才补齐，避免同名项目串数据。
  return matchedProject
    ? {
        ...values,
        projectId: matchedProject.id,
        project: matchedProject.name
      }
    : explicitProjectId
      ? {
          // 关联 ID 只能指向当前工作区内真实项目；无效 ID 不得原样落库。
          // 项目型实体的 API 会更早返回 4xx，这个兜底主要覆盖 Bug、旧脚本和本地演示数据。
          ...values,
          projectId: undefined
        }
      : values;
}

function withRecordVersionScope(data: LocalDatabase, type: DashboardEntityType, values: Record<string, unknown>, workspaceId: string) {
  if (type === "task" || type === "bug" || type === "requirement") {
    return withProjectIdFromName(data, withRequirementVersionProject(data, values, workspaceId), workspaceId);
  }

  if (type === "requirementVersion") {
    return withProjectIdFromName(data, withRequirementVersionParentProject(data, values, workspaceId), workspaceId);
  }

  if (type === "risk") {
    return withProjectIdFromName(data, values, workspaceId);
  }

  return values;
}

function createMetrics(data: Pick<DashboardData, "projects" | "tasks" | "bugs" | "requirements" | "documents">) {
  const activeProjects = data.projects.filter(
    (project) => project.status !== "已完成" && project.status !== "已归档"
  ).length;
  const deliveryRate = data.projects.length
    ? Math.round(data.projects.reduce((sum, project) => sum + project.progress, 0) / data.projects.length)
    : 0;
  const today = dayjs().startOf("day");
  const overdueTasks = data.tasks.filter((task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(today)).length;
  const aiSavedHours = Math.max(
    0,
    data.requirements.length * 3 + data.documents.length * 2 + data.tasks.length + data.bugs.length
  );

  return {
    activeProjects,
    deliveryRate,
    overdueTasks,
    aiSavedHours
  };
}

function getRecordTitle(type: DashboardEntityType, values: Record<string, unknown>) {
  if (type === "project") {
    return asText(values.name, "未命名项目");
  }

  if (type === "requirementVersion") {
    return asText(values.name, "未命名版本");
  }

  return asText(values.title, "未命名记录");
}

function getEntityLabel(type: DashboardEntityType) {
  const labels: Record<DashboardEntityType, string> = {
    project: "项目",
    task: "任务",
    bug: "Bug",
    risk: "风险",
    requirementVersion: "需求版本",
    requirement: "需求",
    document: "文档"
  };

  return labels[type];
}

function getNotificationTargetIdentities(values: Record<string, unknown>) {
  const ownerName = asOwnerName(values);

  return [
    values.ownerMemberId,
    values.ownerOpenId,
    values.ownerUnionId,
    values.ownerUserId,
    values.ownerEmail,
    ownerName && ownerName !== "未分配" ? ownerName : ""
  ]
    .map((value) => asText(value).trim().toLowerCase())
    .filter(Boolean);
}

function getMemberNotificationIdentities(member: DashboardMember) {
  return [
    member.id,
    member.name,
    member.email,
    member.notification.feishuOpenId,
    member.notification.feishuUnionId,
    member.notification.feishuUserId,
    ...member.notification.channels.flatMap((channel) => [
      channel.target,
      channel.feishuOpenId,
      channel.feishuUnionId,
      channel.feishuUserId,
      channel.email
    ]),
    ...member.identities.flatMap((identity) => [
      identity.providerUserId,
      identity.providerUnionId,
      identity.providerTenantUserId,
      identity.email
    ])
  ]
    .map((value) => asText(value).trim().toLowerCase())
    .filter(Boolean);
}

function findMemberByNotificationIdentities(data: LocalDatabase, workspaceId: string, targetIdentities: string[]) {
  if (!targetIdentities.length) {
    return undefined;
  }

  return data.members.find((member) => {
    if (member.workspaceId !== workspaceId) {
      return false;
    }

    const memberIdentities = getMemberNotificationIdentities(member);

    return targetIdentities.some((identity) => memberIdentities.includes(identity));
  });
}

function findNotificationMember(data: LocalDatabase, workspaceId: string, values: Record<string, unknown>) {
  return findMemberByNotificationIdentities(data, workspaceId, getNotificationTargetIdentities(values));
}

function getEnabledDeliveryChannels(member: DashboardMember | undefined, scene: MemberNotificationScene) {
  return (member?.notification.channels ?? []).filter(
    (channel) =>
      (channel.provider === "feishu" || channel.provider === "email") &&
      channel.enabled &&
      channel.scenes.includes(scene)
  );
}

function hasEnabledProvider(member: DashboardMember | undefined, provider: MemberNotificationChannelProvider) {
  return Boolean(member?.notification.channels.some((channel) => channel.provider === provider && channel.enabled));
}

function getNotificationChannelDedupePart(channel: MemberNotificationChannel) {
  return [
    channel.provider,
    channel.id,
    channel.target,
    channel.feishuOpenId,
    channel.email
  ]
    .map((value) => asText(value).trim())
    .filter(Boolean)
    .join(":")
    .slice(0, 80);
}

function getDispatchableDeliveryChannels(channels: MemberNotificationChannel[]) {
  const emailSettings = getEmailNotificationSettings();
  const emailConfigured = Boolean(emailSettings.apiKey && emailSettings.from);

  return {
    channels: channels.filter((channel) => channel.provider !== "email" || emailConfigured),
    emailDisabledReason: channels.some((channel) => channel.provider === "email") && !emailConfigured
      ? "邮箱通知未配置 RESEND_API_KEY 或 EMAIL_FROM，邮箱不会发送。"
      : ""
  };
}

async function notifyOwner(data: LocalDatabase, workspaceId: string, type: DashboardEntityType, values: Record<string, unknown>) {
  const member = findNotificationMember(data, workspaceId, values);
  const notificationScene: MemberNotificationScene =
    type === "requirement" || type === "requirementVersion"
      ? "requirementChanged"
      : type === "bug"
        ? "bugFlowChanged"
        : "taskAssigned";
  const deliveryChannels = getEnabledDeliveryChannels(member, notificationScene);
  const dispatchableDelivery = getDispatchableDeliveryChannels(deliveryChannels);
  const ownerName = asOwnerName(values);
  const recordTitle = getRecordTitle(type, values);
  const cardTitle = type === "bug" ? "你有一个 Bug 需要处理" : `你被设置为${getEntityLabel(type)}负责人`;
  const cardText =
    type === "bug"
      ? [
          `**${recordTitle}**`,
          "",
          `提交人：${asText(values.reporter, "未填写")}`,
          `严重程度：${asText(values.severity, "一般")}`,
          `当前状态：${asText(values.status, "新建")}`,
          `关联版本：${asText(values.versionName, "未规划")}`,
          "",
          "测试已提交或重新打开该 Bug，请开发负责人进入 AI PM 查看复现步骤并继续定位处理。"
        ].join("\n")
      : `**${recordTitle}**\n\n请在 AI PM 平台查看详情并确认下一步动作。`;

  if (!getNotificationTargetIdentities(values).length) {
    return "";
  }

  if (!member) {
    return `未发送飞书通知：负责人 ${ownerName} 未在成员管理中匹配到成员。`;
  }

  if (member.status !== "active") {
    return `未发送通知：成员 ${member.name} 已被禁用。`;
  }

  if (!hasEnabledProvider(member, "feishu") && !hasEnabledProvider(member, "email")) {
    return `未发送通知：成员 ${member.name} 已关闭飞书和邮箱通知。`;
  }

  if (!deliveryChannels.length) {
    return `未发送通知：成员 ${member.name} 未启用该通知场景的飞书或邮箱渠道。`;
  }

  if (!dispatchableDelivery.channels.length) {
    return `未发送通知：${dispatchableDelivery.emailDisabledReason}`;
  }

  try {
    // 通知发送按渠道拆成独立后台任务：邮箱失败不能阻断飞书，邮箱重试也不能造成飞书重复发送。
    await Promise.all(dispatchableDelivery.channels.map((channel) =>
      createDashboardSideEffectQueue().enqueue({
        workspaceId,
        entityType: type,
        entityId: asText(values.id, recordTitle).slice(0, 191),
        jobType: "notify_owner",
        dedupeKey: `${workspaceId}:${type}:${asText(values.id, recordTitle)}:notify_owner:${getOwnerNotificationSignature(values)}:${getNotificationChannelDedupePart(channel)}`.slice(0, 191),
        payload: createNotificationPayload({
          targetIdentities: getNotificationTargetIdentities(values),
          notificationScene,
          ownerName,
          cardTitle,
          cardText,
          view: type === "project" ? "projects" : type === "bug" ? "bugs" : type === "task" ? "tasks" : "overview",
          channelProvider: channel.provider,
          channelId: channel.id
        })
      })
    ));

    return `已提交后台通知：${asOwnerName(values)}。${dispatchableDelivery.emailDisabledReason}`;
  } catch (error) {
    return `通知入队失败：${error instanceof Error ? error.message : "未知错误"}。`;
  }
}

// Bug 修复完成后通知提交人回归验证，避免继续使用“负责人变更”文案造成职责不清。
async function notifyBugTesterOnReady(
  data: LocalDatabase,
  workspaceId: string,
  previousBug: BugReport,
  nextBug: BugReport
) {
  if (previousBug.status === "待验证" || nextBug.status !== "待验证") {
    return "";
  }

  const testerName = asText(nextBug.reporter, "测试人员");
  const testerIdentities = [nextBug.reporter]
    .map((value) => asText(value).trim().toLowerCase())
    .filter(Boolean);
  const member = findMemberByNotificationIdentities(data, workspaceId, testerIdentities);
  const deliveryChannels = getEnabledDeliveryChannels(member, "bugFlowChanged");
  const dispatchableDelivery = getDispatchableDeliveryChannels(deliveryChannels);

  if (!testerIdentities.length) {
    return "";
  }

  if (!member) {
    return `未发送测试通知：提交人 ${testerName} 未在成员管理中匹配到成员。`;
  }

  if (member.status !== "active") {
    return `未发送测试通知：测试人员 ${member.name} 已被禁用。`;
  }

  if (!hasEnabledProvider(member, "feishu") && !hasEnabledProvider(member, "email")) {
    return `未发送测试通知：测试人员 ${member.name} 已关闭飞书和邮箱通知。`;
  }

  if (!deliveryChannels.length) {
    return `未发送测试通知：测试人员 ${member.name} 未启用 Bug 流转的飞书或邮箱渠道。`;
  }

  if (!dispatchableDelivery.channels.length) {
    return `未发送测试通知：${dispatchableDelivery.emailDisabledReason}`;
  }

  try {
    // 测试通知同样按渠道拆分，避免一个渠道配置错误拖住另一个渠道。
    await Promise.all(dispatchableDelivery.channels.map((channel) =>
      createDashboardSideEffectQueue().enqueue({
        workspaceId,
        entityType: "bug",
        entityId: nextBug.id,
        jobType: "notify_bug_tester",
        dedupeKey: `${workspaceId}:bug:${nextBug.id}:notify_bug_tester:${nextBug.status}:${getNotificationChannelDedupePart(channel)}`.slice(0, 191),
        payload: createNotificationPayload({
          targetIdentities: testerIdentities,
          notificationScene: "bugFlowChanged",
          ownerName: testerName,
          cardTitle: "Bug 修复任务已结束，请回归验证",
          cardText: [
          `**${nextBug.title}**`,
          "",
          `修复负责人：${nextBug.owner || "未分配"}`,
          `关联版本：${nextBug.versionName ?? "未规划"}`,
          `当前状态：${nextBug.status}`,
          "",
          "开发修复任务已结束，请测试人员进入 AI PM 查看复现步骤、预期结果和实际结果，并完成回归验证。"
          ].join("\n"),
          view: "bugs",
          channelProvider: channel.provider,
          channelId: channel.id
        })
      })
    ));

    return `已提交后台测试通知：${member.name}。${dispatchableDelivery.emailDisabledReason}`;
  } catch (error) {
    return `测试通知入队失败：${error instanceof Error ? error.message : "未知错误"}。`;
  }
}

function shouldNotifyBugDeveloperOnOpen(previousBug: BugReport, nextBug: BugReport) {
  const developerStatuses: BugReport["status"][] = ["新建", "定位中", "修复中"];

  return !developerStatuses.includes(previousBug.status) && developerStatuses.includes(nextBug.status);
}

// 测试回归不通过时会把 Bug 重新打开，这里把处理权清楚地转回开发负责人。
async function notifyBugDeveloperOnOpen(
  data: LocalDatabase,
  workspaceId: string,
  previousBug: BugReport,
  nextBug: BugReport
) {
  if (!shouldNotifyBugDeveloperOnOpen(previousBug, nextBug)) {
    return "";
  }

  const values: Record<string, unknown> = {
    ...nextBug,
    status: nextBug.status,
    title: nextBug.title
  };

  return notifyOwner(data, workspaceId, "bug", values);
}

function getOwnerNotificationSignature(values: Record<string, unknown>) {
  return getNotificationTargetIdentities(values).join("|");
}

function shouldNotifyOwnerUpdate(
  type: DashboardEntityType,
  previousRecord: DashboardEntityMap[DashboardEntityType],
  nextValues: Record<string, unknown>
) {
  if (!["project", "task", "bug", "risk", "requirement"].includes(type)) {
    return false;
  }

  return getOwnerNotificationSignature(previousRecord as Record<string, unknown>) !== getOwnerNotificationSignature(nextValues);
}

export async function getDashboardData(user?: FeishuUser, workspaceId?: string): Promise<DashboardData> {
  // 工作台首屏和工作区切换只需要当前工作区业务数据；在数据库层下推 workspaceId 可以避免每次页面读取都扫全库任务、Bug、需求。
  // 其他写入路径仍使用 readDatabase() 全量读取，确保旧的全量同步写库语义不误删其他工作区数据。
  const baseData = await readDatabase(workspaceId, { scopeToWorkspace: true });
  const workspaceResult = resolveCurrentWorkspace(baseData, workspaceId);
  const memberResult = ensureCurrentMember(workspaceResult.data, workspaceResult.currentWorkspace.id, user);
  const data = memberResult.data;
  const changed = workspaceResult.changed || memberResult.changed;
  const currentMember = memberResult.currentMember;
  const workspaceScopedData = scopeDataToWorkspace(data, workspaceResult.currentWorkspace.id);
  const visibleIds = await resolveVisibleProjectIds({
    currentMember,
    isLocalDemo: !isAuthServiceConfigured(),
    workspaceId: workspaceResult.currentWorkspace.id
  });
  const scopedData = scopeDataToVisibleProjects(workspaceScopedData, visibleIds);

  if (changed) {
    // 读取仪表盘时只可能因为当前工作区规范化或登录用户资料同步而变化，不能走全量写库，否则腾讯云 MySQL 公网下会反复 upsert 大量任务导致首屏超时。
    await writeDashboardIdentityDatabase(data);
  }

  return {
    ...scopedData,
    workspaces: data.workspaces,
    metrics: createMetrics(scopedData),
    meta: {
      source: "database",
      user,
      currentWorkspace: workspaceResult.currentWorkspace,
      currentMember,
      permissions: getDashboardPermissions(currentMember),
      storage: DASHBOARD_DATABASE_STORAGE,
      message: "已接入 MySQL 数据库，平台成员负责权限与负责人选择，飞书仅用于登录和机器人通知。"
    }
  };
}

export async function getWorkspaceAccessContext(user?: FeishuUser, workspaceId?: string) {
  const currentWorkspace = resolveWorkspaceFromList(await readWorkspaces(), workspaceId);
  const members = (await readDashboardMembersDatabase(currentWorkspace.id)).map((member) =>
    normalizeMember(member, currentWorkspace.id)
  );
  const currentMember = findWorkspaceMemberForUser(members, currentWorkspace.id, user);

  // 业务 API 做权限判断时只需要当前工作区成员身份，不需要任务、Bug、需求等完整 dashboard；
  // 这条轻量路径和 getDashboardData 使用同一套 member 匹配/权限函数，避免性能优化后权限语义分叉。
  return {
    currentMember,
    currentWorkspace,
    permissions: getDashboardPermissions(currentMember)
  };
}

export async function getDashboardBugById(id: string) {
  return readDashboardBugDatabase(id);
}

function normalizeMemberInput(values: Record<string, unknown>, fallback?: DashboardMember): DashboardMember {
  const now = new Date().toISOString();
  const workspaceId = asText(values.workspaceId, fallback?.workspaceId ?? DEFAULT_WORKSPACE.id);
  const feishuOpenId = asText(values.feishuOpenId, fallback?.notification.feishuOpenId);
  const feishuUnionId = asText(values.feishuUnionId, fallback?.notification.feishuUnionId);
  const feishuUserId = asText(values.feishuUserId, fallback?.notification.feishuUserId);
  const email = asText(values.email, fallback?.email);
  const identities: DashboardMember["identities"] = [];
  const notificationInput = {
    feishuEnabled: values.feishuEnabled,
    feishuOpenId,
    feishuUnionId,
    feishuUserId,
    taskAssigned: values.taskAssigned,
    requirementChanged: values.requirementChanged
  };
  const channels = normalizeNotificationChannels(values.channels, notificationInput, fallback?.notification);
  const primaryFeishuChannel = getPrimaryFeishuChannel({
    channels,
    feishuEnabled: asBoolean(values.feishuEnabled, fallback?.notification.feishuEnabled ?? Boolean(feishuOpenId)),
    feishuOpenId: feishuOpenId || undefined,
    feishuUnionId: feishuUnionId || undefined,
    feishuUserId: feishuUserId || undefined,
    taskAssigned: asBoolean(values.taskAssigned, fallback?.notification.taskAssigned ?? true),
    requirementChanged: asBoolean(values.requirementChanged, fallback?.notification.requirementChanged ?? true)
  });
  const legacyScenes = primaryFeishuChannel?.scenes ?? getLegacyNotificationScenes(notificationInput, fallback?.notification);
  const primaryFeishuOpenId = primaryFeishuChannel?.feishuOpenId ?? feishuOpenId;
  const primaryFeishuUnionId = primaryFeishuChannel?.feishuUnionId ?? feishuUnionId;
  const primaryFeishuUserId = primaryFeishuChannel?.feishuUserId ?? feishuUserId;

  if (feishuOpenId) {
    identities.push({
      provider: "feishu",
      providerUserId: feishuOpenId,
      providerUnionId: feishuUnionId || undefined,
      providerTenantUserId: feishuUserId || undefined,
      email: email || undefined
    });
  }

  if (email) {
    identities.push({
      provider: "email",
      providerUserId: email,
      email
    });
  }

  const formIdentities: DashboardMember["identities"] = identities;

  return {
    id: fallback?.id ?? createLocalId("member"),
    workspaceId,
    name: asText(values.name, fallback?.name ?? "未命名成员"),
    email: email || undefined,
    avatarUrl: asText(values.avatarUrl, fallback?.avatarUrl) || undefined,
    registrationChannel: fallback?.registrationChannel ?? "email",
    role: normalizeMemberRole(values.role ?? fallback?.role),
    status: normalizeMemberStatus(values.status ?? fallback?.status),
    identities: mergeMemberIdentities(fallback?.identities, formIdentities),
    notification: {
      channels,
      feishuEnabled: primaryFeishuChannel?.enabled ?? asBoolean(values.feishuEnabled, fallback?.notification.feishuEnabled ?? Boolean(feishuOpenId)),
      feishuOpenId: primaryFeishuOpenId || undefined,
      feishuUnionId: primaryFeishuUnionId || undefined,
      feishuUserId: primaryFeishuUserId || undefined,
      taskAssigned: legacyScenes.includes("taskAssigned"),
      requirementChanged: legacyScenes.includes("requirementChanged")
    },
    lastActiveAt: asText(values.lastActiveAt, fallback?.lastActiveAt) || undefined,
    createdAt: fallback?.createdAt ?? now,
    updatedAt: now
  };
}

function hasDuplicatedMemberIdentity(members: DashboardMember[], member: DashboardMember, ignoreMemberId?: string) {
  const memberIdentities = [member.email, member.notification.feishuOpenId]
    .filter(Boolean);

  if (!memberIdentities.length) {
    return false;
  }

  // 成员身份去重只需要在同一工作区内检查邮箱/飞书 openId/历史 identities；
  // 这里不依赖任务、Bug、需求等业务数据，避免成员管理保存动作被全量 dashboard 读取拖慢。
  return members.some((item) =>
    item.id !== ignoreMemberId &&
    item.workspaceId === member.workspaceId &&
    memberIdentities.some((identity) =>
      item.email === identity ||
      item.notification.feishuOpenId === identity ||
      item.identities.some((itemIdentity) => itemIdentity.providerUserId === identity)
    )
  );
}

export async function createDashboardMember(values: Record<string, unknown>, workspaceId = DEFAULT_WORKSPACE.id) {
  const workspace = resolveWorkspaceFromList(await readWorkspaces(), workspaceId);
  const members = (await readDashboardMembersDatabase(workspace.id)).map((item) => normalizeMember(item, workspace.id));
  const member = normalizeMemberInput({ ...values, workspaceId: workspace.id });
  const duplicated = hasDuplicatedMemberIdentity(members, member);

  if (duplicated) {
    throw new Error("成员已存在，请直接编辑角色或通知配置");
  }

  // 新增成员只需要写入 workspace_members 一行；全量 writeDatabase 会重写任务/Bug/需求等业务表，
  // 对公网 MySQL 来说成本过高，也会让通知配置这类轻量操作看起来“卡住”。
  await upsertDashboardMemberDatabase(member);

  return {
    member,
    message: `已添加成员：${member.name}。`
  };
}

export async function updateDashboardMember(id: string, values: Record<string, unknown>) {
  const existingMember = await readDashboardMemberDatabase(id);

  if (!existingMember) {
    throw new Error("成员不存在或已被删除");
  }

  const members = (await readDashboardMembersDatabase(existingMember.workspaceId)).map((item) =>
    normalizeMember(item, existingMember.workspaceId)
  );
  const member = normalizeMemberInput({
    ...values,
    workspaceId: existingMember.workspaceId
  }, existingMember);
  const duplicated = hasDuplicatedMemberIdentity(members, member, id);
  const existingCanManage = existingMember.status === "active" && ["owner", "admin"].includes(existingMember.role);
  const nextCanManage = member.status === "active" && ["owner", "admin"].includes(member.role);
  const hasAnotherManager = members.some((item) =>
    item.id !== id && item.workspaceId === member.workspaceId && item.status === "active" && ["owner", "admin"].includes(item.role)
  );

  if (duplicated) {
    throw new Error("成员身份已被其他成员绑定，请检查邮箱或飞书账号");
  }

  if (existingCanManage && !nextCanManage && !hasAnotherManager) {
    throw new Error("至少需要保留一个启用的所有者或管理员");
  }

  // 成员更新尤其是通知渠道保存是后台配置单行写入，不能触发全量 dashboard 同步事务。
  await upsertDashboardMemberDatabase(member);

  return {
    member,
    message: `已更新成员：${member.name}。`
  };
}

export async function createDashboardWorkspace(values: Record<string, unknown>, user?: FeishuUser) {
  const now = new Date().toISOString();
  const workspaces = normalizeWorkspaces(await readWorkspaces());
  const workspace: DashboardWorkspace = {
    id: createLocalId("workspace"),
    name: asText(values.name, "未命名工作区"),
    description: asText(values.description) || undefined,
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  if (workspaces.some((item) => item.name === workspace.name && item.status !== "archived")) {
    throw new Error("工作区名称已存在");
  }

  let member: DashboardMember | undefined;

  if (user) {
    member = createMemberFromUser(user, "owner", workspace.id);
  }

  // 新建工作区是 AI PM 的业务动作，不回写 SDK/Auth Service；SDK 只提供稳定 authUserId，
  // 这里把当前登录用户挂到 AI PM 自己的 workspace_members，避免其他接入 SDK 的系统被迫接受工作区模型。
  // 该动作只新增工作区本身以及创建者 owner 身份，项目/任务/需求等业务数据没有变化；增量插入可以避免公网 MySQL 下全量重写数据导致事务超时。
  await createDashboardWorkspaceDatabase(workspace, member);

  return {
    workspace,
    member,
    message: `已创建工作区：${workspace.name}。`
  };
}

export async function createDashboardRecord<T extends DashboardEntityType>(
  type: T,
  values: Record<string, unknown>,
  workspaceId = DEFAULT_WORKSPACE.id,
  user?: FeishuUser
): Promise<CreateRecordResult<T>> {
  const data = await readDatabase();
  const workspace = resolveCurrentWorkspace(data, workspaceId).currentWorkspace;
  const now = new Date().toISOString();
  const baseValues = {
    ...values,
    workspaceId: workspace.id,
    ...(type === "bug"
      ? {
          createdAt: now,
          flowRecordAt: now,
          flowRecordOperator: getBugFlowOperator(user, asText(values.reporter, "系统"))
        }
      : {})
  };
  const scopedValues = withRecordVersionScope(data, type, baseValues, workspace.id);
  const record = createRecord(type, scopedValues);

  if (type === "project") {
    data.projects = [record as Project, ...data.projects];
  }

  if (type === "task") {
    data.tasks = [record as Task, ...data.tasks];
  }

  if (type === "bug") {
    data.bugs = [record as BugReport, ...data.bugs];
  }

  if (type === "risk") {
    data.risks = [record as Risk, ...data.risks];
  }

  if (type === "requirementVersion") {
    data.requirementVersions = [record as RequirementVersion, ...data.requirementVersions];
  }

  if (type === "requirement") {
    data.requirements = [record as Requirement, ...data.requirements];
  }

  if (type === "document") {
    data.documents = [record as DocumentItem, ...data.documents];
  }

  const savedData = applyProjectMetrics(data);
  const savedRecord = findRecord(savedData, type, record.id) ?? record;
  const notifyMessage = await notifyOwner(data, workspace.id, type, {
    ...scopedValues,
    id: savedRecord.id
  });

  if (type === "project") {
    // 项目创建只影响 projects 当前行；项目进度/健康度读取时派生，避免全量同步重写任务等大表。
    await upsertDashboardProjectDatabase(savedRecord as Project);
  } else if (type === "task") {
    // 任务创建是高频入口，和拖拽更新一样只写当前任务行；项目统计在读取时派生，
    // 不能为了新增一条任务调用全量 writeDatabase 重写所有业务表。
    await upsertDashboardTaskDatabase(savedRecord as Task);
  } else if (type === "bug") {
    // 创建 Bug 会先触发负责人通知；保存阶段只写当前 Bug 行和其附件/流转记录，避免飞书已送达但前端仍等待全量同步。
    await upsertDashboardBugDatabase(savedRecord as BugReport);
  } else if (type === "requirement") {
    // 单条需求保存只影响 requirements 当前行；需求 AI 索引由 API route 异步投递，
    // 这里不能再调用全量 writeDatabase，否则会复现公网 MySQL 60 秒事务超时。
    await upsertDashboardRequirementDatabase(
      savedRecord as Requirement,
      undefined,
      getAssignmentPermissionActor(data, workspace.id, user)
    );
  } else if (type === "requirementVersion") {
    // 新建版本只写当前版本行；子版本项目继承和后续记录归一化已经在服务层完成。
    await upsertDashboardRequirementVersionDatabase(
      savedRecord as RequirementVersion,
      undefined,
      getAssignmentPermissionActor(data, workspace.id, user)
    );
  } else {
    await writeDatabase(savedData);
  }

  return {
    type,
    record: savedRecord,
    persisted: true,
    message: [`已保存到 AI PM 项目管理平台。`, notifyMessage].filter(Boolean).join(" ")
  };
}

export async function createDashboardTaskRecord(
  values: Record<string, unknown>,
  workspaceId = DEFAULT_WORKSPACE.id
): Promise<CreateRecordResult<"task">> {
  const workspace = resolveWorkspaceFromList(await readWorkspaces(), workspaceId);
  const version = await resolveTaskVersionForCreate(workspace.id, values);
  const scopedValues = withResolvedRequirementVersionProject({
    ...values,
    workspaceId: workspace.id
  }, version);
  const task = normalizeCreateTask(scopedValues);
  const notifyMessage = getNotificationTargetIdentities(task as unknown as Record<string, unknown>).length
    ? await notifyOwner(
        createNotificationLookupData(workspace.id, await readDashboardMembersDatabase(workspace.id)),
        workspace.id,
        "task",
        {
          ...task,
          id: task.id
        }
      )
    : "";

  // 新建任务是常见工作台操作，只影响 project_tasks 当前行；版本回填、负责人通知都用轻量查询完成，
  // 不再为了插入一条任务读取项目、Bug、需求、文档等整份 dashboard。
  await upsertDashboardTaskDatabase(task);

  return {
    type: "task",
    record: task,
    persisted: true,
    message: [`已保存到 AI PM 项目管理平台。`, notifyMessage].filter(Boolean).join(" ")
  };
}

export async function updateDashboardTaskRecord(
  id: string,
  values: Record<string, unknown>,
  user?: FeishuUser
): Promise<CreateRecordResult<"task">> {
  const existingTask = await readDashboardTaskDatabase(id);

  if (!existingTask) {
    throw new Error("记录不存在或已被删除");
  }

  const workspaceId = getWorkspaceId(existingTask);
  const task = normalizeCreateTask({
    ...existingTask,
    ...values,
    workspaceId
  }, id);
  const shouldNotifyOwner = shouldNotifyOwnerUpdate("task", existingTask, task as unknown as Record<string, unknown>);
  const notifyMessage = shouldNotifyOwner
    ? await notifyOwner(
        createNotificationLookupData(workspaceId, await readDashboardMembersDatabase(workspaceId)),
        workspaceId,
        "task",
        {
          ...task,
          id,
          flowRecordOperator: getBugFlowOperator(user, asText(values.owner, task.owner))
        }
      )
    : "";

  // 高频任务拖拽/转交只更新 project_tasks 当前行，不再走 updateDashboardRecord 的全 dashboard 读取和项目指标派生。
  // 项目进度、健康度和顶部 metrics 由前端乐观更新 + 防抖 dashboard 校准补齐，保证交互优先。
  await updateDashboardTaskDatabase(task);

  return {
    type: "task",
    record: task,
    persisted: true,
    message: [`已更新任务：${task.title}。`, notifyMessage].filter(Boolean).join(" ")
  };
}

export async function updateDashboardRecord<T extends DashboardEntityType>(
  type: T,
  id: string,
  values: Record<string, unknown>,
  user?: FeishuUser
): Promise<CreateRecordResult<T>> {
  const data = await readDatabase();
  const existingRecord = findRecord(data, type, id);

  if (!existingRecord) {
    throw new Error("记录不存在或已被删除");
  }

  const baseValues = {
    // 旧 UI 尚未展示本轮新增字段；编辑时先铺入原记录，再覆盖用户显式提交值，避免隐藏字段被 normalizer 默认值清空。
    ...(existingRecord as unknown as Record<string, unknown>),
    ...values,
    workspaceId: getWorkspaceId(existingRecord),
    ...(type === "bug"
      ? {
          createdAt: (existingRecord as BugReport).createdAt
        }
      : {})
  };
  const scopedValues = withRecordVersionScope(data, type, baseValues, getWorkspaceId(existingRecord));
  const record = createRecord(type, scopedValues, existingRecord);
  let typedRecord = {
    ...record,
    id
  } as DashboardEntityMap[T];
  const projectNameChanged =
    type === "project" && (existingRecord as Project).name !== (typedRecord as Project).name;
  let updated = false;

  if (type === "project") {
    const project = typedRecord as Project;

    data.projects = data.projects.map((item) => item.id === id ? project : item);
    updated = data.projects.some((project) => project.id === id);

    if (updated && projectNameChanged) {
      // 项目名是展示快照，真实归属必须以 projectId 为准。只级联稳定 ID 命中的记录，
      // 不再用旧名扫描，因此即使工作区内有同名项目，也不会改到另一个项目的版本、需求、任务、风险或 Bug。
      data.requirementVersions = data.requirementVersions.map((version) =>
        version.projectId === project.id ? { ...version, project: project.name } : version
      );
      data.requirements = data.requirements.map((requirement) =>
        requirement.projectId === project.id ? { ...requirement, project: project.name } : requirement
      );
      data.tasks = data.tasks.map((task) =>
        task.projectId === project.id ? { ...task, project: project.name } : task
      );
      data.risks = data.risks.map((risk) =>
        risk.projectId === project.id ? { ...risk, project: project.name } : risk
      );
      data.bugs = data.bugs.map((bug) =>
        bug.projectId === project.id ? { ...bug, project: project.name } : bug
      );
    }
  }

  if (type === "task") {
    data.tasks = data.tasks.map((task) => task.id === id ? (typedRecord as Task) : task);
    updated = data.tasks.some((task) => task.id === id);
  }

  if (type === "bug") {
    typedRecord = {
      ...(typedRecord as BugReport),
      flowRecords: appendBugUpdateFlowRecords(
        existingRecord as BugReport,
        typedRecord as BugReport,
        getBugFlowOperator(user, asText(values.reporter, "系统"))
      )
    } as DashboardEntityMap[T];
    data.bugs = data.bugs.map((bug) => bug.id === id ? (typedRecord as BugReport) : bug);
    updated = data.bugs.some((bug) => bug.id === id);
  }

  if (type === "risk") {
    data.risks = data.risks.map((risk) => risk.id === id ? (typedRecord as Risk) : risk);
    updated = data.risks.some((risk) => risk.id === id);
  }

  if (type === "requirementVersion") {
    const version = typedRecord as RequirementVersion;

    data.requirementVersions = data.requirementVersions.map((item) =>
      item.id === id
        ? (typedRecord as RequirementVersion)
        : item.parentVersionId === id
          ? {
              ...item,
              parentVersionName: version.name,
              project: version.project,
              projectId: version.projectId
            }
          : item
    );
    updated = data.requirementVersions.some((version) => version.id === id);

    if (updated) {
      data.requirements = data.requirements.map((requirement) =>
        requirement.versionId === id
          ? {
              ...requirement,
              versionName: version.name,
              project: version.project,
              projectId: version.projectId
            }
          : requirement
      );
      data.tasks = data.tasks.map((task) =>
        task.versionId === id
          ? {
              ...task,
              versionName: version.name,
              project: version.project === "跨项目" ? task.project : version.project,
              projectId: version.project === "跨项目" ? task.projectId : version.projectId
            }
          : task
      );
      data.bugs = data.bugs.map((bug) =>
        bug.versionId === id
          ? {
              ...bug,
              versionName: version.name,
              project: version.project === "跨项目" ? bug.project : version.project,
              projectId: version.project === "跨项目" ? bug.projectId : version.projectId
            }
          : bug
      );
    }
  }

  if (type === "requirement") {
    data.requirements = data.requirements.map((requirement) =>
      requirement.id === id ? (typedRecord as Requirement) : requirement
    );
    updated = data.requirements.some((requirement) => requirement.id === id);
  }

  if (type === "document") {
    data.documents = data.documents.map((document) => document.id === id ? (typedRecord as DocumentItem) : document);
    updated = data.documents.some((document) => document.id === id);
  }

  if (!updated) {
    throw new Error("记录不存在或已被删除");
  }

  const savedData = applyProjectMetrics(data);
  const savedRecord = findRecord(savedData, type, id) ?? typedRecord;
  const shouldNotifyBugOpen =
    type === "bug" && shouldNotifyBugDeveloperOnOpen(existingRecord as BugReport, savedRecord as BugReport);
  const notifyMessages = [
    shouldNotifyOwnerUpdate(type, existingRecord, scopedValues) && !shouldNotifyBugOpen
      ? await notifyOwner(savedData, getWorkspaceId(existingRecord), type, {
          ...scopedValues,
          id
        })
      : "",
    type === "bug"
      ? await notifyBugDeveloperOnOpen(
          savedData,
          getWorkspaceId(existingRecord),
          existingRecord as BugReport,
          savedRecord as BugReport
        )
      : "",
    type === "bug"
      ? await notifyBugTesterOnReady(
          savedData,
          getWorkspaceId(existingRecord),
          existingRecord as BugReport,
          savedRecord as BugReport
        )
      : ""
  ].filter(Boolean);

  if (type === "project") {
    const project = savedRecord as Project;

    if (projectNameChanged) {
      // 改名时仅同步该 projectId 下的显示快照，比整库重写更轻，也不会按项目名误伤同名记录。
      await upsertDashboardProjectScopeDatabase({
        bugs: savedData.bugs.filter((bug) => bug.projectId === project.id),
        project,
        requirements: savedData.requirements.filter((requirement) => requirement.projectId === project.id),
        risks: savedData.risks.filter((risk) => risk.projectId === project.id),
        tasks: savedData.tasks.filter((task) => task.projectId === project.id),
        versions: savedData.requirementVersions.filter((version) => version.projectId === project.id)
      });
    } else {
      await upsertDashboardProjectDatabase(project);
    }
  } else if (type === "task") {
    // 任务看板拖拽会高频调用 PATCH，只更新当前任务一行即可；如果走 writeDatabase 会触发整库同步事务并放大 MySQL 锁等待。
    await updateDashboardTaskDatabase(savedRecord as Task);
  } else if (type === "bug") {
    // Bug 状态流转、负责人变更和回归验证同样是单记录写入；项目统计读取时会派生，不能用全量同步拖慢保存按钮。
    await upsertDashboardBugDatabase(savedRecord as BugReport);
  } else if (type === "requirement") {
    // 需求状态/负责人等编辑不需要重算并回写所有业务表；版本联动已在内存对象中完成，当前需求行单独持久化即可。
    await upsertDashboardRequirementDatabase(
      savedRecord as Requirement,
      undefined,
      getAssignmentPermissionActor(data, getWorkspaceId(existingRecord), user)
    );
  } else if (type === "requirementVersion") {
    const version = savedRecord as RequirementVersion;

    // 版本名称或项目变更会影响该版本下的需求、任务和 Bug 展示口径；
    // 只同步这个版本的关联记录，避免一次版本编辑退化成全库长事务。
    await upsertDashboardRequirementVersionScopeDatabase({
      actor: getAssignmentPermissionActor(data, getWorkspaceId(existingRecord), user),
      bugs: savedData.bugs.filter((bug) => bug.versionId === version.id),
      requirements: savedData.requirements.filter((requirement) => requirement.versionId === version.id),
      tasks: savedData.tasks.filter((task) => task.versionId === version.id),
      version
    });
  } else {
    await writeDatabase(savedData);
  }

  return {
    type,
    record: savedRecord,
    persisted: true,
    message: [`已更新${getEntityLabel(type)}：${getRecordTitle(type, values)}。`, ...notifyMessages].join(" ")
  };
}

export async function deleteDashboardRecord<T extends DashboardEntityType>(type: T, id: string) {
  const data = await readDatabase();
  const existingRecord = findRecord(data, type, id);

  if (!existingRecord) {
    throw new Error("记录不存在或已被删除");
  }

  let fallbackVersion: RequirementVersion | undefined;
  const recordWorkspaceId = getWorkspaceId(existingRecord);

  if (type === "requirementVersion") {
    if (id === DEFAULT_REQUIREMENT_VERSION_ID) {
      throw new Error("未规划需求池是系统兜底版本，不能删除");
    }

    const sourceVersion = existingRecord as RequirementVersion;
    const referenceCounts = {
      requirements: data.requirements.filter((requirement) => (
        getWorkspaceId(requirement) === recordWorkspaceId && requirement.versionId === id
      )).length,
      tasks: data.tasks.filter((task) => (
        getWorkspaceId(task) === recordWorkspaceId && task.versionId === id
      )).length,
      bugs: data.bugs.filter((bug) => (
        getWorkspaceId(bug) === recordWorkspaceId && bug.versionId === id
      )).length
    };
    const needsFallback = requiresRequirementVersionFallback(referenceCounts);

    if (needsFallback) {
      const neutralProjectScope = sourceVersion.project === "跨项目" || sourceVersion.project === "未关联项目";
      const sourceProject = sourceVersion.projectId
        ? data.projects.find((project) => (
            project.id === sourceVersion.projectId && getWorkspaceId(project) === recordWorkspaceId
          ))
        : selectUniqueProjectNameCandidate(data.projects.filter((project) => (
            getWorkspaceId(project) === recordWorkspaceId
            && normalizeProjectName(project.name) === normalizeProjectName(sourceVersion.project)
          )));

      // 有业务引用时必须能证明迁移目标与源版本同项目。真实项目优先比较稳定 ID；
      // “跨项目/未关联项目”是系统范围标签而不是项目名，允许按该标签保留各记录自身的 projectId。
      const belongsToSourceProject = (version: RequirementVersion) => {
        if (sourceVersion.projectId) {
          return Boolean(sourceProject && version.projectId === sourceProject.id);
        }

        if (sourceProject) {
          return version.projectId === sourceProject.id;
        }

        return neutralProjectScope
          && !version.projectId
          && version.project === sourceVersion.project;
      };

      const systemFallback = data.requirementVersions.find((version) => (
        version.id === DEFAULT_REQUIREMENT_VERSION_ID
        && getWorkspaceId(version) === recordWorkspaceId
        && belongsToSourceProject(version)
      ));
      const siblingCandidates = data.requirementVersions.filter((version) => (
        version.id !== id
        && version.id !== DEFAULT_REQUIREMENT_VERSION_ID
        && getWorkspaceId(version) === recordWorkspaceId
        && belongsToSourceProject(version)
      ));
      const automaticFallback = selectAutomaticRequirementVersionFallback(systemFallback, siblingCandidates);

      if (automaticFallback.ambiguous) {
        // 没有系统兜底版本时不能从多个同项目兄弟版本中任取一个，否则删除结果取决于数组/数据库顺序。
        throw new Error("当前项目有多个可迁移版本，请先保留唯一迁移目标或将关联记录手动迁移后再删除。");
      }

      fallbackVersion = automaticFallback.fallback;

      if (!fallbackVersion) {
        const referenceSummary = `${referenceCounts.requirements} 个需求、${referenceCounts.tasks} 个任务和 ${referenceCounts.bugs} 个 Bug`;

        throw new Error(`当前版本仍关联 ${referenceSummary}，但没有可安全迁移的同项目版本，请先新建同项目版本后再删除。`);
      }
    }

    data.requirementVersions = data.requirementVersions
      .filter((version) => version.id !== id)
      .map((version) =>
        version.parentVersionId === id
          ? {
              ...version,
              parentVersionId: undefined,
              parentVersionName: undefined
            }
          : version
      );

    if (fallbackVersion) {
      const migrationVersion = fallbackVersion;
      // 中性版本只承载分组关系，不拥有具体项目；迁移时保留各业务记录自己的项目快照与稳定 ID。
      const keepsRecordProject = migrationVersion.project === "跨项目" || migrationVersion.project === "未关联项目";

      data.requirements = data.requirements.map((requirement) =>
        requirement.versionId === id
          ? {
              ...requirement,
              versionId: migrationVersion.id,
              versionName: migrationVersion.name,
              project: keepsRecordProject ? requirement.project : migrationVersion.project,
              projectId: keepsRecordProject ? requirement.projectId : migrationVersion.projectId
            }
          : requirement
      );
      data.tasks = data.tasks.map((task) =>
        task.versionId === id
          ? {
              ...task,
              versionId: migrationVersion.id,
              versionName: migrationVersion.name,
              project: keepsRecordProject ? task.project : migrationVersion.project,
              projectId: keepsRecordProject ? task.projectId : migrationVersion.projectId
            }
          : task
      );
      data.bugs = data.bugs.map((bug) =>
        bug.versionId === id
          ? {
              ...bug,
              versionId: migrationVersion.id,
              versionName: migrationVersion.name,
              project: keepsRecordProject ? bug.project : migrationVersion.project,
              projectId: keepsRecordProject ? bug.projectId : migrationVersion.projectId
            }
          : bug
      );
    }
  } else if (type === "requirement") {
    const requirement = existingRecord as Requirement;
    const legacyTaskCandidates = data.tasks.filter((task) => (
      getWorkspaceId(task) === recordWorkspaceId
      && !task.requirementId
      && task.requirementTitle === requirement.title
      && task.versionId === requirement.versionId
    ));
    const sameNameProjects = data.projects.filter((project) => (
      getWorkspaceId(project) === recordWorkspaceId
      && normalizeProjectName(project.name) === normalizeProjectName(requirement.project)
    ));
    const uniqueNameProject = selectUniqueProjectNameCandidate(sameNameProjects);
    const resolvedRequirementProjectId = requirement.projectId ?? uniqueNameProject?.id;
    const matchingLegacyTasks = legacyTaskCandidates.filter((task) => (
      task.projectId
        ? Boolean(resolvedRequirementProjectId && task.projectId === resolvedRequirementProjectId)
        : normalizeProjectName(task.project) === normalizeProjectName(requirement.project)
    ));
    const hasNameOnlyLegacyTask = matchingLegacyTasks.some((task) => (
      !task.projectId
    ));

    if (
      hasNameOnlyLegacyTask
      && (!uniqueNameProject || uniqueNameProject.id !== resolvedRequirementProjectId)
    ) {
      // 老任务只有“需求标题 + 项目名”快照时，同名项目下无法证明它属于哪条需求；宁可阻止删除等待人工补 ID，
      // 也不能随机把名称当作稳定归属而漏检关联任务。
      throw new Error("需求所属项目名称不唯一，无法安全核对历史关联，请先补齐 projectId/requirementId 后再删除。");
    }

    const relatedTaskCount = data.tasks.filter((task) =>
      getWorkspaceId(task) === recordWorkspaceId && task.requirementId === requirement.id
    ).length;
    const totalRelatedTaskCount = relatedTaskCount + matchingLegacyTasks.length;

    if (totalRelatedTaskCount > 0) {
      throw new Error(`需求仍关联 ${totalRelatedTaskCount} 个任务，请先迁移或解除任务关联后再删除。`);
    }

    data.requirements = data.requirements.filter((requirement) => requirement.id !== id);
  } else if (type === "document") {
    data.documents = data.documents.filter((document) => document.id !== id);
  } else if (type === "project") {
    const project = existingRecord as Project;
    const uniqueNameProject = selectUniqueProjectNameCandidate(data.projects.filter((candidate) => (
      getWorkspaceId(candidate) === recordWorkspaceId
      && normalizeProjectName(candidate.name) === normalizeProjectName(project.name)
    )));
    const belongsToDeletedProject = (record: { project: string; projectId?: string; workspaceId?: string }) =>
      getWorkspaceId(record) === recordWorkspaceId && (
        record.projectId === project.id || (
          !record.projectId
          && uniqueNameProject?.id === project.id
          && record.project === project.name
        )
      );
    const relatedCounts = {
      versions: data.requirementVersions.filter(belongsToDeletedProject).length,
      requirements: data.requirements.filter(belongsToDeletedProject).length,
      tasks: data.tasks.filter(belongsToDeletedProject).length,
      risks: data.risks.filter(belongsToDeletedProject).length,
      bugs: data.bugs.filter(belongsToDeletedProject).length
    };
    const relatedTotal = Object.values(relatedCounts).reduce((sum, count) => sum + count, 0);

    // Project 与历史业务表仍处在“稳定 ID + 项目名兼容”的迁移阶段，直接级联会误删同名或跨项目记录。
    // 因此只允许删除空项目集；有交付数据时应先迁移记录或把项目归档，避免产生孤儿版本和任务。
    if (relatedTotal > 0) {
      throw new Error(
        `项目仍包含 ${relatedCounts.versions} 个项目/版本、${relatedCounts.requirements} 个需求、${relatedCounts.tasks} 个任务、${relatedCounts.risks} 个风险和 ${relatedCounts.bugs} 个 Bug，请先迁移关联数据或将项目设为已归档。`
      );
    }

    data.projects = data.projects.filter((project) => project.id !== id);
  } else if (type === "task") {
    data.tasks = data.tasks.filter((task) => task.id !== id);
  } else if (type === "bug") {
    data.bugs = data.bugs.filter((bug) => bug.id !== id);
  } else if (type === "risk") {
    data.risks = data.risks.filter((risk) => risk.id !== id);
  }

  if (type === "task") {
    // 任务删除同样保持单行删除，索引 cleanup 由 API route 后续投递，项目统计读取时派生。
    await deleteDashboardTaskDatabase(id);
  } else if (type === "bug") {
    // Bug 删除依赖数据库级联清理附件、流转记录和 AI 修复任务，不再触发全量 dashboard 同步。
    await deleteDashboardBugDatabase(id);
  } else if (type === "requirement") {
    // 删除前在 Serializable 事务内重新检查任务引用，避免本地快照检查后并发插入新任务形成孤儿。
    await deleteDashboardRequirementDatabase({ requirementId: id, workspaceId: recordWorkspaceId });
  } else if (type === "requirementVersion") {
    // 版本迁移与删除改为作用域事务，不再用旧快照全量同步所有表，避免误删并发创建的无关记录。
    await deleteDashboardRequirementVersionDatabase({
      fallbackVersionId: fallbackVersion?.id,
      versionId: id,
      workspaceId: recordWorkspaceId
    });
  } else if (type === "project") {
    // 数据库层再次检查当前引用和代码仓库，随后只删除项目本身；治理记录由外键级联清理。
    await deleteDashboardProjectDatabase({ projectId: id, workspaceId: recordWorkspaceId });
  } else if (type === "risk") {
    await deleteDashboardRiskDatabase({ riskId: id, workspaceId: recordWorkspaceId });
  } else if (type === "document") {
    await deleteDashboardDocumentDatabase({ documentId: id, workspaceId: recordWorkspaceId });
  }

  return {
    type,
    id,
    persisted: true,
    fallbackVersion,
    message:
      type === "requirementVersion" && fallbackVersion
        ? `已删除${getEntityLabel(type)}，关联记录已迁移到「${fallbackVersion.name}」，子版本已提升为一级版本。`
        : `已删除${getEntityLabel(type)}。`
  };
}
