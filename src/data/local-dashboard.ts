import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import { dashboardData } from "@/data/dashboard";
import { sendFeishuBotTaskCard } from "@/lib/feishu-message";
import type {
  BugReport,
  DashboardData,
  DocumentItem,
  FeishuUser,
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

const DATABASE_DIR = path.join(process.cwd(), ".ai-pm");
const DATABASE_FILE = path.join(DATABASE_DIR, "app-database.json");
const DEFAULT_REQUIREMENT_VERSION: RequirementVersion = {
  id: "rv-backlog",
  name: "未规划需求池",
  project: "跨项目",
  status: "规划中",
  startDate: "2026-05-01",
  releaseDate: "2026-06-30",
  goal: "收纳尚未进入明确版本的需求，评审后再绑定到目标版本。"
};
const DEFAULT_REQUIREMENT_VERSION_ID = DEFAULT_REQUIREMENT_VERSION.id;

type LocalDatabase = Omit<DashboardData, "meta"> & {
  updatedAt: string;
};

function cloneSeedData(): LocalDatabase {
  return {
    ...JSON.parse(JSON.stringify(dashboardData)),
    updatedAt: new Date().toISOString()
  } as LocalDatabase;
}

function createLocalId(type: DashboardEntityType | "milestone") {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDatabaseDir() {
  await mkdir(DATABASE_DIR, { recursive: true });
}

async function readDatabase() {
  let raw = "";

  try {
    raw = await readFile(DATABASE_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    const seed = applyProjectMetrics(cloneSeedData());

    await writeDatabase(seed);

    return seed;
  }

  try {
    const data = JSON.parse(raw) as Partial<LocalDatabase>;
    const seed = cloneSeedData();
    const migratedData = migrateLocalDatabase({
      ...seed,
      ...data,
      metrics: seed.metrics,
      projects: Array.isArray(data.projects) ? data.projects : seed.projects,
      tasks: Array.isArray(data.tasks) ? data.tasks : seed.tasks,
      bugs: Array.isArray(data.bugs) ? data.bugs : [],
      risks: Array.isArray(data.risks) ? data.risks : seed.risks,
      requirementVersions: Array.isArray(data.requirementVersions) ? data.requirementVersions : seed.requirementVersions,
      requirements: Array.isArray(data.requirements) ? data.requirements : seed.requirements,
      documents: Array.isArray(data.documents) ? data.documents : seed.documents,
      weeklyInsight: Array.isArray(data.weeklyInsight) ? data.weeklyInsight : seed.weeklyInsight,
      updatedAt: asText(data.updatedAt, seed.updatedAt)
    });

    const derivedData = applyProjectMetrics(migratedData);

    return {
      ...derivedData,
      metrics: createMetrics(derivedData)
    };
  } catch {
    await writeFile(`${DATABASE_FILE}.corrupt-${Date.now()}`, raw, {
      mode: 0o600
    });

    const seed = applyProjectMetrics(cloneSeedData());

    await writeDatabase(seed);

    return seed;
  }
}

async function writeDatabase(data: LocalDatabase) {
  await ensureDatabaseDir();
  const tempFile = `${DATABASE_FILE}.${process.pid}.${Date.now()}.tmp`;
  const derivedData = applyProjectMetrics(data);
  const payload = `${JSON.stringify(
    {
      ...derivedData,
      metrics: createMetrics(derivedData),
      updatedAt: new Date().toISOString()
    },
    null,
    2
  )}\n`;

  await writeFile(tempFile, payload, {
    mode: 0o600
  });
  await rename(tempFile, DATABASE_FILE);
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asOwnerName(values: Record<string, unknown>) {
  return asText(values.owner, "未分配");
}

function asOwnerOpenId(values: Record<string, unknown>) {
  return asText(values.ownerOpenId);
}

function createOwnerLink(values: Record<string, unknown>) {
  return {
    ownerOpenId: asText(values.ownerOpenId) || undefined,
    ownerUnionId: asText(values.ownerUnionId) || undefined,
    ownerUserId: asText(values.ownerUserId) || undefined,
    ownerEmail: asText(values.ownerEmail) || undefined,
    ownerAvatarUrl: asText(values.ownerAvatarUrl) || undefined
  };
}

function asNumber(value: unknown, fallback: number) {
  const nextValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(nextValue) ? nextValue : fallback;
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
  if (value.includes("开发")) {
    return "开发中";
  }

  if (value.includes("上线")) {
    return "待上线";
  }

  if (value.includes("设计")) {
    return "设计中";
  }

  return "评审中";
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
  owner,
  ownerAvatarUrl,
  ownerEmail,
  ownerOpenId,
  ownerUnionId,
  ownerUserId,
  progress,
  projectName
}: {
  dueDate: string;
  owner: string;
  ownerAvatarUrl?: string;
  ownerEmail?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  progress: number;
  projectName: string;
}): ProjectMilestone[] {
  return [
    {
      id: createLocalId("milestone"),
      title: "项目启动",
      status: progress > 0 ? "已完成" : "未开始",
      dueDate: asDateString(dayjs(dueDate).subtract(14, "day").format("YYYY-MM-DD")),
      owner,
      ownerOpenId,
      ownerUnionId,
      ownerUserId,
      ownerEmail,
      ownerAvatarUrl,
      note: `${projectName} 立项、目标和成员范围确认。`
    },
    {
      id: createLocalId("milestone"),
      title: "阶段验收",
      status: progress >= 100 ? "已完成" : progress >= 60 ? "进行中" : "未开始",
      dueDate,
      owner,
      ownerOpenId,
      ownerUnionId,
      ownerUserId,
      ownerEmail,
      ownerAvatarUrl,
      note: "按里程碑确认交付范围、风险和下一步行动。"
    }
  ];
}

function normalizeProjectMilestone(
  value: unknown,
  index: number,
  fallback: { dueDate: string; owner: string }
): ProjectMilestone {
  const milestone = typeof value === "object" && value ? (value as Record<string, unknown>) : {};

  return {
    id: asText(milestone.id, createLocalId("milestone")),
    title: asText(milestone.title, `里程碑 ${index + 1}`),
    status: normalizeMilestoneStatus(asText(milestone.status, index === 0 ? "进行中" : "未开始")),
    dueDate: asDateString(milestone.dueDate, fallback.dueDate),
    owner: asText(milestone.owner, fallback.owner),
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

  return milestones.length ? milestones : createFallbackMilestones(fallback);
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

function normalizeExistingProject(project: Project): Project {
  return normalizeCreateProject(
    {
      ...project,
      milestones: (project as Project & { milestones?: unknown }).milestones
    },
    project.id
  );
}

function normalizeCreateTask(values: Record<string, unknown>, id = createLocalId("task")): Task {
  const dueDate = asDateString(values.dueDate, dayjs().add(7, "day").format("YYYY-MM-DD"));

  return {
    id,
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

function normalizeExistingTask(task: Task, versions: RequirementVersion[]): Task {
  const dueDate = asDateString(task.dueDate, dayjs().add(7, "day").format("YYYY-MM-DD"));
  const fallbackVersion = findFallbackVersionForProject(task.project, versions);
  const matchedVersion = versions.find((version) => version.id === task.versionId) ?? fallbackVersion;

  return {
    ...task,
    versionId: matchedVersion.id,
    versionName: matchedVersion.name,
    dueDate,
    startDate: asDateString(
      (task as Task & { startDate?: unknown }).startDate,
      dayjs(dueDate).subtract(3, "day").format("YYYY-MM-DD")
    )
  };
}

function normalizeCreateBug(values: Record<string, unknown>, id = createLocalId("bug")): BugReport {
  return {
    id,
    title: asText(values.title, "未命名 Bug"),
    status: normalizeBugStatus(asText(values.status, "新建")),
    severity: normalizeBugSeverity(asText(values.severity, "一般")),
    project: asText(values.project, "未关联项目"),
    versionId: asText(values.versionId) || DEFAULT_REQUIREMENT_VERSION.id,
    versionName: asText(values.versionName) || DEFAULT_REQUIREMENT_VERSION.name,
    reporter: asText(values.reporter, "未填写"),
    owner: asOwnerName(values),
    ...createOwnerLink(values),
    environment: asText(values.environment, "未填写"),
    reproduction: asText(values.reproduction, "暂无复现步骤。"),
    expected: asText(values.expected, "暂无预期结果。"),
    actual: asText(values.actual, "暂无实际结果。"),
    dueDate: asDateString(values.dueDate, dayjs().add(3, "day").format("YYYY-MM-DD"))
  };
}

function normalizeExistingBug(bug: BugReport, versions: RequirementVersion[]): BugReport {
  const fallbackVersion = findFallbackVersionForProject(bug.project, versions);
  const matchedVersion = versions.find((version) => version.id === bug.versionId) ?? fallbackVersion;

  return normalizeCreateBug(
    {
      ...bug,
      versionId: matchedVersion.id,
      versionName: matchedVersion.name,
      status: bug.status,
      severity: bug.severity
    },
    bug.id
  );
}

function normalizeCreateRequirementVersion(
  values: Record<string, unknown>,
  id = createLocalId("requirementVersion")
): RequirementVersion {
  return {
    id,
    name: asText(values.name, "未命名版本"),
    project: asText(values.project, "跨项目"),
    status: normalizeRequirementVersionStatus(asText(values.status, "规划中")),
    startDate: asDateString(values.startDate, dayjs().format("YYYY-MM-DD")),
    releaseDate: asDateString(values.releaseDate, dayjs().add(30, "day").format("YYYY-MM-DD")),
    goal: asText(values.goal, "暂无版本目标。")
  };
}

function normalizeExistingRequirementVersion(version: RequirementVersion): RequirementVersion {
  return normalizeCreateRequirementVersion(version as unknown as Record<string, unknown>, version.id);
}

function normalizeCreateRequirement(
  values: Record<string, unknown>,
  id = createLocalId("requirement")
): Requirement {
  return {
    id,
    title: asText(values.title, "未命名需求"),
    priority: normalizeRequirementPriority(asText(values.priority, "P1")),
    status: normalizeRequirementStatus(asText(values.status, "评审中")),
    project: asText(values.project, "未关联项目"),
    versionId: asText(values.versionId) || DEFAULT_REQUIREMENT_VERSION.id,
    versionName: asText(values.versionName) || DEFAULT_REQUIREMENT_VERSION.name,
    uiLink: asText(values.uiLink),
    documentLink: asText(values.documentLink),
    acceptance: asText(values.acceptance, "暂无验收标准。")
  };
}

function normalizeExistingRequirement(requirement: Requirement, versions: RequirementVersion[]): Requirement {
  const fallbackVersion =
    versions.find((version) => version.id === DEFAULT_REQUIREMENT_VERSION.id) ?? versions[0] ?? DEFAULT_REQUIREMENT_VERSION;
  const matchedVersion = versions.find((version) => version.id === requirement.versionId) ?? fallbackVersion;

  return normalizeCreateRequirement(
    {
      ...requirement,
      versionId: matchedVersion.id,
      versionName: matchedVersion.name,
      project: matchedVersion.project
    },
    requirement.id
  );
}

function migrateLocalDatabase(data: LocalDatabase): LocalDatabase {
  const normalizedVersions = (data.requirementVersions.length ? data.requirementVersions : [DEFAULT_REQUIREMENT_VERSION])
    .map(normalizeExistingRequirementVersion);

  return {
    ...data,
    projects: data.projects.map(normalizeExistingProject),
    tasks: data.tasks.map((task) => normalizeExistingTask(task, normalizedVersions)),
    bugs: data.bugs.map((bug) => normalizeExistingBug(bug, normalizedVersions)),
    requirementVersions: normalizedVersions,
    requirements: data.requirements.map((requirement) => normalizeExistingRequirement(requirement, normalizedVersions))
  };
}

function normalizeCreateRisk(values: Record<string, unknown>, id = createLocalId("risk")): Risk {
  return {
    id,
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

function findFallbackVersionForProject(project: string, versions: RequirementVersion[]) {
  return (
    versions.find((version) => version.project !== "跨项目" && normalizeProjectName(version.project) === normalizeProjectName(project)) ??
    versions.find((version) => version.id === DEFAULT_REQUIREMENT_VERSION.id) ??
    versions[0] ??
    DEFAULT_REQUIREMENT_VERSION
  );
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

async function notifyOwner(type: DashboardEntityType, values: Record<string, unknown>) {
  const ownerOpenId = asOwnerOpenId(values);

  if (!ownerOpenId) {
    return "";
  }

  try {
    await sendFeishuBotTaskCard({
      openId: ownerOpenId,
      title: `你被设置为${getEntityLabel(type)}负责人`,
      text: `**${getRecordTitle(type, values)}**\n\n请在 AI PM 平台查看详情并确认下一步动作。`,
      view: type === "project" ? "projects" : type === "bug" ? "bugs" : type === "task" ? "tasks" : "overview"
    });

    return `已通过飞书机器人通知 ${asOwnerName(values)}。`;
  } catch (error) {
    return `机器人通知失败：${error instanceof Error ? error.message : "未知错误"}。`;
  }
}

export async function getDashboardData(user?: FeishuUser): Promise<DashboardData> {
  const data = await readDatabase();

  return {
    ...data,
    metrics: createMetrics(data),
    meta: {
      source: "local",
      user,
      storage: DATABASE_FILE,
      message: "已接入站内项目管理数据源，飞书仅用于登录、负责人选择和机器人通知。"
    }
  };
}

export async function createDashboardRecord<T extends DashboardEntityType>(
  type: T,
  values: Record<string, unknown>
): Promise<CreateRecordResult<T>> {
  const data = await readDatabase();
  const record = createRecord(type, values);
  const notifyMessage = await notifyOwner(type, values);

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

  await writeDatabase(savedData);

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
  values: Record<string, unknown>
): Promise<CreateRecordResult<T>> {
  const data = await readDatabase();
  const record = createRecord(type, values);
  const typedRecord = {
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
    data.bugs = data.bugs.map((bug) => bug.id === id ? (typedRecord as BugReport) : bug);
    updated = data.bugs.some((bug) => bug.id === id);
  }

  if (type === "risk") {
    data.risks = data.risks.map((risk) => risk.id === id ? (typedRecord as Risk) : risk);
    updated = data.risks.some((risk) => risk.id === id);
  }

  if (type === "requirementVersion") {
    const version = typedRecord as RequirementVersion;

    data.requirementVersions = data.requirementVersions.map((version) =>
      version.id === id ? (typedRecord as RequirementVersion) : version
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

  await writeDatabase(savedData);

  return {
    type,
    record: savedRecord,
    persisted: true,
    message: `已更新${getEntityLabel(type)}：${getRecordTitle(type, values)}。`
  };
}

export async function deleteDashboardRecord<T extends DashboardEntityType>(type: T, id: string) {
  const data = await readDatabase();
  const existingRecord = findRecord(data, type, id);

  if (!existingRecord) {
    throw new Error("记录不存在或已被删除");
  }

  let fallbackVersion: RequirementVersion | undefined;

  if (type === "requirementVersion") {
    if (id === DEFAULT_REQUIREMENT_VERSION_ID) {
      throw new Error("未规划需求池是系统兜底版本，不能删除");
    }

    fallbackVersion =
      data.requirementVersions.find((version) => version.id === DEFAULT_REQUIREMENT_VERSION_ID) ??
      data.requirementVersions.find((version) => version.id !== id);

    if (!fallbackVersion) {
      throw new Error("请至少保留一个需求版本");
    }

    const migrationVersion = fallbackVersion;

    data.requirementVersions = data.requirementVersions.filter((version) => version.id !== id);
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
        ? `已删除${getEntityLabel(type)}，关联记录已迁移到「${fallbackVersion.name}」。`
        : `已删除${getEntityLabel(type)}。`
  };
}
