import { NextRequest, NextResponse } from "next/server";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import { getSession } from "@/lib/auth/session";
import {
  addProjectMembers,
  getProjectManagementSnapshot,
  parseFunctionalRolesInput,
  parseProjectAccessLevel,
  ProjectManagementError,
  removeProjectMember,
  transferProjectOwner,
  updateProjectMember
} from "@/lib/project-management";

type ProjectManagementRequestBody = {
  action?: "members" | "transferOwner" | "member";
  workspaceId?: string;
  projectId?: string;
  memberIds?: unknown;
  newOwnerMemberId?: unknown;
  keepPreviousOwnerAsAdmin?: unknown;
  reason?: unknown;
  permissionId?: unknown;
  memberId?: unknown;
  accessLevel?: unknown;
  functionalRoles?: unknown;
};

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalText).filter((item): item is string => Boolean(item))
    : [];
}

function hasOwn(record: object, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

async function getAuthorizedSession() {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return {
      response: NextResponse.json({ error: "未登录" }, { status: 401 })
    };
  }

  return { user: session?.user };
}

function projectManagementErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ProjectManagementError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 502 }
  );
}

/**
 * 读取项目治理聚合视图。
 *
 * 项目、成员权限、最近活动和当前用户 capability 在同一响应返回，
 * 前端不需要用多个请求自行拼接权限事实，也不会根据中文角色名称猜测是否允许操作。
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthorizedSession();

  if (auth.response) {
    return auth.response;
  }

  const workspaceId = optionalText(request.nextUrl.searchParams.get("workspaceId"));
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();

  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId。" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getProjectManagementSnapshot({
      user: auth.user,
      workspaceId,
      projectId
    }));
  } catch (error) {
    return projectManagementErrorResponse(error, "读取项目治理信息失败");
  }
}

/**
 * POST 只承载“批量加入成员”和“负责人交接”两个复合命令。
 * 这两类操作都会同时改变多行数据并写入活动记录，不应被拆成多次普通 PATCH。
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedSession();

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as ProjectManagementRequestBody | null;
  const projectId = optionalText(body?.projectId);
  const workspaceId = optionalText(body?.workspaceId);

  if (!body?.action || !projectId) {
    return NextResponse.json({ error: "缺少 action 或 projectId。" }, { status: 400 });
  }

  try {
    if (body.action === "members") {
      const result = await addProjectMembers({
        user: auth.user,
        workspaceId,
        projectId,
        memberIds: stringArray(body.memberIds),
        accessLevel: hasOwn(body, "accessLevel") ? parseProjectAccessLevel(body.accessLevel) : undefined,
        functionalRoles: hasOwn(body, "functionalRoles") ? parseFunctionalRolesInput(body.functionalRoles) : undefined
      });
      const snapshot = await getProjectManagementSnapshot({ user: auth.user, workspaceId, projectId });

      return NextResponse.json({
        message: result.message,
        permissions: snapshot.permissions,
        activity: result.activity,
        addedMemberIds: result.addedMemberIds,
        skippedMemberIds: result.skippedMemberIds
      });
    }

    if (body.action === "transferOwner") {
      const newOwnerMemberId = optionalText(body.newOwnerMemberId);

      if (!newOwnerMemberId) {
        throw new ProjectManagementError("缺少 newOwnerMemberId。", 400);
      }

      const result = await transferProjectOwner({
        user: auth.user,
        workspaceId,
        projectId,
        newOwnerMemberId,
        keepPreviousOwnerAsAdmin: typeof body.keepPreviousOwnerAsAdmin === "boolean"
          ? body.keepPreviousOwnerAsAdmin
          : true,
        reason: optionalText(body.reason) ?? ""
      });
      const snapshot = await getProjectManagementSnapshot({ user: auth.user, workspaceId, projectId });

      return NextResponse.json({
        message: result.message,
        project: snapshot.project,
        permissions: snapshot.permissions,
        activity: result.activity
      });
    }

    return NextResponse.json({ error: "POST action 只支持 members 或 transferOwner。" }, { status: 400 });
  } catch (error) {
    return projectManagementErrorResponse(error, "更新项目治理信息失败");
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthorizedSession();

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as ProjectManagementRequestBody | null;
  const projectId = optionalText(body?.projectId);
  const workspaceId = optionalText(body?.workspaceId);

  if (body?.action !== "member" || !projectId) {
    return NextResponse.json({ error: "PATCH action 必须是 member，且必须提供 projectId。" }, { status: 400 });
  }

  try {
    const result = await updateProjectMember({
      user: auth.user,
      workspaceId,
      projectId,
      permissionId: optionalText(body.permissionId),
      memberId: optionalText(body.memberId),
      accessLevel: hasOwn(body, "accessLevel") ? parseProjectAccessLevel(body.accessLevel) : undefined,
      functionalRoles: hasOwn(body, "functionalRoles") ? parseFunctionalRolesInput(body.functionalRoles) : undefined
    });
    const snapshot = await getProjectManagementSnapshot({ user: auth.user, workspaceId, projectId });

    return NextResponse.json({
      message: result.message,
      permissions: snapshot.permissions,
      activity: result.activity
    });
  } catch (error) {
    return projectManagementErrorResponse(error, "更新项目成员权限失败");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthorizedSession();

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as ProjectManagementRequestBody | null;
  const projectId = optionalText(body?.projectId);
  const workspaceId = optionalText(body?.workspaceId);

  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId。" }, { status: 400 });
  }

  try {
    const result = await removeProjectMember({
      user: auth.user,
      workspaceId,
      projectId,
      permissionId: optionalText(body?.permissionId),
      memberId: optionalText(body?.memberId)
    });
    const snapshot = await getProjectManagementSnapshot({ user: auth.user, workspaceId, projectId });

    return NextResponse.json({
      message: result.message,
      permissions: snapshot.permissions,
      activity: result.activity
    });
  } catch (error) {
    return projectManagementErrorResponse(error, "移除项目成员失败");
  }
}
