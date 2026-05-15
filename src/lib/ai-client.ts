import type { DashboardData } from "@/types/dashboard";

const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";
const DEFAULT_AI_MODEL = "deepseek-chat";
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
    数据源: data.meta?.source === "feishu" ? "飞书多维表格" : "演示数据",
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

export function isAiAssistantConfigured() {
  return Boolean(getAiApiKey());
}

export async function createAiAssistantReply(message: string, data: DashboardData) {
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
        messages: [
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
        ]
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
