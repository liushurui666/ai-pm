import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import type { AppSession } from "@/types/auth";
import type { FeishuUser } from "@/types/dashboard";
import { createPublicAppUrl, getPublicAppOrigin, isLocalUrl } from "@/lib/auth/public-url";
import { getFeishuAppAccessToken } from "@/lib/feishu/client";

export const FEISHU_STATE_COOKIE_NAME = "ai_pm_feishu_state";

type FeishuAccessTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  name?: string;
  en_name?: string;
  avatar_url?: string;
  open_id?: string;
  union_id?: string;
  user_id?: string;
  email?: string;
};

type FeishuUserInfoResponse = {
  name?: string;
  en_name?: string;
  avatar_url?: string;
  avatar_thumb?: string;
  avatar_middle?: string;
  avatar_big?: string;
  open_id?: string;
  union_id?: string;
  user_id?: string;
  email?: string;
};

type FeishuResponse<T> = {
  code: number;
  msg?: string;
  message?: string;
  data?: T;
};

export function isFeishuAuthConfigured() {
  return Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);
}

export function createOauthState() {
  return randomBytes(24).toString("base64url");
}

export function getFeishuRedirectUri(request: NextRequest) {
  const configuredRedirectUri = process.env.FEISHU_REDIRECT_URI?.trim();

  if (configuredRedirectUri) {
    const publicOrigin = getPublicAppOrigin(request);

    // 生产域名访问时如果仍使用 localhost 回调，飞书授权完成后会把用户浏览器带到自己的电脑。
    // 当 APP_URL 或代理头已经能识别出公网域名时，自动改用公网回调；本地开发仍保留 localhost 配置。
    if (!isLocalUrl(configuredRedirectUri) || isLocalUrl(publicOrigin)) {
      return configuredRedirectUri;
    }
  }

  return createPublicAppUrl("/api/auth/feishu/callback", request).toString();
}

export function getFeishuAuthorizeUrl(request: NextRequest, state: string) {
  const appId = process.env.FEISHU_APP_ID;

  if (!appId) {
    throw new Error("FEISHU_APP_ID 未配置");
  }

  const authorizeUrl = new URL("https://open.feishu.cn/open-apis/authen/v1/index");
  authorizeUrl.searchParams.set("app_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", getFeishuRedirectUri(request));
  authorizeUrl.searchParams.set("state", state);

  return authorizeUrl;
}

async function exchangeCodeForUserAccessToken(code: string) {
  const appAccessToken = await getFeishuAppAccessToken();
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuResponse<FeishuAccessTokenResponse>;

  if (!response.ok || payload.code !== 0 || !payload.data?.access_token) {
    throw new Error(payload.msg || payload.message || "飞书授权码换取 user_access_token 失败");
  }

  return payload.data;
}

async function getFeishuUserInfo(accessToken: string) {
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuResponse<FeishuUserInfoResponse>;

  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(payload.msg || payload.message || "获取飞书用户信息失败");
  }

  return payload.data;
}

export async function createSessionFromFeishuCode(code: string): Promise<AppSession> {
  const tokenData = await exchangeCodeForUserAccessToken(code);
  const userInfo = await getFeishuUserInfo(tokenData.access_token).catch(() => null);

  const user: FeishuUser = {
    openId: userInfo?.open_id || tokenData.open_id || "",
    unionId: userInfo?.union_id || tokenData.union_id,
    userId: userInfo?.user_id || tokenData.user_id,
    name: userInfo?.name || tokenData.name || "飞书用户",
    enName: userInfo?.en_name || tokenData.en_name,
    avatarUrl: userInfo?.avatar_big || userInfo?.avatar_middle || userInfo?.avatar_url || tokenData.avatar_url,
    email: userInfo?.email || tokenData.email
  };

  if (!user.openId) {
    throw new Error("飞书返回的用户信息缺少 open_id");
  }

  return {
    user,
    loginAt: new Date().toISOString()
  };
}
