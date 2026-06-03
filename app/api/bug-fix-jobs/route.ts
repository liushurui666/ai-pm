import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/access/permissions";
import { getSession } from "@/lib/auth/session";
import { createBugFixJob, listBugFixJobsByBug } from "@/server/repositories/bug-fix-jobs";
import {
  findRepositoryForBug,
  getProjectRepository,
  listProjectRepositories
} from "@/server/repositories/project-repositories";

function normalizeRequestText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const bugId = request.nextUrl.searchParams.get("bugId");
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;

  try {
    const data = await getDashboardData(session?.user, workspaceId);

    if (!bugId) {
      return NextResponse.json({
        repositories: await listProjectRepositories(data.meta?.currentWorkspace?.id ?? "ws-default")
      });
    }

    return NextResponse.json({
      jobs: await listBugFixJobsByBug(bugId)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取 AI 修复任务失败"
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

  const body = (await request.json().catch(() => null)) as {
    baseBranch?: string;
    bugId?: string;
    repositoryId?: string;
    workspaceId?: string;
  } | null;

  if (!body?.bugId) {
    return NextResponse.json({ error: "缺少 Bug ID" }, { status: 400 });
  }

  const requestedRepositoryId = normalizeRequestText(body.repositoryId);
  const requestedBaseBranch = normalizeRequestText(body.baseBranch);

  // 基准分支会进入 Worker 的 checkout 命令，先在 API 层拦截明显非法字符，后续 Git 命令仍保留最终校验。
  if (requestedBaseBranch && /[\s~^:?*\[\\]/.test(requestedBaseBranch)) {
    return NextResponse.json({ error: "基准分支名称包含 Git 不支持的字符" }, { status: 400 });
  }

  try {
    const data = await getDashboardData(session?.user, body.workspaceId);
    const permissions = data.meta?.permissions;
    const workspaceId = data.meta?.currentWorkspace?.id ?? body.workspaceId ?? "ws-default";

    if (!permissions || !canPerformAction(permissions, "bug:update")) {
      return NextResponse.json(
        {
          error: permissions ? getPermissionDeniedReason(permissions, "bug:update") : "无创建 AI 修复任务权限"
        },
        {
          status: 403
        }
      );
    }

    const bug = data.bugs.find((item) => item.id === body.bugId);

    if (!bug) {
      return NextResponse.json({ error: "Bug 不存在或不属于当前工作区" }, { status: 404 });
    }

    const repository = requestedRepositoryId
      ? await getProjectRepository(requestedRepositoryId)
      : await findRepositoryForBug(workspaceId, bug.project);

    if (!repository) {
      return NextResponse.json({ error: "当前 Bug 未匹配到可用代码仓库" }, { status: 400 });
    }

    const job = await createBugFixJob({
      workspaceId,
      bugId: bug.id,
      repositoryId: repository.id,
      baseBranch: requestedBaseBranch || repository.defaultBranch,
      requestedBy: session?.user.name || session?.user.enName || session?.user.email || session?.user.openId
    });

    return NextResponse.json({
      job,
      message: "已创建 AI 修复 MR 任务"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建 AI 修复任务失败"
      },
      {
        status: 502
      }
    );
  }
}
