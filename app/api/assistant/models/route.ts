import { NextResponse } from "next/server";
import { getAiAvailableModels, getAiModel, isAiAssistantConfigured } from "@/lib/ai/settings";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
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

  return NextResponse.json({
    configured: isAiAssistantConfigured(),
    defaultModel: getAiModel(),
    models: getAiAvailableModels()
  });
}
