import { createAuthServer } from "@rc-tool/unified-auth-sdk/server";
import { authDatabase } from "@/lib/auth/database";
import { resolveUnifiedAuthProviderCredentials, unifiedAuthConfig } from "@/lib/auth/config";

/**
 * AI PM 内嵌的 Better Auth 服务实例。
 *
 * Unified Auth SDK 负责 Better Auth 的 Drizzle adapter、标准认证表 schema、admin/genericOAuth 插件和
 * provider callback 处理；AI PM 只传入独立 auth 数据库连接、统一配置和三方 provider 凭证来源。
 * 三方 provider 凭证统一从 unified-auth.config.ts 解析，避免“登录页展示了 provider，但 Better Auth 没拿到凭证”
 * 时只能从 SDK 内部默认读取路径排查。业务成员/权限继续保留在自己的 MySQL 表。
 */
export const auth = createAuthServer({
  config: unifiedAuthConfig,
  database: authDatabase,
  ...resolveUnifiedAuthProviderCredentials(),
});
