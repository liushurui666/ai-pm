import { createAuthServiceClient } from "@rc-tool/unified-auth-sdk/service-client";
import type {
  AuthContext,
  AuthServiceClient,
  AuthUser,
  CreateAuthServiceClientOptions
} from "@rc-tool/unified-auth-sdk/service-client";
import { unifiedAuthConfig } from "@/lib/auth/config";
import { isAuthServiceConfigured, resolveAppBaseURL, resolveAuthServiceBaseURL } from "@/lib/auth/settings";
import type { FeishuUser } from "@/types/dashboard";

const SUPPORTED_MEMBER_IDENTITY_PROVIDERS = new Set(["feishu", "google", "github", "email"]);

function isFeishuOpenId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("ou_");
}

function asAuthUserText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getFeishuOpenIdFromSyntheticEmail(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedEmail = value.trim();

  return normalizedEmail.startsWith("ou_") && normalizedEmail.endsWith("@feishu.local")
    ? normalizedEmail.split("@")[0]
    : undefined;
}

function resolveFeishuOpenId(user: AuthUser, metadata: Record<string, unknown>) {
  const metadataOpenId = metadata.feishuOpenId;

  if (isFeishuOpenId(metadataOpenId)) {
    return metadataOpenId;
  }

  const emailOpenId = getFeishuOpenIdFromSyntheticEmail(user.email);

  if (emailOpenId) {
    return emailOpenId;
  }

  return isFeishuOpenId(user.id) ? asAuthUserText(user.id) : undefined;
}

type AiPmAuthClientOptions = Partial<Pick<CreateAuthServiceClientOptions, "authBaseURL" | "defaultRedirectURI" | "fetcher">>;
type AiPmAuthHrefOptions = {
  appBaseURL?: string;
  authBaseURL?: string;
};

function toAbsoluteAppURL(pathOrURL: string, appBaseURL = resolveAppBaseURL()) {
  if (/^https?:\/\//i.test(pathOrURL)) {
    return pathOrURL;
  }

  return new URL(pathOrURL, appBaseURL).toString();
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
export function getAiPmAuthLoginHref(redirectURI = "/", options: AiPmAuthHrefOptions = {}) {
  const appBaseURL = options.appBaseURL ?? resolveAppBaseURL();
  const absoluteRedirectURI = toAbsoluteAppURL(redirectURI, appBaseURL);
  const client = createAiPmAuthServiceClient({
    authBaseURL: options.authBaseURL,
    defaultRedirectURI: absoluteRedirectURI
  });

  return client.getLoginURL({ redirectURI: absoluteRedirectURI });
}

/**
 * 生成站内退出地址。
 *
 * 退出也交给 Auth Service 清理统一会话 Cookie，AI PM 只提供退出后的业务回跳地址。
 */
export function getAiPmAuthLogoutHref(redirectURI = "/login", options: AiPmAuthHrefOptions = {}) {
  const appBaseURL = options.appBaseURL ?? resolveAppBaseURL();
  const absoluteRedirectURI = toAbsoluteAppURL(redirectURI, appBaseURL);
  const client = createAiPmAuthServiceClient({
    authBaseURL: options.authBaseURL,
    defaultRedirectURI: absoluteRedirectURI
  });

  return client.getLogoutURL({ redirectURI: absoluteRedirectURI });
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
  const authUserId = asAuthUserText(user?.id);
  // Auth Service 的 user.id 是统一身份 id，不一定是飞书 open_id；机器人消息接口只接受 `ou_...`。
  // 早期 Feishu 登录会把 open_id 落成 `ou_xxx@feishu.local` 占位邮箱，这里优先从 metadata 和占位邮箱恢复真实 open_id。
  const openId = user
    ? authProvider === "feishu" ? resolveFeishuOpenId(user, metadata) ?? authUserId : authUserId
    : undefined;

  if (!user || !openId) {
    return null;
  }

  return {
    authProvider: authProvider as FeishuUser["authProvider"],
    authUserId,
    avatarUrl: user.avatarUrl ?? undefined,
    email: user.email ?? undefined,
    enName: typeof metadata.enName === "string" ? metadata.enName : undefined,
    name: user.name || user.email || "统一认证用户",
    openId,
    unionId: typeof metadata.feishuUnionId === "string" ? metadata.feishuUnionId : undefined,
    userId: typeof metadata.feishuUserId === "string" ? metadata.feishuUserId : undefined
  };
}

export { isAuthServiceConfigured };

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
