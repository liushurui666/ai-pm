import { cookies } from "next/headers";
import type { AuthContext } from "@rc-tool/unified-auth-sdk/service-client";
import type { AppSession } from "@/types/auth";
import { createAiPmAuthServiceClient, createEmptyAuthContext, mapAuthUserToFeishuUser } from "@/lib/auth/unified-auth";

function serializeCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((item) => `${item.name}=${encodeURIComponent(item.value)}`)
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
  const authClient = createAiPmAuthServiceClient({
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
  const user = mapAuthUserToFeishuUser(context.user);

  if (!context.session || !user) {
    return null;
  }

  return {
    loginAt: context.session.id.split(":").slice(2).join(":") || new Date().toISOString(),
    user
  };
}
