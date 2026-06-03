import { NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSession();
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || undefined;

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json(
      {
        error: "未登录"
      },
      {
        status: 401
      }
    );
  }

  try {
    return NextResponse.json(await getDashboardData(session?.user, workspaceId));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取项目数据失败"
      },
      {
        status: 502
      }
    );
  }
}
