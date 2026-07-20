import type { AuthContext, AuthUser } from "@/lib/auth/types";
import { isAuthServiceConfigured, resolveAppBaseURL, resolveAuthServiceBaseURL } from "@/lib/auth/settings";
import type { FeishuUser } from "@/types/dashboard";

const SUPPORTED_MEMBER_IDENTITY_PROVIDERS = new Set(["feishu", "google", "github", "email"]);

type AiPmAuthHrefOptions = {
  appBaseURL?: string;
  authBaseURL?: string;
};

function asAuthUserText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isFeishuOpenId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("ou_");
}

function getFeishuOpenIdFromSyntheticEmail(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const email = value.trim();

  return email.startsWith("ou_") && email.endsWith("@feishu.local") ? email.split("@")[0] : undefined;
}

function resolveFeishuOpenId(user: AuthUser, metadata: Record<string, unknown>) {
  return isFeishuOpenId(metadata.feishuOpenId)
    ? metadata.feishuOpenId
    : getFeishuOpenIdFromSyntheticEmail(user.email) ?? (isFeishuOpenId(user.id) ? user.id : undefined);
}

function toAbsoluteAppURL(pathOrURL: string, appBaseURL = resolveAppBaseURL()) {
  return /^https?:\/\//i.test(pathOrURL) ? pathOrURL : new URL(pathOrURL, appBaseURL).toString();
}

/**
 * 生成 AI PM 自有登录页地址。不再注入 SDK `client_id`，只传递经服务端白名单二次校验的站内回跳地址。
 */
export function getAiPmAuthLoginHref(redirectURI = "/", options: AiPmAuthHrefOptions = {}) {
  const appBaseURL = options.appBaseURL ?? resolveAppBaseURL();
  const authBaseURL = options.authBaseURL ?? resolveAuthServiceBaseURL();
  const url = new URL("/login", authBaseURL);

  url.searchParams.set("redirect_uri", toAbsoluteAppURL(redirectURI, appBaseURL));

  return url.toString();
}

/**
 * 退出仍由 Better Auth 清理原 `better-auth.*` Cookie，这里只组装退出后的站内回跳。
 */
export function getAiPmAuthLogoutHref(redirectURI = "/login", options: AiPmAuthHrefOptions = {}) {
  const appBaseURL = options.appBaseURL ?? resolveAppBaseURL();
  const authBaseURL = options.authBaseURL ?? resolveAuthServiceBaseURL();
  const url = new URL("/logout", authBaseURL);

  url.searchParams.set("redirect_uri", toAbsoluteAppURL(redirectURI, appBaseURL));

  return url.toString();
}

/**
 * Better Auth 用户映射为 AI PM 现有的业务身份结构。
 * 成员权限始终用认证表 `user.id` 匹配 `authUserId`，只有飞书通知场景才从 metadata/占位邮箱恢复 `ou_...`。
 */
export function mapAuthUserToFeishuUser(user?: AuthUser | null): FeishuUser | null {
  const metadata = user?.metadata ?? {};
  const rawProvider = typeof metadata.provider === "string" ? metadata.provider : undefined;
  const authProvider = rawProvider && SUPPORTED_MEMBER_IDENTITY_PROVIDERS.has(rawProvider) ? rawProvider : "email";
  const authUserId = asAuthUserText(user?.id);
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
    name: user.name || user.email || "认证用户",
    openId,
    unionId: typeof metadata.feishuUnionId === "string" ? metadata.feishuUnionId : undefined,
    userId: typeof metadata.feishuUserId === "string" ? metadata.feishuUserId : undefined,
  };
}

export function createEmptyAuthContext(): AuthContext {
  return { session: null, user: null };
}

export { isAuthServiceConfigured };
