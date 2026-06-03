import { redirect } from "next/navigation";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import type { AppView } from "@/components/project-management-platform";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";

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

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<{
    view?: string | string[];
    workspaceId?: string | string[];
  }>;
}) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    redirect("/login");
  }

  const params = await searchParams;

  const initialWorkspaceId = Array.isArray(params?.workspaceId) ? params?.workspaceId[0] : params?.workspaceId;

  return <ProjectManagementPlatform initialView={resolveInitialView(params?.view)} initialWorkspaceId={initialWorkspaceId} />;
}
