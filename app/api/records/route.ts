import { NextRequest, NextResponse } from "next/server";
import { createDashboardRecord, deleteDashboardRecord, getDashboardData, updateDashboardRecord } from "@/data/local-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import type { DashboardEntityType } from "@/types/records";

const entityTypes = new Set<DashboardEntityType>([
  "project",
  "task",
  "bug",
  "risk",
  "requirementVersion",
  "requirement",
  "document"
]);

function isRequirementManagementType(type: DashboardEntityType) {
  return type === "requirement" || type === "requirementVersion";
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as {
    type?: DashboardEntityType;
    workspaceId?: string;
    values?: Record<string, unknown>;
  } | null;

  if (!body?.type || !entityTypes.has(body.type) || !body.values) {
    return NextResponse.json(
      {
        error: "创建参数不完整"
      },
      {
        status: 400
      }
    );
  }

  if (isRequirementManagementType(body.type)) {
    const data = await getDashboardData(session?.user, body.workspaceId);
    const permissions = data.meta?.permissions;

    if (!permissions || !canPerformAction(permissions, "requirement:create")) {
      return NextResponse.json(
        {
          error: permissions ? getPermissionDeniedReason(permissions, "requirement:create") : "无创建权限"
        },
        {
          status: 403
        }
      );
    }
  }

  try {
    return NextResponse.json(await createDashboardRecord(body.type, body.values, body.workspaceId));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建记录失败"
      },
      {
        status: 502
      }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as {
    type?: DashboardEntityType;
    id?: string;
    workspaceId?: string;
    values?: Record<string, unknown>;
  } | null;

  if (!body?.type || !entityTypes.has(body.type) || !body.id || !body.values) {
    return NextResponse.json(
      {
        error: "更新参数不完整"
      },
      {
        status: 400
      }
    );
  }

  if (isRequirementManagementType(body.type)) {
    const data = await getDashboardData(session?.user, body.workspaceId);
    const permissions = data.meta?.permissions;

    if (!permissions || !canPerformAction(permissions, "requirement:update")) {
      return NextResponse.json(
        {
          error: permissions ? getPermissionDeniedReason(permissions, "requirement:update") : "无编辑权限"
        },
        {
          status: 403
        }
      );
    }
  }

  try {
    return NextResponse.json(await updateDashboardRecord(body.type, body.id, body.values));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "更新记录失败"
      },
      {
        status: 502
      }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as {
    type?: DashboardEntityType;
    id?: string;
    workspaceId?: string;
  } | null;

  if (!body?.type || !entityTypes.has(body.type) || !body.id) {
    return NextResponse.json(
      {
        error: "删除参数不完整"
      },
      {
        status: 400
      }
    );
  }

  const data = await getDashboardData(session?.user, body.workspaceId);
  const permissions = data.meta?.permissions;
  const action = isRequirementManagementType(body.type) ? "requirement:delete" : "member:manage";

  if (!permissions || !canPerformAction(permissions, action)) {
    return NextResponse.json(
      {
        error: permissions ? getPermissionDeniedReason(permissions, action) : "无删除权限"
      },
      {
        status: 403
      }
    );
  }

  try {
    return NextResponse.json(await deleteDashboardRecord(body.type, body.id));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "删除记录失败"
      },
      {
        status: 502
      }
    );
  }
}
