import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import type { AppView } from "@/components/project-management-platform";
import { getDashboardData } from "@/data/local-dashboard";
import { unifiedAuthConfig } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { getRequestOriginFromHeaders, resolveTrustedRequestOrigin } from "@/lib/auth/request-origin";
import { getAiPmAuthLoginHref, isAuthServiceConfigured } from "@/lib/auth/unified-auth";

export const dynamic = "force-dynamic";
const defaultAuthOrigin = unifiedAuthConfig.auth?.origin ?? unifiedAuthConfig.app?.origin ?? "http://localhost:3004";

const validAppViews = new Set<AppView>([
  "overview",
  "projects",
  "versionDashboard",
  "tasks",
  "bugs",
  "requirements",
  "assistant",
  "members"
]);

function resolveInitialView(value?: string | string[]) {
  const view = Array.isArray(value) ? value[0] : value;

  return view && validAppViews.has(view as AppView) ? (view as AppView) : "overview";
}

function resolveSingleParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function buildWorkbenchReturnPath(params?: { view?: string | string[]; workspaceId?: string | string[] }) {
  const query = new URLSearchParams();
  const view = resolveSingleParam(params?.view);
  const workspaceId = resolveSingleParam(params?.workspaceId);

  if (view && view !== "overview" && validAppViews.has(view as AppView)) {
    query.set("view", view);
  }

  if (workspaceId) {
    query.set("workspaceId", workspaceId);
  }

  const queryString = query.toString();

  return queryString ? `/workbench?${queryString}` : "/workbench";
}

export default async function WorkbenchPage({
  searchParams
}: {
  searchParams?: Promise<{
    view?: string | string[];
    workspaceId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const requestOrigin = resolveTrustedRequestOrigin(
    getRequestOriginFromHeaders(await headers()),
    defaultAuthOrigin
  );

  // 工作台仍保持强登录要求；公开首页只给入口，真实项目数据必须经过统一认证会话。
  if (isAuthServiceConfigured() && !session) {
    redirect(getAiPmAuthLoginHref(buildWorkbenchReturnPath(params), {
      appBaseURL: requestOrigin,
      authBaseURL: requestOrigin
    }));
  }

  const initialWorkspaceId = resolveSingleParam(params?.workspaceId);
  const initialDashboardResult = await getDashboardData(session?.user, initialWorkspaceId)
    .then((data) => ({
      data,
      error: ""
    }))
    .catch((error: unknown) => ({
      data: null,
      // 首屏服务端预取失败时仍交给工作台壳展示可读错误，避免数据库短暂抖动直接触发 Next 错误页。
      error: error instanceof Error ? error.message : "读取项目数据失败"
    }));

  return (
    <ProjectManagementPlatform
      initialData={initialDashboardResult.data ?? undefined}
      initialLoadError={initialDashboardResult.error}
      initialView={resolveInitialView(params?.view)}
      initialWorkspaceId={initialWorkspaceId}
    />
  );
}
