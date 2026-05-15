import { NextRequest, NextResponse } from "next/server";
import { createAssistantReply } from "@/data/dashboard";
import { getDashboardData } from "@/data/feishu-dashboard";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { getSession } from "@/lib/session";

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

  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim();

  if (!message) {
    return NextResponse.json(
      {
        error: "请输入要分析的问题"
      },
      {
        status: 400
      }
    );
  }

  try {
    const data = await getDashboardData(session?.user);

    return NextResponse.json({
      reply: createAssistantReply(message, data),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI 助手读取项目数据失败"
      },
      {
        status: 502
      }
    );
  }
}
