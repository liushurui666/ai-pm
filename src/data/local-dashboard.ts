import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import { dashboardData } from "@/data/dashboard";
import { sendFeishuBotText } from "@/lib/feishu-message";
import type {
  DashboardData,
  DocumentItem,
  FeishuUser,
  Project,
  ProjectStatus,
  Requirement,
  Risk,
  Task,
  TaskStage
} from "@/types/dashboard";
import type { CreateRecordResult, DashboardEntityMap, DashboardEntityType } from "@/types/records";

const DATABASE_DIR = path.join(process.cwd(), ".ai-pm");
const DATABASE_FILE = path.join(DATABASE_DIR, "app-database.json");

type LocalDatabase = Omit<DashboardData, "meta"> & {
  updatedAt: string;
};

function cloneSeedData(): LocalDatabase {
  return {
    ...JSON.parse(JSON.stringify(dashboardData)),
    updatedAt: new Date().toISOString()
  } as LocalDatabase;
}

function createLocalId(type: DashboardEntityType) {
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

    const seed = cloneSeedData();

    await writeDatabase(seed);

    return seed;
  }

  try {
    const data = JSON.parse(raw) as LocalDatabase;
    const migratedData = migrateLocalDatabase({
      ...cloneSeedData(),
      ...data
    });

    return {
      ...migratedData,
      metrics: createMetrics(migratedData)
    };
  } catch {
    await writeFile(`${DATABASE_FILE}.corrupt-${Date.now()}`, raw, {
      mode: 0o600
    });

    const seed = cloneSeedData();

    await writeDatabase(seed);

    return seed;
  }
}

async function writeDatabase(data: LocalDatabase) {
  await ensureDatabaseDir();
  const tempFile = `${DATABASE_FILE}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(
    {
      ...data,
      metrics: createMetrics(data),
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
    ownerEmail: asText(values.ownerEmail) || undefined
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

function normalizeCreateProject(values: Record<string, unknown>, id = createLocalId("project")): Project {
  const progress = Math.min(100, Math.max(0, asNumber(values.progress, 0)));
  const health = Math.min(100, Math.max(0, asNumber(values.health, 80)));

  return {
    id,
    name: asText(values.name, "未命名项目"),
    owner: asOwnerName(values),
    ...createOwnerLink(values),
    status: normalizeProjectStatus(asText(values.status, "进行中")),
    progress,
    health,
    dueDate: asDateString(values.dueDate, dayjs().add(14, "day").format("YYYY-MM-DD")),
    team: asNumber(values.team, 1),
    riskCount: asNumber(values.riskCount, 0),
    summary: asText(values.summary, "暂无项目摘要。")
  };
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
    priority: normalizeTaskPriority(asText(values.priority, "中")),
    startDate: asDateString(values.startDate, dayjs(dueDate).subtract(3, "day").format("YYYY-MM-DD")),
    dueDate,
    aiHint: asText(values.aiHint, "AI 暂未发现额外风险。")
  };
}

function normalizeExistingTask(task: Task): Task {
  const dueDate = asDateString(task.dueDate, dayjs().add(7, "day").format("YYYY-MM-DD"));

  return {
    ...task,
    dueDate,
    startDate: asDateString(
      (task as Task & { startDate?: unknown }).startDate,
      dayjs(dueDate).subtract(3, "day").format("YYYY-MM-DD")
    )
  };
}

function migrateLocalDatabase(data: LocalDatabase): LocalDatabase {
  return {
    ...data,
    tasks: data.tasks.map(normalizeExistingTask)
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
    acceptance: asText(values.acceptance, "暂无验收标准。")
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

  if (type === "risk") {
    return normalizeCreateRisk(values) as DashboardEntityMap[T];
  }

  if (type === "requirement") {
    return normalizeCreateRequirement(values) as DashboardEntityMap[T];
  }

  return normalizeCreateDocument(values) as DashboardEntityMap[T];
}

function createMetrics(data: Pick<DashboardData, "projects" | "tasks" | "requirements" | "documents">) {
  const activeProjects = data.projects.filter((project) => project.status !== "已完成").length;
  const deliveryRate = data.projects.length
    ? Math.round(data.projects.reduce((sum, project) => sum + project.progress, 0) / data.projects.length)
    : 0;
  const today = dayjs().startOf("day");
  const overdueTasks = data.tasks.filter((task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(today)).length;
  const aiSavedHours = Math.max(0, data.requirements.length * 3 + data.documents.length * 2 + data.tasks.length);

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

  return asText(values.title, "未命名记录");
}

function getEntityLabel(type: DashboardEntityType) {
  const labels: Record<DashboardEntityType, string> = {
    project: "项目",
    task: "任务",
    risk: "风险",
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
    await sendFeishuBotText(
      ownerOpenId,
      `你被设置为${getEntityLabel(type)}负责人：${getRecordTitle(type, values)}。请在 AI PM 平台查看详情。`
    );

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

  if (type === "risk") {
    data.risks = [record as Risk, ...data.risks];
  }

  if (type === "requirement") {
    data.requirements = [record as Requirement, ...data.requirements];
  }

  if (type === "document") {
    data.documents = [record as DocumentItem, ...data.documents];
  }

  data.metrics = createMetrics(data);
  await writeDatabase(data);

  return {
    type,
    record,
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

  if (type === "risk") {
    data.risks = data.risks.map((risk) => risk.id === id ? (typedRecord as Risk) : risk);
    updated = data.risks.some((risk) => risk.id === id);
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

  data.metrics = createMetrics(data);
  await writeDatabase(data);

  return {
    type,
    record: typedRecord,
    persisted: true,
    message: `已更新${getEntityLabel(type)}：${getRecordTitle(type, values)}。`
  };
}
