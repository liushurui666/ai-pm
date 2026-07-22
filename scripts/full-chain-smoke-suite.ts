import { spawn } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";

type SmokeGroup = "all" | "auth" | "core" | "db" | "static";

type SmokeCase = {
  description: string;
  env?: NodeJS.ProcessEnv;
  groups: SmokeGroup[];
  id: string;
  script: string;
  timeoutMs: number;
};

type RunResult = {
  durationMs: number;
  exitCode: number | null;
  id: string;
  ok: boolean;
  script: string;
  signal: NodeJS.Signals | null;
};

const smokeCases: SmokeCase[] = [
  {
    description: "未登录页面跳转与业务 API 401 保护；需要本地 Web 服务可访问。",
    groups: ["all", "auth", "core"],
    id: "auth",
    script: "scripts/full-chain-auth-smoke.ts",
    timeoutMs: 90_000
  },
  {
    description: "localhost/127.0.0.1 登录页与 redirect_uri origin 一致性。",
    groups: ["all", "auth", "core"],
    id: "auth-origin",
    script: "scripts/full-chain-auth-origin-smoke.ts",
    timeoutMs: 90_000
  },
  {
    description: "真实 Chromium 登录页、未登录跳转、移动端登录页；提供 storageState 时覆盖已登录一级视图。",
    groups: ["all", "auth", "core"],
    id: "browser",
    script: "scripts/full-chain-browser-smoke.ts",
    timeoutMs: 120_000
  },
  {
    description: "工作台 Shell 视图枚举、导航、账号、搜索、日程和主题切换契约。",
    groups: ["all", "core", "static"],
    id: "workbench-ui",
    script: "scripts/full-chain-workbench-ui-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "工作区创建入口、/api/workspaces、切换新工作区和本地状态回填契约。",
    groups: ["all", "core", "static"],
    id: "workspace-management",
    script: "scripts/full-chain-workspace-management-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "概览页 AI 周报导出、个人口径、Markdown 模板、接口兜底和下载契约。",
    groups: ["all", "core", "static"],
    id: "weekly-report",
    script: "scripts/full-chain-weekly-report-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "AI 助手 ChatBox 登录保护、流式历史清洗、工具边界、前端超时和错误净化契约。",
    groups: ["all", "core", "static"],
    id: "assistant-chat",
    script: "scripts/full-chain-assistant-chat-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "飞书通讯录授权范围、子部门/用户组展开、去重和搜索过滤。",
    groups: ["all", "core"],
    id: "feishu-contact",
    script: "scripts/full-chain-feishu-contact-smoke.ts",
    timeoutMs: 120_000
  },
  {
    description: "已登录成员页添加成员抽屉、飞书通讯录下拉总数和搜索匹配提示。",
    groups: ["all", "auth", "core"],
    id: "member-ui",
    script: "scripts/full-chain-member-ui-smoke.ts",
    timeoutMs: 300_000
  },
  {
    description: "权限矩阵、禁用成员、未加入成员和 Better Auth 身份匹配。",
    groups: ["all", "core", "static"],
    id: "permission",
    script: "scripts/full-chain-permission-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "校验测试矩阵、package 命令与 full-chain 脚本都已互相登记，防止覆盖退化。",
    groups: ["all", "core", "static"],
    id: "coverage",
    script: "scripts/full-chain-coverage-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "AI/Email/COS/RAG 配置解析与本地 fallback 输出。",
    groups: ["all", "core", "static"],
    id: "dependency-fallback",
    script: "scripts/full-chain-dependency-fallback-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "需求飞书链接解析、AI 体检 fallback、接口兜底和前端表单回填契约。",
    groups: ["all", "core", "static"],
    id: "requirement-ai",
    script: "scripts/full-chain-requirement-ai-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "文档拆任务 fallback、documents/analyze 接口、版本/负责人回填和任务看板入库契约。",
    groups: ["all", "core", "static"],
    id: "document-breakdown",
    script: "scripts/full-chain-document-breakdown-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "Docker/部署脚本/运行时 env 静态配置完整性。",
    groups: ["all", "core", "static"],
    id: "deploy",
    script: "scripts/full-chain-deploy-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "Bug 附件 COS 签名、类型/大小校验和错误分支，默认使用 mock COS。",
    groups: ["all", "core", "static"],
    id: "bug-attachment",
    script: "scripts/full-chain-bug-attachment-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "项目仓库配置、Bug 修复 diff 安全边界、Runner 输出解析和 MR 模板。",
    groups: ["all", "core", "db"],
    id: "bug-fix-security",
    script: "scripts/full-chain-bug-fix-security-smoke.ts",
    timeoutMs: 120_000
  },
  {
    description: "任务/Bug 创建更新删除、Bug 流转、AI 索引入队和残留清理。",
    groups: ["all", "core", "db"],
    id: "crud",
    script: "scripts/full-chain-crud-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "成员手动/飞书添加、角色状态、通知渠道保存、重复身份拦截。",
    groups: ["all", "core", "db"],
    id: "member-management",
    script: "scripts/full-chain-member-management-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "成员飞书/邮箱通知渠道配置、按渠道拆分入队和无真实发送保护。",
    groups: ["all", "core", "db"],
    id: "notification",
    script: "scripts/full-chain-notification-smoke.ts",
    timeoutMs: 120_000
  },
  {
    description: "服务函数层成员、任务、Bug、需求、工作区写入与清理。",
    groups: ["all", "db"],
    id: "service",
    script: "scripts/full-chain-service-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "production Prisma 单例、MariaDB 小连接池及高并发读取连接上限。",
    env: {
      NODE_ENV: "production"
    },
    groups: ["all", "db"],
    id: "database-connection",
    script: "scripts/full-chain-database-connection-smoke.ts",
    timeoutMs: 120_000
  },
  {
    description: "MySQL 队列、Dashboard 副作用队列、Bug 修复仓储状态机。",
    groups: ["all", "db"],
    id: "infra",
    script: "scripts/full-chain-infra-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "AI 索引管理员状态/重建契约、Mastra 工作区重建入队和临时数据清理。",
    groups: ["all", "core", "db"],
    id: "ai-index-admin",
    script: "scripts/full-chain-ai-index-admin-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "AI 助手动作 worker 的完成任务、关闭 Bug、转交任务、批量创建任务。",
    groups: ["all", "db"],
    id: "assistant-action",
    script: "scripts/full-chain-assistant-action-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "工作区首次登录 owner 创建、邮箱归并、飞书历史桥接和 lastActiveAt 节流。",
    groups: ["all", "core", "db"],
    id: "workspace-identity",
    script: "scripts/full-chain-workspace-identity-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "父子版本项目继承、需求/任务/Bug 按 versionId 回填和版本大屏 scope。",
    groups: ["all", "core", "db"],
    id: "version-scope",
    script: "scripts/full-chain-version-scope-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "one2all PM 对齐的数据字段、项目详情、表单、治理 API、健康规则和历史兼容静态契约。",
    groups: ["all", "core", "static"],
    id: "project-management",
    script: "scripts/full-chain-project-management-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "需求下钻任务的 URL、SSR、刷新和 popstate 回放，以及跨工作区/不可见目标清理。",
    groups: ["all", "core", "static"],
    id: "task-requirement-deep-link",
    script: "scripts/task-requirement-deep-link-smoke.ts",
    timeoutMs: 60_000
  },
  {
    description: "隔离工作区验证指派入成员、plan_unit 作用域、读可见性与无效成员原子回滚。",
    groups: ["all", "db"],
    id: "project-management-access",
    script: "scripts/full-chain-project-management-access-smoke.ts",
    timeoutMs: 120_000
  },
  {
    description: "隔离工作区验证版本级交付标签保存刷新、隔离、软删除、节点同步和权限边界。",
    groups: ["all", "db"],
    id: "project-management-label",
    script: "scripts/full-chain-project-management-label-smoke.ts",
    timeoutMs: 120_000
  },
  {
    description: "隔离工作区验证项目/版本/需求增量删除、legacy 引用和并发安全；需要已迁移的 MySQL。",
    groups: ["all", "db"],
    id: "project-management-delete",
    script: "scripts/full-chain-project-management-delete-smoke.ts",
    timeoutMs: 120_000
  }
];

