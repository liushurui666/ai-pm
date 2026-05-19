import { redirect } from "next/navigation";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import type { AppView } from "@/components/project-management-platform";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const validAppViews = new Set<AppView>(["overview", "projects", "tasks", "bugs", "requirements", "risks", "docs", "reports"]);

function resolveInitialView(value?: string | string[]) {
  const view = Array.isArray(value) ? value[0] : value;

  return view && validAppViews.has(view as AppView) ? (view as AppView) : "overview";
}

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
}) {
  const session = await getSession();

  if (isFeishuAuthConfigured() && !session) {
    redirect("/login");
  }

  const params = await searchParams;

  return <ProjectManagementPlatform initialView={resolveInitialView(params?.view)} />;
}
