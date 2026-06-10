const LOCAL_HOST_PATTERNS = [/^localhost(?::\d+)?$/i, /^127\.\d+\.\d+\.\d+(?::\d+)?$/, /^\[::1\](?::\d+)?$/];

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}

function inferProtocol(host?: string) {
  return host && LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(host)) ? "http" : "https";
}

export function normalizeRequestOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

export function isLocalRequestOrigin(origin: string) {
  try {
    const url = new URL(origin);

    return LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(url.host));
  } catch {
    return false;
  }
}

export function resolveTrustedRequestOrigin(requestOrigin: string | undefined, fallbackOrigin: string) {
  const fallback = normalizeRequestOrigin(fallbackOrigin);

  if (!requestOrigin) {
    return fallback;
  }

  const normalizedRequestOrigin = normalizeRequestOrigin(requestOrigin);

  if (normalizedRequestOrigin === fallback || isLocalRequestOrigin(normalizedRequestOrigin)) {
    return normalizedRequestOrigin;
  }

  return fallback;
}

// 认证回跳和服务端会话读取必须跟随当前请求的真实 origin，避免 APP_URL 与访问域名不一致时丢失同站 Cookie。
export function getRequestOriginFromHeaders(headersList: Pick<Headers, "get">) {
  const host = firstHeaderValue(headersList.get("x-forwarded-host")) ?? firstHeaderValue(headersList.get("host"));

  if (!host) {
    return undefined;
  }

  const protocol = firstHeaderValue(headersList.get("x-forwarded-proto")) ?? inferProtocol(host);

  return normalizeRequestOrigin(`${protocol}://${host}`);
}

// Next route handler 可以直接从 Request.url 得到当前 origin；代理链路下仍优先信任 x-forwarded-*。
export function getRequestOriginFromRequest(request: Request) {
  return getRequestOriginFromHeaders(request.headers) ?? new URL(request.url).origin;
}
