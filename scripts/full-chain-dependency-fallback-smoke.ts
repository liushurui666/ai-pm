import { config as loadEnv } from "dotenv";
import {
  getAiApiKey,
  getAiAvailableModels,
  getAiBaseUrl,
  getAiModel,
  isAiAssistantConfigured,
  resolveAiModel
} from "@/lib/ai/settings";
import { createFallbackRequirementAnalysis } from "@/lib/ai/client";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";
import { createFallbackDocumentTaskBreakdown } from "@/lib/documents/breakdown";
import { assertEmailNotificationConfigured, getEmailNotificationSettings } from "@/lib/notifications/email/settings";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

type DependencyStatus = "configured" | "missing" | "partial";

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getCosStatus(): DependencyStatus {
  const hasSecretId = Boolean(process.env.TENCENT_COS_SECRET_ID?.trim());
  const hasSecretKey = Boolean(process.env.TENCENT_COS_SECRET_KEY?.trim());

  if (hasSecretId && hasSecretKey) {
    return "configured";
  }

  if (hasSecretId || hasSecretKey) {
    return "partial";
  }

  return "missing";
}

function getEmailStatus(): DependencyStatus {
  const settings = getEmailNotificationSettings();

  if (settings.apiKey && settings.from) {
    return "configured";
  }

  if (settings.apiKey || settings.from) {
    return "partial";
  }

  return "missing";
}

function verifyAiSettings() {
  const apiKey = getAiApiKey();
  const baseUrl = getAiBaseUrl();
  const model = getAiModel();
  const availableModels = getAiAvailableModels();
  const resolvedDefault = resolveAiModel();
  const resolvedUnknown = resolveAiModel("not allowed model");

  // 这里只验证配置解析与降级，不发起模型请求；全链路模型连通性由 ChatBox 浏览器回归和 ai-index doctor 分别覆盖。
  assertSmoke(baseUrl.startsWith("http"), "AI_BASE_URL 应解析为 http(s) 地址");
  assertSmoke(!baseUrl.endsWith("/"), "AI_BASE_URL 应去除尾部斜杠，避免拼接 /chat/completions 时双斜杠");
  assertSmoke(model.length > 0, "AI_MODEL 不应为空");
  assertSmoke(availableModels.length > 0, "可用模型清单不应为空");
  assertSmoke(new Set(availableModels).size === availableModels.length, "可用模型清单应去重");
  assertSmoke(resolvedDefault === model, "未指定模型时应回退到默认 AI_MODEL");
  assertSmoke(resolvedUnknown === model, "未知模型应回退到默认 AI_MODEL");
  assertSmoke(isAiAssistantConfigured() === Boolean(apiKey), "AI 配置状态应只由 AI_API_KEY 决定");

  return {
    configured: Boolean(apiKey),
    baseUrl,
    defaultModel: model,
    availableModelCount: availableModels.length
  };
}

function verifyEmailSettings() {
  const settings = getEmailNotificationSettings();
  const status = getEmailStatus();
  let assertMessage = "";

  try {
    assertEmailNotificationConfigured(settings);
    assertSmoke(status === "configured", "邮箱配置校验通过时状态必须是 configured");
  } catch (error) {
    assertMessage = error instanceof Error ? error.message : "邮箱配置校验失败";
    assertSmoke(status !== "configured", "邮箱配置状态为 configured 时不应校验失败");
    assertSmoke(assertMessage.includes("RESEND_API_KEY") || assertMessage.includes("EMAIL_FROM"), "邮箱缺失提示应指向具体环境变量");
  }

  return {
    hasApiKey: Boolean(settings.apiKey),
    hasFrom: Boolean(settings.from),
    hasReplyTo: Boolean(settings.replyTo),
    status,
    assertMessage
  };
}

function verifyKnowledgeSettings() {
  const settings = getKnowledgeSettings();

  // 自动索引 RAG 的外部组件可逐步配置；缺 Redis/Qdrant 时业务写入仍应使用 MySQL fallback 或仅跳过向量写入。
  assertSmoke(settings.embeddingModel.length > 0, "Embedding 模型不应为空");
  assertSmoke(settings.embeddingDimensions > 0, "Embedding 维度必须为正数");
  assertSmoke(settings.rerankModel.length > 0, "Rerank 模型不应为空");
  assertSmoke(settings.qdrantCollection.length > 0, "Qdrant collection 应有默认值");
  assertSmoke(settings.indexQueueName.length > 0, "索引队列名称应有默认值");
  assertSmoke(settings.indexJobLockMs > 0, "索引 job 锁超时必须为正数");

  return {
    embeddingModel: settings.embeddingModel,
    embeddingDimensions: settings.embeddingDimensions,
    qdrantConfigured: Boolean(settings.qdrantUrl),
    qdrantCollection: settings.qdrantCollection,
    redisConfigured: Boolean(settings.redisUrl),
    indexQueueName: settings.indexQueueName
  };
}

