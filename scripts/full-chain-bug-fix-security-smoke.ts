import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getPrismaClient } from "@/lib/database/prisma";
import { createMergeRequestBody, createMergeRequestTitle } from "@/lib/bug-fix-jobs/mr-template";
import { parseAiCodeRunnerOutput } from "@/lib/bug-fix-jobs/runner";
import { assertDiffIsAllowed, getDefaultBlockedPaths } from "@/lib/bug-fix-jobs/security";
import {
  createProjectRepository,
  findRepositoryForBug,
  getProjectRepository,
  listProjectRepositories
} from "@/server/repositories/project-repositories";
import type { BugFixCheckResult, BugReport } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";
const repoRoot = process.cwd();
const bugFixJobsRoutePath = path.join(repoRoot, "app/api/bug-fix-jobs/route.ts");
const bugFixJobDetailRoutePath = path.join(repoRoot, "app/api/bug-fix-jobs/[jobId]/route.ts");
const bugFixJobCancelRoutePath = path.join(repoRoot, "app/api/bug-fix-jobs/[jobId]/cancel/route.ts");
const projectRepositoriesRoutePath = path.join(repoRoot, "app/api/project-repositories/route.ts");

// 这个脚本覆盖 Bug AI 修复里“最容易误伤生产代码”的边界：仓库选择、安全白名单、
// Runner 输出和 MR 文案。它只使用本地/数据库内的确定性断言，不调用真实 GitHub 或 AI Runner，
// 这样全链路回归可以高频运行而不会创建外部分支、PR 或消耗模型额度。
function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyProjectRepositoriesApiContracts() {
  const routeText = readFileSync(projectRepositoriesRoutePath, "utf8");

  // 仓库配置接口只需要目标工作区和成员管理权限；如果读取整份 dashboard，
  // 打开 AI 修复抽屉的仓库下拉和保存仓库配置都会被项目/任务/Bug/需求数据拖慢。
  assertSmoke(!routeText.includes("getDashboardData"), "项目仓库 API 不应读取整份 dashboard。");
  assertSmoke(routeText.includes("getWorkspaceAccessContext(session?.user, workspaceId)"), "项目仓库列表缺少轻量工作区上下文。");
  assertSmoke(routeText.includes("getWorkspaceAccessContext(session?.user, body.workspaceId)"), "项目仓库创建缺少轻量权限上下文。");
  assertSmoke(routeText.includes("workspaceId: accessContext.currentWorkspace.id"), "项目仓库创建没有使用轻量上下文解析后的工作区。");
}

function verifyBugFixJobsApiContracts() {
  const routeText = readFileSync(bugFixJobsRoutePath, "utf8");
  const detailRouteText = readFileSync(bugFixJobDetailRoutePath, "utf8");
  const cancelRouteText = readFileSync(bugFixJobCancelRoutePath, "utf8");
  const combinedRouteText = [routeText, detailRouteText, cancelRouteText].join("\n");

  // AI 修复任务接口只需要工作区权限、单个 Bug 和 job 记录；禁止回退到完整 dashboard 读取。
  assertSmoke(!combinedRouteText.includes("getDashboardData"), "AI 修复任务 API 不应读取整份 dashboard。");
  assertSmoke(routeText.includes("getWorkspaceAccessContext(session?.user, workspaceId)"), "AI 修复任务列表缺少轻量工作区上下文。");
  assertSmoke(routeText.includes("getWorkspaceAccessContext(session?.user, body.workspaceId)"), "AI 修复任务创建缺少轻量权限上下文。");
  assertSmoke(routeText.includes("getDashboardBugById(body.bugId)"), "AI 修复任务创建应单独读取目标 Bug。");
  assertSmoke(detailRouteText.includes("getWorkspaceAccessContext(session?.user, workspaceId)"), "AI 修复任务详情缺少轻量工作区上下文。");
  assertSmoke(cancelRouteText.includes("getWorkspaceAccessContext(session?.user, existingJob.workspaceId)"), "AI 修复任务取消应按 job 所属工作区校验权限。");
}

