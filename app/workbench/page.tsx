import { redirect } from "next/navigation";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import type { AppView } from "@/components/project-management-platform";
import { getSession } from "@/lib/auth/session";
import { getAiPmAuthLoginHref, isAuthServiceConfigured } from "@/lib/auth/unified-auth";

export const dynamic = "force-dynamic";

const validAppViews = new Set<AppView>([
  "overview",
  "projects",
  "versionDashboard",
  "tasks",
  "bugs",
  "requirements",
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

  if (view && view !== "overview" && validAppViews.has(view as AppView)) {
    query.set("view", view);
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

  // 工作台仍保持强登录要求；公开首页只给入口，真实项目数据必须经过统一认证会话。
  if (isAuthServiceConfigured() && !session) {
    redirect(getAiPmAuthLoginHref(buildWorkbenchReturnPath(params)));
  }

  const initialWorkspaceId = resolveSingleParam(params?.workspaceId);

  return <ProjectManagementPlatform initialView={resolveInitialView(params?.view)} initialWorkspaceId={initialWorkspaceId} />;
}
