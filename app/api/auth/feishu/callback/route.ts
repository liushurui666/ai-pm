import { NextRequest, NextResponse } from "next/server";
import { createPublicAppUrl } from "@/lib/auth/public-url";
import { createSessionFromFeishuCode, FEISHU_STATE_COOKIE_NAME } from "@/lib/feishu/auth";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = request.cookies.get(FEISHU_STATE_COOKIE_NAME)?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(createPublicAppUrl("/login?error=invalid_state", request));
  }

  try {
    const session = await createSessionFromFeishuCode(code);
    const publicHomeUrl = createPublicAppUrl("/", request);
    const response = NextResponse.redirect(publicHomeUrl);

    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(session),
      // 登录完成后的会话 Cookie 跟随公网域名签发，避免容器内 localhost 参与 Secure 判断。
      getSessionCookieOptions(publicHomeUrl, request.headers.get("x-forwarded-proto"))
    );
    response.cookies.delete(FEISHU_STATE_COOKIE_NAME);

    return response;
  } catch (error) {
    const loginUrl = createPublicAppUrl("/login", request);
    loginUrl.searchParams.set("error", error instanceof Error ? error.message : "feishu_login_failed");

    return NextResponse.redirect(loginUrl);
  }
}
