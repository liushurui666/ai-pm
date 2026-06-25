import { NextRequest, NextResponse } from "next/server";
import {
  createDashboardMember,
  getWorkspaceAccessContext,
  updateDashboardMember
} from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getPermissionDeniedReason } from "@/lib/access/permissions";
import { getSession } from "@/lib/auth/session";
import { readDashboardMembersDatabase } from "@/data/database-dashboard";

async function getAuthorizedMemberContext(workspaceId?: string) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return {
      response: NextResponse.json({ error: "未登录" }, { status: 401 })
    };
  }

  // 成员接口只需要当前工作区、当前成员权限和 workspace_members 列表；
  // 不能为了成员管理权限读取项目、任务、Bug、需求等整份 dashboard，否则成员配置会被无关业务数据拖慢。
  const accessContext = await getWorkspaceAccessContext(session?.user, workspaceId);

  return {
    ...accessContext
  };
}

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || undefined;
  const context = await getAuthorizedMemberContext(workspaceId);

  if (context.response) {
    return context.response;
  }

  // GET 成员列表同样只读当前工作区成员表，和服务端 create/update 的轻量成员链路保持一致。
  const members = await readDashboardMembersDatabase(context.currentWorkspace.id);

  return NextResponse.json({
    members,
    currentWorkspace: context.currentWorkspace,
    currentMember: context.currentMember,
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

  if (!permissions.canManageMembers) {
    return NextResponse.json(
      {
        error: getPermissionDeniedReason(permissions, "member:manage")
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
    return NextResponse.json(await createDashboardMember(body.values, context.currentWorkspace.id));
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

  if (!permissions.canManageMembers) {
    return NextResponse.json(
      {
        error: getPermissionDeniedReason(permissions, "member:manage")
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
