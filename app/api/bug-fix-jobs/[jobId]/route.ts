import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceAccessContext } from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";
import { getBugFixJob } from "@/server/repositories/bug-fix-jobs";

export async function GET(
  request: NextRequest,
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
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;

  try {
    const accessContext = await getWorkspaceAccessContext(session?.user, workspaceId);
    const job = await getBugFixJob(jobId);

    if (!job || job.workspaceId !== accessContext.currentWorkspace.id) {
      return NextResponse.json({ error: "AI 修复任务不存在" }, { status: 404 });
    }

    return NextResponse.json({
      job
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