function verifyDocumentFallback() {
  const breakdown = createFallbackDocumentTaskBreakdown({
    fileName: "AI PM 需求拆解技术方案.md",
    documentText: [
      "任务：完成登录态过期后的统一跳转和错误提示，必须覆盖权限边界。",
      "待办：开发 Bug 附件上传失败时的可读提示，并补齐测试用例。",
      "测试：确认成员权限、需求创建、Bug 关闭和通知降级的全链路回归。"
    ].join("\n")
  });

  assertSmoke(breakdown.documentType === "技术方案", "文档 fallback 应能从文件名/正文推断技术方案");
  assertSmoke(breakdown.tasks.length >= 6, "文档 fallback 应至少生成前后端测试拆解任务");
  assertSmoke(breakdown.tasks.some((task) => task.title.includes("【前端】")), "文档 fallback 应包含前端任务");
  assertSmoke(breakdown.tasks.some((task) => task.title.includes("【后端】")), "文档 fallback 应包含后端任务");
  assertSmoke(breakdown.tasks.some((task) => task.title.includes("【测试】")), "文档 fallback 应包含测试任务");
  assertSmoke(
    breakdown.tasks.every((task) =>
      typeof task.startDate === "string" &&
      typeof task.dueDate === "string" &&
      task.startDate <= task.dueDate
    ),
    "文档 fallback 任务必须包含开始/截止日期，且开始日期不能晚于截止日期"
  );

  return {
    documentTitle: breakdown.documentTitle,
    documentType: breakdown.documentType,
    taskCount: breakdown.tasks.length,
    firstTask: breakdown.tasks[0]?.title
  };
}

function verifyRequirementFallback() {
  const analysis = createFallbackRequirementAnalysis({
    documentTitle: "Bug 附件上传与通知降级",
    documentText: [
      "本需求需要支持 Bug 上传图片和视频附件，缺少 COS 密钥时显示可读错误。",
      "验收标准：用户未登录返回 401；文件类型错误返回提示；权限不足不能上传。",
      "接口需要校验字段、权限、异常、空状态和边界。"
    ].join("\n"),
    warning: "AI_API_KEY 未配置，已使用本地规则生成需求体检。"
  });

  assertSmoke(analysis.source === "fallback", "需求分析 fallback source 应为 fallback");
  assertSmoke(analysis.title === "Bug 附件上传与通知降级", "需求分析 fallback 标题应保留文档标题");
  assertSmoke(analysis.acceptance.length > 0, "需求分析 fallback 应生成验收标准");
  assertSmoke(analysis.frontendNotes.length > 0, "需求分析 fallback 应生成前端建议");
  assertSmoke(analysis.backendNotes.length > 0, "需求分析 fallback 应生成后端建议");
  assertSmoke(analysis.testingNotes.length > 0, "需求分析 fallback 应生成测试建议");
  assertSmoke(analysis.completenessScore >= 0 && analysis.completenessScore <= 100, "需求完整度分数应在 0-100");
  assertSmoke(Boolean(analysis.warning), "需求分析 fallback 应保留降级 warning");

  return {
    source: analysis.source,
    suggestedPriority: analysis.suggestedPriority,
    suggestedStatus: analysis.suggestedStatus,
    completenessScore: analysis.completenessScore,
    missingItemCount: analysis.missingItems.length
  };
}

function main() {
  const ai = verifyAiSettings();
  const email = verifyEmailSettings();
  const knowledge = verifyKnowledgeSettings();
  const documentFallback = verifyDocumentFallback();
  const requirementFallback = verifyRequirementFallback();
  const cosStatus = getCosStatus();

  assertSmoke(cosStatus !== "partial", "腾讯云 COS 只配置了部分密钥，请同时配置 TENCENT_COS_SECRET_ID 和 TENCENT_COS_SECRET_KEY");

  console.log(JSON.stringify({
    ok: true,
    dependencies: {
      ai,
      cos: {
        status: cosStatus
      },
      email,
      knowledge
    },
    fallbacks: {
      document: documentFallback,
      requirement: requirementFallback
    }
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[full-chain-dependency-fallback-smoke] failed", error);
  process.exitCode = 1;
}
