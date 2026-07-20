import { cookies, headers } from "next/headers";
import type { AppSession } from "@/types/auth";
import { auth } from "@/lib/auth/server";
import { authPgPool } from "@/lib/auth/database";
import { authConfig } from "@/lib/auth/config";
import type { AuthContext, AuthUser } from "@/lib/auth/types";
import { getRequestOriginFromHeaders, resolveTrustedRequestOrigin } from "@/lib/auth/request-origin";
import { mapAuthUserToFeishuUser } from "@/lib/auth/client";
import { getAuthSchemaName } from "@/lib/auth/schema";

const supportedAuthProviders = new Set(["feishu", "google", "github", "email"]);
const authContextRetryDelaysMs = [120, 360];

export class AuthServiceUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("认证服务暂时不可用，请稍后重试。");
    this.name = "AuthServiceUnavailableError";
    this.cause = cause;
  }
}

function serializeCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((item) => {
      // Next 可能已对 Cookie value 解码，重新编码可避免中文值在构造 Better Auth Request 时违反 ByteString 约束。
      return `${item.name}=${encodeURIComponent(item.value)}`;
    })
    .join("; ");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDate(value: unknown) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

function toAuthContext(payload: unknown): AuthContext {
  const data = payload as {
    session?: { expiresAt?: unknown; id?: string | null; token?: string | null; userId?: string | null };
    user?: Record<string, unknown> & { email?: string | null; id?: string; image?: string | null; name?: string | null };
  } | null;
  const rawUser = data?.user;
  const rawSession = data?.session;
  let user: AuthUser | null = null;

  if (rawUser?.id) {
    const metadata = Object.fromEntries(
      Object.entries(rawUser).filter(([key]) => ![
        "createdAt",
        "email",
        "emailVerified",
        "id",
        "image",
        "name",
        "updatedAt",
      ].includes(key)),
    );

    user = {
      avatarUrl: rawUser.image ?? null,
      email: rawUser.email ?? null,
      id: rawUser.id,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      name: rawUser.name ?? null,
    };
  }

  return {
    session: rawSession?.userId
      ? {
          expiresAt: normalizeDate(rawSession.expiresAt),
          id: String(rawSession.id ?? rawSession.token ?? ""),
          userId: rawSession.userId,
        }
      : null,
    user,
  };
}

/**
 * 直接在当前 Next 进程内读取 Better Auth 会话。
 *
 * 旧链路会先通过 SDK client 发起同源 HTTP，再由 SDK hosted route 转发给 Better Auth；现在只保留最后一层。
 * 认证库短暂失败仍会极短重试，并在失败时抛出 503 语义，不把服务故障伪装成未登录 401。
 */
export async function getAuthContext(): Promise<AuthContext> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const origin = resolveTrustedRequestOrigin(
    getRequestOriginFromHeaders(requestHeaders),
    authConfig.auth.origin,
  );
  const cookieHeader = serializeCookieHeader(cookieStore);

  for (let attempt = 0; attempt <= authContextRetryDelaysMs.length; attempt += 1) {
    try {
      const authHeaders = new Headers(requestHeaders);

      if (cookieHeader) {
        authHeaders.set("cookie", cookieHeader);
      }

      const response = await auth.handler(new Request(new URL("/api/auth/get-session", origin), {
        headers: authHeaders,
        method: "GET",
      }));

      if (!response.ok) {
        throw new Error(`Better Auth get-session 返回 ${response.status}`);
      }

      return toAuthContext(await response.json().catch(() => null));
    } catch (error) {
      const retryDelay = authContextRetryDelaysMs[attempt];

      if (retryDelay !== undefined) {
        console.warn("[auth] retry auth context after transient failure", {
          attempt: attempt + 1,
          retryDelay,
        });
        await wait(retryDelay);
        continue;
      }

      console.error("[auth] failed to load auth context", error);
      throw new AuthServiceUnavailableError(error);
    }
  }

  throw new AuthServiceUnavailableError();
}

/**
 * 把 Better Auth 会话整理为 AI PM 业务层已有的 AppSession，不在此处签发或自行解析会话 Cookie。
 */
export async function getSession(): Promise<AppSession | null> {
  const context = await getAuthContext();
  const authProvider = await resolveAccountProvider(context);
  const user = mapAuthUserToFeishuUser(
    authProvider && context.user
      ? {
          ...context.user,
          metadata: { ...context.user.metadata, provider: authProvider },
        }
      : context.user,
  );

  if (!context.session || !user) {
    return null;
  }

  return {
    loginAt: context.session.id.split(":").slice(2).join(":") || new Date().toISOString(),
    user,
  };
}

function quotePgIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

/**
 * Better Auth session 不保证携带 OAuth provider，成员注册渠道因此直接从原 `auth_ai_pm.account` 回查。
 * 这里只读取 providerId，查询失败会退回会话 metadata，不影响用户进入工作台。
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
    const schemaName = quotePgIdentifier(getAuthSchemaName(authConfig.realm));
    const result = await authPgPool.query<{ providerId: string }>(
      `select "providerId" from ${schemaName}."account" where "userId" = $1 order by "updatedAt" desc nulls last limit 1`,
      [context.user.id],
    );
    const providerId = result.rows[0]?.providerId;

    return providerId && supportedAuthProviders.has(providerId) ? providerId : undefined;
  } catch {
    return undefined;
  }
}
