import { defineUnifiedAuthConfig } from "@rc-tool/unified-auth-hosted-service/config";

const DEFAULT_APP_ORIGIN = "http://localhost:3004";
const LOCAL_AUTH_DATABASE_URL = "postgresql://ai_pm_auth:ai_pm_auth_local@localhost:5432/ai_pm_auth";
const LOCAL_BETTER_AUTH_SECRET = "9fiSf/msIiUStw15LoCNM/OEgshq7BlrpEmteSfbmiE=";

function readEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function resolveAppOrigin() {
  const origin = readEnv("APP_URL") ?? readEnv("NEXT_PUBLIC_APP_URL") ?? DEFAULT_APP_ORIGIN;

  return origin.replace(/\/$/, "");
}

function resolveAuthDatabaseURL() {
  // Unified Auth 的认证表使用独立 PostgreSQL；AI PM 的业务 MySQL 仍然由 DATABASE_URL 管理，二者不能混用。
  return readEnv("AUTH_DATABASE_URL")
    ?? (process.env.NODE_ENV === "production" ? undefined : LOCAL_AUTH_DATABASE_URL);
}

function isNextBuildLifecycle() {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
}

function resolveBetterAuthSecret() {
  // Next build 会以 NODE_ENV=production 执行静态收集，但构建机不一定注入真实密钥；此时只用占位值避免 Better Auth 落到默认 secret。
  // 生产运行时不能使用占位值，Docker/部署脚本会在启动或发布前强制检查 BETTER_AUTH_SECRET。
  return readEnv("BETTER_AUTH_SECRET")
    ?? (process.env.NODE_ENV === "production" && !isNextBuildLifecycle() ? undefined : LOCAL_BETTER_AUTH_SECRET);
}

const appOrigin = resolveAppOrigin();

export default defineUnifiedAuthConfig({
  app: {
    id: "ai-pm",
    name: "AI PM",
    origin: appOrigin,
    redirectURI: `${appOrigin}/`,
  },
  auth: {
    origin: appOrigin,
    secret: resolveBetterAuthSecret,
    trustedOrigins: [appOrigin],
  },
  database: {
    url: resolveAuthDatabaseURL,
  },
  providers: ["feishu", "google", "github"],
  realm: "ai-pm",
});
