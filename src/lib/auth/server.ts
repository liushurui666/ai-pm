import { createAuthServer } from "@rc-tool/unified-auth-sdk/server";
import { authDatabase } from "@/lib/auth/database";
import { unifiedAuthConfig } from "@/lib/auth/config";

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

/**
 * AI PM 内嵌的 Better Auth 服务实例。
 *
 * Unified Auth SDK 负责 Better Auth 的 Drizzle adapter、标准认证表 schema、admin/genericOAuth 插件和
 * provider callback 处理；AI PM 只传入独立 auth 数据库连接、统一配置和三方 provider 凭证来源。
 * 这里显式把业务侧已有的环境变量接到 SDK options 上，避免“登录页展示了 provider，但 Better Auth 没拿到凭证”
 * 时只能从 SDK 内部默认读取路径排查。业务成员/权限继续保留在自己的 MySQL 表。
 */
export const auth = createAuthServer({
  config: unifiedAuthConfig,
  database: authDatabase,
  feishuProviders: [
    {
      appId: readEnv("FEISHU_APP_ID"),
      appSecret: readEnv("FEISHU_APP_SECRET"),
      providerId: "feishu",
    },
  ],
  githubProvider: {
    clientId: readEnv("GITHUB_CLIENT_ID"),
    clientSecret: readEnv("GITHUB_CLIENT_SECRET"),
  },
  googleProvider: {
    clientId: readEnv("GOOGLE_CLIENT_ID"),
    clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
  },
});
