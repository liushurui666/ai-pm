import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceAccessContext } from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/access/permissions";
import { getSession } from "@/lib/auth/session";
import {
  createProjectRepository,
  listProjectRepositories
} from "@/server/repositories/project-repositories";
import type { ProjectRepository } from "@/types/dashboard";

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : [];
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;
    // 仓库列表只依赖当前有效工作区；轻量 access context 可以复用登录/成员匹配规则，
    // 同时避免为了一个仓库下拉读取整份 dashboard。
    const accessContext = await getWorkspaceAccessContext(session?.user, workspaceId);

    return NextResponse.json({
      repositories: await listProjectRepositories(accessContext.currentWorkspace.id)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取项目仓库失败"
      },
      {
        status: 502
      }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Partial<ProjectRepository> | null;

  if (!body?.repoFullName || !body.cloneUrl) {
    return NextResponse.json({ error: "缺少仓库名称或 cloneUrl" }, { status: 400 });
  }

  try {
    // 仓库配置只需要成员管理权限和目标工作区，不需要项目、任务、Bug、需求等完整 dashboard。
    const accessContext = await getWorkspaceAccessContext(session?.user, body.workspaceId);
    const permissions = accessContext.permissions;

    if (!canPerformAction(permissions, "member:manage")) {
      return NextResponse.json(
        {
          error: getPermissionDeniedReason(permissions, "member:manage")
        },
        {
          status: 403
        }
      );
    }

    const repository = await createProjectRepository({
      workspaceId: accessContext.currentWorkspace.id,
      projectId: body.projectId,
      provider: body.provider ?? "github",
      repoFullName: body.repoFullName,
      cloneUrl: body.cloneUrl,
      defaultBranch: body.defaultBranch,
      packageManager: body.packageManager,
      installCommand: body.installCommand,
      lintCommand: body.lintCommand,
      testCommand: body.testCommand,
      buildCommand: body.buildCommand,
      allowedPaths: asStringArray(body.allowedPaths),
      blockedPaths: asStringArray(body.blockedPaths),
      defaultReviewers: asStringArray(body.defaultReviewers)
    });

    return NextResponse.json({
      repository,
      message: "已创建项目仓库配置"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建项目仓库失败"
      },
      {
        status: 502
      }
    );
  }
}
