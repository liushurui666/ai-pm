import { createAuthServer } from "@rc-tool/unified-auth-sdk/server";
import { authDatabase } from "@/lib/auth/database";
import { unifiedAuthConfig } from "@/lib/auth/config";

/**
 * AI PM 内嵌的 Better Auth 服务实例。
 *
 * Unified Auth SDK 负责 Better Auth 的 Drizzle adapter、标准认证表 schema、admin/genericOAuth 插件和
 * provider callback 处理；AI PM 只传入独立 auth 数据库连接与统一配置，业务成员/权限继续保留在自己的 MySQL 表。
 */
export const auth = createAuthServer({
  config: unifiedAuthConfig,
  database: authDatabase,
});
