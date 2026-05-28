import { NextRequest, NextResponse } from "next/server";
import { listFeishuPeople } from "@/lib/feishu/users";
import { isFeishuAuthConfigured } from "@/lib/feishu/auth";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const configured = isFeishuAuthConfigured();

  if (configured && !session) {
    return NextResponse.json(
      {
        error: "未登录"
      },
      {
        status: 401
      }
    );
  }

  if (!configured) {
    return NextResponse.json({
      people: []
    });
  }

  const query = request.nextUrl.searchParams.get("query") ?? "";

  try {
    return NextResponse.json({
      people: await listFeishuPeople(query)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取飞书通讯录失败"
      },
      {
        status: 502
      }
    );
  }
}
