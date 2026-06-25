import fs from "node:fs";
import path from "node:path";
import { createFallbackRequirementAnalysis } from "@/lib/ai/client";
import { parseFeishuDocumentLink } from "@/lib/requirements/feishu-document";

type RequirementAiCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const routePath = path.join(repoRoot, "app/api/requirements/analyze-link/route.ts");
const analyzerPath = path.join(repoRoot, "src/components/project-management-platform/requirements/requirement-ai-link-analyzer/index.tsx");

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): RequirementAiCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "需求飞书链接分析冒烟失败"
      },
      name,
      ok: false
    };
  }
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function expectError(fn: () => unknown, expectedText: string) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    assertSmoke(message.includes(expectedText), `错误信息应包含 ${expectedText}，实际为：${message}`);

    return message;
  }

  throw new Error(`预期抛出错误：${expectedText}`);
}

function verifyFeishuLinkParser() {
  const docx = parseFeishuDocumentLink("https://abc.feishu.cn/docx/DocToken123?from=from_copylink");
  const wiki = parseFeishuDocumentLink("https://abc.feishu.cn/wiki/WikiToken456");
  const lark = parseFeishuDocumentLink("https://abc.larksuite.com/docx/LarkToken789");
  const oldDoc = parseFeishuDocumentLink("https://abc.feishu.cn/doc/OldDocToken");
  const errors = {
    invalidUrl: expectError(() => parseFeishuDocumentLink("not-a-url"), "请输入完整的飞书文档链接"),
    unsupportedHost: expectError(() => parseFeishuDocumentLink("https://example.com/docx/Token"), "仅支持飞书/Lark"),
    unsupportedType: expectError(() => parseFeishuDocumentLink("https://abc.feishu.cn/sheets/SheetToken"), "新版文档 docx 和知识库 wiki")
  };

  // 链接解析是飞书体检的第一道用户输入边界；这里覆盖 docx/wiki/Lark 和常见错误，避免接口把无效链接打到飞书 API。
  assertSmoke(docx.type === "docx" && docx.token === "DocToken123", "docx 链接解析失败。");
  assertSmoke(wiki.type === "wiki" && wiki.token === "WikiToken456", "wiki 链接解析失败。");
  assertSmoke(lark.type === "docx" && lark.token === "LarkToken789", "Lark 链接解析失败。");
  assertSmoke(oldDoc.type === "doc" && oldDoc.token === "OldDocToken", "旧版 doc 链接应先解析为 doc 类型，再由读取阶段给出升级提示。");

  return {
    docx,
    errors,
    lark,
    oldDoc,
    wiki
  };
}

function verifyFallbackRequirementAnalysis() {
  const richAnalysis = createFallbackRequirementAnalysis({
    documentTitle: "登录态过期需求",
    documentText: [
      "用户在登录态过期后访问工作台，需要跳转登录并保留回跳地址。",
      "UI 需要展示明确提示，Figma 原型已给出空状态和错误态。",
      "接口需要校验权限、记录日志，并覆盖成功、失败、边界条件和验收标准。",
      "异常场景包括网络失败、权限不足、空状态和重复提交。"
    ].join("\n")
  });
  const thinAnalysis = createFallbackRequirementAnalysis({
    documentTitle: "一句话需求",
    documentText: "做一个入口。",
    warning: "AI_API_KEY 未配置，已使用本地规则生成需求体检。"
  });

  // fallback 会在 AI 未配置或模型失败时直接回填表单；它必须输出完整结构，而不是只给一段摘要。
  assertSmoke(richAnalysis.source === "fallback", "本地需求体检 source 应为 fallback。");
  assertSmoke(richAnalysis.suggestedStatus === "待排期", "信息完整的需求应建议进入待排期。");
  assertSmoke(richAnalysis.missingItems.length === 0, "信息完整需求不应产生缺失项。");
  assertSmoke(richAnalysis.completenessScore >= 90, "信息完整需求完整度应较高。");
  assertSmoke(thinAnalysis.missingItems.length >= 3, "信息不足需求应列出多个缺失项。");
  assertSmoke(thinAnalysis.suggestedStatus === "待评审", "信息不足需求应回到待评审。");
  assertSmoke(thinAnalysis.warning?.includes("AI_API_KEY"), "fallback warning 应透传给前端。");
  assertSmoke(thinAnalysis.acceptance.includes("产品补齐可量化验收标准"), "fallback 应补齐可执行验收标准。");
  assertSmoke(thinAnalysis.frontendNotes.length > 0 && thinAnalysis.backendNotes.length > 0 && thinAnalysis.testingNotes.length > 0, "fallback 应输出前后端和测试关注点。");

  return {
    rich: {
      completenessScore: richAnalysis.completenessScore,
      missingItems: richAnalysis.missingItems.length,
      status: richAnalysis.suggestedStatus
    },
    thin: {
      completenessScore: thinAnalysis.completenessScore,
      missingItems: thinAnalysis.missingItems.length,
      status: thinAnalysis.suggestedStatus,
      warning: thinAnalysis.warning
    }
  };
}

