import { redirect } from "next/navigation";
import { ProjectManagementPlatform } from "@/components/project-management-platform";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();

  if (isFeishuAuthConfigured() && !session) {
    redirect("/login");
  }

  return <ProjectManagementPlatform />;
}
