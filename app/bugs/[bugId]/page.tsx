import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import { getDashboardData } from "@/data/local-dashboard";
import { authConfig } from "@/lib/auth/config";
import { getRequestOriginFromHeaders, resolveTrustedRequestOrigin } from "@/lib/auth/request-origin";
import { getAiPmAuthLoginHref, isAuthServiceConfigured } from "@/lib/auth/client";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const defaultAuthOrigin = authConfig.auth.origin;

export default async function BugEditPage({
  params,
  searchParams
}: {
  params: Promise<{
    bugId: string;
  }>;
  searchParams?: Promise<{
    workspaceId?: string | string[];
  }>;
}) {
  const session = await getSession();
  const [{ bugId }, query] = await Promise.all([params, searchParams]);
  const initialWorkspaceId = Array.isArray(query?.workspaceId) ? query?.workspaceId[0] : query?.workspaceId;
  const requestOrigin = resolveTrustedRequestOrigin(
    getRequestOriginFromHeaders(await headers()),
    defaultAuthOrigin
  );

  if (isAuthServiceConfigured() && !session) {
    const queryString = initialWorkspaceId ? `?workspaceId=${encodeURIComponent(initialWorkspaceId)}` : "";

    redirect(getAiPmAuthLoginHref(`/bugs/${bugId}${queryString}`, {
      appBaseURL: requestOrigin,
      authBaseURL: requestOrigin
    }));
  }

  const initialDashboardResult = await getDashboardData(session?.user, initialWorkspaceId)
    .then((data) => ({
      data,
      error: ""
    }))
    .catch((error: unknown) => ({
      data: null,
      // Bug 深链同样使用工作台主壳；预取失败时保留应用内错误态，避免刷新 Bug 详情直接落到 Next 错误页。
      error: error instanceof Error ? error.message : "读取项目数据失败"
    }));

  return (
    <ProjectManagementPlatform
      initialBugId={bugId}
      initialData={initialDashboardResult.data ?? undefined}
      initialLoadError={initialDashboardResult.error}
      initialView="bugEdit"
      initialWorkspaceId={initialWorkspaceId}
    />
  );
}
