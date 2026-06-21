import dayjs from "dayjs";
import {
  createDashboardWorkspaceDatabase,
  DASHBOARD_DATABASE_STORAGE,
  readDashboardDatabase,
  readDashboardWorkspacesDatabase,
  updateDashboardTaskDatabase,
  upsertDashboardBugDatabase,
  upsertDashboardMemberDatabase,
  writeDashboardDatabase,
  writeDashboardIdentityDatabase
} from "@/data/database-dashboard";
import { dashboardData } from "@/data/dashboard";
import { createDashboardSideEffectQueue, createNotificationPayload } from "@/lib/dashboard-side-effects";
import { findWorkspaceMemberForUser, getDashboardPermissions } from "@/lib/access/permissions";
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
  ProjectMilestone,
  ProjectMilestoneStatus,
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
  status: "规划中",
  startDate: "2026-05-01",
  releaseDate: "2026-06-30",
  goal: "收纳尚未进入明确版本的需求，评审后再绑定到目标版本。",
  milestones: [
    {
      id: "rv-backlog-m-1",
      title: "需求池梳理",
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

type LocalDatabase = Omit<DashboardData, "meta"> & {
  updatedAt: string;
};

function cloneSeedData(): LocalDatabase {
  return {
    ...JSON.parse(JSON.stringify(dashboardData)),
    updatedAt: new Date().toISOString()
  } as LocalDatabase;
}

function createLocalId(type: DashboardEntityType | "bugFlow" | "member" | "milestone" | "notificationChannel" | "workspace") {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function asNumber(value: unknown, fallback: number) {
  const nextValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(nextValue) ? nextValue : fallback;
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
  if (value.includes("完成")) {
    return "已完成";
  }

  if (value.includes("评审") || value.includes("验收")) {
    return "评审中";
  }

  if (value.includes("进行") || value.includes("开发") || value.includes("处理中")) {
    return "进行中";
  }

  return "待处理";
}

function normalizeTaskPriority(value: string): Task["priority"] {
  if (value.includes("高") || value.includes("P0")) {
    return "高";
  }

  if (value.includes("低") || value.includes("P2")) {
    return "低";
  }

  return "中";
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
  if (value.includes("P0") || value.includes("高")) {
    return "P0";
  }

  if (value.includes("P2") || value.includes("低")) {
    return "P2";
  }

  return "P1";
}

function normalizeRequirementStatus(value: string): Requirement["status"] {
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

  return "待评审";
}

function normalizeRequirementVersionStatus(value: string): RequirementVersion["status"] {
  if (value.includes("发布") || value.includes("上线")) {
    return "已发布";
  }

  if (value.includes("归档") || value.includes("关闭")) {
    return "已归档";
  }

  if (value.includes("进行") || value.includes("开发") || value.includes("执行")) {
    return "进行中";
  }

  return "规划中";
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

function createFallbackMilestones({
  dueDate,
  endNote = "按里程碑确认交付范围、风险和下一步行动。",
  endTitle = "阶段验收",
  owner,
  ownerMemberId,
  ownerAvatarUrl,
  ownerEmail,
  ownerOpenId,
  ownerUnionId,
  ownerUserId,
  progress,
  projectName,
  startDate,
  startNote,
  startTitle = "项目启动"
}: {
  dueDate: string;
  endNote?: string;
  endTitle?: string;
  owner: string;
  ownerMemberId?: string;
  ownerAvatarUrl?: string;
  ownerEmail?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  progress: number;
  projectName: string;
  startDate?: string;
  startNote?: string;
  startTitle?: string;
}): ProjectMilestone[] {
  return [
    {
      id: createLocalId("milestone"),
      title: startTitle,
      status: progress > 0 ? "已完成" : "未开始",
      dueDate: startDate ?? asDateString(dayjs(dueDate).subtract(14, "day").format("YYYY-MM-DD")),
      owner,
      ownerMemberId,
      ownerOpenId,
      ownerUnionId,
      ownerUserId,
      ownerEmail,
      ownerAvatarUrl,
      note: startNote ?? `${projectName} 立项、目标和成员范围确认。`
    },
    {
      id: createLocalId("milestone"),
      title: endTitle,
      status: progress >= 100 ? "已完成" : progress >= 60 ? "进行中" : "未开始",
      dueDate,
      owner,
      ownerMemberId,
      ownerOpenId,
      ownerUnionId,
      ownerUserId,
      ownerEmail,
      ownerAvatarUrl,
      note: endNote
    }
  ];
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
    status: normalizeMilestoneStatus(asText(milestone.status, index === 0 ? "进行中" : "未开始")),
    dueDate: asDateString(milestone.dueDate, fallback.dueDate),
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

  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    name,
    owner,
    ...ownerLink,
    status: normalizeProjectStatus(asText(values.status, "进行中")),
    progress,
    health,
    dueDate,
    team: asNumber(values.team, 1),
    riskCount: asNumber(values.riskCount, 0),
    summary: asText(values.summary, "暂无项目摘要。"),
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
  const dueDate = asDateString(values.dueDate, dayjs().add(7, "day").format("YYYY-MM-DD"));

  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    title: asText(values.title, "未命名任务"),
    stage: normalizeTaskStage(asText(values.stage, "待处理")),
    owner: asOwnerName(values),
    ...createOwnerLink(values),
    project: asText(values.project, "未关联项目"),
    versionId: asText(values.versionId) || DEFAULT_REQUIREMENT_VERSION.id,
    versionName: asText(values.versionName) || DEFAULT_REQUIREMENT_VERSION.name,
    priority: normalizeTaskPriority(asText(values.priority, "中")),
    startDate: asDateString(values.startDate, dayjs(dueDate).subtract(3, "day").format("YYYY-MM-DD")),
    dueDate,
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

function getRequirementVersionMilestoneProgress(status: RequirementVersion["status"]) {
  if (status === "已发布" || status === "已归档") {
    return 100;
  }

  return status === "进行中" ? 50 : 0;
}

function normalizeRequirementVersionMilestones(
  value: unknown,
  fallback: {
    name: string;
    releaseDate: string;
    startDate: string;
    status: RequirementVersion["status"];
  }
) {
  const milestones = Array.isArray(value)
    ? value
        .filter((milestone) => typeof milestone === "object" && milestone)
        .map((milestone, index) =>
          normalizeProjectMilestone(milestone, index, {
            dueDate: fallback.releaseDate,
            owner: "",
            ownerMemberId: undefined
          })
        )
        .filter((milestone) => milestone.title)
    : [];

  // 版本没有配置里程碑时给出启动和验收兜底，确保需求管理仍能展示交付检查点。
  return milestones.length
    ? milestones
    : createFallbackMilestones({
        dueDate: fallback.releaseDate,
        endNote: "检查需求、任务、Bug 和上线准备。",
        endTitle: "提测验收",
        owner: "",
        progress: getRequirementVersionMilestoneProgress(fallback.status),
        projectName: fallback.name,
        startDate: fallback.startDate,
        startNote: "确认版本目标、需求范围和负责人。",
        startTitle: "版本启动"
      });
}

function normalizeCreateRequirementVersion(
  values: Record<string, unknown>,
  id = createLocalId("requirementVersion")
): RequirementVersion {
  const name = asText(values.name, "未命名版本");
  const status = normalizeRequirementVersionStatus(asText(values.status, "规划中"));
  const startDate = asDateString(values.startDate, dayjs().format("YYYY-MM-DD"));
  const releaseDate = asDateString(values.releaseDate, dayjs().add(30, "day").format("YYYY-MM-DD"));
  const parentVersionId = asText(values.parentVersionId);

  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    parentVersionId: parentVersionId && parentVersionId !== id ? parentVersionId : undefined,
    parentVersionName: parentVersionId && parentVersionId !== id ? asText(values.parentVersionName) || undefined : undefined,
    name,
    project: asText(values.project, "跨项目"),
    status,
    startDate,
    releaseDate,
    goal: asText(values.goal, "暂无版本目标。"),
    productOwner: asText(values.productOwner) || undefined,
    ...createVersionRoleOwnerLink(values, "product"),
    uiOwner: asText(values.uiOwner) || undefined,
    ...createVersionRoleOwnerLink(values, "ui"),
    devOwner: asText(values.devOwner) || undefined,
    ...createVersionRoleOwnerLink(values, "dev"),
    milestones: normalizeRequirementVersionMilestones(values.milestones, {
      name,
      releaseDate,
      startDate,
      status
    })
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
    versionId: asText(values.versionId) || DEFAULT_REQUIREMENT_VERSION.id,
    versionName: asText(values.versionName) || DEFAULT_REQUIREMENT_VERSION.name,
    owner: asOwnerName(values),
    ...createOwnerLink(values),
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
    createdAt: asText(member.createdAt, now),
    updatedAt: asText(member.updatedAt, now)
  };
}

function createMemberFromUser(user: FeishuUser, role: MemberRole, workspaceId = DEFAULT_WORKSPACE.id): DashboardMember {
  const now = new Date().toISOString();
  const identities: DashboardMember["identities"] = [];
  const authProvider = getAuthIdentityProvider(user);
  const authUserId = getAuthIdentityUserId(user);
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
      channels: authProvider === "feishu" && user.openId
        ? [
            {
              id: createLocalId("notificationChannel"),
              provider: "feishu",
              enabled: true,
              name: "飞书",
              target: user.openId,
              feishuOpenId: user.openId,
              feishuUnionId: user.unionId,
              feishuUserId: user.userId,
              scenes: [...defaultNotificationScenes]
            }
          ]
        : [],
      feishuEnabled: authProvider === "feishu" && Boolean(user.openId),
      feishuOpenId: authProvider === "feishu" ? user.openId || undefined : undefined,
      feishuUnionId: authProvider === "feishu" ? user.unionId : undefined,
      feishuUserId: authProvider === "feishu" ? user.userId : undefined,
      taskAssigned: true,
      requirementChanged: true
    },
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
  const hasAuthProviderIdentity = member.identities.some(
    (identity) => identity.provider === authProvider && identity.providerUserId === authUserId
  );
  const shouldAttachAuthIdentity = Boolean(authUserId && !hasAuthProviderIdentity);

  // 资料同步发生在页面读数据时，只补齐 SDK authUserId 对应的身份；飞书通知通道必须限定飞书来源，
  // 避免 Google/GitHub 登录用户被错误创建机器人通知目标。
  if (authProvider === "feishu" && user.openId && feishuChannelIndex >= 0) {
    channels[feishuChannelIndex] = {
      ...channels[feishuChannelIndex],
      target: channels[feishuChannelIndex].target || user.openId,
      feishuOpenId: channels[feishuChannelIndex].feishuOpenId || user.openId,
      feishuUnionId: channels[feishuChannelIndex].feishuUnionId || user.unionId,
      feishuUserId: channels[feishuChannelIndex].feishuUserId || user.userId
    };
  } else if (authProvider === "feishu" && user.openId) {
    channels.push({
      id: createLocalId("notificationChannel"),
      provider: "feishu",
      enabled: member.notification.feishuEnabled,
      name: "飞书",
      target: user.openId,
      feishuOpenId: user.openId,
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
      feishuOpenId: authProvider === "feishu" ? member.notification.feishuOpenId || user.openId || undefined : member.notification.feishuOpenId,
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
    const membersWithSyncedCurrentMember = members.map((member) => member.id === existingMember.id ? syncedMember : member);
    const duplicateIdentityResult = detachAuthIdentityFromDuplicateMembers(
      membersWithSyncedCurrentMember,
      workspaceId,
      syncedMember.id,
      user
    );
    // 页面读取阶段会对成员结构做一次兼容性规范化，但这不应该反复触发数据库写入；只有登录成员资料真的补齐或变化时才持久化。
    const changed = syncedMember !== existingMember || duplicateIdentityResult.changed;

    return {
      data: {
        ...data,
        members: duplicateIdentityResult.members
      },
      changed,
      currentMember: syncedMember
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

function normalizeCreateRisk(values: Record<string, unknown>, id = createLocalId("risk")): Risk {
  return {
    id,
    workspaceId: asText(values.workspaceId, DEFAULT_WORKSPACE.id),
    title: asText(values.title, "未命名风险"),
    level: normalizeRiskLevel(asText(values.level, "中")),
    owner: asOwnerName(values),
    ...createOwnerLink(values),
    project: asText(values.project, "未关联项目"),
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
  values: Record<string, unknown>
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
    return normalizeCreateRequirementVersion(values) as DashboardEntityMap[T];
  }

  if (type === "requirement") {
    return normalizeCreateRequirement(values) as DashboardEntityMap[T];
  }

  return normalizeCreateDocument(values) as DashboardEntityMap[T];
}

function normalizeProjectName(value: string) {
  return value.trim().toLowerCase();
}

function isLinkedToProject(project: Project, value?: string) {
  return Boolean(value && normalizeProjectName(project.name) === normalizeProjectName(value));
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getMilestoneProgress(status: ProjectMilestoneStatus) {
  const progressByStatus: Record<ProjectMilestoneStatus, number> = {
    未开始: 0,
    进行中: 50,
    已完成: 100,
    延期: 30
  };

  return progressByStatus[status];
}

function getTaskStageProgress(stage: TaskStage) {
  const progressByStage: Record<TaskStage, number> = {
    待处理: 0,
    进行中: 50,
    评审中: 80,
    已完成: 100
  };

  return progressByStage[stage];
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateProjectProgress(project: Project, tasks: Task[]) {
  const milestoneScore = project.milestones.length
    ? average(project.milestones.map((milestone) => getMilestoneProgress(milestone.status)))
    : null;
  const taskScore = tasks.length ? average(tasks.map((task) => getTaskStageProgress(task.stage))) : null;

  if (milestoneScore !== null && taskScore !== null) {
    return clampScore(milestoneScore * 0.65 + taskScore * 0.35);
  }

  if (milestoneScore !== null) {
    return clampScore(milestoneScore);
  }

  if (taskScore !== null) {
    return clampScore(taskScore);
  }

  return clampScore(project.progress);
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

  if (project.status !== "已完成" && dueDate.isBefore(today) && progress < 100) {
    health -= 18;
  } else if (project.status !== "已完成" && dueDate.diff(today, "day") <= 7 && progress < 70) {
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
  const scheduleRisk =
    project.status !== "已完成" && dayjs(project.dueDate).isBefore(today) && progress < 100 ? 1 : 0;
  const healthRisk = health < 70 ? 1 : 0;

  return risks.length + criticalBugs.length + overdueTasks.length + delayedMilestones.length + scheduleRisk + healthRisk;
}

function deriveProjectStatus(project: Project, progress: number, health: number, riskCount: number): ProjectStatus {
  if (project.status === "暂停") {
    return "暂停";
  }

  if (progress >= 100 && riskCount === 0) {
    return "已完成";
  }

  if (riskCount > 0 || health < 75) {
    return "有风险";
  }

  return "进行中";
}

function applyProjectMetrics(data: LocalDatabase): LocalDatabase {
  const projects = data.projects.map((project) => {
    const tasks = data.tasks.filter((task) => isLinkedToProject(project, task.project));
    const bugs = data.bugs.filter((bug) => isLinkedToProject(project, bug.project));
    const risks = data.risks.filter((risk) => isLinkedToProject(project, risk.project));
    const progress = calculateProjectProgress(project, tasks);
    const health = calculateProjectHealth({ bugs, progress, project, risks, tasks });
    const riskCount = calculateProjectRiskCount({ bugs, health, progress, project, risks, tasks });

    return {
      ...project,
      progress,
      health,
      riskCount,
      status: deriveProjectStatus(project, progress, health, riskCount)
    };
  });

  return {
    ...data,
    projects,
    metrics: createMetrics({
      ...data,
      projects
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

function withBugVersionProject(data: LocalDatabase, values: Record<string, unknown>, workspaceId: string) {
  const versionId = asText(values.versionId);
  const version = data.requirementVersions.find(
    (item) => item.id === versionId && getWorkspaceId(item) === workspaceId
  ) ?? DEFAULT_REQUIREMENT_VERSION;

  return {
    ...values,
    versionId: version.id,
    versionName: version.name,
    project: version.project
  };
}

function createMetrics(data: Pick<DashboardData, "projects" | "tasks" | "bugs" | "requirements" | "documents">) {
  const activeProjects = data.projects.filter((project) => project.status !== "已完成").length;
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

async function notifyOwner(data: LocalDatabase, workspaceId: string, type: DashboardEntityType, values: Record<string, unknown>) {
  const member = findNotificationMember(data, workspaceId, values);
  const notificationScene: MemberNotificationScene =
    type === "requirement" || type === "requirementVersion"
      ? "requirementChanged"
      : type === "bug"
        ? "bugFlowChanged"
        : "taskAssigned";
  const feishuChannel = member?.notification.channels.find(
    (channel) => channel.provider === "feishu" && channel.enabled && channel.scenes.includes(notificationScene)
  );
  const ownerOpenId = feishuChannel?.feishuOpenId ?? feishuChannel?.target ?? member?.notification.feishuOpenId;
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
    return `未发送飞书通知：成员 ${member.name} 已被禁用。`;
  }

  if (!member.notification.channels.some((channel) => channel.provider === "feishu" && channel.enabled)) {
    return `未发送飞书通知：成员 ${member.name} 已关闭飞书通知。`;
  }

  if (!ownerOpenId) {
    return `未发送飞书通知：成员 ${member.name} 未绑定飞书账号。`;
  }

  if (!feishuChannel) {
    return `未发送飞书通知：成员 ${member.name} 已关闭该通知场景。`;
  }

  try {
    // 飞书发送放入 Dashboard 副作用队列，Web 请求只负责保存主记录和入队，避免外部通知接口拖住保存按钮。
    await createDashboardSideEffectQueue().enqueue({
      workspaceId,
      entityType: type,
      entityId: asText(values.id, recordTitle).slice(0, 191),
      jobType: "notify_owner",
      dedupeKey: `${workspaceId}:${type}:${asText(values.id, recordTitle)}:notify_owner:${getOwnerNotificationSignature(values)}`.slice(0, 191),
      payload: createNotificationPayload({
        targetIdentities: getNotificationTargetIdentities(values),
        notificationScene,
        ownerName,
        cardTitle,
        cardText,
        view: type === "project" ? "projects" : type === "bug" ? "bugs" : type === "task" ? "tasks" : "overview"
      })
    });

    return `已提交后台飞书通知：${asOwnerName(values)}。`;
  } catch (error) {
    return `飞书通知入队失败：${error instanceof Error ? error.message : "未知错误"}。`;
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
  const feishuChannel = member?.notification.channels.find(
    (channel) => channel.provider === "feishu" && channel.enabled && channel.scenes.includes("bugFlowChanged")
  );
  const testerOpenId = feishuChannel?.feishuOpenId ?? feishuChannel?.target ?? member?.notification.feishuOpenId;

  if (!testerIdentities.length) {
    return "";
  }

  if (!member) {
    return `未发送测试通知：提交人 ${testerName} 未在成员管理中匹配到成员。`;
  }

  if (member.status !== "active") {
    return `未发送测试通知：测试人员 ${member.name} 已被禁用。`;
  }

  if (!member.notification.channels.some((channel) => channel.provider === "feishu" && channel.enabled)) {
    return `未发送测试通知：测试人员 ${member.name} 已关闭飞书通知。`;
  }

  if (!testerOpenId) {
    return `未发送测试通知：测试人员 ${member.name} 未绑定飞书账号。`;
  }

  if (!feishuChannel) {
    return `未发送测试通知：测试人员 ${member.name} 已关闭 Bug 流转通知场景。`;
  }

  try {
    // 回归通知同样走后台队列，避免 Bug 状态保存等待飞书接口完成。
    await createDashboardSideEffectQueue().enqueue({
      workspaceId,
      entityType: "bug",
      entityId: nextBug.id,
      jobType: "notify_bug_tester",
      dedupeKey: `${workspaceId}:bug:${nextBug.id}:notify_bug_tester:${nextBug.status}`.slice(0, 191),
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
        view: "bugs"
      })
    });

    return `已提交后台测试通知：${member.name}。`;
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
  const scopedData = scopeDataToWorkspace(data, workspaceResult.currentWorkspace.id);

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
    createdAt: fallback?.createdAt ?? now,
    updatedAt: now
  };
}

export async function createDashboardMember(values: Record<string, unknown>, workspaceId = DEFAULT_WORKSPACE.id) {
  const data = await readDatabase();
  const workspace = resolveCurrentWorkspace(data, workspaceId).currentWorkspace;
  const member = normalizeMemberInput({ ...values, workspaceId: workspace.id });
  const duplicated = data.members.map((item) => normalizeMember(item)).some((item) =>
    item.workspaceId === member.workspaceId &&
    [member.email, member.notification.feishuOpenId]
      .filter(Boolean)
      .some((identity) =>
        item.email === identity ||
        item.notification.feishuOpenId === identity ||
        item.identities.some((itemIdentity) => itemIdentity.providerUserId === identity)
      )
  );

  if (duplicated) {
    throw new Error("成员已存在，请直接编辑角色或通知配置");
  }

  data.members = [member, ...data.members.map((item) => normalizeMember(item))];
  // 新增成员只需要写入 workspace_members 一行；全量 writeDatabase 会重写任务/Bug/需求等业务表，
  // 对公网 MySQL 来说成本过高，也会让通知配置这类轻量操作看起来“卡住”。
  await upsertDashboardMemberDatabase(member);

  return {
    member,
    message: `已添加成员：${member.name}。`
  };
}

export async function updateDashboardMember(id: string, values: Record<string, unknown>) {
  const data = await readDatabase();
  const members = data.members.map((item) => normalizeMember(item));
  const existingMember = members.find((member) => member.id === id);

  if (!existingMember) {
    throw new Error("成员不存在或已被删除");
  }

  const member = normalizeMemberInput(values, existingMember);
  const duplicated = members.some((item) =>
    item.id !== id &&
    item.workspaceId === member.workspaceId &&
    [member.email, member.notification.feishuOpenId]
      .filter(Boolean)
      .some((identity) =>
        item.email === identity ||
        item.notification.feishuOpenId === identity ||
        item.identities.some((itemIdentity) => itemIdentity.providerUserId === identity)
      )
  );
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

  data.members = members.map((item) => item.id === id ? member : item);
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
  const scopedValues = type === "bug" ? withBugVersionProject(data, baseValues, workspace.id) : baseValues;
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

  if (type === "bug") {
    // 创建 Bug 会先触发负责人通知；保存阶段只写当前 Bug 行和其附件/流转记录，避免飞书已送达但前端仍等待全量同步。
    await upsertDashboardBugDatabase(savedRecord as BugReport);
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
    ...values,
    workspaceId: getWorkspaceId(existingRecord),
    ...(type === "bug"
      ? {
          createdAt: (existingRecord as BugReport).createdAt
        }
      : {})
  };
  const scopedValues =
    type === "bug" ? withBugVersionProject(data, baseValues, getWorkspaceId(existingRecord)) : baseValues;
  const record = createRecord(type, scopedValues);
  let typedRecord = {
    ...record,
    id
  } as DashboardEntityMap[T];
  let updated = false;

  if (type === "project") {
    data.projects = data.projects.map((project) => project.id === id ? (typedRecord as Project) : project);
    updated = data.projects.some((project) => project.id === id);
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
              parentVersionName: version.name
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
              project: version.project
            }
          : requirement
      );
      data.tasks = data.tasks.map((task) =>
        task.versionId === id
          ? {
              ...task,
              versionName: version.name,
              project: version.project === "跨项目" ? task.project : version.project
            }
          : task
      );
      data.bugs = data.bugs.map((bug) =>
        bug.versionId === id
          ? {
              ...bug,
              versionName: version.name,
              project: version.project === "跨项目" ? bug.project : version.project
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

  if (type === "task") {
    // 任务看板拖拽会高频调用 PATCH，只更新当前任务一行即可；如果走 writeDatabase 会触发整库同步事务并放大 MySQL 锁等待。
    await updateDashboardTaskDatabase(savedRecord as Task);
  } else if (type === "bug") {
    // Bug 状态流转、负责人变更和回归验证同样是单记录写入；项目统计读取时会派生，不能用全量同步拖慢保存按钮。
    await upsertDashboardBugDatabase(savedRecord as BugReport);
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

    fallbackVersion =
      data.requirementVersions.find((version) => version.id === DEFAULT_REQUIREMENT_VERSION_ID && getWorkspaceId(version) === recordWorkspaceId) ??
      data.requirementVersions.find((version) => version.id !== id && getWorkspaceId(version) === recordWorkspaceId);

    if (!fallbackVersion) {
      throw new Error("请至少保留一个需求版本");
    }

    const migrationVersion = fallbackVersion;

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
    data.requirements = data.requirements.map((requirement) =>
      requirement.versionId === id
        ? {
            ...requirement,
            versionId: migrationVersion.id,
            versionName: migrationVersion.name,
            project: migrationVersion.project === "跨项目" ? requirement.project : migrationVersion.project
          }
        : requirement
    );
    data.tasks = data.tasks.map((task) =>
      task.versionId === id
        ? {
            ...task,
            versionId: migrationVersion.id,
            versionName: migrationVersion.name,
            project: migrationVersion.project === "跨项目" ? task.project : migrationVersion.project
          }
        : task
    );
    data.bugs = data.bugs.map((bug) =>
      bug.versionId === id
        ? {
            ...bug,
            versionId: migrationVersion.id,
            versionName: migrationVersion.name,
            project: migrationVersion.project === "跨项目" ? bug.project : migrationVersion.project
          }
        : bug
    );
  } else if (type === "requirement") {
    data.requirements = data.requirements.filter((requirement) => requirement.id !== id);
  } else if (type === "document") {
    data.documents = data.documents.filter((document) => document.id !== id);
  } else if (type === "project") {
    data.projects = data.projects.filter((project) => project.id !== id);
  } else if (type === "task") {
    data.tasks = data.tasks.filter((task) => task.id !== id);
  } else if (type === "bug") {
    data.bugs = data.bugs.filter((bug) => bug.id !== id);
  } else if (type === "risk") {
    data.risks = data.risks.filter((risk) => risk.id !== id);
  }

  const savedData = applyProjectMetrics(data);

  await writeDatabase(savedData);

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
