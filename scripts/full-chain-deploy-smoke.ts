import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type CheckResult = {
  name: string;
  status: "passed";
  detail: string;
};

const ROOT_DIR = process.cwd();
const checks: CheckResult[] = [];

function readProjectFile(relativePath: string) {
  const absolutePath = path.join(ROOT_DIR, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`缺少文件：${relativePath}`);
  }

  return readFileSync(absolutePath, "utf8");
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function recordCheck(name: string, detail: string) {
  checks.push({
    name,
    status: "passed",
    detail
  });
}

function assertIncludes(source: string, expected: string, message: string) {
  assertSmoke(source.includes(expected), message);
}

function assertMatches(source: string, pattern: RegExp, message: string) {
  assertSmoke(pattern.test(source), message);
}

function parsePackageJson() {
  const packageJson = JSON.parse(readProjectFile("package.json")) as {
    scripts?: Record<string, string>;
  };

  assertSmoke(packageJson.scripts, "package.json 缺少 scripts");
  return packageJson.scripts;
}

function verifyPackageScripts() {
  const scripts = parsePackageJson();
  const requiredScripts: Record<string, string> = {
    "deploy:docker": "bash scripts/deploy.docker.sh",
    "deploy:ops": "bash scripts/deploy.ops.sh",
    "deploy:remote": "bash scripts/deploy.sh",
    "ai-index:worker": "tsx scripts/ai-index-worker.ts",
    "assistant-action:worker": "tsx scripts/assistant-action-worker.ts",
    "dashboard-side-effect:worker": "tsx scripts/dashboard-side-effect-worker.ts",
    "bug-fix:worker": "tsx scripts/bug-fix-worker.ts",
    "ai-index:doctor": "tsx scripts/ai-index-doctor.ts",
    "ai-index:eval": "tsx scripts/ai-index-eval.ts"
  };

  for (const [name, command] of Object.entries(requiredScripts)) {
    assertSmoke(scripts[name] === command, `package.json script ${name} 应为 ${command}`);

    for (const scriptPath of command.match(/scripts\/[^\s"]+/g) ?? []) {
      assertSmoke(existsSync(path.join(ROOT_DIR, scriptPath)), `${name} 引用的脚本不存在：${scriptPath}`);
    }
  }

  recordCheck("package-scripts", `已校验 ${Object.keys(requiredScripts).length} 个部署/worker 脚本入口`);
}

function verifyDockerfile() {
  const dockerfile = readProjectFile("deploy/docker/Dockerfile");

  // Docker 镜像构建不能依赖真实认证库；build 阶段只用占位 PostgreSQL URL，运行时再由 entrypoint 强校验真实变量。
  assertIncludes(dockerfile, "AUTH_DATABASE_URL=\"postgresql://ai_pm_build", "Docker build 阶段应使用占位 AUTH_DATABASE_URL");
  assertIncludes(dockerfile, "BETTER_AUTH_SECRET=\"docker-build-placeholder-secret\"", "Docker build 阶段应使用占位 BETTER_AUTH_SECRET");
  assertMatches(dockerfile, /pnpm db:generate\s+\\\n\s+&& pnpm build/, "Dockerfile 必须先 db:generate 再 build");
  assertIncludes(dockerfile, "apt-get install -y --no-install-recommends openssl ca-certificates git", "runner 镜像必须安装 git，供 bug-fix worker clone 仓库");
  assertIncludes(dockerfile, "ENTRYPOINT [\"scripts/docker-entrypoint.sh\"]", "Dockerfile 必须使用 docker-entrypoint.sh");
  assertIncludes(dockerfile, "pnpm exec next start -p", "Docker runtime 必须通过 next CLI 启动");
  assertIncludes(dockerfile, "${PORT:-3003}", "Docker runtime 必须读取 PORT，默认回退 3003");
  assertIncludes(dockerfile, "EXPOSE 3003", "Dockerfile 应暴露默认容器端口 3003");

  recordCheck("dockerfile", "已校验 build 占位认证库、Prisma generate、runtime git、entrypoint 和端口启动方式");
}

function verifyDockerCompose() {
  const compose = readProjectFile("deploy/docker/docker-compose.example.yml");
  const requiredServices = [
    "ai-pm",
    "ai-index-worker",
    "assistant-action-worker",
    "dashboard-side-effect-worker",
    "bug-fix-worker",
    "redis",
    "qdrant"
  ];
  const workerCommands: Record<string, string> = {
    "ai-index-worker": "command: [\"pnpm\", \"ai-index:worker\"]",
    "assistant-action-worker": "command: [\"pnpm\", \"assistant-action:worker\"]",
    "dashboard-side-effect-worker": "command: [\"pnpm\", \"dashboard-side-effect:worker\"]",
    "bug-fix-worker": "command: [\"pnpm\", \"bug-fix:worker\"]"
  };

  for (const service of requiredServices) {
    assertMatches(compose, new RegExp(`^  ${service}:`, "m"), `compose 缺少服务：${service}`);
  }

  for (const [service, command] of Object.entries(workerCommands)) {
    assertIncludes(compose, command, `compose 服务 ${service} 未使用预期 worker 命令`);
  }

  // Web 容器必须通过同一份运行时 env 启动，并把慢任务交给 Redis/Qdrant/worker 组合处理。
  assertIncludes(compose, "${AI_PM_ENV_FILE:-../../.env}", "compose 必须支持通过 AI_PM_ENV_FILE 指定运行时 env");
  assertIncludes(compose, "REDIS_URL: ${REDIS_URL:-redis://redis:6379}", "compose 必须给容器内进程注入 Redis 服务地址");
  assertIncludes(compose, "QDRANT_URL: ${QDRANT_URL:-http://qdrant:6333}", "compose 必须给 RAG 链路注入 Qdrant 服务地址");
  assertIncludes(compose, "RUN_MIGRATIONS: ${RUN_MIGRATIONS:-1}", "Web 服务应默认执行业务迁移");
  assertIncludes(compose, "RUN_AUTH_MIGRATIONS: ${RUN_AUTH_MIGRATIONS:-0}", "认证迁移必须默认关闭，只能显式打开");
  assertIncludes(compose, "AI_BUG_FIX_WORKDIR: ${AI_BUG_FIX_WORKDIR:-/tmp/ai-pm-bug-fix-workspaces}", "bug-fix worker 应显式配置临时工作目录");
  assertIncludes(compose, "qdrant-data:/qdrant/storage", "Qdrant 数据必须持久化到 volume");
  assertIncludes(compose, "redis-data:/data", "Redis AOF 数据必须持久化到 volume");

  recordCheck("docker-compose", `已校验 ${requiredServices.length} 个 compose 服务和 ${Object.keys(workerCommands).length} 个 worker 命令`);
}

function verifyDockerEntrypoint() {
  const entrypoint = readProjectFile("scripts/docker-entrypoint.sh");

  for (const key of ["DATABASE_URL", "AUTH_DATABASE_URL", "BETTER_AUTH_SECRET", "APP_URL"]) {
    assertIncludes(entrypoint, key, `docker-entrypoint 缺少 ${key} 校验`);
  }

  // 生产入口必须阻止常见误配：业务库误用 PostgreSQL、认证库误用 MySQL、APP_URL 仍指向 localhost。
  assertIncludes(entrypoint, "mysql://*", "docker-entrypoint 必须强制 DATABASE_URL 使用 MySQL");
  assertIncludes(entrypoint, "postgresql://*|postgres://*", "docker-entrypoint 必须强制 AUTH_DATABASE_URL 使用 PostgreSQL");
  assertIncludes(entrypoint, "ALLOW_LOCAL_APP_URL", "docker-entrypoint 必须允许本地容器测试显式豁免 localhost APP_URL");
  assertIncludes(entrypoint, "pnpm db:migrate", "RUN_MIGRATIONS=1 时必须执行业务数据库迁移");
  assertIncludes(entrypoint, "pnpm auth-db:migrate", "RUN_AUTH_MIGRATIONS=1 时必须执行认证库迁移");
  assertIncludes(entrypoint, "pnpm auth-db:doctor", "认证库迁移后必须执行 Better Auth doctor");

  recordCheck("docker-entrypoint", "已校验生产必填 env、数据库类型、迁移开关和 OAuth 回调提示");
}

function verifyDeployScripts() {
  const dockerDeploy = readProjectFile("scripts/deploy.docker.sh");
  const opsDeploy = readProjectFile("scripts/deploy.ops.sh");
  const remoteDeploy = readProjectFile("scripts/deploy.sh");

  for (const key of ["APP_URL", "DATABASE_URL", "AUTH_DATABASE_URL", "BETTER_AUTH_SECRET"]) {
    assertIncludes(dockerDeploy, `require_runtime_env ${key}`, `deploy.docker.sh 缺少 ${key} 必填校验`);
  }

  assertIncludes(dockerDeploy, "AI_PM_BUG_FIX_WORKER_CONTAINER_NAME", "deploy.docker.sh 必须允许覆盖 bug-fix worker 容器名");
  assertIncludes(dockerDeploy, "HEALTHCHECK_PATH:=/login", "Docker 部署健康检查应默认访问 /login");
  assertIncludes(dockerDeploy, "compose_cmd -f \"${COMPOSE_FILE}\" up -d --remove-orphans", "Docker 部署必须使用 compose up 并清理孤儿容器");
  assertIncludes(dockerDeploy, "logs --tail=80", "Docker 健康检查失败时应输出最近容器日志");
  assertIncludes(dockerDeploy, "AI_PM_ENV_FILE:=/etc/ai-pm/ai-pm.env", "Docker 部署应默认读取 /etc/ai-pm/ai-pm.env");

  for (const script of [opsDeploy, remoteDeploy]) {
    assertIncludes(script, "pnpm db:migrate", "非 Docker 部署脚本必须支持业务迁移");
    assertIncludes(script, "pnpm auth-db:migrate", "非 Docker 部署脚本必须支持显式认证迁移");
    assertIncludes(script, "pnpm auth-db:doctor", "非 Docker 部署脚本必须在迁移后校验认证表");
    assertIncludes(script, "RUN_AUTH_MIGRATE", "非 Docker 部署脚本必须默认关闭认证迁移开关");
    assertIncludes(script, "pnpm build", "非 Docker 部署脚本必须支持生产构建");
    assertIncludes(script, "systemctl restart", "非 Docker 部署脚本必须支持 systemd 重启");
  }

  recordCheck("deploy-scripts", "已校验 Docker/ops/remote 部署脚本的 env、迁移、构建、重启与健康检查约束");
}

function parseEnvExample(relativePath: string) {
  const env = readProjectFile(relativePath);
  const keys = new Set<string>();

  for (const line of env.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=/);

    if (match) {
      keys.add(match[1]);
    }
  }

  return {
    keys,
    text: env
  };
}

function verifyRuntimeEnvExample() {
  const runtime = parseEnvExample("scripts/runtime.env.example");
  const requiredKeys = [
    "NODE_ENV",
    "PORT",
    "RUN_MIGRATIONS",
    "RUN_AUTH_MIGRATIONS",
    "APP_URL",
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "FEISHU_APP_ID",
    "FEISHU_APP_SECRET",
    "AI_API_KEY",
    "AI_BASE_URL",
    "AI_MODEL",
    "AI_MODELS",
    "AI_EMBEDDING_MODEL",
    "AI_EMBEDDING_DIMENSIONS",
    "AI_RERANK_MODEL",
    "QDRANT_URL",
    "QDRANT_COLLECTION",
    "REDIS_URL",
    "DASHBOARD_SIDE_EFFECT_QUEUE_NAME",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "TENCENT_COS_BUCKET",
    "TENCENT_COS_SECRET_ID",
    "TENCENT_COS_SECRET_KEY",
    "GITHUB_TOKEN",
    "AI_BUG_FIX_RUNNER_COMMAND",
    "AI_BUG_FIX_WORKDIR",
    "AI_BUG_FIX_MAX_CHANGED_FILES",
    "AI_BUG_FIX_MAX_DIFF_LINES"
  ];

  for (const key of requiredKeys) {
    assertSmoke(runtime.keys.has(key), `runtime.env.example 缺少 ${key}`);
  }

  assertIncludes(runtime.text, "APP_URL=https://your-domain.example.com", "runtime env 样例的 APP_URL 应是公网域名占位，不应是 localhost");
  assertIncludes(runtime.text, "DATABASE_URL=mysql://", "runtime env 样例必须声明业务 MySQL");
  assertIncludes(runtime.text, "AUTH_DATABASE_URL=postgresql://", "runtime env 样例必须声明认证 PostgreSQL");
  assertIncludes(runtime.text, "QDRANT_URL=http://qdrant:6333", "runtime env 样例应适配 compose 内部 Qdrant 地址");
  assertIncludes(runtime.text, "REDIS_URL=redis://redis:6379", "runtime env 样例应适配 compose 内部 Redis 地址");

  recordCheck("runtime-env-example", `已校验 ${requiredKeys.length} 个运行时 env 键和关键示例值`);
}

function verifyDeployEnvExample() {
  const deploy = parseEnvExample("scripts/deploy.env.example");
  const requiredKeys = [
    "DEPLOY_HOST",
    "DEPLOY_USER",
    "DEPLOY_SSH_PORT",
    "DEPLOY_TARGET_DIR",
    "DEPLOY_APP_NAME",
    "DEPLOY_PORT",
    "DEPLOY_RUNTIME_ENV_SOURCE",
    "DEPLOY_RUNTIME_ENV_NAME",
    "DEPLOY_RUN_INSTALL",
    "DEPLOY_RUN_MIGRATE",
    "DEPLOY_RUN_AUTH_MIGRATE",
    "DEPLOY_RUN_BUILD",
    "DEPLOY_RESTART_STRATEGY",
    "DEPLOY_SYSTEMD_SERVICE"
  ];

  for (const key of requiredKeys) {
    assertSmoke(deploy.keys.has(key), `deploy.env.example 缺少 ${key}`);
  }

  assertIncludes(deploy.text, "DEPLOY_RUN_AUTH_MIGRATE=0", "远程部署样例必须默认关闭认证迁移");
  assertIncludes(deploy.text, "DEPLOY_RESTART_STRATEGY=systemd", "远程部署样例应默认 systemd 重启");

  recordCheck("deploy-env-example", `已校验 ${requiredKeys.length} 个远程部署 env 键`);
}

function verifyDockerIgnore() {
  const dockerIgnore = readProjectFile(".dockerignore");
  const ignoredPatterns = [".env", ".env.*", "node_modules", ".next", ".git", "scripts/deploy.env"];

  // Docker build context 是最容易把本地密钥打进镜像的地方；这里把密钥和构建产物排除规则纳入冒烟。
  for (const pattern of ignoredPatterns) {
    assertMatches(dockerIgnore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), `.dockerignore 缺少 ${pattern}`);
  }

  recordCheck("dockerignore", `已校验 ${ignoredPatterns.length} 个敏感文件/构建产物排除规则`);
}

function main() {
  verifyPackageScripts();
  verifyDockerfile();
  verifyDockerCompose();
  verifyDockerEntrypoint();
  verifyDeployScripts();
  verifyRuntimeEnvExample();
  verifyDeployEnvExample();
  verifyDockerIgnore();

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    checks
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[full-chain-deploy-smoke] failed", error);
  process.exitCode = 1;
}
