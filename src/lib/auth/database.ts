import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { authConfig, resolveAuthConfigValue } from "@/lib/auth/config";

const BUILD_AUTH_DATABASE_URL = "postgresql://ai_pm_build:ai_pm_build@127.0.0.1:5432/ai_pm_build";

const globalForAuthDatabase = globalThis as typeof globalThis & {
  aiPmAuthPgPool?: Pool;
};

function isNextBuildLifecycle() {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
}

function resolveAuthDatabaseURL() {
  const databaseURL = resolveAuthConfigValue(authConfig.database.url);

  if (!databaseURL) {
    if (isNextBuildLifecycle()) {
      // Next 构建会静态收集认证路由并初始化 Better Auth 模块，但构建阶段不应该把真实认证库密钥打进镜像。
      // 这里仅返回占位连接串用于创建 Pool 对象；运行容器时 entrypoint 仍会强制校验真实 AUTH_DATABASE_URL。
      return BUILD_AUTH_DATABASE_URL;
    }

    throw new Error("缺少 AUTH_DATABASE_URL：Better Auth 认证表需要独立 PostgreSQL 连接，不能复用 AI PM 业务 MySQL。");
  }

  return databaseURL;
}

function createAuthPgPool() {
  // Better Auth 负责用户、OAuth 账号和 session，连接池只在认证路由运行时使用；开发环境复用全局实例，
  // 避免 Next 热更新反复创建 PostgreSQL 连接。
  return new Pool({
    connectionString: resolveAuthDatabaseURL(),
    ssl: authConfig.database.ssl,
  });
}

export const authPgPool = globalForAuthDatabase.aiPmAuthPgPool ?? createAuthPgPool();

if (process.env.NODE_ENV !== "production") {
  globalForAuthDatabase.aiPmAuthPgPool = authPgPool;
}

/**
 * Better Auth 的 Drizzle 数据库实例。
 *
 * 这里只提供原认证 PostgreSQL 连接；具体 `auth_ai_pm` 表 schema 在本项目的 auth/schema.ts 内管理。
 * 业务 MySQL 不会被 Better Auth adapter 读写，避免认证数据和项目数据继续耦合。
 */
export const authDatabase = drizzle(authPgPool);
