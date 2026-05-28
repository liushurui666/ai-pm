import { NextRequest, NextResponse } from "next/server";
import {
  createOauthState,
  FEISHU_STATE_COOKIE_NAME,
  getFeishuAuthorizeUrl,
  isFeishuAuthConfigured
} from "@/lib/feishu/auth";
import { createPublicAppUrl } from "@/lib/auth/public-url";
import { shouldUseSecureCookie } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  if (!isFeishuAuthConfigured()) {
    return NextResponse.redirect(createPublicAppUrl("/login?error=missing_feishu_config", request));
  }

  const state = createOauthState();
  const publicStartUrl = createPublicAppUrl("/api/auth/feishu/start", request);
  const response = NextResponse.redirect(getFeishuAuthorizeUrl(request, state));

  response.cookies.set(FEISHU_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    // OAuth state Cookie 要按用户访问的公网协议判断 Secure，否则 HTTPS 反代到容器 HTTP 时会话可能丢失。
    secure: shouldUseSecureCookie(publicStartUrl, request.headers.get("x-forwarded-proto"))
  });

  return response;
}
