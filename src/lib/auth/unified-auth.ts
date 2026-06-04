import { createAuthServiceClient } from "@rc-tool/unified-auth-sdk/service-client";
import type {
  AuthContext,
  AuthServiceClient,
  AuthUser,
  CreateAuthServiceClientOptions
} from "@rc-tool/unified-auth-sdk/service-client";
import { unifiedAuthConfig } from "@/lib/auth/config";
import type { FeishuUser } from "@/types/dashboard";

const DEFAULT_APP_URL = "http://localhost:3004";
const SUPPORTED_MEMBER_IDENTITY_PROVIDERS = new Set(["feishu", "google", "github", "email"]);

type AiPmAuthClientOptions = Partial<Pick<CreateAuthServiceClientOptions, "authBaseURL" | "defaultRedirectURI" | "fetcher">>;

function resolveAuthServiceBaseURL() {
  if (typeof window !== "undefined") {
    // 前端运行时优先使用当前页面 origin，保证 /login、/logout 和 /api/auth/* 都落在 AI PM 自己的路由上。
    // root config 主要给服务端和 CLI 使用；浏览器里继续信任当前 origin，可以避免构建期把 localhost 写入生产 href。
    return window.location.origin;
  }

  return unifiedAuthConfig.auth?.origin ?? unifiedAuthConfig.app?.origin ?? process.env.APP_URL ?? DEFAULT_APP_URL;
}

function resolveAppBaseURL() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || DEFAULT_APP_URL;
}

function toAbsoluteAppURL(pathOrURL: string) {
  if (/^https?:\/\//i.test(pathOrURL)) {
    return pathOrURL;
  }

  return new URL(pathOrURL, resolveAppBaseURL()).toString();
}

/**
 * 创建面向 AI PM 的统一认证 SDK 客户端。
 *
 * AI PM 不再维护 OAuth、用户表和会话签发，只通过 Auth Service 的黑盒 API 读取认证上下文。
 * clientId、redirectURI 和 realm 均来自 unified-auth.config.ts；这里仅在浏览器侧补当前 origin，避免业务组件散落环境变量。
 */
export function createAiPmAuthServiceClient(options: AiPmAuthClientOptions = {}): AuthServiceClient {
  return createAuthServiceClient({
    authBaseURL: options.authBaseURL ?? resolveAuthServiceBaseURL(),
    config: unifiedAuthConfig,
    defaultRedirectURI: options.defaultRedirectURI ?? toAbsoluteAppURL("/"),
    fetcher: options.fetcher
  });
}

/**
 * 生成站内登录地址。
 *
 * SDK 默认会产出绝对 URL；组件 href 使用同源相对路径可以避免服务端渲染时把 localhost 写进生产页面，
 * 同时保留 client_id、provider、redirect_uri 这些未来托管认证服务需要识别的参数。
 */
export function getAiPmAuthLoginHref(redirectURI = "/") {
  const client = createAiPmAuthServiceClient({
    defaultRedirectURI: toAbsoluteAppURL(redirectURI)
  });

  return client.getLoginURL({ redirectURI: toAbsoluteAppURL(redirectURI) });
}

/**
 * 生成站内退出地址。
 *
 * 退出也交给 Auth Service 清理统一会话 Cookie，AI PM 只提供退出后的业务回跳地址。
 */
export function getAiPmAuthLogoutHref(redirectURI = "/login") {
  const client = createAiPmAuthServiceClient({
    defaultRedirectURI: toAbsoluteAppURL(redirectURI)
  });

  return client.getLogoutURL({ redirectURI: toAbsoluteAppURL(redirectURI) });
}

/**
 * 将 Auth Service 的通用用户模型映射回 AI PM 当前业务层使用的负责人身份。
 *
 * AI PM 的任务、Bug、通知等模块历史上使用 FeishuUser 形状传递“当前人”，这里仅做字段适配；
 * 成员权限匹配只看 SDK 的 authUserId，OAuth provider 原始 id 不再参与运行时登录匹配。
 */
export function mapAuthUserToFeishuUser(user?: AuthUser | null): FeishuUser | null {
  const metadata = user?.metadata ?? {};
  const rawProvider = typeof metadata.provider === "string" ? metadata.provider : undefined;
  const authProvider = rawProvider && SUPPORTED_MEMBER_IDENTITY_PROVIDERS.has(rawProvider) ? rawProvider : "email";
  const openId = typeof metadata.feishuOpenId === "string" ? metadata.feishuOpenId : user?.id;

  if (!user || !openId) {
    return null;
  }

  return {
    authProvider: authProvider as FeishuUser["authProvider"],
    authUserId: user.id,
    avatarUrl: user.avatarUrl ?? undefined,
    email: user.email ?? undefined,
    enName: typeof metadata.enName === "string" ? metadata.enName : undefined,
    name: user.name || user.email || "统一认证用户",
    openId,
    unionId: typeof metadata.feishuUnionId === "string" ? metadata.feishuUnionId : undefined,
    userId: typeof metadata.feishuUserId === "string" ? metadata.feishuUserId : undefined
  };
}

/**
 * 判断是否启用黑盒认证服务。
 * 默认本地开发使用 AI PM 自己的 origin，认证页面和接口由 SDK route handler 内嵌提供。
 */
export function isAuthServiceConfigured() {
  return Boolean(resolveAuthServiceBaseURL());
}

/**
 * 空认证上下文用于 Auth Service 暂时不可用时的安全兜底。
 * 业务接口会把它视作未登录，而不是在 AI PM 内部生成一个本地用户。
 */
export function createEmptyAuthContext(): AuthContext {
  return {
    session: null,
    user: null
  };
}
