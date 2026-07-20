import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceAccessContext } from "@/data/local-dashboard";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/access/permissions";
import { getSession } from "@/lib/auth/session";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import { getPrismaClient } from "@/lib/database/prisma";

export const runtime = "nodejs";

const sourceStatuses = ["pending", "indexing", "ready", "failed", "disabled"] as const;
const jobStatuses = ["pending", "running", "success", "failed"] as const;

async function countByStatus<TStatus extends string>(
  statuses: readonly TStatus[],
  count: (status: TStatus) => Promise<number>
) {
  const entries = await Promise.all(statuses.map(async (status) => [status, await count(status)] as const));

  return Object.fromEntries(entries) as Record<TStatus, number>;
}

export async function GET(request: NextRequest) {
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

  const workspaceIdFromQuery = request.nextUrl.searchParams.get("workspaceId")?.trim();
  // AI 索引状态只需要定位当前工作区和校验管理员权限，避免读取整份工作台数据拖慢切换链路。
  const accessContext = await getWorkspaceAccessContext(session?.user, workspaceIdFromQuery);
  const workspaceId = accessContext.currentWorkspace.id;
  const permissions = accessContext.permissions;

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

  const prisma = getPrismaClient();

  // 这个接口只给管理员/运维排查用，不接入普通业务页面，避免用户看到“同步中/失败”等后台索引状态。
  const [sources, jobs, recentFailedJobs, recentTraces] = await Promise.all([
    countByStatus(sourceStatuses, (status) => prisma.aiIndexSource.count({
      where: {
        workspaceId,
        status
      }
    })),
    countByStatus(jobStatuses, (status) => prisma.aiIndexJob.count({
      where: {
        workspaceId,
        status
      }
    })),
    prisma.aiIndexJob.findMany({
      where: {
        workspaceId,
        status: "failed"
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 10,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        jobType: true,
        retryCount: true,
        error: true,
        updatedAt: true
      }
    }),
    prisma.aiIndexTrace.findMany({
      where: {
        workspaceId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10,
      select: {
        id: true,
        traceId: true,
        name: true,
        output: true,
        scores: true,
        createdAt: true
      }
    })
  ]);

  return NextResponse.json({
    workspaceId,
    sources,
    jobs,
    recentFailedJobs,
    recentTraces
  });
}