function getArgValue(name: string) {
  const prefix = `${name}=`;
  const inlineValue = process.argv.find((arg) => arg.startsWith(prefix));

  if (inlineValue) {
    return inlineValue.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function printList() {
  console.log("AI PM full-chain smoke cases:");

  for (const smokeCase of smokeCases) {
    console.log(`- ${smokeCase.id.padEnd(20)} groups=${smokeCase.groups.join(",")} script=${smokeCase.script}`);
    console.log(`  ${smokeCase.description}`);
  }
}

function resolveGroup(): SmokeGroup {
  const group = (getArgValue("--group") ?? "core") as SmokeGroup;
  const allowedGroups: SmokeGroup[] = ["all", "auth", "core", "db", "static"];

  if (!allowedGroups.includes(group)) {
    throw new Error(`未知测试分组：${group}。可用分组：${allowedGroups.join(", ")}`);
  }

  return group;
}

function resolveCases() {
  const only = getArgValue("--only");

  if (only) {
    const ids = new Set(only.split(",").map((id) => id.trim()).filter(Boolean));
    const selectedCases = smokeCases.filter((smokeCase) => ids.has(smokeCase.id));
    const unknownIds = [...ids].filter((id) => !smokeCases.some((smokeCase) => smokeCase.id === id));

    if (unknownIds.length) {
      throw new Error(`未知测试用例：${unknownIds.join(", ")}。可用 --list 查看完整清单。`);
    }

    return selectedCases;
  }

  const group = resolveGroup();

  return smokeCases.filter((smokeCase) => smokeCase.groups.includes(group));
}

function runSmokeCase(smokeCase: SmokeCase): Promise<RunResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const scriptPath = path.resolve(process.cwd(), smokeCase.script);
    const child = spawn("pnpm", ["exec", "tsx", scriptPath], {
      env: {
        ...process.env,
        ...smokeCase.env
      },
      shell: false,
      stdio: "inherit"
    });
    const timeout = setTimeout(() => {
      // 单个冒烟脚本超时通常意味着外部服务、数据库锁或 worker 状态机卡住；
      // 这里终止子进程并继续输出总汇总，方便一次运行暴露多个断点。
      child.kill("SIGTERM");
    }, smokeCase.timeoutMs);

    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);

      resolve({
        durationMs: performance.now() - startTime,
        exitCode,
        id: smokeCase.id,
        ok: exitCode === 0,
        script: smokeCase.script,
        signal
      });
    });
  });
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log("Usage: pnpm full-chain:smoke -- [--group core|static|db|auth|all] [--only id,id] [--list] [--bail]");
    printList();
    return;
  }

  if (hasFlag("--list")) {
    printList();
    return;
  }

  const selectedCases = resolveCases();
  const bail = hasFlag("--bail");
  const results: RunResult[] = [];
  const suiteStartTime = performance.now();

  if (!selectedCases.length) {
    throw new Error("没有匹配到要执行的全链路冒烟用例。");
  }

  console.log(`AI PM full-chain smoke suite: ${selectedCases.map((smokeCase) => smokeCase.id).join(", ")}`);

  for (const [index, smokeCase] of selectedCases.entries()) {
    console.log(`\n[${index + 1}/${selectedCases.length}] ${smokeCase.id} - ${smokeCase.description}`);
    const result = await runSmokeCase(smokeCase);

    results.push(result);
    console.log(
      `[${result.ok ? "PASS" : "FAIL"}] ${result.id} duration=${formatDuration(result.durationMs)} exit=${result.exitCode ?? "null"} signal=${result.signal ?? ""}`
    );

    if (!result.ok && bail) {
      break;
    }
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    checked: results.length,
    duration: formatDuration(performance.now() - suiteStartTime),
    failed: failed.map((result) => ({
      exitCode: result.exitCode,
      id: result.id,
      signal: result.signal
    })),
    passed: results.filter((result) => result.ok).length
  };

  console.log(`\nAI PM full-chain smoke summary:\n${JSON.stringify(summary, null, 2)}`);

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
