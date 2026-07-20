import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/data/local-dashboard";
import { createAiWeeklyReportReply, isAiAssistantConfigured } from "@/lib/ai/client";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import { getSession } from "@/lib/auth/session";
import { createWeeklyReportMarkdown } from "@/lib/reports/weekly-report";

export const runtime = "nodejs";
export const maxDuration = 120;

type WeeklyReportRequestBody = {
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

  const body = (await request.json().catch(() => null)) as WeeklyReportRequestBody | null;

  try {
    const data = await getDashboardData(session?.user, body?.workspaceId);
    const fallbackReply = createWeeklyReportMarkdown(data);

    if (!isAiAssistantConfigured()) {
      return NextResponse.json({
        reply: [
          fallbackReply,
          "（未配置 AI_API_KEY，已使用本地固定模板兜底生成。）"
        ].join("\n\n"),
        source: "fallback-weekly-report",
        warning: "未配置 AI_API_KEY，已使用本地固定模板兜底。",
        generatedAt: new Date().toISOString()
      });
    }

    try {
      return NextResponse.json({
        reply: await createAiWeeklyReportReply(data),
        source: "ai-weekly-report",
        generatedAt: new Date().toISOString()
      });
    } catch {
      return NextResponse.json({
        reply: [
          fallbackReply,
          "（AI 周报生成暂时不可用，已使用本地固定模板兜底生成。）"
        ].join("\n\n"),
        source: "fallback-weekly-report",
        warning: "AI 周报生成暂时不可用，已使用本地固定模板兜底。",
        generatedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI 周报读取项目数据失败"
      },
      {
        status: 502
      }
    );
  }
}
