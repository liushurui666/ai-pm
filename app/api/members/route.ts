import { NextRequest, NextResponse } from "next/server";
import { createDashboardMember, getDashboardData, updateDashboardMember } from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getPermissionDeniedReason } from "@/lib/access/permissions";
import { getSession } from "@/lib/auth/session";

async function getAuthorizedMemberContext(workspaceId?: string) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return {
      response: NextResponse.json({ error: "未登录" }, { status: 401 })
    };
  }

  const data = await getDashboardData(session?.user, workspaceId);

  return {
    data,
    permissions: data.meta?.permissions
  };
}

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || undefined;
  const context = await getAuthorizedMemberContext(workspaceId);

  if (context.response) {
    return context.response;
  }

  return NextResponse.json({
    members: context.data?.members ?? [],
    currentWorkspace: context.data?.meta?.currentWorkspace,
    currentMember: context.data?.meta?.currentMember,
    permissions: context.permissions
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: string;
    values?: Record<string, unknown>;
  } | null;
  const context = await getAuthorizedMemberContext(body?.workspaceId);

  if (context.response) {
    return context.response;
  }

  const permissions = context.permissions;

  if (!permissions?.canManageMembers) {
    return NextResponse.json(
      {
        error: permissions ? getPermissionDeniedReason(permissions, "member:manage") : "无成员管理权限"
      },
      {
        status: 403
      }
    );
  }

  if (!body?.values) {
    return NextResponse.json(
      {
        error: "成员参数不完整"
      },
      {
        status: 400
      }
    );
  }

  try {
    return NextResponse.json(await createDashboardMember(body.values, context.data?.meta?.currentWorkspace?.id));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建成员失败"
      },
      {
        status: 400
      }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    workspaceId?: string;
    values?: Record<string, unknown>;
  } | null;
  const context = await getAuthorizedMemberContext(body?.workspaceId);

  if (context.response) {
    return context.response;
  }

  const permissions = context.permissions;

  if (!permissions?.canManageMembers) {
    return NextResponse.json(
      {
        error: permissions ? getPermissionDeniedReason(permissions, "member:manage") : "无成员管理权限"
      },
      {
        status: 403
      }
    );
  }

  if (!body?.id || !body.values) {
    return NextResponse.json(
      {
        error: "成员参数不完整"
      },
      {
        status: 400
      }
    );
  }

  try {
    return NextResponse.json(await updateDashboardMember(body.id, body.values));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "更新成员失败"
      },
      {
        status: 400
      }
    );
  }
}
