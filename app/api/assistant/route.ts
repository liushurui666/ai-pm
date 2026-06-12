import type { UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { createAssistantStreamResult } from "@/lib/ai/assistant-stream";
import { sanitizeAssistantErrorMessage } from "@/lib/ai/assistant-error-message";
import { isAiAssistantConfigured } from "@/lib/ai/settings";
import { getRequestOriginFromRequest } from "@/lib/auth/request-origin";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { AuthServiceUnavailableError, getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 120;

type AssistantRequestBody = {
  messages?: UIMessage[];
  model?: string;
  workspaceId?: string;
};

export async function POST(request: NextRequest) {
  try {
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

    const data = await getDashboardData(session?.user, body?.workspaceId);
    const result = await createAssistantStreamResult({
      actionRuntime: {
        // 动作 tool 会复用当前请求的同源 Cookie 调用站内业务 API，确保权限语义和用户手动操作一致。
        cookieHeader: request.headers.get("cookie") ?? undefined,
        origin: getRequestOriginFromRequest(request),
        workspaceId: data.meta?.currentWorkspace?.id
      },
      data,
      model: body?.model,
      messages
    });

    return result.toUIMessageStreamResponse({
      // AI SDK 默认会把底层异常文本写入 UI message stream；模型网关 502 时可能是完整 HTML 错误页。
      // ChatBox 用户只需要知道模型服务暂不可用，不能看到供应商网关、HTML 或内部异常细节。
      onError: (error) => {
        console.error("[assistant] stream failed", {
          error
        });

        return sanitizeAssistantErrorMessage(error);
      }
    });
  } catch (error) {
    console.error("[assistant] request failed", {
      error
    });

    return NextResponse.json(
      {
        error: sanitizeAssistantErrorMessage(error)
      },
      {
        status: error instanceof AuthServiceUnavailableError ? 503 : 502
      }
    );
  }
}
