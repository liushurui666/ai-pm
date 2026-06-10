import type { UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { createAssistantStreamResult } from "@/lib/ai/assistant-stream";
import { isAiAssistantConfigured } from "@/lib/ai/settings";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 120;

type AssistantRequestBody = {
  messages?: UIMessage[];
  workspaceId?: string;
};

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

  const body = (await request.json().catch(() => null)) as AssistantRequestBody | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  if (!messages.length) {
    return NextResponse.json(
      {
        error: "请输入要分析的问题"
      },
      {
        status: 400
      }
    );
  }

  if (!isAiAssistantConfigured()) {
    return NextResponse.json(
      {
        error: "未配置 AI_API_KEY，流式 ChatBox 需要可用模型后才能回答。"
      },
      {
        status: 503
      }
    );
  }

  try {
    const data = await getDashboardData(session?.user, body?.workspaceId);
    const result = await createAssistantStreamResult({
      data,
      messages
    });

    return result.toUIMessageStreamResponse();
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
