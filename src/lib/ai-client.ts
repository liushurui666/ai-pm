import type { DashboardData } from "@/types/dashboard";
import type { DocumentTaskBreakdown } from "@/types/records";

const DEFAULT_AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_MODEL = "qwen-plus";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DOCUMENT_BREAKDOWN_TIMEOUT_MS = 120_000;
const DOCUMENT_BREAKDOWN_TASK_LIMIT = 24;
const DOCUMENT_BREAKDOWN_TEXT_LIMIT = 24_000;

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
    数据源: data.meta?.source === "local" ? "AI PM 站内数据源" : "演示数据",
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
      验收标准: requirement.acceptance
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

function extractJsonObject(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 没有返回可解析的任务 JSON");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as Partial<DocumentTaskBreakdown>;
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
  peopleNames
}: {
  documentText: string;
  fileName: string;
  projectName: string;
  peopleNames: string[];
}) {
  const reply = await createChatCompletion(
    [
      {
        role: "system",
        content: [
          "你是 AI 项目管理平台的文档拆解助手。",
          "你只基于用户上传的文档内容拆解项目任务，不要编造文档之外的事实。",
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

  return normalizeBreakdown(extractJsonObject(reply), fileName.replace(/\.[^.]+$/, ""), documentText);
}
