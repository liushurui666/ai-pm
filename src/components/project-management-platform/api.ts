
import type { DashboardData, FeishuPerson } from "@/types/dashboard";

export type PeopleResponse = {
  people?: FeishuPerson[];
  error?: string;
};

function redirectToLogin() {
  const loginUrl = new URL("/login", window.location.origin);

  loginUrl.searchParams.set("error", "session_expired");
  window.location.assign(loginUrl.toString());
}

// 统一封装仪表盘读取逻辑，确保工作区切换和首屏加载使用同一套登录态处理。
export async function fetchDashboardFromApi(workspaceId?: string | null) {
  const url = new URL("/api/dashboard", window.location.origin);

  if (workspaceId) {
    url.searchParams.set("workspaceId", workspaceId);
  }

  // 明确携带同源 Cookie，避免登录后首屏接口因会话未带上而停留在空加载态。
  const response = await fetch(url.toString(), {
    cache: "no-store",
    credentials: "same-origin"
  });
  const nextData = (await response.json()) as DashboardData & { error?: string };

  if (response.status === 401) {
    redirectToLogin();

    throw new Error("登录状态已失效，请重新登录。");
  }

  if (!response.ok) {
    throw new Error(nextData.error || "读取项目数据失败");
  }

  return nextData;
}
