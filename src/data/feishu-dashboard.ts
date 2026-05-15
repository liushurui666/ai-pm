import dayjs from "dayjs";
import { getFeishuAppAccessToken } from "@/lib/feishu-client";
import { dashboardData } from "@/data/dashboard";
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

type BitableRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

type BitableSearchResponse = {
  code: number;
  msg?: string;
  data?: {
    items?: BitableRecord[];
    page_token?: string;
    has_more?: boolean;
  };
};

type TableKey = "projects" | "tasks" | "risks" | "requirements" | "documents" | "insights";

const tableEnv: Record<TableKey, string> = {
  projects: "FEISHU_PROJECTS_TABLE_ID",
  tasks: "FEISHU_TASKS_TABLE_ID",
  risks: "FEISHU_RISKS_TABLE_ID",
  requirements: "FEISHU_REQUIREMENTS_TABLE_ID",
  documents: "FEISHU_DOCUMENTS_TABLE_ID",
  insights: "FEISHU_INSIGHTS_TABLE_ID"
};

const tableLabels: Record<TableKey, string> = {
  projects: "项目",
  tasks: "任务",
  risks: "风险",
  requirements: "需求",
  documents: "文档",
  insights: "洞察"
};

const fieldAliases = {
  projectName: ["项目名称", "名称", "项目", "name", "Name"],
  owner: ["负责人", "责任人", "owner", "Owner"],
  status: ["状态", "status", "Status"],
  progress: ["进度", "完成率", "progress", "Progress"],
  health: ["健康度", "健康分", "health", "Health"],
  dueDate: ["截止日期", "截止时间", "计划完成时间", "dueDate", "Due Date"],
  team: ["团队人数", "成员数", "team", "Team"],
  riskCount: ["风险数", "风险数量", "riskCount", "Risk Count"],
  summary: ["摘要", "说明", "summary", "Summary"],
  title: ["标题", "任务名称", "需求名称", "风险名称", "文档名称", "title", "Title"],
  stage: ["阶段", "任务状态", "stage", "Stage"],
  priority: ["优先级", "priority", "Priority"],
  aiHint: ["AI提示", "AI 提示", "AI建议", "AI 建议", "aiHint"],
  level: ["等级", "风险等级", "level", "Level"],
  mitigation: ["应对措施", "解决方案", "mitigation", "Mitigation"],
  acceptance: ["验收标准", "验收条件", "acceptance", "Acceptance"],
  docType: ["类型", "文档类型", "type", "Type"],
  updatedAt: ["更新时间", "更新日期", "updatedAt", "Updated At"],
  aiSummary: ["AI摘要", "AI 摘要", "摘要", "aiSummary"],
  content: ["内容", "洞察", "insight", "content", "Content"]
} as const;

function cloneMockData() {
  return JSON.parse(JSON.stringify(dashboardData)) as DashboardData;
}

export function isFeishuBitableConfigured() {
  return Boolean(process.env.FEISHU_BITABLE_APP_TOKEN && getConfiguredTables().length > 0);
}

function getConfiguredTables() {
  return (Object.keys(tableEnv) as TableKey[]).filter((key) => Boolean(process.env[tableEnv[key]]));
}