// 仓库匹配需要依赖真实项目名称；这里读取当前工作区第一个项目，避免用假项目名导致
// `findRepositoryForBug` 只能测到 fallback 分支，漏掉项目专属仓库优先级。
async function getWorkspaceProject() {
  const prisma = getPrismaClient();
  const project = await prisma.project.findFirst({
    where: {
      workspaceId: WORKSPACE_ID
    },
    orderBy: {
      name: "asc"
    },
    select: {
      id: true,
      name: true
    }
  });

  assertSmoke(project, `工作区 ${WORKSPACE_ID} 缺少项目，无法验证仓库匹配`);
  return project;
}

async function cleanupRepositories(runLabel: string) {
  const prisma = getPrismaClient();

  // 仓库配置冒烟会真实写入 project_repositories；清理只按本轮 runLabel 的 repoFullName 删除，
  // 避免误删用户已经配置好的生产仓库白名单。
  await prisma.projectRepository.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      repoFullName: {
        contains: runLabel
      }
    }
  });
}

// 真实写入 project_repositories 后再回读/匹配，能覆盖 Prisma mapper、JSON 数组字段和禁用过滤。
// 测试仓库名带 runLabel，finally 只按本轮标记清理，保护用户已经配置好的真实仓库白名单。
async function verifyRepositoryLifecycle(runLabel: string) {
  const prisma = getPrismaClient();
  const project = await getWorkspaceProject();
  const fallbackRepository = await createProjectRepository({
    workspaceId: WORKSPACE_ID,
    repoFullName: `codex/${runLabel}-fallback`,
    cloneUrl: `https://github.com/codex/${runLabel}-fallback.git`,
    allowedPaths: ["src/**", "app/**", "package.json"],
    blockedPaths: ["src/legacy/**"],
    defaultReviewers: ["reviewer-a", "reviewer-b"]
  });
  const projectRepository = await createProjectRepository({
    workspaceId: WORKSPACE_ID,
    projectId: project.id,
    provider: "github",
    repoFullName: `codex/${runLabel}-project`,
    cloneUrl: `https://github.com/codex/${runLabel}-project.git`,
    defaultBranch: "release/qa",
    packageManager: "npm",
    installCommand: "npm ci",
    lintCommand: "npm run lint",
    testCommand: "npm test",
    buildCommand: "npm run build",
    allowedPaths: ["src/components/**", "app/api/**"],
    blockedPaths: ["app/api/auth/**"],
    defaultReviewers: ["qa-reviewer"]
  });

  assertSmoke(fallbackRepository.provider === "github", "仓库 provider 应默认 github");
  assertSmoke(fallbackRepository.defaultBranch === "main", "默认分支应回退 main");
  assertSmoke(fallbackRepository.packageManager === "pnpm", "默认包管理器应回退 pnpm");
  assertSmoke(fallbackRepository.installCommand === "pnpm install", "默认安装命令应回退 pnpm install");
  assertSmoke(fallbackRepository.allowedPaths.includes("src/**"), "allowedPaths 应按 string[] 返回");
  assertSmoke(fallbackRepository.defaultReviewers.length === 2, "defaultReviewers 应按 string[] 返回");

  assertSmoke(projectRepository.projectId === project.id, "项目仓库应绑定目标项目");
  assertSmoke(projectRepository.defaultBranch === "release/qa", "仓库应保留自定义默认分支");
  assertSmoke(projectRepository.lintCommand === "npm run lint", "仓库应保留 lint 命令");

  const listed = await listProjectRepositories(WORKSPACE_ID);

  assertSmoke(listed.some((repository) => repository.id === fallbackRepository.id), "列表应包含 active fallback 仓库");
  assertSmoke(listed.some((repository) => repository.id === projectRepository.id), "列表应包含 active 项目仓库");

  const fetched = await getProjectRepository(projectRepository.id);

  assertSmoke(fetched?.repoFullName === projectRepository.repoFullName, "getProjectRepository 应能恢复仓库详情");

  const matchedProjectRepository = await findRepositoryForBug(WORKSPACE_ID, project.name);

  assertSmoke(matchedProjectRepository?.id === projectRepository.id, "有项目绑定时应优先匹配项目仓库");

  await prisma.projectRepository.update({
    where: {
      id: projectRepository.id
    },
    data: {
      status: "disabled"
    }
  });

  const matchedFallbackRepository = await findRepositoryForBug(WORKSPACE_ID, project.name);
  const listedAfterDisabled = await listProjectRepositories(WORKSPACE_ID);

  assertSmoke(matchedFallbackRepository?.id === fallbackRepository.id, "项目仓库禁用后应回退工作区默认仓库");
  assertSmoke(!listedAfterDisabled.some((repository) => repository.id === projectRepository.id), "禁用仓库不应出现在 active 列表");

  return {
    fallbackRepository: {
      allowedPaths: fallbackRepository.allowedPaths,
      defaultBranch: fallbackRepository.defaultBranch,
      id: fallbackRepository.id,
      packageManager: fallbackRepository.packageManager
    },
    projectName: project.name,
    projectRepository: {
      defaultBranch: projectRepository.defaultBranch,
      id: projectRepository.id,
      lintCommand: projectRepository.lintCommand
    }
  };
}

