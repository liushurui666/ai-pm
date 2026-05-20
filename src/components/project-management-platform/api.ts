
import type { DashboardData, FeishuPerson } from "@/types/dashboard";

export type PeopleResponse = {
  people?: FeishuPerson[];
  error?: string;
};

// 统一封装仪表盘读取逻辑，确保工作区切换和首屏加载使用同一套登录态处理。
export async function fetchDashboardFromApi(workspaceId?: string | null) {
  const url = new URL("/api/dashboard", window.location.origin);

  if (workspaceId) {
    url.searchParams.set("workspaceId", workspaceId);
  }

  const response = await fetch(url.toString());
  const nextData = (await response.json()) as DashboardData & { error?: string };

  if (response.status === 401) {
    window.location.assign("/login");

    return null;
  }

  if (!response.ok) {
    throw new Error(nextData.error || "读取项目数据失败");
  }

  return nextData;
}
