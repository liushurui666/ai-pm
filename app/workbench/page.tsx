import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import type { AppView } from "@/components/project-management-platform";
import { getDashboardData } from "@/data/local-dashboard";
import { authConfig } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { getRequestOriginFromHeaders, resolveTrustedRequestOrigin } from "@/lib/auth/request-origin";
import { getAiPmAuthLoginHref, isAuthServiceConfigured } from "@/lib/auth/client";

export const dynamic = "force-dynamic";
const defaultAuthOrigin = authConfig.auth.origin;

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
const validProjectDetailTabs = new Set([
  "overview",
  "requirements",
  "members",
  "activities",
  "schedule"
]);

function resolveInitialView(value?: string | string[]) {
  const view = Array.isArray(value) ? value[0] : value;

  return view && validAppViews.has(view as AppView) ? (view as AppView) : "overview";
}

function resolveSingleParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveBoundedParam(value?: string | string[], maxLength = 128) {
  const resolved = resolveSingleParam(value)?.trim();

  return resolved && resolved.length <= maxLength ? resolved : undefined;
}

type WorkbenchSearchParams = {
  view?: string | string[];
  workspaceId?: string | string[];
  requirementId?: string | string[];
  projectId?: string | string[];
  versionId?: string | string[];
  detailTab?: string | string[];
};

function buildWorkbenchReturnPath(params?: WorkbenchSearchParams) {
  const query = new URLSearchParams();
  const view = resolveSingleParam(params?.view);
  const workspaceId = resolveBoundedParam(params?.workspaceId);
  const requirementId = resolveBoundedParam(params?.requirementId);
  const projectId = resolveBoundedParam(params?.projectId);
  const versionId = resolveBoundedParam(params?.versionId);
  const detailTab = resolveBoundedParam(params?.detailTab, 32);

  if (view && view !== "overview" && validAppViews.has(view as AppView)) {
    query.set("view", view);
  }

  if (workspaceId) {
    query.set("workspaceId", workspaceId);
  }

  // 登录回跳需要保留项目详情上下文；真实归属仍在工作区数据加载后校验，查询参数本身不触发跨租户读取。
  if (view === "projects" && projectId) {
    query.set("projectId", projectId);

    if (versionId) {
      query.set("versionId", versionId);

      if (detailTab && validProjectDetailTabs.has(detailTab)) {
        query.set("detailTab", detailTab);
      }
    }
  }

  // 任务筛选的登录回跳必须保留需求主键及归属快照；真实可见性仍由当前工作区数据校验。
  if (view === "tasks" && requirementId) {
    query.set("requirementId", requirementId);

    if (projectId) {
      query.set("projectId", projectId);
    }

    if (versionId) {
      query.set("versionId", versionId);
    }
  }

  const queryString = query.toString();

  return queryString ? `/workbench?${queryString}` : "/workbench";
}

export default async function WorkbenchPage({
  searchParams
}: {
  searchParams?: Promise<WorkbenchSearchParams>;
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

  const initialView = resolveInitialView(params?.view);
  const initialWorkspaceId = resolveBoundedParam(params?.workspaceId);
  const requestedProjectId = resolveBoundedParam(params?.projectId);
  const requestedVersionId = resolveBoundedParam(params?.versionId);
  const initialProjectId = initialView === "projects" ? requestedProjectId : undefined;
  const initialProjectVersionId = initialView === "projects" ? requestedVersionId : undefined;
  const initialTaskRequirementId = initialView === "tasks"
    ? resolveBoundedParam(params?.requirementId)
    : undefined;
  const initialTaskProjectId = initialView === "tasks" ? requestedProjectId : undefined;
  const initialTaskVersionId = initialView === "tasks" ? requestedVersionId : undefined;
  const requestedDetailTab = resolveBoundedParam(params?.detailTab, 32);
  const initialProjectDetailTab = initialView === "projects"
    && requestedDetailTab
    && validProjectDetailTabs.has(requestedDetailTab)
    ? requestedDetailTab
    : undefined;
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
      initialView={initialView}
      initialWorkspaceId={initialWorkspaceId}
      initialProjectId={initialProjectId}
      initialProjectVersionId={initialProjectVersionId}
      initialProjectDetailTab={initialProjectDetailTab}
      initialTaskRequirementId={initialTaskRequirementId}
      initialTaskProjectId={initialTaskProjectId}
      initialTaskVersionId={initialTaskVersionId}
    />
  );
}
