import { NextRequest, NextResponse } from "next/server";
import { createDashboardWorkspace, getDashboardData } from "@/data/local-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu/auth";
import { getPermissionDeniedReason } from "@/lib/access/permissions";
import { getSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isFeishuAuthConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentWorkspaceId?: string;
    values?: Record<string, unknown>;
  } | null;
  const data = await getDashboardData(session?.user, body?.currentWorkspaceId);
  const permissions = data.meta?.permissions;

  if (!permissions?.canManageMembers) {
    return NextResponse.json(
      {
        error: permissions ? getPermissionDeniedReason(permissions, "member:manage") : "无工作区管理权限"
      },
      {
        status: 403
      }
    );
  }

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