function verifyRouteContract() {
  const routeText = readText(routePath);

  // API route 负责登录保护、飞书文档读取和 AI 失败兜底；这些契约缺一项都会让需求创建抽屉不可用或用户拿到空分析。
  assertSmoke(routeText.includes("isAuthServiceConfigured() && !session"), "需求链接分析接口缺少登录保护。");
  assertSmoke(routeText.includes("请先填写飞书需求文档链接"), "需求链接分析接口缺少空链接 400。");
  assertSmoke(routeText.includes("readFeishuDocumentFromLink(documentLink)"), "需求链接分析接口未读取飞书文档。");
  assertSmoke(routeText.includes("MAX_REQUIREMENT_TEXT_LENGTH"), "需求链接分析接口缺少正文长度保护。");
  assertSmoke(routeText.includes("documentText.length < 20"), "需求链接分析接口缺少短正文保护。");
  assertSmoke(routeText.includes("!isAiAssistantConfigured()"), "需求链接分析接口缺少 AI 未配置 fallback。");
  assertSmoke(routeText.includes("createFallbackRequirementAnalysis"), "需求链接分析接口缺少本地规则兜底。");
  assertSmoke(routeText.includes("AI 模型调用失败，已使用本地规则生成需求体检"), "需求链接分析接口缺少模型失败 warning。");
  assertSmoke(routeText.includes("旧版"), "需求链接分析接口缺少旧版文档用户错误识别。");
  assertSmoke(routeText.includes("status: isUserInputError ? 400 : 502"), "需求链接分析接口缺少用户输入错误和外部错误的状态区分。");

  return {
    aiFallback: true,
    authProtected: true,
    feishuRead: true,
    userErrorStatus: true
  };
}

function verifyAnalyzerUiContract() {
  const analyzerText = readText(analyzerPath);
  const requiredFormFields = [
    "title",
    "priority",
    "status",
    "acceptance",
    "aiSummary",
    "aiRisks",
    "aiMissingItems",
    "aiFrontendNotes",
    "aiBackendNotes",
    "aiTestingNotes",
    "aiCompletenessScore"
  ];
  const missingFields = requiredFormFields.filter((field) => !analyzerText.includes(`${field}:`));

  // 前端组件必须把分析结果直接写回需求表单的结构化字段，否则后续保存和需求完整度评分拿不到 AI 体检结果。
  assertSmoke(analyzerText.includes("form.validateFields([\"documentLink\"]"), "需求体检按钮应先校验 documentLink。");
  assertSmoke(analyzerText.includes("/api/requirements/analyze-link"), "需求体检组件未调用专用接口。");
  assertSmoke(analyzerText.includes("fetchWithAuthRedirect"), "需求体检请求未走统一认证跳转封装。");
  assertSmoke(analyzerText.includes("JSON.stringify(analysisPayload.risks)"), "风险列表应序列化回隐藏字段。");
  assertSmoke(!missingFields.length, `需求体检结果未写回字段：${missingFields.join(", ")}`);
  assertSmoke(analyzerText.includes("analysisPayload.warning"), "需求体检组件未展示 fallback warning。");
  assertSmoke(analyzerText.includes("Progress"), "需求体检组件缺少完整度进度展示。");
  assertSmoke(analyzerText.includes("completenessScore >= 80 ? \"success\" : \"active\""), "需求完整度进度状态契约缺失。");

  return {
    formFields: requiredFormFields.length,
    usesAuthFetch: true,
    warningVisible: true
  };
}

const results = [
  runCheck("feishu link parser", verifyFeishuLinkParser),
  runCheck("fallback requirement analysis", verifyFallbackRequirementAnalysis),
  runCheck("route contract", verifyRouteContract),
  runCheck("analyzer ui contract", verifyAnalyzerUiContract)
];
const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  checked: results.length,
  failed: failed.length,
  results
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
