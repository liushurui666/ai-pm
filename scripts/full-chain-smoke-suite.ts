import { spawn } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";

type SmokeGroup = "all" | "auth" | "core" | "db" | "static";

type SmokeCase = {
  description: string;
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
    description: "权限矩阵、禁用成员、未加入成员和 Unified Auth 身份匹配。",
    groups: ["all", "core", "static"],
    id: "permission",
    script: "scripts/full-chain-permission-smoke.ts",
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
    description: "服务函数层成员、任务、Bug、需求、工作区写入与清理。",
    groups: ["all", "db"],
    id: "service",
    script: "scripts/full-chain-service-smoke.ts",
    timeoutMs: 180_000
  },
  {
    description: "MySQL 队列、Dashboard 副作用队列、Bug 修复仓储状态机。",
    groups: ["all", "db"],
    id: "infra",
    script: "scripts/full-chain-infra-smoke.ts",
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
      env: process.env,
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
