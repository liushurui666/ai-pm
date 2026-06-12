import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/access/permissions";
import { createMastraKnowledgeWorkflow, createMySqlIndexQueue } from "@/lib/ai/knowledge";
import { getSession } from "@/lib/auth/session";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json(
      {
        error: "未登录"
      },
      {
        status: 401
      }
    );
  }

  const body = (await request.json().catch(() => null)) as { workspaceId?: string } | null;
  const data = await getDashboardData(session?.user, body?.workspaceId);
  const workspaceId = data.meta?.currentWorkspace?.id ?? body?.workspaceId;
  const permissions = data.meta?.permissions;

  if (!workspaceId) {
    return NextResponse.json(
      {
        error: "缺少工作区"
      },
      {
        status: 400
      }
    );
  }

  if (!permissions || !canPerformAction(permissions, "member:manage")) {
    return NextResponse.json(
      {
        error: permissions ? getPermissionDeniedReason(permissions, "member:manage") : "无管理员权限"
      },
      {
        status: 403
      }
    );
  }

  // 管理员重建只做批量入队，不同步重建 chunk/embedding/Qdrant；普通业务页面也不会展示同步状态。
  const queue = createMySqlIndexQueue();
  const workflow = createMastraKnowledgeWorkflow(queue);
  const result = await workflow.runWorkspaceRebuild({
    workspaceId,
    requestedBy: session?.user?.authUserId
  });

  return NextResponse.json({
    workspaceId,
    enqueued: result.enqueued,
    message: result.enqueued > 0 ? `已提交 ${result.enqueued} 个 AI 索引重建任务。` : "当前工作区暂无可重建的 AI 索引源。"
  });
}
