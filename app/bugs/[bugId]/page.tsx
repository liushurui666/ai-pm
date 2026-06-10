import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import { unifiedAuthConfig } from "@/lib/auth/config";
import { getRequestOriginFromHeaders, resolveTrustedRequestOrigin } from "@/lib/auth/request-origin";
import { getAiPmAuthLoginHref, isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const defaultAuthOrigin = unifiedAuthConfig.auth?.origin ?? unifiedAuthConfig.app?.origin ?? "http://localhost:3004";

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

  return (
    <ProjectManagementPlatform
      initialBugId={bugId}
      initialView="bugEdit"
      initialWorkspaceId={initialWorkspaceId}
    />
  );
}
