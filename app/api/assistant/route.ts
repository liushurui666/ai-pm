import type { UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { createAssistantStreamResult } from "@/lib/ai/assistant-stream";
import { sanitizeAssistantErrorMessage } from "@/lib/ai/assistant-error-message";
import { isAiAssistantConfigured } from "@/lib/ai/settings";
import { getRequestOriginFromRequest } from "@/lib/auth/request-origin";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { AuthServiceUnavailableError, getSession } from "@/lib/auth/session";
import type { DashboardData } from "@/types/dashboard";

export const runtime = "nodejs";
export const maxDuration = 120;

type AssistantRequestBody = {
  messages?: UIMessage[];
  model?: string;
  workspaceId?: string;
};

function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

  return latestUserMessage?.parts
    .filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim() ?? "";
}

function shouldUseLightweightChat(messages: UIMessage[]) {
  const latestUserText = getLatestUserText(messages);
  const normalizedText = latestUserText.replace(/\s+/g, "");

  if (!normalizedText || normalizedText.length > 24) {
    return false;
  }

  // “你好/谢谢/你是谁/能做什么”不需要读取项目全量数据，也不需要把整组 tools 挂给模型。
  // 这些轻量对话直接走模型回复，可以把本地首轮从项目数据读取 + tools 决策的重链路中解出来。
  if (/^(你好|您好|哈喽|hello|hi|在吗|谢谢|感谢|辛苦了|你是谁|你能做什么|有什么能力)[。！!？?，,]*$/i.test(normalizedText)) {
    return true;
  }

  return false;
}

function createLightweightDashboardData(workspaceId: string): DashboardData {
  const now = new Date().toISOString();

  // 轻量对话不会启用 tools，但流式入口仍保持统一签名；这里提供最小 DashboardData，
  // 避免普通寒暄为了构造 tools 而访问数据库、Qdrant 或业务聚合逻辑。
  return {
    bugs: [],
    documents: [],
    members: [],
    meta: {
      currentWorkspace: {
        createdAt: now,
        description: "轻量对话占位工作区",
        id: workspaceId,
        name: "当前工作区",
        status: "active",
        updatedAt: now
      },
      source: "mock"
    },
    metrics: {
      activeProjects: 0,
      aiSavedHours: 0,
      deliveryRate: 0,
      overdueTasks: 0
    },
    projects: [],
    requirementVersions: [],
    requirements: [],
    risks: [],
    tasks: [],
    weeklyInsight: [],
    workspaces: []
  };
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

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
    const requestedModel = body?.model?.trim() || "default";
    const requestedWorkspaceId = body?.workspaceId?.trim() || "default";

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

    const useLightweightChat = shouldUseLightweightChat(messages);
    const data = useLightweightChat
      ? createLightweightDashboardData(requestedWorkspaceId)
      : await getDashboardData(session?.user, body?.workspaceId);
    console.info("[assistant] request accepted", {
      durationMs: Date.now() - startedAt,
      lightweight: useLightweightChat,
      messageCount: messages.length,
      model: requestedModel,
      requestId,
      workspaceId: requestedWorkspaceId
    });
    const result = await createAssistantStreamResult({
      actionRuntime: {
        // 动作 tool 会复用当前请求的同源 Cookie 调用站内业务 API，确保权限语义和用户手动操作一致。
        cookieHeader: request.headers.get("cookie") ?? undefined,
        origin: getRequestOriginFromRequest(request),
        workspaceId: data.meta?.currentWorkspace?.id
      },
      data,
      enableTools: !useLightweightChat,
      model: body?.model,
      messages
    });

    return result.toUIMessageStreamResponse({
      // AI SDK 默认会把底层异常文本写入 UI message stream；模型网关 502 时可能是完整 HTML 错误页。
      // ChatBox 用户只需要知道模型服务暂不可用，不能看到供应商网关、HTML 或内部异常细节。
      onError: (error) => {
        console.error("[assistant] stream failed", {
          durationMs: Date.now() - startedAt,
          error,
          messageCount: messages.length,
          model: requestedModel,
          requestId,
          workspaceId: requestedWorkspaceId
        });

        return sanitizeAssistantErrorMessage(error);
      }
    });
  } catch (error) {
    console.error("[assistant] request failed", {
      durationMs: Date.now() - startedAt,
      error,
      requestId
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
