import { cookies, headers } from "next/headers";
import type { AuthContext } from "@rc-tool/unified-auth-sdk/service-client";
import type { AppSession } from "@/types/auth";
import { authPgPool } from "@/lib/auth/database";
import { unifiedAuthConfig } from "@/lib/auth/config";
import { getRequestOriginFromHeaders, resolveTrustedRequestOrigin } from "@/lib/auth/request-origin";
import { createAiPmAuthServiceClient, createEmptyAuthContext, mapAuthUserToFeishuUser } from "@/lib/auth/unified-auth";

const supportedAuthProviders = new Set(["feishu", "google", "github", "email"]);
const defaultAuthOrigin = unifiedAuthConfig.auth?.origin ?? unifiedAuthConfig.app?.origin ?? "http://localhost:3004";

function serializeCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
}

/**
 * 从黑盒 Auth Service 获取认证上下文。
 *
 * AI PM 只转发浏览器带来的统一认证 Cookie，不解析、不签发、不刷新用户会话；
 * 如果 Auth Service 不可用，返回空上下文，让页面和接口按未登录处理。
 */
export async function getAuthContext(): Promise<AuthContext> {
  const cookieHeader = serializeCookieHeader(await cookies());
  const requestOrigin = resolveTrustedRequestOrigin(
    getRequestOriginFromHeaders(await headers()),
    defaultAuthOrigin
  );
  const authClient = createAiPmAuthServiceClient({
    authBaseURL: requestOrigin,
    defaultRedirectURI: `${requestOrigin}/`,
    fetcher(input, init) {
      return fetch(input, {
        ...init,
        cache: "no-store",
        headers: {
          ...init?.headers,
          ...(cookieHeader ? { cookie: cookieHeader } : {})
        }
      });
    }
  });

  try {
    return await authClient.getAuthContext();
  } catch {
    return createEmptyAuthContext();
  }
}

/**
 * 获取 AI PM 当前请求的业务会话。
 *
 * 真正的会话签发、续期和 Cookie 校验都在 Unified Auth SDK 内部完成；这里仅把 SDK 上下文整理成
 * 页面和 API 已经使用的 AppSession 结构，方便权限、负责人筛选和工作区成员同步继续走同一入口。
 */
export async function getSession(): Promise<AppSession | null> {
  const context = await getAuthContext();
  const authProvider = await resolveAccountProvider(context);
  const user = mapAuthUserToFeishuUser(
    authProvider && context.user
      ? {
          ...context.user,
          metadata: {
            ...context.user.metadata,
            provider: authProvider
          }
        }
      : context.user
  );

  if (!context.session || !user) {
    return null;
  }

  return {
    loginAt: context.session.id.split(":").slice(2).join(":") || new Date().toISOString(),
    user
  };
}

function getAuthSchemaName() {
  const realm = unifiedAuthConfig.realm ?? unifiedAuthConfig.app?.id ?? "default";

  return `auth_${realm.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function quotePgIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

/**
 * SDK 当前的 AuthUser 只稳定返回 user/session，某些 Better Auth 路径不会把 account.providerId
 * 带进 metadata；AI PM 的成员注册渠道必须展示真实 OAuth 来源，所以服务端会按当前 authUserId
 * 回查认证库账号表。查询失败时退回 SDK metadata，避免认证库短暂抖动影响用户进入业务页面。
 */
async function resolveAccountProvider(context: AuthContext) {
  const metadataProvider = typeof context.user?.metadata?.provider === "string" ? context.user.metadata.provider : undefined;

  if (metadataProvider && supportedAuthProviders.has(metadataProvider)) {
    return metadataProvider;
  }

  if (!context.session || !context.user?.id) {
    return undefined;
  }

  try {
    const schemaName = quotePgIdentifier(getAuthSchemaName());
    const result = await authPgPool.query<{ providerId: string }>(
      `select "providerId" from ${schemaName}."account" where "userId" = $1 order by "updatedAt" desc nulls last limit 1`,
      [context.user.id]
    );
    const providerId = result.rows[0]?.providerId;

    return providerId && supportedAuthProviders.has(providerId) ? providerId : undefined;
  } catch {
    return undefined;
  }
}
