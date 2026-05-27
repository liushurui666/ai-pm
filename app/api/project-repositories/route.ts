import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/permissions";
import { getSession } from "@/lib/session";
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

  if (isFeishuAuthConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;
    const data = await getDashboardData(session?.user, workspaceId);

    return NextResponse.json({
      repositories: await listProjectRepositories(data.meta?.currentWorkspace?.id ?? "ws-default")
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

  if (isFeishuAuthConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Partial<ProjectRepository> | null;

  if (!body?.repoFullName || !body.cloneUrl) {
    return NextResponse.json({ error: "缺少仓库名称或 cloneUrl" }, { status: 400 });
  }

  try {
    const data = await getDashboardData(session?.user, body.workspaceId);
    const permissions = data.meta?.permissions;

    if (!permissions || !canPerformAction(permissions, "member:manage")) {
      return NextResponse.json(
        {
          error: permissions ? getPermissionDeniedReason(permissions, "member:manage") : "无仓库配置权限"
        },
        {
          status: 403
        }
      );
    }

    const repository = await createProjectRepository({
      workspaceId: data.meta?.currentWorkspace?.id ?? "ws-default",
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
