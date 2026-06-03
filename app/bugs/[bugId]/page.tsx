import { redirect } from "next/navigation";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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

  if (isAuthServiceConfigured() && !session) {
    redirect("/login");
  }

  const [{ bugId }, query] = await Promise.all([params, searchParams]);
  const initialWorkspaceId = Array.isArray(query?.workspaceId) ? query?.workspaceId[0] : query?.workspaceId;

  return (
    <ProjectManagementPlatform
      initialBugId={bugId}
      initialView="bugEdit"
      initialWorkspaceId={initialWorkspaceId}
    />
  );
}
