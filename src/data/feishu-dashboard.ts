import dayjs from "dayjs";
import { getFeishuTenantAccessToken } from "@/lib/feishu-client";
import { sendFeishuBotText } from "@/lib/feishu-message";
import { canEnsureFeishuWorkspace, ensureFeishuWorkspace } from "@/lib/feishu-workspace";
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
import type { CreateRecordResult, DashboardEntityMap, DashboardEntityType } from "@/types/records";

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

type BitableCreateResponse = {
  code: number;
  msg?: string;
  data?: {
    record?: BitableRecord;
  };
};

type BitableTable = {
  table_id: string;
  name: string;
};

type BitableTableListResponse = {
  code: number;
  msg?: string;
  data?: {
    items?: BitableTable[];
    page_token?: string;
    has_more?: boolean;
  };
};

type BitableField = {
  field_id: string;
  field_name: string;
  type: number;
};

type BitableFieldListResponse = {
  code: number;
  msg?: string;
  data?: {
    items?: BitableField[];
    page_token?: string;
    has_more?: boolean;
  };
};

type BitableTableCreateResponse = {
  code: number;
  msg?: string;
  data?: {
    table_id?: string;
    table?: BitableTable;
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

const tableNameAliases: Record<TableKey, string[]> = {
  projects: ["项目", "项目表", "项目管理", "Projects", "Project"],
  tasks: ["任务", "任务表", "任务看板", "Tasks", "Task"],
  risks: ["风险", "风险表", "风险中心", "Risks", "Risk"],
  requirements: ["需求", "需求表", "需求管理", "Requirements", "Requirement"],
  documents: ["文档", "文档表", "文档知识库", "Documents", "Document"],
  insights: ["洞察", "洞察表", "AI洞察", "AI 洞察", "Insights", "Insight"]
};

const tableDefinitions: Record<
  TableKey,
  {
    name: string;
    fields: Array<{
      field_name: string;
      type: number;
      ui_type?: string;
      property?: Record<string, unknown>;
    }>;
  }
> = {
  projects: {
    name: "项目",
    fields: [
      { field_name: "项目名称", type: 1, ui_type: "Text" },
      { field_name: "负责人", type: 11, ui_type: "User", property: { multiple: false } },
      {
        field_name: "状态",
        type: 3,
        ui_type: "SingleSelect",
        property: { options: ["进行中", "有风险", "已完成", "暂停"].map((name) => ({ name })) }
      },
      { field_name: "进度", type: 2, ui_type: "Number" },
      { field_name: "健康度", type: 2, ui_type: "Number" },
      { field_name: "截止日期", type: 5, ui_type: "DateTime", property: { date_formatter: "yyyy/MM/dd" } },
      { field_name: "团队人数", type: 2, ui_type: "Number" },
      { field_name: "风险数", type: 2, ui_type: "Number" },
      { field_name: "摘要", type: 1, ui_type: "Text" }
    ]
  },
  tasks: {
    name: "任务",
    fields: [
      { field_name: "标题", type: 1, ui_type: "Text" },
      {
        field_name: "阶段",
        type: 3,
        ui_type: "SingleSelect",
        property: { options: ["待处理", "进行中", "评审中", "已完成"].map((name) => ({ name })) }
      },
      { field_name: "负责人", type: 11, ui_type: "User", property: { multiple: false } },
      { field_name: "项目名称", type: 1, ui_type: "Text" },
      {
        field_name: "优先级",
        type: 3,
        ui_type: "SingleSelect",
        property: { options: ["高", "中", "低"].map((name) => ({ name })) }
      },
      { field_name: "截止日期", type: 5, ui_type: "DateTime", property: { date_formatter: "yyyy/MM/dd" } },
      { field_name: "AI提示", type: 1, ui_type: "Text" }
    ]
  },
  risks: {
    name: "风险",
    fields: [
      { field_name: "标题", type: 1, ui_type: "Text" },
      {
        field_name: "等级",
        type: 3,
        ui_type: "SingleSelect",
        property: { options: ["高", "中", "低"].map((name) => ({ name })) }
      },
      { field_name: "负责人", type: 11, ui_type: "User", property: { multiple: false } },
      { field_name: "项目名称", type: 1, ui_type: "Text" },
      { field_name: "应对措施", type: 1, ui_type: "Text" }
    ]
  },
  requirements: {
    name: "需求",
    fields: [
      { field_name: "标题", type: 1, ui_type: "Text" },
      {
        field_name: "优先级",
        type: 3,
        ui_type: "SingleSelect",
        property: { options: ["P0", "P1", "P2"].map((name) => ({ name })) }
      },
      {
        field_name: "状态",
        type: 3,
        ui_type: "SingleSelect",
        property: { options: ["评审中", "设计中", "开发中", "待上线"].map((name) => ({ name })) }
      },
      { field_name: "项目名称", type: 1, ui_type: "Text" },
      { field_name: "验收标准", type: 1, ui_type: "Text" }
    ]
  },
  documents: {
    name: "文档",
    fields: [
      { field_name: "标题", type: 1, ui_type: "Text" },
      {
        field_name: "类型",
        type: 3,
        ui_type: "SingleSelect",
        property: { options: ["PRD", "会议纪要", "技术方案", "复盘"].map((name) => ({ name })) }
      },
      { field_name: "更新时间", type: 5, ui_type: "DateTime", property: { date_formatter: "yyyy/MM/dd HH:mm" } },
      { field_name: "AI摘要", type: 1, ui_type: "Text" }
    ]
  },
  insights: {
    name: "洞察",
    fields: [
      { field_name: "内容", type: 1, ui_type: "Text" }
    ]
  }
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

function createLocalId(type: DashboardEntityType) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isFeishuBitableConfigured() {
  return canEnsureFeishuWorkspace();
}

function normalizeTableName(name: string) {
  return name.replace(/\s+/g, "").toLowerCase();
}

async function listBitableTables(appToken: string) {
  const accessToken = await getFeishuTenantAccessToken();
  const tables: BitableTable[] = [];
  let pageToken = "";

  do {
    const url = new URL(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`);
    url.searchParams.set("page_size", "100");

    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as BitableTableListResponse;

    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.msg || "读取飞书多维表格数据表列表失败");
    }

    tables.push(...(payload.data?.items ?? []));
    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken);

  return tables;
}

async function createBitableTable(key: TableKey, appToken: string) {
  const accessToken = await getFeishuTenantAccessToken();
  const definition = tableDefinitions[key];
  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      table: {
        name: definition.name,
        default_view_name: "默认视图",
        fields: definition.fields
      }
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as BitableTableCreateResponse;
  const tableId = payload.data?.table?.table_id || payload.data?.table_id;

  if (!response.ok || payload.code !== 0 || !tableId) {
    throw new Error(payload.msg || `创建飞书${tableLabels[key]}表失败`);
  }

  return tableId;
}

async function listBitableFields(tableId: string, appToken: string) {
  const accessToken = await getFeishuTenantAccessToken();
  const fields: BitableField[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`
    );
    url.searchParams.set("page_size", "100");

    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as BitableFieldListResponse;

    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.msg || `读取飞书多维表格字段 ${tableId} 失败`);
    }

    fields.push(...(payload.data?.items ?? []));
    pageToken = payload.data?.has_more ? payload.data.page_token ?? "" : "";
  } while (pageToken);

  return fields;
}

async function resolveTableIds(user?: FeishuUser, options: { autoCreate?: boolean } = {}) {
  const resolved: Partial<Record<TableKey, string>> = {};
  const createdTables: string[] = [];
  const workspace = await ensureFeishuWorkspace(user);
  const appToken = workspace.appToken;

  for (const key of Object.keys(tableEnv) as TableKey[]) {
    const tableId = process.env[tableEnv[key]]?.trim();

    if (tableId) {
      resolved[key] = tableId;
    }
  }

  const unresolvedKeys = (Object.keys(tableEnv) as TableKey[]).filter((key) => !resolved[key]);

  if (!unresolvedKeys.length) {
    return {
      appToken,
      tableIds: resolved,
      createdTables,
      workspaceCreated: workspace.created
    };
  }

  const tables = await listBitableTables(appToken);
  const tableByName = new Map(tables.map((table) => [normalizeTableName(table.name), table.table_id]));

  for (const key of unresolvedKeys) {
    const matchedTableId = tableNameAliases[key]
      .map((name) => tableByName.get(normalizeTableName(name)))
      .find(Boolean);

    if (matchedTableId) {
      resolved[key] = matchedTableId;
    }
  }

  if (options.autoCreate !== false) {
    for (const key of unresolvedKeys.filter((tableKey) => !resolved[tableKey])) {
      resolved[key] = await createBitableTable(key, appToken);
      createdTables.push(tableLabels[key]);
    }
  }

  return {
    appToken,
    tableIds: resolved,
    createdTables,
    workspaceCreated: workspace.created
  };
}

async function searchBitableRecords(tableId: string, appToken: string) {
  const accessToken = await getFeishuTenantAccessToken();
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

async function createBitableRecord(tableId: string, fields: Record<string, unknown>, appToken: string) {
  const accessToken = await getFeishuTenantAccessToken();
  const url = new URL(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`);
  url.searchParams.set("user_id_type", "open_id");

  const response = await fetch(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields
      }),
      cache: "no-store"
    }
  );
  const payload = (await response.json()) as BitableCreateResponse;

  if (!response.ok || payload.code !== 0 || !payload.data?.record) {
    throw new Error(payload.msg || `写入飞书多维表格 ${tableId} 失败`);
  }

  return payload.data.record;
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

    if (typeof record.id === "string") {
      return record.id;
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

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asOwnerName(values: Record<string, unknown>) {
  return asText(values.owner, "未分配");
}

function asOwnerOpenId(values: Record<string, unknown>) {
  return asText(values.ownerOpenId);
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

function toDateTimestamp(value: unknown) {
  const date = typeof value === "string" && value ? dayjs(value) : dayjs();

  return date.isValid() ? date.valueOf() : Date.now();
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

function normalizeCreateProject(values: Record<string, unknown>, id = createLocalId("project")): Project {
  const progress = Math.min(100, Math.max(0, asNumber(values.progress, 0)));
  const health = Math.min(100, Math.max(0, asNumber(values.health, 80)));

  return {
    id,
    name: asText(values.name, "未命名项目"),
    owner: asOwnerName(values),
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
  return {
    id,
    title: asText(values.title, "未命名任务"),
    stage: normalizeTaskStage(asText(values.stage, "待处理")),
    owner: asOwnerName(values),
    project: asText(values.project, "未关联项目"),
    priority: normalizeTaskPriority(asText(values.priority, "中")),
    dueDate: asDateString(values.dueDate, dayjs().add(7, "day").format("YYYY-MM-DD")),
    aiHint: asText(values.aiHint, "AI 暂未发现额外风险。")
  };
}

function normalizeCreateRisk(values: Record<string, unknown>, id = createLocalId("risk")): Risk {
  return {
    id,
    title: asText(values.title, "未命名风险"),
    level: normalizeRiskLevel(asText(values.level, "中")),
    owner: asOwnerName(values),
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

async function getTableIdForType(type: DashboardEntityType, user?: FeishuUser) {
  const tableKeyByType: Record<DashboardEntityType, TableKey> = {
    project: "projects",
    task: "tasks",
    risk: "risks",
    requirement: "requirements",
    document: "documents"
  };
  const key = tableKeyByType[type];
  const { appToken, tableIds } = await resolveTableIds(user);

  return {
    appToken,
    key,
    tableId: tableIds[key]
  };
}

function getFieldType(fields: BitableField[], fieldName: string) {
  return fields.find((field) => field.field_name === fieldName)?.type;
}

function createOwnerFieldValue(values: Record<string, unknown>, ownerFieldType?: number) {
  const ownerOpenId = asOwnerOpenId(values);

  if (ownerFieldType === 11 && ownerOpenId) {
    return [
      {
        id: ownerOpenId
      }
    ];
  }

  if (ownerFieldType === 11) {
    throw new Error("负责人字段是飞书人员字段，请先从飞书通讯录选择负责人。");
  }

  return asOwnerName(values);
}

function createFieldsForType(type: DashboardEntityType, values: Record<string, unknown>, fields: BitableField[] = []) {
  const ownerFieldType = getFieldType(fields, "负责人");

  if (type === "project") {
    const project = normalizeCreateProject(values);

    return {
      项目名称: project.name,
      负责人: createOwnerFieldValue(values, ownerFieldType),
      状态: project.status,
      进度: project.progress,
      健康度: project.health,
      截止日期: toDateTimestamp(project.dueDate),
      团队人数: project.team,
      风险数: project.riskCount,
      摘要: project.summary
    };
  }

  if (type === "task") {
    const task = normalizeCreateTask(values);

    return {
      标题: task.title,
      阶段: task.stage,
      负责人: createOwnerFieldValue(values, ownerFieldType),
      项目名称: task.project,
      优先级: task.priority,
      截止日期: toDateTimestamp(task.dueDate),
      AI提示: task.aiHint
    };
  }

  if (type === "risk") {
    const risk = normalizeCreateRisk(values);

    return {
      标题: risk.title,
      等级: risk.level,
      负责人: createOwnerFieldValue(values, ownerFieldType),
      项目名称: risk.project,
      应对措施: risk.mitigation
    };
  }

  if (type === "requirement") {
    const requirement = normalizeCreateRequirement(values);

    return {
      标题: requirement.title,
      优先级: requirement.priority,
      状态: requirement.status,
      项目名称: requirement.project,
      验收标准: requirement.acceptance
    };
  }

  const document = normalizeCreateDocument(values);

  return {
    标题: document.title,
    类型: document.type,
    更新时间: toDateTimestamp(document.updatedAt),
    AI摘要: document.aiSummary
  };
}

function createMockRecord<T extends DashboardEntityType>(
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

function getRecordTitle(type: DashboardEntityType, values: Record<string, unknown>) {
  if (type === "project") {
    return asText(values.name, "未命名项目");
  }

  return asText(values.title, `未命名${entityLabelForType(type)}`);
}

function entityLabelForType(type: DashboardEntityType) {
  const labels: Record<DashboardEntityType, string> = {
    project: "项目",
    task: "任务",
    risk: "风险",
    requirement: "需求",
    document: "文档"
  };

  return labels[type];
}

function mapCreatedRecord<T extends DashboardEntityType>(
  type: T,
  record: BitableRecord,
  values: Record<string, unknown>
): DashboardEntityMap[T] {
  if (type === "project") {
    return { ...mapProjects([record])[0], ...normalizeCreateProject(values), id: record.record_id } as DashboardEntityMap[T];
  }

  if (type === "task") {
    return { ...mapTasks([record])[0], ...normalizeCreateTask(values), id: record.record_id } as DashboardEntityMap[T];
  }

  if (type === "risk") {
    return { ...mapRisks([record])[0], ...normalizeCreateRisk(values), id: record.record_id } as DashboardEntityMap[T];
  }

  if (type === "requirement") {
    return { ...mapRequirements([record])[0], ...normalizeCreateRequirement(values), id: record.record_id } as DashboardEntityMap[T];
  }

  return { ...mapDocuments([record])[0], ...normalizeCreateDocument(values), id: record.record_id } as DashboardEntityMap[T];
}

function mapInsights(records: BitableRecord[]) {
  return records
    .map((record) => readString(record.fields, fieldAliases.content))
    .filter(Boolean)
    .slice(0, 5);
}

async function loadTable<T>(
  appToken: string,
  tableId: string | undefined,
  mapper: (records: BitableRecord[]) => T[]
) {
  if (!tableId) {
    return null;
  }

  return mapper(await searchBitableRecords(tableId, appToken));
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

  if (!canEnsureFeishuWorkspace()) {
    return {
      ...data,
      meta: {
        source: "mock",
        user,
        missingConfig: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
        message: "未配置飞书应用身份，当前使用本地演示数据。"
      }
    };
  }

  const { appToken, tableIds, createdTables, workspaceCreated } = await resolveTableIds(user);
  const loadedTables: string[] = [];
  const missingTables = (Object.keys(tableEnv) as TableKey[])
    .filter((key) => !tableIds[key])
    .map((key) => tableLabels[key]);

  const [projects, tasks, risks, requirements, documents, insights] = await Promise.all([
    loadTable(appToken, tableIds.projects, mapProjects),
    loadTable(appToken, tableIds.tasks, mapTasks),
    loadTable(appToken, tableIds.risks, mapRisks),
    loadTable(appToken, tableIds.requirements, mapRequirements),
    loadTable(appToken, tableIds.documents, mapDocuments),
    loadTable(appToken, tableIds.insights, mapInsights)
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
    createdTables,
    missingConfig: [],
    message: loadedTables.length
      ? `${workspaceCreated ? "已自动创建飞书项目管理工作区，并" : "已"}接入飞书多维表格：${loadedTables.join("、")}`
      : "飞书多维表格未返回数据，当前使用本地演示数据。"
  };

  return data;
}

export async function createDashboardRecord<T extends DashboardEntityType>(
  type: T,
  values: Record<string, unknown>,
  user?: FeishuUser
): Promise<CreateRecordResult<T>> {
  const mockRecord = createMockRecord(type, values);

  if (!canEnsureFeishuWorkspace()) {
    return {
      type,
      record: mockRecord,
      persisted: false,
      message: "缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET，无法创建飞书工作区。已在当前页面临时创建，刷新后会丢失。"
    };
  }

  const { appToken, key, tableId } = await getTableIdForType(type, user);

  if (!tableId) {
    return {
      type,
      record: mockRecord,
      persisted: false,
      message: `未识别到飞书${tableLabels[key]}表，已在当前页面临时创建。`
    };
  }

  const tableFields = await listBitableFields(tableId, appToken);
  const createdRecord = await createBitableRecord(tableId, createFieldsForType(type, values, tableFields), appToken);
  const ownerOpenId = asOwnerOpenId(values);
  let notifyMessage = "";

  if (ownerOpenId) {
    try {
      await sendFeishuBotText(
        ownerOpenId,
        `你被设置为${tableLabels[key]}负责人：${getRecordTitle(type, values)}。请在 AI PM 平台查看详情。`
      );
      notifyMessage = `已通过飞书机器人通知 ${asOwnerName(values)}。`;
    } catch (error) {
      notifyMessage = `机器人通知失败：${error instanceof Error ? error.message : "未知错误"}。`;
    }
  }

  return {
    type,
    record: mapCreatedRecord(type, createdRecord, values),
    persisted: true,
    message: [
      `${user?.name ? `${user.name} 已` : "已"}写入飞书${tableLabels[key]}表。`,
      notifyMessage
    ].filter(Boolean).join(" ")
  };
}
