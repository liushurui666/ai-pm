import { NextRequest, NextResponse } from "next/server";
import { createAssistantReply } from "@/data/dashboard";
import { getDashboardData } from "@/data/local-dashboard";
import { createAiAssistantReply, isAiAssistantConfigured } from "@/lib/ai-client";
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
    const fallbackReply = createAssistantReply(message, data);

    if (!isAiAssistantConfigured()) {
      return NextResponse.json({
        reply: fallbackReply,
        source: "fallback",
        generatedAt: new Date().toISOString()
      });
    }

    try {
      return NextResponse.json({
        reply: await createAiAssistantReply(message, data),
        source: "ai",
        generatedAt: new Date().toISOString()
      });
    } catch {
      return NextResponse.json({
        reply: [
          fallbackReply,
          "（模型接口暂时不可用，以上为本地规则分析结果。）"
        ].join("\n\n"),
        source: "fallback",
        warning: "AI 模型接口暂时不可用，已使用本地分析兜底。",
        generatedAt: new Date().toISOString()
      });
    }
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
