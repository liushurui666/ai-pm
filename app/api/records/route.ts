import { NextRequest, NextResponse } from "next/server";
import { createDashboardRecord, deleteDashboardRecord, getDashboardData, updateDashboardRecord } from "@/data/local-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import type { BugReport } from "@/types/dashboard";
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

function getDeleteAction(type: DashboardEntityType) {
  if (isRequirementManagementType(type)) {
    return "requirement:delete";
  }

  if (type === "bug") {
    return "bug:delete";
  }

  return "member:manage";
}

const limitedBugUpdateFields = [
  "status",
  "owner",
  "ownerMemberId",
  "ownerOpenId",
  "ownerUnionId",
  "ownerUserId",
  "ownerEmail",
  "ownerAvatarUrl"
] as const;

function createLimitedBugUpdateValues(existingBug: BugReport, values: Record<string, unknown>) {
  const nextValues: Record<string, unknown> = { ...existingBug };

  for (const field of limitedBugUpdateFields) {
    if (Object.prototype.hasOwnProperty.call(values, field)) {
      nextValues[field] = values[field];
    }
  }

  return nextValues;
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
    return NextResponse.json(await createDashboardRecord(body.type, body.values, body.workspaceId, session?.user));
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

  let updateValues = body.values;

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

  if (body.type === "bug") {
    const data = await getDashboardData(session?.user, body.workspaceId);
    const permissions = data.meta?.permissions;

    if (!permissions || !canPerformAction(permissions, "bug:update")) {
      return NextResponse.json(
        {
          error: permissions ? getPermissionDeniedReason(permissions, "bug:update") : "无编辑权限"
        },
        {
          status: 403
        }
      );
    }

    if (!permissions.canEditBugsFully) {
      const existingBug = data.bugs.find((bug) => bug.id === body.id);

      if (!existingBug) {
        return NextResponse.json(
          {
            error: "记录不存在或已被删除"
          },
          {
            status: 404
          }
        );
      }

      updateValues = createLimitedBugUpdateValues(existingBug, body.values);
    }
  }

  try {
    return NextResponse.json(await updateDashboardRecord(body.type, body.id, updateValues, session?.user));
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
  const action = getDeleteAction(body.type);

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
