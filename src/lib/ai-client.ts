import type { DashboardData } from "@/types/dashboard";
import { requirementStatusOptions } from "@/lib/requirements/requirement-quality";
import type { Requirement } from "@/types/dashboard";
import type { DocumentTaskBreakdown, RequirementAnalyzeResult } from "@/types/records";
import { createWeeklyReportAiPrompt } from "@/lib/weekly-report-ai";

const DEFAULT_AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_MODEL = "qwen-plus";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DOCUMENT_BREAKDOWN_TIMEOUT_MS = 120_000;
const DOCUMENT_BREAKDOWN_TASK_LIMIT = 24;
const DOCUMENT_BREAKDOWN_TEXT_LIMIT = 24_000;
const REQUIREMENT_ANALYSIS_TIMEOUT_MS = 90_000;
const REQUIREMENT_ANALYSIS_TEXT_LIMIT = 24_000;
const WEEKLY_REPORT_TIMEOUT_MS = 120_000;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

function getAiApiKey() {
  return process.env.AI_API_KEY?.trim() ?? "";
}

function getAiBaseUrl() {
  return (process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
}

function getAiModel() {
  return process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
}

function compactDashboardContext(data: DashboardData) {
  return {
    数据源: data.meta?.source === "database" ? "AI PM PostgreSQL 数据库" : data.meta?.source === "local" ? "AI PM 站内数据源" : "演示数据",
    指标: data.metrics,
    项目: data.projects.slice(0, 8).map((project) => ({
      名称: project.name,
      负责人: project.owner,
      状态: project.status,
      进度: project.progress,
      健康度: project.health,
      截止日期: project.dueDate,
      风险数: project.riskCount,
      摘要: project.summary
    })),
    任务: data.tasks.slice(0, 12).map((task) => ({
      标题: task.title,
      阶段: task.stage,
      负责人: task.owner,
      项目: task.project,
      版本: task.versionName,
      优先级: task.priority,
      截止日期: task.dueDate,
      AI提示: task.aiHint
    })),
    风险: data.risks.slice(0, 10).map((risk) => ({
      标题: risk.title,
      等级: risk.level,
      负责人: risk.owner,
      项目: risk.project,
      应对措施: risk.mitigation
    })),
    需求: data.requirements.slice(0, 10).map((requirement) => ({
      标题: requirement.title,
      优先级: requirement.priority,
      状态: requirement.status,
      项目: requirement.project,
      版本: requirement.versionName,
      UI链接: requirement.uiLink,
      需求文档链接: requirement.documentLink,
      验收标准: requirement.acceptance
    })),
    版本: data.requirementVersions.slice(0, 10).map((version) => ({
      名称: version.name,
      项目: version.project,
      状态: version.status,
      开始日期: version.startDate,
      发布日期: version.releaseDate,
      目标: version.goal
    })),
    文档: data.documents.slice(0, 8).map((document) => ({
      标题: document.title,
      类型: document.type,
      更新时间: document.updatedAt,
      AI摘要: document.aiSummary
    })),
    周洞察: data.weeklyInsight.slice(0, 6)
  };
}

function createSystemPrompt() {
  return [
    "你是 AI 项目管理平台内置的项目管理助手。",
    "你需要基于用户问题和给定项目上下文回答，不要编造上下文里不存在的事实。",
    "回答使用中文，先给结论，再给依据；需要行动建议时控制在 3 条以内。",
    "保持项目经理可执行的表达，避免空泛口号。"
  ].join("\n");
}

async function createChatCompletion(
  messages: Array<{ role: "system" | "user"; content: string }>,
  options: {
    timeoutMs?: number;
    maxTokens?: number;
  } = {}
) {
  const apiKey = getAiApiKey();

  if (!apiKey) {
    throw new Error("请先配置 AI_API_KEY");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getAiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getAiModel(),
        temperature: 0.2,
        messages,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {})
      }),
      cache: "no-store",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message || `AI 模型请求失败（${response.status}）`);
    }

    const reply = payload?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      throw new Error("AI 模型没有返回可读内容");
    }

    return reply;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`AI 模型响应超过 ${Math.round(timeoutMs / 1000)} 秒，请稍后重试或缩短文档内容。`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function isAiAssistantConfigured() {
  return Boolean(getAiApiKey());
}

