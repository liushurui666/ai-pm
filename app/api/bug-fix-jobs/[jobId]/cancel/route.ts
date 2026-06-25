import { NextResponse } from "next/server";
import { getWorkspaceAccessContext } from "@/data/local-dashboard";
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
    const existingJob = await getBugFixJob(jobId);

    if (!existingJob) {
      return NextResponse.json({ error: "AI 修复任务不存在" }, { status: 404 });
    }

    // 取消任务按 job 所属工作区校验成员权限，不读取整份工作台数据。
    const accessContext = await getWorkspaceAccessContext(session?.user, existingJob.workspaceId);
    const permissions = accessContext.permissions;

    if (!canPerformAction(permissions, "bug:update")) {
      return NextResponse.json(
        {
          error: getPermissionDeniedReason(permissions, "bug:update")
        },
        {
          status: 403
        }
      );
    }

    if (existingJob.workspaceId !== accessContext.currentWorkspace.id) {
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
