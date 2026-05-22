import { NextRequest, NextResponse } from "next/server";
import { createSessionFromFeishuCode, FEISHU_STATE_COOKIE_NAME } from "@/lib/feishu-auth";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/session";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = request.cookies.get(FEISHU_STATE_COOKIE_NAME)?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", request.url));
  }

  try {
    const session = await createSessionFromFeishuCode(code);
    const response = NextResponse.redirect(new URL("/", request.url));

    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(session),
      getSessionCookieOptions(request.url, request.headers.get("x-forwarded-proto"))
    );
    response.cookies.delete(FEISHU_STATE_COOKIE_NAME);

    return response;
  } catch (error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", error instanceof Error ? error.message : "feishu_login_failed");

    return NextResponse.redirect(loginUrl);
  }
}
