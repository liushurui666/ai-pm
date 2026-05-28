import { NextRequest, NextResponse } from "next/server";
import { createPublicAppUrl } from "@/lib/auth/public-url";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(createPublicAppUrl("/login", request));

  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}
