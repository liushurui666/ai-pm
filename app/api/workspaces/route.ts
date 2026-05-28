import { NextRequest, NextResponse } from "next/server";
import { createDashboardWorkspace } from "@/data/local-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu/auth";
import { getSession } from "@/lib/auth/session";

// 工作区是平台顶层隔离空间，创建新工作区不应继承“当前工作区成员管理”权限；否则新用户在旧工作区里是只读角色时，会被挡在创建自己的工作区之前。
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isFeishuAuthConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentWorkspaceId?: string;
    values?: Record<string, unknown>;
  } | null;

  if (!body?.values) {
    return NextResponse.json({ error: "工作区参数不完整" }, { status: 400 });
  }

  try {
    return NextResponse.json(await createDashboardWorkspace(body.values, session?.user));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建工作区失败"
      },
      {
        status: 400
      }
    );
  }
}
