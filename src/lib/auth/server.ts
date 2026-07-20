import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import { authConfig, resolveAuthConfigValue, resolveAuthProviderCredentials } from "@/lib/auth/config";
import { authDatabase } from "@/lib/auth/database";
import { createFeishuOAuthProvider } from "@/lib/auth/providers/feishu";
import { createAuthSchema } from "@/lib/auth/schema";

const credentials = resolveAuthProviderCredentials();
const feishuProviders = credentials.feishuProviders.filter((provider) => provider.appId && provider.appSecret);
const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};

if (credentials.github.clientId && credentials.github.clientSecret) {
  socialProviders.github = credentials.github;
}
if (credentials.google.clientId && credentials.google.clientSecret) {
  socialProviders.google = credentials.google;
}

/**
 * AI PM 直接创建 Better Auth 服务，不再经过外部 Unified Auth SDK。
 *
 * 数据库 adapter、realm schema、会话时长、OAuth provider id 与原实现完全对齐，这是保留现有用户、
 * account 绑定和 `better-auth.session_token` 会话的关键。工作区、成员与权限仍存在业务 MySQL。
 */
export const auth = betterAuth({
  advanced: process.env.NODE_ENV === "production"
    ? {
        trustedProxyHeaders: true,
        useSecureCookies: true,
      }
    : undefined,
  appName: authConfig.app.name,
  baseURL: authConfig.auth.origin,
  database: drizzleAdapter(authDatabase, {
    camelCase: true,
    provider: "pg",
    schema: createAuthSchema(authConfig.realm),
  }),
  emailAndPassword: {
    autoSignIn: true,
    disableSignUp: true,
    enabled: true,
    minPasswordLength: 8,
  },
  onAPIError: {
    errorURL: "/login",
  },
  plugins: [
    admin({
      bannedUserMessage: "你的账号已被封禁，请联系管理员。",
    }),
    ...(feishuProviders.length
      ? [genericOAuth({ config: feishuProviders.map(createFeishuOAuthProvider) })]
      : []),
  ],
  secret: resolveAuthConfigValue(authConfig.auth.secret),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 5,
  },
  socialProviders,
  trustedOrigins: [...new Set([...authConfig.auth.trustedOrigins, "http://localhost:3000"])],
  user: {
    additionalFields: {
      feishuTenantKey: {
        input: false,
        required: false,
        type: "string",
      },
      feishuTenantName: {
        input: false,
        required: false,
        type: "string",
      },
    },
  },
});