async function searchBitableRecords(tableId: string) {
  const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;

  if (!appToken) {
    throw new Error("请先配置 FEISHU_BITABLE_APP_TOKEN");
  }

  const accessToken = await getFeishuAppAccessToken();
  const records: BitableRecord[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`
    );
    url.searchParams.set("page_size", "500");

    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        automatic_fields: true
      }),
      cache: "no-store"
    });
    const payload = (await response.json()) as BitableSearchResponse;

    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.msg || `读取飞书多维表格 ${tableId} 失败`);
    }

    records.push(...(payload.data?.items ?? []));
    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken);

  return records;
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue).filter(Boolean).join("、");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.text === "string") {
      return record.text;
    }

    if (typeof record.name === "string") {
      return record.name;
    }

    if (typeof record.value === "string" || typeof record.value === "number") {
      return String(record.value);
    }

    if (typeof record.link === "string") {
      return typeof record.text === "string" ? record.text : record.link;
    }
  }

  return "";
}

function pickValue(fields: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = fields[alias];

    if (value !== undefined && value !== null && normalizeValue(value)) {
      return value;
    }
  }

  return undefined;
}

function readString(fields: Record<string, unknown>, aliases: readonly string[], fallback = "") {
  return normalizeValue(pickValue(fields, aliases)) || fallback;
}

function readNumber(fields: Record<string, unknown>, aliases: readonly string[], fallback: number) {
  const raw = readString(fields, aliases);
  const value = Number(raw.replace("%", ""));

  return Number.isFinite(value) ? value : fallback;
}

function readDate(fields: Record<string, unknown>, aliases: readonly string[], fallback: string) {
  const rawValue = pickValue(fields, aliases);

  if (typeof rawValue === "number") {
    return dayjs(rawValue < 10_000_000_000 ? rawValue * 1000 : rawValue).format("YYYY-MM-DD");
  }

  const raw = normalizeValue(rawValue);

  return raw ? dayjs(raw).format("YYYY-MM-DD") : fallback;
}

function readDateTime(fields: Record<string, unknown>, aliases: readonly string[], fallback: string) {
  const rawValue = pickValue(fields, aliases);

  if (typeof rawValue === "number") {
    return dayjs(rawValue < 10_000_000_000 ? rawValue * 1000 : rawValue).format("YYYY-MM-DD HH:mm");
  }

  const raw = normalizeValue(rawValue);

  return raw ? dayjs(raw).format("YYYY-MM-DD HH:mm") : fallback;
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

function mapProjects(records: BitableRecord[]): Project[] {
  return records.map((record, index) => {
    const fields = record.fields;

    return {
      id: record.record_id,
      name: readString(fields, fieldAliases.projectName, `未命名项目 ${index + 1}`),
      owner: readString(fields, fieldAliases.owner, "未分配"),
      status: normalizeProjectStatus(readString(fields, fieldAliases.status, "进行中")),
      progress: Math.min(100, Math.max(0, readNumber(fields, fieldAliases.progress, 0))),
      health: Math.min(100, Math.max(0, readNumber(fields, fieldAliases.health, 80))),
      dueDate: readDate(fields, fieldAliases.dueDate, dayjs().add(14, "day").format("YYYY-MM-DD")),
      team: readNumber(fields, fieldAliases.team, 1),
      riskCount: readNumber(fields, fieldAliases.riskCount, 0),
      summary: readString(fields, fieldAliases.summary, "暂无项目摘要。")
    };
  });
}

function mapTasks(records: BitableRecord[]): Task[] {
  return records.map((record, index) => {
    const fields = record.fields;

    return {
      id: record.record_id,
      title: readString(fields, fieldAliases.title, `未命名任务 ${index + 1}`),
      stage: normalizeTaskStage(readString(fields, fieldAliases.stage, "待处理")),
      owner: readString(fields, fieldAliases.owner, "未分配"),
      project: readString(fields, fieldAliases.projectName, "未关联项目"),
      priority: normalizeTaskPriority(readString(fields, fieldAliases.priority, "中")),
      dueDate: readDate(fields, fieldAliases.dueDate, dayjs().add(7, "day").format("YYYY-MM-DD")),
      aiHint: readString(fields, fieldAliases.aiHint, "AI 暂未发现额外风险。")
    };
  });
}

function mapRisks(records: BitableRecord[]): Risk[] {
  return records.map((record, index) => {
    const fields = record.fields;

    return {
      id: record.record_id,
      title: readString(fields, fieldAliases.title, `未命名风险 ${index + 1}`),
      level: normalizeRiskLevel(readString(fields, fieldAliases.level, "中")),
      owner: readString(fields, fieldAliases.owner, "未分配"),
      project: readString(fields, fieldAliases.projectName, "未关联项目"),
      mitigation: readString(fields, fieldAliases.mitigation, "暂无应对措施。")
    };
  });
}

function mapRequirements(records: BitableRecord[]): Requirement[] {
  return records.map((record, index) => {
    const fields = record.fields;

    return {
      id: record.record_id,
      title: readString(fields, fieldAliases.title, `未命名需求 ${index + 1}`),
      priority: normalizeRequirementPriority(readString(fields, fieldAliases.priority, "P1")),
      status: normalizeRequirementStatus(readString(fields, fieldAliases.status, "评审中")),
      project: readString(fields, fieldAliases.projectName, "未关联项目"),
      acceptance: readString(fields, fieldAliases.acceptance, "暂无验收标准。")
    };
  });
}

function mapDocuments(records: BitableRecord[]): DocumentItem[] {
  return records.map((record, index) => {
    const fields = record.fields;

    return {
      id: record.record_id,
      title: readString(fields, fieldAliases.title, `未命名文档 ${index + 1}`),
      type: normalizeDocumentType(readString(fields, fieldAliases.docType, "PRD")),
      updatedAt: readDateTime(fields, fieldAliases.updatedAt, dayjs().format("YYYY-MM-DD HH:mm")),
      aiSummary: readString(fields, fieldAliases.aiSummary, "暂无 AI 摘要。")
    };
  });
}

function mapInsights(records: BitableRecord[]) {
  return records
    .map((record) => readString(record.fields, fieldAliases.content))
    .filter(Boolean)
    .slice(0, 5);
}

async function loadTable<T>(key: TableKey, mapper: (records: BitableRecord[]) => T[]) {
  const tableId = process.env[tableEnv[key]];

  if (!tableId) {
    return null;
  }

  return mapper(await searchBitableRecords(tableId));
}

function createMetrics(data: DashboardData) {
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

export async function getDashboardData(user?: FeishuUser): Promise<DashboardData> {
  const data = cloneMockData();
  const configuredTables = getConfiguredTables();

  if (!process.env.FEISHU_BITABLE_APP_TOKEN || configuredTables.length === 0) {
    return {
      ...data,
      meta: {
        source: "mock",
        user,
        message: "未配置飞书多维表格，当前使用本地演示数据。"
      }
    };
  }

  const loadedTables: string[] = [];
  const missingTables = (Object.keys(tableEnv) as TableKey[])
    .filter((key) => !process.env[tableEnv[key]])
    .map((key) => tableLabels[key]);

  const [projects, tasks, risks, requirements, documents, insights] = await Promise.all([
    loadTable("projects", mapProjects),
    loadTable("tasks", mapTasks),
    loadTable("risks", mapRisks),
    loadTable("requirements", mapRequirements),
    loadTable("documents", mapDocuments),
    loadTable("insights", mapInsights)
  ]);

  if (projects) {
    data.projects = projects;
    loadedTables.push(tableLabels.projects);
  }

  if (tasks) {
    data.tasks = tasks;
    loadedTables.push(tableLabels.tasks);
  }

  if (risks) {
    data.risks = risks;
    loadedTables.push(tableLabels.risks);
  }

  if (requirements) {
    data.requirements = requirements;
    loadedTables.push(tableLabels.requirements);
  }

  if (documents) {
    data.documents = documents;
    loadedTables.push(tableLabels.documents);
  }

  if (insights?.length) {
    data.weeklyInsight = insights;
    loadedTables.push(tableLabels.insights);
  }

  data.metrics = createMetrics(data);
  data.meta = {
    source: loadedTables.length ? "feishu" : "mock",
    user,
    loadedTables,
    missingTables,
    message: loadedTables.length
      ? `已接入飞书多维表格：${loadedTables.join("、")}`
      : "飞书多维表格未返回数据，当前使用本地演示数据。"
  };

  return data;
}
