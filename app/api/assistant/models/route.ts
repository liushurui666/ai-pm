import { NextResponse } from "next/server";
import { getValidatedAiAvailableModels } from "@/lib/ai/model-availability";
import { isAiAssistantConfigured } from "@/lib/ai/settings";
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

  const modelAvailability = await getValidatedAiAvailableModels();

  return NextResponse.json({
    configured: isAiAssistantConfigured(),
    ...modelAvailability
  });
}
