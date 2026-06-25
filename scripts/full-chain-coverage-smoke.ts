import fs from "node:fs";
import path from "node:path";

type CoverageCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const scriptsDir = path.join(repoRoot, "scripts");
const suitePath = path.join(scriptsDir, "full-chain-smoke-suite.ts");
const packagePath = path.join(repoRoot, "package.json");
const testPlanPath = path.join(repoRoot, "docs/ai-pm-full-chain-test-plan.md");

const requiredPackageScripts = [
  "full-chain:ai-index-admin",
  "full-chain:assistant-chat",
  "full-chain:auth-origin",
  "full-chain:browser",
  "full-chain:browser:login",
  "full-chain:feishu-contact",
  "full-chain:member-management",
  "full-chain:smoke",
  "full-chain:smoke:all",
  "full-chain:smoke:list",
  "full-chain:notification",
  "full-chain:requirement-ai",
  "full-chain:weekly-report",
  "full-chain:workbench-ui"
];

const requiredMatrixIds = [
  "AUTH-001",
  "AUTH-003",
  "AUTH-006",
  "SHELL-001",
  "SHELL-008",
  "OVERVIEW-003",
  "VERSION-005",
  "REQ-005",
  "TASK-001",
  "BUG-004",
  "MEMBER-002",
  "MEMBER-007",
  "PERM-001",
  "AI-002",
  "RAG-001",
  "OPS-004"
];

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): CoverageCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "全链路覆盖清单校验失败"
      },
      name,
      ok: false
    };
  }
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function getFullChainScriptFiles() {
  return fs
    .readdirSync(scriptsDir)
    .filter((fileName) => /^full-chain-.+\.ts$/.test(fileName))
    .filter((fileName) => fileName !== "full-chain-smoke-suite.ts")
    .sort();
}

function verifySuiteRegistration() {
  const suiteText = readText(suitePath);
  const scriptFiles = getFullChainScriptFiles();
  const missingInSuite = scriptFiles.filter((fileName) => !suiteText.includes(`scripts/${fileName}`));
  const ids = [...suiteText.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingGroups = ["all", "auth", "core", "db", "static"].filter((group) => !suiteText.includes(`"${group}"`));

  // 统一 runner 是所有冒烟脚本的调度入口；新增脚本若没有登记，就会变成“看起来有测试，实际从不执行”。
  assertSmoke(!missingInSuite.length, `以下 full-chain 脚本未纳入 suite：${missingInSuite.join(", ")}`);
  assertSmoke(!duplicateIds.length, `suite 中存在重复用例 id：${[...new Set(duplicateIds)].join(", ")}`);
  assertSmoke(!missingGroups.length, `suite 缺少测试分组：${missingGroups.join(", ")}`);

  return {
    registeredScripts: scriptFiles.length,
    suiteCases: ids.length
  };
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText(packagePath)) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};
  const missingScripts = requiredPackageScripts.filter((scriptName) => !scripts[scriptName]);
  const wrongEntrypoints = requiredPackageScripts.filter((scriptName) => {
    const command = scripts[scriptName] ?? "";

    if (scriptName === "full-chain:ai-index-admin") {
      return !command.includes("scripts/full-chain-ai-index-admin-smoke.ts");
    }

    if (scriptName === "full-chain:assistant-chat") {
      return !command.includes("scripts/full-chain-assistant-chat-smoke.ts");
    }

    if (scriptName === "full-chain:auth-origin") {
      return !command.includes("scripts/full-chain-auth-origin-smoke.ts");
    }

    if (scriptName === "full-chain:browser") {
      return !command.includes("scripts/full-chain-browser-smoke.ts");
    }

    if (scriptName === "full-chain:browser:login") {
      return !command.includes("scripts/capture-auth-storage-state.ts");
    }

    if (scriptName === "full-chain:feishu-contact") {
      return !command.includes("scripts/full-chain-feishu-contact-smoke.ts");
    }

    if (scriptName === "full-chain:member-management") {
      return !command.includes("scripts/full-chain-member-management-smoke.ts");
    }

    if (scriptName === "full-chain:notification") {
      return !command.includes("scripts/full-chain-notification-smoke.ts");
    }

    if (scriptName === "full-chain:requirement-ai") {
      return !command.includes("scripts/full-chain-requirement-ai-smoke.ts");
    }

    if (scriptName === "full-chain:weekly-report") {
      return !command.includes("scripts/full-chain-weekly-report-smoke.ts");
    }

    if (scriptName === "full-chain:workbench-ui") {
      return !command.includes("scripts/full-chain-workbench-ui-smoke.ts");
    }

    return !command.includes("scripts/full-chain-smoke-suite.ts");
  });

  // package scripts 是研发和部署最容易复制的入口；这里防止 runner 已存在但没人知道该怎么跑。
  assertSmoke(!missingScripts.length, `package.json 缺少命令：${missingScripts.join(", ")}`);
  assertSmoke(!wrongEntrypoints.length, `package.json 命令入口不正确：${wrongEntrypoints.join(", ")}`);

  return {
    checkedScripts: requiredPackageScripts.length
  };
}

function verifyTestPlanCoverage() {
  const testPlanText = readText(testPlanPath);
  const missingMatrixIds = requiredMatrixIds.filter((id) => !testPlanText.includes(id));
  const scriptFiles = getFullChainScriptFiles();
  const missingScriptMentions = scriptFiles.filter((fileName) => !testPlanText.includes(fileName));

  // 文档矩阵是人工验收范围的锚点，脚本是自动证据；两者必须互相出现，避免只剩命令没有测试意图。
  assertSmoke(!missingMatrixIds.length, `测试矩阵缺少关键用例 ID：${missingMatrixIds.join(", ")}`);
  assertSmoke(!missingScriptMentions.length, `测试计划未记录脚本：${missingScriptMentions.join(", ")}`);

  return {
    checkedMatrixIds: requiredMatrixIds.length,
    documentedScripts: scriptFiles.length
  };
}

function verifyApiRouteCoverage() {
  const testPlanText = readText(testPlanPath);
  const apiRouteDir = path.join(repoRoot, "app/api");
  const apiRoutes = fs
    .readdirSync(apiRouteDir, { recursive: true })
    .filter((entry) => String(entry).endsWith("route.ts"))
    .map((entry) => `/api/${String(entry).replace(/\/route\.ts$/, "").replace(/\\/g, "/")}`)
    .sort();
  const importantRoutes = [
    "/api/assistant",
    "/api/bug-attachments",
    "/api/bug-fix-jobs",
    "/api/dashboard",
    "/api/feishu/users",
    "/api/members",
    "/api/records",
    "/api/workspaces"
  ];
  const missingImportantRoutes = importantRoutes.filter((route) => !testPlanText.includes(route.replace("/api/", "")) && !testPlanText.includes(route));

  // 路由数量变化是系统功能面变化的强信号；这里记录总数，并守住高风险入口在矩阵中有名字可追。
  assertSmoke(!missingImportantRoutes.length, `测试计划缺少重要 API 入口：${missingImportantRoutes.join(", ")}`);

  return {
    apiRouteCount: apiRoutes.length,
    checkedImportantRoutes: importantRoutes.length
  };
}

const results = [
  runCheck("suite registration", verifySuiteRegistration),
  runCheck("package scripts", verifyPackageScripts),
  runCheck("test plan coverage", verifyTestPlanCoverage),
  runCheck("api route coverage", verifyApiRouteCoverage)
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