export async function createAiAssistantReply(message: string, data: DashboardData) {
  return createChatCompletion([
    {
      role: "system",
      content: createSystemPrompt()
    },
    {
      role: "user",
      content: [
        `用户问题：${message}`,
        "当前项目上下文：",
        JSON.stringify(compactDashboardContext(data), null, 2)
      ].join("\n")
    }
  ]);
}

export async function createAiWeeklyReportReply(data: DashboardData) {
  const { systemPrompt, userPrompt } = createWeeklyReportAiPrompt(data);
  const reply = await createChatCompletion([
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: userPrompt
    }
  ], {
    maxTokens: 5_000,
    timeoutMs: WEEKLY_REPORT_TIMEOUT_MS
  });

  // 有些模型会习惯性包一层 fenced block，导出 Markdown 前先去掉外壳。
  return reply.replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractJsonObject<T>(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 没有返回可解析的任务 JSON");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as Partial<T>;
}

function replaceIfUnsupported(value: string, sourceText: string, pattern: RegExp, replacement: string) {
  return value.replace(pattern, (match) => sourceText.includes(match.trim()) ? match : replacement);
}

function sanitizeGeneratedTaskText(value: string, sourceText: string) {
  return [
    (text: string) => replaceIfUnsupported(text, sourceText, /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/api\/[A-Za-z0-9_./:-]+/g, "相关业务接口"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\/api\/[A-Za-z0-9_./:-]+/g, "相关业务接口"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\b(MySQL|PostgreSQL|Redis|MongoDB|Oracle|SQL Server|Elasticsearch|ElasticSearch)\b/gi, "站内数据源"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\b(?:HTTP\s*)?[1-5]\d{2}\b/g, "明确错误状态"),
    (text: string) => replaceIfUnsupported(text, sourceText, /延迟\s*[>＞]\s*\d+\s*s/gi, "延迟超过服务超时阈值"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\b\d+\s*s\b/gi, "服务超时阈值"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\.?pdf\b/gi, "不支持格式"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\bJWT\s*token\b|\bJWT\b/gi, "登录态"),
    (text: string) => replaceIfUnsupported(text, sourceText, /scope\s*包含\s*['"][^'"]+['"]/gi, "具备任务创建权限"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\b[a-z]+(?:\.[a-z]+)+\b/g, "任务创建权限"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\b\d+\s*条任务\b/g, "多条任务"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\bmultipart\/form-data\b/gi, "上传表单数据"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, "相关字段"),
    (text: string) => replaceIfUnsupported(text, sourceText, /每日凌晨/g, "按配置周期"),
    (text: string) => replaceIfUnsupported(text, sourceText, /本地缓存表/g, "飞书人员缓存"),
    (text: string) => replaceIfUnsupported(text, sourceText, /项目管理员角色|项目管理员|项目管理权限|project_manage/g, "任务创建权限"),
    (text: string) => replaceIfUnsupported(text, sourceText, /富文本卡片消息|富文本通知/g, "飞书通知消息"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\bWebhook\b/gi, "通知接口"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\bMD5\b/gi, "文档指纹"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\bMock\b/gi, "模拟"),
    (text: string) => replaceIfUnsupported(text, sourceText, /\b\d+\s*秒\b/g, "合理时间"),
    (text: string) => replaceIfUnsupported(text, sourceText, /API\s*泄露/g, "未授权接口调用"),
    (text: string) => text.replace(/相关业务接口\s*接口/g, "相关业务接口"),
    (text: string) => text.replace(/相关字段\.[A-Za-z0-9_]+/g, "相关字段")
  ].reduce((text, sanitize) => sanitize(text), value);
}

