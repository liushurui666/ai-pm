import type { GenericOAuthConfig } from "better-auth/plugins";

type FeishuTokenResponse = {
  access_token?: string;
  code?: number;
  expires_in?: number;
  msg?: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
};

type FeishuUserInfoResponse = {
  code: number;
  data?: {
    avatar_url?: string;
    email?: string;
    en_name?: string;
    enterprise_email?: string;
    name?: string;
    open_id: string;
    tenant_key?: string;
  };
};

type FeishuTenantTokenResponse = {
  code: number;
  expire?: number;
  tenant_access_token?: string;
};

type FeishuTenantQueryResponse = {
  code: number;
  data?: { tenant?: { name?: string } };
};

export type FeishuOAuthProviderOptions = {
  appId: string;
  appSecret: string;
  providerId: string;
};

const tenantTokenCache = new Map<string, { expiresAt: number; token: string }>();

function firstText(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

async function fetchFeishuTenantToken(appId: string, appSecret: string) {
  const now = Date.now();
  const cached = tenantTokenCache.get(appId);

  // 租户信息只用于补充登录用户的组织名，提前 60 秒失效可避免 OAuth 回调恰好命中过期 token。
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    headers: { "content-type": "application/json; charset=utf-8" },
    method: "POST",
  });
  const payload = await response.json() as FeishuTenantTokenResponse;

  if (payload.code !== 0 || !payload.tenant_access_token) {
    return null;
  }

  tenantTokenCache.set(appId, {
    expiresAt: now + (payload.expire ?? 7200) * 1000,
    token: payload.tenant_access_token,
  });

  return payload.tenant_access_token;
}

async function fetchFeishuTenantName(appId: string, appSecret: string) {
  try {
    const token = await fetchFeishuTenantToken(appId, appSecret);

    if (!token) {
      return null;
    }

    const response = await fetch("https://open.feishu.cn/open-apis/tenant/v2/tenant/query", {
      headers: { authorization: `Bearer ${token}` },
    });
    const payload = await response.json() as FeishuTenantQueryResponse;

    return payload.code === 0 ? payload.data?.tenant?.name ?? null : null;
  } catch {
    // 组织名是非关键扩展字段，查询失败不应阻断用户完成 OAuth 登录。
    return null;
  }
}

/**
 * 把飞书企业应用 OAuth 协议直接适配为 Better Auth genericOAuth provider。
 * providerId 与回调路径保持 `feishu`，所以旧 account 绑定和飞书控制台回调配置可原样继续使用。
 */
export function createFeishuOAuthProvider(options: FeishuOAuthProviderOptions): GenericOAuthConfig {
  const { appId, appSecret, providerId } = options;

  return {
    authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    clientId: appId,
    clientSecret: appSecret,
    async getToken({ code, redirectURI }) {
      const response = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
        body: JSON.stringify({
          client_id: appId,
          client_secret: appSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectURI,
        }),
        headers: { "content-type": "application/json; charset=utf-8" },
        method: "POST",
      });
      const payload = await response.json() as FeishuTokenResponse;

      if (!response.ok || !payload.access_token) {
        throw new Error(`飞书 token 交换失败：${payload.code ?? response.status} ${payload.msg ?? ""}`);
      }

      return {
        accessToken: payload.access_token,
        accessTokenExpiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : undefined,
        raw: payload as Record<string, unknown>,
        refreshToken: payload.refresh_token,
        refreshTokenExpiresAt: payload.refresh_token_expires_in
          ? new Date(Date.now() + payload.refresh_token_expires_in * 1000)
          : undefined,
        scopes: payload.scope?.split(" ").filter(Boolean),
        tokenType: payload.token_type ?? "Bearer",
      };
    },
    async getUserInfo(tokens) {
      const [userResponse, tenantName] = await Promise.all([
        fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
          headers: { authorization: `Bearer ${tokens.accessToken}` },
        }),
        fetchFeishuTenantName(appId, appSecret),
      ]);
      const payload = await userResponse.json() as FeishuUserInfoResponse;

      if (payload.code !== 0 || !payload.data) {
        return null;
      }

      const { data } = payload;

      return {
        email: firstText(data.enterprise_email, data.email) ?? `${data.open_id}@feishu.local`,
        emailVerified: false,
        feishuTenantKey: firstText(data.tenant_key),
        feishuTenantName: tenantName ?? undefined,
        id: data.open_id,
        image: firstText(data.avatar_url),
        name: firstText(data.name, data.en_name) ?? data.open_id,
      };
    },
    providerId,
    scopes: ["contact:user.base:readonly", "contact:user.email:readonly"],
    tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
  };
}
