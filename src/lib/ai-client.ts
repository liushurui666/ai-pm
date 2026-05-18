import type { DashboardData } from "@/types/dashboard";
import type { DocumentTaskBreakdown } from "@/types/records";

const DEFAULT_AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_MODEL = "qwen-plus";
const REQUEST_TIMEOUT_MS = 20_000;

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

async function createChatCompletion(messages: Array<{ role: "system" | "user"; content: string }>) {
  const apiKey = getAiApiKey();

  if (!apiKey) {
    throw new Error("请先配置 AI_API_KEY");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
        messages
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

function normalizeBreakdown(payload: Partial<DocumentTaskBreakdown>, fallbackTitle: string): DocumentTaskBreakdown {
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
        title: typeof task.title === "string" ? task.title.trim() : "",
        owner: typeof task.owner === "string" ? task.owner.trim() : "",
        priority: allowedPriorities.has(String(task.priority)) ? task.priority : "中",
        dueDate: typeof task.dueDate === "string" ? task.dueDate.trim() : "",
        aiHint: typeof task.aiHint === "string" && task.aiHint.trim()
          ? task.aiHint.trim().slice(0, 180)
          : "由上传文档自动拆解生成。"
      }))
      .filter((task) => task.title)
      .slice(0, 12)
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
  const reply = await createChatCompletion([
    {
      role: "system",
      content: [
        "你是 AI 项目管理平台的文档拆解助手。",
        "你只基于用户上传的文档内容拆解项目任务，不要编造文档之外的事实。",
        "请输出严格 JSON，不要 Markdown，不要解释。",
        "JSON 结构：{ \"documentTitle\": string, \"documentType\": \"PRD\"|\"会议纪要\"|\"技术方案\"|\"复盘\", \"summary\": string, \"tasks\": [{ \"title\": string, \"owner\": string, \"priority\": \"高\"|\"中\"|\"低\", \"dueDate\": \"YYYY-MM-DD\", \"aiHint\": string }] }。",
        "任务 title 应该可执行，owner 优先从可选负责人里选择；如果文档没有负责人，owner 留空。",
        "最多输出 12 个任务，优先保留明确有交付物、截止时间、依赖或风险的事项。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `项目：${projectName}`,
        `文件名：${fileName}`,
        `可选负责人：${peopleNames.length ? peopleNames.join("、") : "暂无"}`,
        "文档内容：",
        documentText.slice(0, 16_000)
      ].join("\n")
    }
  ]);

  return normalizeBreakdown(extractJsonObject(reply), fileName.replace(/\.[^.]+$/, ""));
}