function normalizeBreakdown(
  payload: Partial<DocumentTaskBreakdown>,
  fallbackTitle: string,
  sourceText: string
): DocumentTaskBreakdown {
  const allowedTypes = new Set(["PRD", "会议纪要", "技术方案", "复盘"]);
  const allowedPriorities = new Set(["高", "中", "低"]);
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  return {
    documentTitle: typeof payload.documentTitle === "string" && payload.documentTitle.trim()
      ? payload.documentTitle.trim()
      : fallbackTitle,
    documentType: allowedTypes.has(String(payload.documentType)) ? payload.documentType! : "PRD",
    summary: typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim().slice(0, 260)
      : "AI 已读取文档并生成任务拆解。",
    tasks: tasks
      .map((task) => ({
        title: typeof task.title === "string" ? sanitizeGeneratedTaskText(task.title, sourceText).trim() : "",
        owner: typeof task.owner === "string" ? task.owner.trim() : "",
        priority: allowedPriorities.has(String(task.priority)) ? task.priority : "中",
        startDate: typeof task.startDate === "string" ? task.startDate.trim() : "",
        dueDate: typeof task.dueDate === "string" ? task.dueDate.trim() : "",
        aiHint: typeof task.aiHint === "string" && task.aiHint.trim()
          ? sanitizeGeneratedTaskText(task.aiHint, sourceText).trim().slice(0, 180)
          : "由上传文档自动拆解生成。"
      }))
      .filter((task) => task.title)
      .slice(0, DOCUMENT_BREAKDOWN_TASK_LIMIT)
  };
}

