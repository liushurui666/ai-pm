import { NextRequest, NextResponse } from "next/server";
import { createDashboardRecord } from "@/data/feishu-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { getSession } from "@/lib/session";
import type { DashboardEntityType } from "@/types/records";

const entityTypes = new Set<DashboardEntityType>(["project", "task", "risk", "requirement", "document"]);

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

  try {
    return NextResponse.json(await createDashboardRecord(body.type, body.values, session?.user));
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
