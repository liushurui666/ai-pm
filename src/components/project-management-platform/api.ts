
import type { DashboardData, FeishuPerson } from "@/types/dashboard";

export type PeopleResponse = {
  people?: FeishuPerson[];
  error?: string;
};

export const sessionExpiredMessage = "登录状态已失效，请重新登录。";

type AuthFetchOptions = {
  redirectOnUnauthorized?: boolean;
};

// 业务工作台的客户端接口统一在这里处理 401，避免不同模块各自展示原始 `{ error: "未登录" }`。
// 登录页需要拿到当前完整地址作为回跳目标，否则用户在成员管理、版本大屏或 Bug 深链里触发会话过期时会丢失现场。
export function redirectToLogin() {
  const loginUrl = new URL("/login", window.location.origin);
  const redirectURI = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  loginUrl.searchParams.set("client_id", "ai-pm");
  loginUrl.searchParams.set("error", "session_expired");
  loginUrl.searchParams.set("redirect_uri", new URL(redirectURI || "/workbench", window.location.origin).toString());
  window.location.replace(loginUrl.toString());
}

export function createSessionExpiredError() {
  return new Error(sessionExpiredMessage);
}

export function isSessionExpiredError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error ?? "");

  return message.includes(sessionExpiredMessage) || message.includes("未登录");
}

// AI SDK 的 ChatBox、普通 JSON 接口和后续新增工作台请求都应显式携带同源 Cookie。
// 如果 Auth Service 判定会话失效，这里统一触发登录回跳并抛出可读错误，避免把服务端 JSON 原样暴露给用户。
export async function fetchWithAuthRedirect(input: RequestInfo | URL, init?: RequestInit, options: AuthFetchOptions = {}) {
  const response = await fetch(input, {
    ...init,
    cache: init?.cache ?? "no-store",
    credentials: init?.credentials ?? "same-origin"
  });

  if (response.status === 401) {
    if (options.redirectOnUnauthorized !== false) {
      redirectToLogin();
    }

    throw createSessionExpiredError();
  }

  return response;
}

// 统一封装仪表盘读取逻辑，确保工作区切换和首屏加载使用同一套登录态处理。
export async function fetchDashboardFromApi(workspaceId?: string | null) {
  const url = new URL("/api/dashboard", window.location.origin);

  if (workspaceId) {
    url.searchParams.set("workspaceId", workspaceId);
  }

  const response = await fetchWithAuthRedirect(url.toString());
  const nextData = (await response.json()) as DashboardData & { error?: string };

  if (!response.ok) {
    throw new Error(nextData.error || "读取项目数据失败");
  }

  return nextData;
}
