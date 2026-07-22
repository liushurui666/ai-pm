import fs from "node:fs";
import path from "node:path";
import { createFallbackDocumentTaskBreakdown } from "@/lib/documents/breakdown";

type DocumentBreakdownCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const routePath = path.join(repoRoot, "app/api/documents/analyze/route.ts");
const fallbackPath = path.join(repoRoot, "src/lib/documents/breakdown.ts");
const platformPath = path.join(repoRoot, "src/components/project-management-platform/index.tsx");
const drawerPath = path.join(repoRoot, "src/components/project-management-platform/forms/document-breakdown-drawer/index.tsx");
const formUtilsPath = path.join(repoRoot, "src/components/project-management-platform/forms/form-utils.ts");
const updatesPath = path.join(repoRoot, "src/components/project-management-platform/state/dashboard-updates.ts");

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): DocumentBreakdownCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "文档拆任务冒烟失败"
      },
      name,
      ok: false
    };
  }
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function verifyFallbackBreakdown() {
  const breakdown = createFallbackDocumentTaskBreakdown({
    fileName: "登录态过期技术方案.md",
    documentText: [
      "必须完成登录态过期后的统一跳转、权限校验、错误提示和日志记录。",
      "前端需要设计页面状态，后端需要提供接口，测试需要覆盖主流程和边界。",
      "2026-06-30 前完成上线评审。"
    ].join("\n")
  });
  const emptyBreakdown = createFallbackDocumentTaskBreakdown({
    fileName: "空白需求.txt",
    documentText: ""
  });
  const roles = new Set(breakdown.tasks.map((task) => task.title.match(/^【(.+?)】/)?.[1]).filter(Boolean));

  // 本地 fallback 是 AI 未配置或模型失败时的兜底拆解结果，必须能稳定产出前端/后端/测试三类可执行任务。
  assertSmoke(breakdown.documentTitle === "登录态过期技术方案", "fallback 文档标题没有去掉扩展名。");
  assertSmoke(breakdown.documentType === "技术方案", "fallback 未根据内容识别技术方案类型。");
  assertSmoke(breakdown.tasks.length >= 3, "fallback 至少应拆出前端/后端/测试任务。");
  assertSmoke(roles.has("前端") && roles.has("后端") && roles.has("测试"), "fallback 未覆盖前端/后端/测试角色任务。");
  assertSmoke(breakdown.tasks.every((task) => ["紧急", "高", "普通", "低"].includes(task.priority)), "fallback 任务优先级不合法。");
  assertSmoke(breakdown.tasks.every((task) => task.dueDate && task.aiHint), "fallback 任务缺少截止日期或 AI 提示。");
  assertSmoke(emptyBreakdown.tasks.length >= 3, "空文档 fallback 仍应生成兜底任务。");
  assertSmoke(emptyBreakdown.tasks.every((task) => task.priority === "普通"), "空文档 fallback 新写入应统一使用“普通”。");

  return {
    emptyTaskCount: emptyBreakdown.tasks.length,
    taskCount: breakdown.tasks.length,
    type: breakdown.documentType
  };
}

