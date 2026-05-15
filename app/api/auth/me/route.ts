import { NextResponse } from "next/server";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  return NextResponse.json({
    authenticated: Boolean(session),
    authConfigured: isFeishuAuthConfigured(),
    user: session?.user ?? null
  });
}
