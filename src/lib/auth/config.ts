import type { FeishuOAuthProviderOptions } from "@/lib/auth/providers/feishu";

const DEFAULT_APP_ORIGIN = "http://localhost:3004";
const LOCAL_AUTH_DATABASE_URL = "postgresql://ai_pm_auth:ai_pm_auth_local@localhost:5432/ai_pm_auth";
const LOCAL_BETTER_AUTH_SECRET = "9fiSf/msIiUStw15LoCNM/OEgshq7BlrpEmteSfbmiE=";

export type AuthConfigValue<T> = T | (() => T | undefined);
export type AuthProviderId = "feishu" | "google" | "github";

export type AiPmAuthConfig = {
  app: {
    id: string;
    name: string;
    origin: string;
    redirectURI: string;
  };
  auth: {
    origin: string;
    secret: AuthConfigValue<string>;
    trustedOrigins: string[];
  };
  database: {
    ssl?: boolean | { rejectUnauthorized?: boolean };
    url: AuthConfigValue<string>;
  };
  providers: AuthProviderId[];
  realm: string;
};

function readEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function isNextBuildLifecycle() {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
}

function resolveAppOrigin() {
  const origin = readEnv("APP_URL") ?? readEnv("NEXT_PUBLIC_APP_URL") ?? DEFAULT_APP_ORIGIN;

  return origin.replace(/\/$/, "");
}

function resolveAuthDatabaseURL() {
  // 认证数据继续使用原 SDK 已建立的独立 PostgreSQL；业务 MySQL 仍只由 DATABASE_URL 管理。
  return readEnv("AUTH_DATABASE_URL")
    ?? (process.env.NODE_ENV === "production" ? undefined : LOCAL_AUTH_DATABASE_URL);
}

function resolveBetterAuthSecret() {
  // Next 构建会以 production 模式收集路由，构建机可以不持有真实会话密钥；生产运行时仍由入口脚本强制校验。
  return readEnv("BETTER_AUTH_SECRET")
    ?? (process.env.NODE_ENV === "production" && !isNextBuildLifecycle() ? undefined : LOCAL_BETTER_AUTH_SECRET);
}

export function resolveAuthConfigValue<T>(value: AuthConfigValue<T> | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T | undefined)() : value;
}

const appOrigin = resolveAppOrigin();

/**
 * AI PM 自有认证配置。
 *
 * 这个对象取代原根目录 Unified Auth SDK 配置：表命名空间、Cookie 密钥和 OAuth 回调域名保持不变，
 * 因此已有 `auth_ai_pm` 用户、账号和会话可以直接继续使用，不需要搬迁认证数据。
 */
export const authConfig: AiPmAuthConfig = {
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
};

/**
 * OAuth 密钥仍由 AI PM 环境变量统一注入，不再通过外部 SDK 解析。
 * 返回稳定的空值对象，让服务端可根据凭证是否完整决定注册哪些 provider。
 */
export function resolveAuthProviderCredentials() {
  const feishuProviders: FeishuOAuthProviderOptions[] = [
    {
      appId: readEnv("FEISHU_APP_ID") ?? "",
      appSecret: readEnv("FEISHU_APP_SECRET") ?? "",
      providerId: "feishu",
    },
  ];

  return {
    feishuProviders,
    github: {
      clientId: readEnv("GITHUB_CLIENT_ID") ?? "",
      clientSecret: readEnv("GITHUB_CLIENT_SECRET") ?? "",
    },
    google: {
      clientId: readEnv("GOOGLE_CLIENT_ID") ?? "",
      clientSecret: readEnv("GOOGLE_CLIENT_SECRET") ?? "",
      // 强制显示 Google 授权确认，避免同一 OAuth Client 的旧授权让用户感知不到账号切换。
      prompt: "consent" as const,
    },
  };
}

export default authConfig;