function verifyRouteContract() {
  const routeText = readText(routePath);

  // 文档拆任务会上传文件并批量写入任务，必须先校验登录、文件、目标版本和正文边界，再进入 AI/fallback。
  assertSmoke(routeText.includes("const configured = isAuthServiceConfigured()") && routeText.includes("configured && !session"), "文档拆解接口缺少登录保护。");
  assertSmoke(routeText.includes("MAX_UPLOAD_SIZE = 4 * 1024 * 1024"), "文档拆解接口缺少 4MB 上传限制。");
  assertSmoke(routeText.includes("MAX_TEXT_LENGTH = 30_000"), "文档拆解接口缺少正文截断上限。");
  assertSmoke(routeText.includes("请上传需要拆解的文档"), "文档拆解接口缺少文件必填校验。");
  assertSmoke(routeText.includes("请选择文档拆解的目标版本"), "文档拆解接口缺少目标版本必填校验。");
  assertSmoke(routeText.includes("文档内容过少，无法拆解任务"), "文档拆解接口缺少短正文保护。");
  assertSmoke(routeText.includes("暂支持 .docx、.txt、.md、.csv、.json 文档"), "文档拆解接口缺少文件类型白名单。");
  assertSmoke(routeText.includes("mammoth.extractRawText"), "文档拆解接口缺少 docx 解析能力。");
  assertSmoke(routeText.includes("getDashboardData(session?.user, workspaceId || undefined)"), "文档拆解接口没有按会话和工作区读取数据。");
  assertSmoke(routeText.includes("resolveBreakdownVersion"), "文档拆解接口没有服务端解析目标版本。");
  assertSmoke(routeText.includes("目标版本不存在或不属于当前工作区"), "文档拆解接口缺少跨工作区版本防护。");
  assertSmoke(routeText.includes("getFallbackOwner(formData)"), "文档拆解接口没有读取默认负责人。");
  assertSmoke(routeText.includes("hasFallbackOwner(fallbackOwner)"), "默认负责人没有覆盖 AI 识别负责人。");
  assertSmoke(routeText.includes("findMatchedOwner(task.owner"), "文档拆解接口没有按 AI 识别 owner 匹配成员。");
  assertSmoke(routeText.includes("!isAiAssistantConfigured()"), "文档拆解接口缺少 AI 未配置 fallback。");
  assertSmoke(routeText.includes("createFallbackDocumentTaskBreakdown"), "文档拆解接口缺少本地 fallback。");
  assertSmoke(routeText.includes("ensureUsefulBreakdown"), "文档拆解接口缺少空任务兜底。");
  assertSmoke(routeText.includes("createDashboardRecord(\n      \"document\""), "文档拆解接口没有创建文档记录。");
  assertSmoke(routeText.includes("createDashboardRecord(\n        \"task\""), "文档拆解接口没有创建任务记录。");
  assertSmoke(routeText.includes("versionId: targetVersion.versionId"), "文档拆解任务没有写入 versionId。");
  assertSmoke(routeText.includes("versionName: targetVersion.versionName"), "文档拆解任务没有写入 versionName。");
  assertSmoke(routeText.includes("project: targetVersion.projectName"), "文档拆解任务没有使用目标版本项目。");
  assertSmoke(routeText.includes("status: error instanceof DocumentAnalyzeInputError ? 400 : 502"), "文档拆解接口没有区分用户输入错误和外部失败。");

  return {
    authProtected: true,
    fallback: true,
    ownerOverride: true,
    versionScoped: true
  };
}