export async function createAiDocumentTaskBreakdown({
  documentText,
  fileName,
  projectName,
  versionName,
  peopleNames
}: {
  documentText: string;
  fileName: string;
  projectName: string;
  versionName: string;
  peopleNames: string[];
}) {
  const reply = await createChatCompletion(
    [
      {
        role: "system",
        content: [
          "你是 AI 项目管理平台的文档拆解助手。",
          "你只基于用户上传的文档内容拆解项目任务，不要编造文档之外的事实。",
          "任务必须归属到用户选择的项目版本；所有任务都围绕该版本的交付范围拆解，不要拆到其他版本。",
          "当前平台技术约束：前端为 Next.js/React/Ant Design；项目管理主数据保存在平台站内数据源；飞书只用于登录、负责人选择和机器人通知；文档上传暂支持 .docx、.txt、.md、.csv、.json 且 4MB 以内。",
          "禁止编造文档没有提到的数据库、接口路径、表名、字段名、缓存表、定时任务、文件格式、文件大小、性能阈值、鉴权协议、权限 scope、第三方系统或组织流程；如果信息不明确，请输出确认/澄清任务。",
          "请输出严格 JSON，不要 Markdown，不要解释。",
          "JSON 结构：{ \"documentTitle\": string, \"documentType\": \"PRD\"|\"会议纪要\"|\"技术方案\"|\"复盘\", \"summary\": string, \"tasks\": [{ \"title\": string, \"owner\": string, \"priority\": \"高\"|\"中\"|\"低\", \"startDate\": \"YYYY-MM-DD\", \"dueDate\": \"YYYY-MM-DD\", \"aiHint\": string }] }。",
          "拆解必须按工程交付视角覆盖【前端】【后端】【测试】三类任务；每个明确需求点尽量拆成前端实现、后端支撑、测试验证三个角度。",
          "如果文档没有明确写前端、后端或测试，也必须补出对应的确认/澄清/验收任务，避免遗漏。",
          "前端任务关注页面、组件、交互、状态、表单校验、权限可见性、异常/空状态和响应式体验。",
          "后端任务关注接口、数据模型、鉴权权限、业务规则、消息通知、数据持久化、幂等、异常和日志。",
          "测试任务关注测试用例、接口联调、端到端流程、权限边界、异常场景、回归范围和验收标准。",
          "任务标题必须以【前端】、【后端】或【测试】开头，不能只写“开发”“测试”“处理”等笼统标题。",
          "aiHint 必须写清交付物、验收点、依赖或边界，不能少于 20 个中文字符。",
          "任务 title 应该可执行，owner 优先从可选负责人里选择；如果文档没有负责人，owner 留空。",
          "startDate 和 dueDate 优先使用文档中的时间；如果文档没有开始日期，按任务复杂度给出合理开始日期，不要晚于 dueDate。",
          `输出 ${Math.min(6, DOCUMENT_BREAKDOWN_TASK_LIMIT)}-${DOCUMENT_BREAKDOWN_TASK_LIMIT} 个任务，优先保留明确有交付物、截止时间、依赖或风险的事项。`
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `项目：${projectName}`,
          `目标版本：${versionName}`,
          `文件名：${fileName}`,
          `可选负责人：${peopleNames.length ? peopleNames.join("、") : "暂无"}`,
          "文档内容：",
          documentText.slice(0, DOCUMENT_BREAKDOWN_TEXT_LIMIT)
        ].join("\n")
      }
    ],
    {
      timeoutMs: DOCUMENT_BREAKDOWN_TIMEOUT_MS,
      maxTokens: 4_000
    }
  );

  return normalizeBreakdown(extractJsonObject<DocumentTaskBreakdown>(reply), fileName.replace(/\.[^.]+$/, ""), documentText);
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeRequirementStatus(value: unknown): Requirement["status"] {
  const text = typeof value === "string" ? value : "";
  const matchedStatus = requirementStatusOptions.find((status) => status === text);

  if (matchedStatus) {
    return matchedStatus;
  }

  if (text.includes("驳回")) {
    return "已驳回";
  }

  if (text.includes("关闭")) {
    return "已关闭";
  }

  if (text.includes("已上线") || text.includes("发布")) {
    return "已上线";
  }

  if (text.includes("上线")) {
    return "待上线";
  }

  if (text.includes("开发")) {
    return "开发中";
  }

  if (text.includes("设计")) {
    return "设计中";
  }

  if (text.includes("排期")) {
    return "待排期";
  }

  if (text.includes("评审")) {
    return "评审中";
  }

  return "待评审";
}

function normalizeRequirementPriority(value: unknown): Requirement["priority"] {
  const text = typeof value === "string" ? value : "";

  if (text.includes("P0") || text.includes("高")) {
    return "P0";
  }

  if (text.includes("P2") || text.includes("低")) {
    return "P2";
  }

  return "P1";
}

function normalizeRequirementAnalysis(
  payload: Partial<RequirementAnalyzeResult>,
  documentTitle: string,
  extractedChars: number,
  source: RequirementAnalyzeResult["source"],
  warning?: string
): RequirementAnalyzeResult {
  const risks = asStringList(payload.risks);
  const missingItems = asStringList(payload.missingItems);
  const frontendNotes = asStringList(payload.frontendNotes);
  const backendNotes = asStringList(payload.backendNotes);
  const testingNotes = asStringList(payload.testingNotes);
  const completenessScore =
    typeof payload.completenessScore === "number" && Number.isFinite(payload.completenessScore)
      ? Math.round(payload.completenessScore)
      : Math.max(35, 100 - missingItems.length * 12 - risks.length * 6);

  return {
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim().slice(0, 80) : documentTitle,
    summary: typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim().slice(0, 360)
      : "已读取飞书需求文档，建议补齐背景、范围、验收和依赖后再进入排期。",
    acceptance: typeof payload.acceptance === "string" && payload.acceptance.trim()
      ? payload.acceptance.trim().slice(0, 1000)
      : [
          "1. 核心主流程可以按需求文档完成。",
          "2. 异常、权限、空状态和边界条件均有明确处理。",
          "3. 产品、研发、测试对上线验收口径达成一致。"
        ].join("\n"),
    suggestedPriority: normalizeRequirementPriority(payload.suggestedPriority),
    suggestedStatus: normalizeRequirementStatus(payload.suggestedStatus),
    risks,
    missingItems,
    frontendNotes,
    backendNotes,
    testingNotes,
    completenessScore: Math.max(0, Math.min(100, completenessScore)),
    source,
    documentTitle,
    extractedChars,
    message: source === "ai" ? "已完成飞书需求文档 AI 体检" : "AI 不可用，已使用本地规则生成需求体检",
    warning
  };
}

export function createFallbackRequirementAnalysis({
  documentTitle,
  documentText,
  warning
}: {
  documentTitle: string;
  documentText: string;
  warning?: string;
}): RequirementAnalyzeResult {
  const compactText = documentText.replace(/\s+/g, " ").trim();
  const hasUi = /ui|figma|蓝湖|设计|原型/i.test(documentText);
  const hasAcceptance = /验收|通过|成功|失败|边界|条件|标准/.test(documentText);
  const missingItems = [
    hasUi ? "" : "缺 UI 或原型说明",
    hasAcceptance ? "" : "缺可量化验收标准",
    /接口|数据|权限|字段/.test(documentText) ? "" : "缺接口数据和权限边界",
    /异常|失败|空状态|边界/.test(documentText) ? "" : "缺异常和边界场景"
  ].filter(Boolean);

  return normalizeRequirementAnalysis(
    {
      title: documentTitle,
      summary: compactText.slice(0, 180) || "已读取飞书文档，但内容较少，需要补充需求背景和范围。",
      acceptance: hasAcceptance
        ? "请基于文档中的验收描述确认主流程、异常场景、权限边界和上线回归范围。"
        : "1. 产品补齐可量化验收标准。\n2. 研发确认接口、数据和权限边界。\n3. 测试覆盖主流程、异常、权限和回归场景。",
      suggestedPriority: missingItems.length >= 3 ? "P1" : "P2",
      suggestedStatus: missingItems.length ? "待评审" : "待排期",
      risks: missingItems.length ? ["需求信息不完整，直接进入开发可能导致返工。"] : [],
      missingItems,
      frontendNotes: ["确认页面入口、组件状态、表单校验、空状态和响应式表现。"],
      backendNotes: ["确认接口契约、数据字段、鉴权权限、消息通知和日志审计。"],
      testingNotes: ["补齐主流程、异常场景、权限边界和版本回归用例。"],
      completenessScore: Math.max(40, 100 - missingItems.length * 15)
    },
    documentTitle,
    documentText.length,
    "fallback",
    warning
  );
}

export async function createAiRequirementAnalysis({
  documentText,
  documentTitle,
  requirementTitle,
  versionName
}: {
  documentText: string;
  documentTitle: string;
  requirementTitle?: string;
  versionName?: string;
}) {
  const reply = await createChatCompletion(
    [
      {
        role: "system",
        content: [
          "你是 AI 项目管理平台的资深产品需求评审助手。",
          "你只基于飞书需求文档正文分析，不要编造文档不存在的事实。",
          "输出严格 JSON，不要 Markdown，不要解释。",
          "JSON 结构：{ \"title\": string, \"summary\": string, \"acceptance\": string, \"suggestedPriority\": \"P0\"|\"P1\"|\"P2\", \"suggestedStatus\": \"待评审\"|\"评审中\"|\"待排期\"|\"设计中\"|\"开发中\"|\"待上线\"|\"已上线\"|\"已关闭\"|\"已驳回\", \"risks\": string[], \"missingItems\": string[], \"frontendNotes\": string[], \"backendNotes\": string[], \"testingNotes\": string[], \"completenessScore\": number }。",
          "summary 用 80-160 个中文字符描述需求目标、用户价值和范围。",
          "acceptance 必须输出可直接回填到需求的验收标准，覆盖主流程、异常状态、权限边界、数据口径和上线回归。",
          "missingItems 只列当前文档缺失且会影响研发或测试的信息。",
          "frontendNotes 从前端页面、交互、组件状态、表单校验、权限可见性、空状态和响应式角度列建议。",
          "backendNotes 从接口、数据模型、鉴权、业务规则、通知、持久化、幂等、异常和日志角度列建议。",
          "testingNotes 从测试用例、联调、端到端流程、权限边界、异常、回归和验收角度列建议。",
          "completenessScore 是 0-100 的整数，综合文档完整度、UI/交互、验收、接口数据、风险和依赖判断。",
          "如果文档信息不足，状态建议为待评审；如果信息完整但未进入研发，状态建议为待排期。"
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `飞书文档标题：${documentTitle}`,
          `当前需求标题：${requirementTitle || "未填写"}`,
          `目标版本：${versionName || "未绑定"}`,
          "飞书文档正文：",
          documentText.slice(0, REQUIREMENT_ANALYSIS_TEXT_LIMIT)
        ].join("\n")
      }
    ],
    {
      timeoutMs: REQUIREMENT_ANALYSIS_TIMEOUT_MS,
      maxTokens: 3_000
    }
  );

  return normalizeRequirementAnalysis(
    extractJsonObject<RequirementAnalyzeResult>(reply),
    documentTitle,
    documentText.length,
    "ai"
  );
}
