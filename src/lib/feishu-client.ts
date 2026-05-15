type FeishuAppTokenPayload = {
  code: number;
  msg?: string;
  app_access_token?: string;
  expire?: number;
};

let cachedAppAccessToken: {
  value: string;
  expiresAt: number;
} | null = null;

export function assertFeishuAppConfig() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    throw new Error("请先配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  }
}

export async function getFeishuAppAccessToken() {
  assertFeishuAppConfig();

  if (cachedAppAccessToken && cachedAppAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAppAccessToken.value;
  }

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuAppTokenPayload;

  if (!response.ok || payload.code !== 0 || !payload.app_access_token) {
    throw new Error(payload.msg || "获取飞书 app_access_token 失败");
  }

  cachedAppAccessToken = {
    value: payload.app_access_token,
    expiresAt: Date.now() + Math.max((payload.expire ?? 7200) - 300, 60) * 1000
  };

  return cachedAppAccessToken.value;
}