// 安全检查的失败文案会直接进入 job 日志和用户排障路径；这里不仅要求抛错，
// 也要求错误包含关键原因，避免后续重构把“禁止路径/超限”等信号吞成泛化失败。
function expectSecurityError(action: () => void, messagePart: string) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    assertSmoke(message.includes(messagePart), `安全错误应包含：${messagePart}`);
    return message;
  }

  throw new Error(`预期安全检查失败：${messagePart}`);
}

// AI Runner 产出的 diff 是自动改代码链路的最后防线：允许路径、禁止路径、文件数和行数都必须
// 在创建 PR 前被强制校验，尤其是 auth、部署和密钥文件这类高风险区域。
function verifyDiffSecurity() {
  const blockedPaths = [...getDefaultBlockedPaths(), "src/generated/**"];

  assertDiffIsAllowed({
    allowedPaths: ["src/components/**", "app/api/**", "package.json"],
    blockedPaths,
    changedFiles: ["src/components/bug-card/index.tsx", "app/api/records/route.ts"],
    maxChangedFiles: 5,
    maxDiffLines: 200,
    totalDiffLines: 80
  });

  const emptyError = expectSecurityError(() => {
    assertDiffIsAllowed({
      allowedPaths: ["src/**"],
      blockedPaths,
      changedFiles: [],
      maxChangedFiles: 5
    });
  }, "未产生代码变更");
  const tooManyFilesError = expectSecurityError(() => {
    assertDiffIsAllowed({
      allowedPaths: ["src/**"],
      blockedPaths,
      changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
      maxChangedFiles: 2
    });
  }, "超过限制");
  const tooManyLinesError = expectSecurityError(() => {
    assertDiffIsAllowed({
      allowedPaths: ["src/**"],
      blockedPaths,
      changedFiles: ["src/a.ts"],
      maxChangedFiles: 5,
      maxDiffLines: 10,
      totalDiffLines: 11
    });
  }, "改动行数");
  const blockedPathError = expectSecurityError(() => {
    assertDiffIsAllowed({
      allowedPaths: ["src/**", "deploy/**"],
      blockedPaths,
      changedFiles: ["deploy/docker/Dockerfile"],
      maxChangedFiles: 5
    });
  }, "禁止路径");
  const disallowedPathError = expectSecurityError(() => {
    assertDiffIsAllowed({
      allowedPaths: ["src/components/**"],
      blockedPaths,
      changedFiles: ["src/lib/auth/server.ts"],
      maxChangedFiles: 5
    });
  }, "不在允许范围");
  const pemBlockedError = expectSecurityError(() => {
    assertDiffIsAllowed({
      allowedPaths: ["secrets/**"],
      blockedPaths,
      changedFiles: ["secrets/private.pem"],
      maxChangedFiles: 5
    });
  }, "禁止路径");

  return {
    allowed: true,
    errors: {
      blockedPathError,
      disallowedPathError,
      emptyError,
      pemBlockedError,
      tooManyFilesError,
      tooManyLinesError
    }
  };
}