function verifyFrontendContract() {
  const routeText = readText(routePath);
  const drawerText = readText(drawerPath);
  const platformText = readText(platformPath);
  const formUtilsText = readText(formUtilsPath);
  const updatesText = readText(updatesPath);
  const expectedFormKeys = [
    "project",
    "versionId",
    "versionName",
    "owner",
    "ownerMemberId",
    "ownerOpenId",
    "ownerUnionId",
    "ownerUserId",
    "ownerEmail",
    "ownerAvatarUrl"
  ];
  const missingFormKeys = expectedFormKeys.filter((key) => !platformText.includes(`"${key}"`));

  // 抽屉层必须以版本为唯一目标上下文，项目字段只隐藏同步；默认负责人用于统一覆盖本次生成任务。
  assertSmoke(drawerText.includes("按版本拆任务"), "文档拆解抽屉标题缺少版本语义。");
  assertSmoke(drawerText.includes("VersionOnlyField"), "文档拆解抽屉没有使用目标版本字段。");
  assertSmoke(drawerText.includes("versionMessage=\"请选择文档拆解的目标版本\""), "文档拆解抽屉缺少版本必填文案。");
  assertSmoke(drawerText.includes("OwnerSelect"), "文档拆解抽屉缺少默认负责人选择。");
  assertSmoke(drawerText.includes("required={false}"), "默认负责人应为可选。");
  assertSmoke(drawerText.includes("accept=\".docx,.txt,.md,.markdown,.csv,.json\""), "文档上传类型白名单缺失。");
  assertSmoke(drawerText.includes("beforeUpload={() => false}"), "文档上传不应自动上传，应由 FormData 提交。");
  assertSmoke(drawerText.includes("maxCount={1}"), "文档拆解只应接受单文件。");
  assertSmoke(drawerText.includes("AI 拆解并入库"), "文档拆解提交按钮文案缺失。");

  // 主容器提交时必须把文件、工作区、版本和负责人身份字段一起传给 API，成功后任务看板立即可见。
  assertSmoke(platformText.includes("const file = getSelectedUploadFile(values.fileList)"), "文档拆解提交没有取原始 File。");
  assertSmoke(platformText.includes("请先上传要拆解的文档"), "文档拆解提交缺少无文件提示。");
  assertSmoke(platformText.includes("formData.append(\"file\", file)"), "文档拆解提交没有追加文件。");
  assertSmoke(platformText.includes("formData.append(\"workspaceId\", currentWorkspaceId)"), "文档拆解提交没有追加 workspaceId。");
  assertSmoke(!missingFormKeys.length, `文档拆解提交缺少 FormData 字段：${missingFormKeys.join(", ")}`);
  assertSmoke(platformText.includes("fetchWithAuthRedirect(\"/api/documents/analyze\""), "文档拆解没有调用专用接口。");
  assertSmoke(platformText.includes("updateDashboardWithDocumentAnalysis"), "文档拆解成功后没有更新本地 dashboard。");
  assertSmoke(platformText.includes("switchView(\"tasks\")"), "文档拆解成功后没有跳转任务看板。");
  assertSmoke(platformText.includes("payload.source === \"ai\""), "文档拆解没有区分 AI 和 fallback 成功提示。");
  assertSmoke(platformText.includes("payload.warning"), "文档拆解没有展示 fallback warning。");
  assertSmoke(platformText.includes("openVersionBreakdownDrawer(version"), "版本详情/卡片入口没有传入版本上下文。");
  assertSmoke(platformText.includes("versionId: version.id"), "版本拆任务入口没有预填 versionId。");
  assertSmoke(platformText.includes("project: version.project === \"跨项目\" ? undefined : version.project"), "版本拆任务入口没有隐藏同步项目。");
  assertSmoke(routeText.includes("entityType: \"requirementVersion\""), "版本拆解仍错误复用普通 task:create 权限。");
  assertSmoke(routeText.includes("action: \"update\""), "版本拆解没有复用 canUpdateVersion 权限口径。");
  assertSmoke(routeText.includes("ownerMemberId: targetVersion.ownerMemberId"), "版本拆解没有把总体负责人纳入授权。");
  assertSmoke(routeText.includes("if (!breakdownAuthorization.allowed)"), "版本拆解缺少无权拒绝分支。");

  // Form 工具和本地状态更新负责让上传值可提交、生成任务即时进入看板并触发指标刷新。
  assertSmoke(formUtilsText.includes("getSelectedUploadFile"), "表单工具缺少文件提取函数。");
  assertSmoke(formUtilsText.includes("file instanceof File"), "文件提取函数没有校验原始 File。");
  assertSmoke(updatesText.includes("tasks: [...result.tasks, ...data.tasks]"), "文档拆解结果没有把新任务插入任务列表。");
  assertSmoke(updatesText.includes("documents: [result.document, ...data.documents]"), "文档拆解结果没有把新文档插入文档列表。");
  assertSmoke(updatesText.includes("nextData.metrics = recalculateMetrics(nextData)"), "文档拆解结果没有刷新指标。");

  return {
    formDataFields: expectedFormKeys.length,
    uploadsSingleFile: true,
    updatesDashboard: true
  };
}

function verifyFallbackImplementationContract() {
  const fallbackText = readText(fallbackPath);

  // fallback 规则本身也要有数量上限和语义信号，避免长文档生成过多任务或空文档没有可执行结果。
  assertSmoke(fallbackText.includes("FALLBACK_TASK_LIMIT = 24"), "文档 fallback 缺少任务数量上限。");
  assertSmoke(fallbackText.includes("taskSignals"), "文档 fallback 缺少任务信号词过滤。");
  assertSmoke(fallbackText.includes("createRoleTasks"), "文档 fallback 缺少按角色拆分任务。");
  assertSmoke(fallbackText.includes("【前端】"), "文档 fallback 缺少前端任务。");
  assertSmoke(fallbackText.includes("【后端】"), "文档 fallback 缺少后端任务。");
  assertSmoke(fallbackText.includes("【测试】"), "文档 fallback 缺少测试任务。");
  assertSmoke(fallbackText.includes("sourceLines"), "文档 fallback 缺少空文本兜底行。");

  return {
    fallbackLimit: 24,
    roleTasks: 3
  };
}

const results = [
  runCheck("fallback breakdown", verifyFallbackBreakdown),
  runCheck("route contract", verifyRouteContract),
  runCheck("frontend contract", verifyFrontendContract),
  runCheck("fallback implementation contract", verifyFallbackImplementationContract)
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
