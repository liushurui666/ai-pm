import { NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/access/permissions";
import { getSession } from "@/lib/auth/session";
import { cancelBugFixJob, getBugFixJob } from "@/server/repositories/bug-fix-jobs";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      jobId: string;
    }>;
  }
) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { jobId } = await context.params;

  try {
    const data = await getDashboardData(session?.user);
    const permissions = data.meta?.permissions;

    if (!permissions || !canPerformAction(permissions, "bug:update")) {
      return NextResponse.json(
        {
          error: permissions ? getPermissionDeniedReason(permissions, "bug:update") : "无取消 AI 修复任务权限"
        },
        {
          status: 403
        }
      );
    }

    const existingJob = await getBugFixJob(jobId);

    if (!existingJob || existingJob.workspaceId !== data.meta?.currentWorkspace?.id) {
      return NextResponse.json({ error: "AI 修复任务不存在" }, { status: 404 });
    }

    const job = await cancelBugFixJob(
      jobId,
      session?.user.name || session?.user.enName || session?.user.email || session?.user.openId || "系统"
    );

    return NextResponse.json({
      job,
      message: "已取消 AI 修复任务"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "取消 AI 修复任务失败"
      },
      {
        status: 502
      }
    );
  }
}
