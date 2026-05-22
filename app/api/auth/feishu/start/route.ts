import { NextRequest, NextResponse } from "next/server";
import {
  createOauthState,
  FEISHU_STATE_COOKIE_NAME,
  getFeishuAuthorizeUrl,
  isFeishuAuthConfigured
} from "@/lib/feishu-auth";
import { shouldUseSecureCookie } from "@/lib/session";

export async function GET(request: NextRequest) {
  if (!isFeishuAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=missing_feishu_config", request.url));
  }

  const state = createOauthState();
  const response = NextResponse.redirect(getFeishuAuthorizeUrl(request, state));

  response.cookies.set(FEISHU_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(request.url, request.headers.get("x-forwarded-proto"))
  });

  return response;
}
