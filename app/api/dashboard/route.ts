import { NextResponse } from "next/server";
import { getDashboardData } from "@/data/feishu-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  if (isFeishuAuthConfigured() && !session) {
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
    return NextResponse.json(await getDashboardData(session?.user));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取飞书数据失败"
      },
      {
        status: 502
      }
    );
  }
}
