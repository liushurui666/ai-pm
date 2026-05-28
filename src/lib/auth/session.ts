import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AppSession } from "@/types/auth";

export const SESSION_COOKIE_NAME = "ai_pm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = AppSession & {
  exp: number;
};

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.FEISHU_APP_SECRET || "ai-pm-local-session-secret";
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSessionToken(session: AppSession) {
  const payload: SessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function parseSessionToken(token?: string) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature || !safeEqual(signPayload(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      user: payload.user,
      loginAt: payload.loginAt
    } satisfies AppSession;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();

  return parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export function shouldUseSecureCookie(requestUrl?: string | URL, forwardedProto?: string | null) {
  if (requestUrl) {
    const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);

    // 本地 http 调试时不设置 Secure，避免 OAuth 回跳后浏览器不回传会话 Cookie。
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return false;
    }
  }

  const normalizedProto = forwardedProto?.split(",")[0]?.trim().toLowerCase();

  if (normalizedProto) {
    return normalizedProto === "https";
  }

  if (requestUrl) {
    const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);

    return url.protocol === "https:";
  }

  return process.env.NODE_ENV === "production";
}

export function getSessionCookieOptions(requestUrl?: string | URL, forwardedProto?: string | null) {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    // 本地用 next start 跑生产包时仍是 http，固定 Secure 会导致刷新后会话 Cookie 丢失。
    secure: shouldUseSecureCookie(requestUrl, forwardedProto)
  };
}