// MR 模板只需要一个最小 Bug 快照即可验证文案结构；不复用真实 Bug，避免脚本因为线上数据变化
// 让标题、负责人或复现步骤断言变得不稳定。
function createBugForTemplate(): BugReport {
  return {
    id: "bug-security-smoke",
    title: "登录后附件上传失败",
    status: "定位中",
    severity: "严重",
    project: "AI PM",
    reporter: "QA",
    owner: "西洲",
    environment: "Chrome / 本地",
    reproduction: "1. 登录\n2. 上传附件\n3. 观察错误",
    expected: "附件上传成功",
    actual: "上传失败",
    createdAt: "2026-06-25T02:00:00.000Z"
  };
}

// Runner 输出既可能是约定 JSON，也可能混有普通日志；解析器必须保留可追踪摘要，
// 但不能在非 JSON 场景伪造 changedFiles，否则后续安全检查会失去依据。
function verifyRunnerAndMrTemplate() {
  const structured = parseAiCodeRunnerOutput([
    "runner log line",
    JSON.stringify({
      summary: "修复附件上传错误提示",
      changedFiles: ["src/lib/bug-attachments/cos.ts"],
      riskNotes: ["需要人工确认 COS 权限"]
    })
  ].join("\n"));
  const fallback = parseAiCodeRunnerOutput("plain runner output without json");
  const bug = createBugForTemplate();
  const checks: BugFixCheckResult[] = [
    {
      id: "check-lint",
      jobId: "job-security-smoke",
      name: "lint",
      command: "pnpm lint",
      status: "passed",
      createdAt: "2026-06-25T02:00:00.000Z"
    },
    {
      id: "check-test",
      jobId: "job-security-smoke",
      name: "test",
      command: "pnpm test",
      status: "skipped",
      createdAt: "2026-06-25T02:00:00.000Z"
    }
  ];
  const title = createMergeRequestTitle(bug);
  const body = createMergeRequestBody({
    bug,
    changedFiles: structured.changedFiles,
    checks,
    riskNotes: structured.riskNotes,
    summary: structured.summary
  });

  assertSmoke(structured.summary === "修复附件上传错误提示", "Runner 结构化输出应解析 summary");
  assertSmoke(structured.changedFiles[0] === "src/lib/bug-attachments/cos.ts", "Runner 结构化输出应解析 changedFiles");
  assertSmoke(structured.riskNotes[0] === "需要人工确认 COS 权限", "Runner 结构化输出应解析 riskNotes");
  assertSmoke(fallback.summary.includes("plain runner output"), "Runner 非 JSON 输出应进入摘要 fallback");
  assertSmoke(fallback.changedFiles.length === 0, "Runner 非 JSON 输出不应伪造 changedFiles");
  assertSmoke(title === "fix: 修复 登录后附件上传失败", "MR 标题应包含 Bug 标题");
  assertSmoke(body.includes("## Bug"), "MR body 应包含 Bug 区块");
  assertSmoke(body.includes("通过：pnpm lint"), "MR body 应包含校验结果");
  assertSmoke(body.includes("需要人工确认 COS 权限"), "MR body 应包含风险提示");

  return {
    fallbackSummaryLength: fallback.summary.length,
    mrTitle: title,
    structured
  };
}

// 主流程刻意先清理同名 runLabel，再执行测试，finally 再清理一次；这样即使上一次脚本被中断，
// 本轮也不会被残留仓库配置干扰，数据库连接也会显式释放，避免 tsx 进程挂住。
async function main() {
  verifyProjectRepositoriesApiContracts();
  verifyBugFixJobsApiContracts();

  const runLabel = `bugfix-security-e2e-${Date.now()}`;
  const prisma = getPrismaClient();

  await cleanupRepositories(runLabel);

  try {
    const repositories = await verifyRepositoryLifecycle(runLabel);
    const security = verifyDiffSecurity();
    const runnerAndMr = verifyRunnerAndMrTemplate();

    console.log(JSON.stringify({
      ok: true,
      repositories,
      runnerAndMr,
      security
    }, null, 2));
  } finally {
    await cleanupRepositories(runLabel);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[full-chain-bug-fix-security-smoke] failed", error);
  process.exitCode = 1;
});
