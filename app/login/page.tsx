import { redirect } from "next/navigation";
import { FeishuLoginPage } from "@/components/feishu-login-page";
import { isFeishuAuthConfigured } from "@/lib/feishu/auth";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{
    error?: string;
  }>;
}) {
  const session = await getSession();

  if (session) {
    redirect("/");
  }

  const params = await searchParams;

  return <FeishuLoginPage configured={isFeishuAuthConfigured()} error={params?.error} />;
}
