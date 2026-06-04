import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { resolveUnifiedAuthConfigValue } from "@rc-tool/unified-auth-hosted-service/config";
import { unifiedAuthConfig } from "@/lib/auth/config";

const globalForAuthDatabase = globalThis as typeof globalThis & {
  aiPmAuthPgPool?: Pool;
};

function resolveAuthDatabaseURL() {
  const databaseURL = resolveUnifiedAuthConfigValue(unifiedAuthConfig.database?.url);

  if (!databaseURL) {
    throw new Error("缺少 AUTH_DATABASE_URL：Unified Auth 认证表需要独立 PostgreSQL 连接，不能复用 AI PM 业务 MySQL。");
  }

  return databaseURL;
}

function createAuthPgPool() {
  // Better Auth 负责用户、OAuth 账号和 session，连接池只在认证路由运行时使用；开发环境复用全局实例，
  // 避免 Next 热更新反复创建 PostgreSQL 连接。
  return new Pool({
    connectionString: resolveAuthDatabaseURL(),
    ssl: unifiedAuthConfig.database?.ssl,
  });
}

export const authPgPool = globalForAuthDatabase.aiPmAuthPgPool ?? createAuthPgPool();

if (process.env.NODE_ENV !== "production") {
  globalForAuthDatabase.aiPmAuthPgPool = authPgPool;
}

/**
 * Better Auth 的 Drizzle 数据库实例。
 *
 * 这里不声明业务表 schema；SDK 的 createAuthServer 会根据 unifiedAuthConfig.realm 注入标准 Better Auth
 * Drizzle schema。业务项目只负责提供 PostgreSQL 连接，不再维护认证表结构或 adapter 读写逻辑。
 */
export const authDatabase = drizzle(authPgPool);
