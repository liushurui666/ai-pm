import { authConfig, resolveAuthProviderCredentials } from "@/lib/auth/config";
import { auth } from "@/lib/auth/server";
import { aiPmLoginPageComponent } from "@/lib/auth/login-page";
import { feishuIcon, githubIcon, googleIcon } from "@/lib/auth/login-page/provider-icons";
import type { LoginPageModel, LoginProviderId, LoginProviderView } from "@/lib/auth/types";
import {
  getRequestOriginFromRequest,
  normalizeRequestOrigin,
  resolveTrustedRequestOrigin,
} from "@/lib/auth/request-origin";

const aiPmAppOrigin = normalizeRequestOrigin(authConfig.app.origin);
const providerOrder: LoginProviderId[] = ["feishu", "google", "github"];
const providerDefinitions: Record<LoginProviderId, Omit<LoginProviderView, "enabled" | "href" | "id">> = {
  feishu: { icon: feishuIcon, iconClassName: "provider-icon-feishu", label: "飞书" },
  github: { icon: githubIcon, iconClassName: "provider-icon-github", label: "GitHub" },
  google: { icon: googleIcon, iconClassName: "provider-icon-google", label: "Google" },
};

function html(content: string, status = 200) {
  return new Response(content, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status,
  });
}

function json(data: unknown, status: number) {
  return Response.json(data, { status });
}

function redirect(url: string, sourceHeaders?: Headers) {
  const responseHeaders = new Headers(sourceHeaders);

  responseHeaders.set("location", url);

  return new Response(null, { headers: responseHeaders, status: 302 });
}

function getAllowedOrigins(requestOrigin: string) {
  return [...new Set([aiPmAppOrigin, requestOrigin].map(normalizeRequestOrigin))];
}

function isSafeRedirectURI(value: string, allowedOrigins: string[]) {
  try {
    const url = new URL(value);

    // 登录/退出只能回到当前 AI PM 的公开首页、登录页、工作台或 Bug 深链，防止认证路由变成开放重定向。
    return allowedOrigins.includes(url.origin) && (
      url.pathname === "/" ||
      url.pathname === "/login" ||
      url.pathname === "/workbench" ||
      url.pathname.startsWith("/bugs/")
    );
  } catch {
    return false;
  }
}

function resolveRedirectURI(request: Request, requestOrigin: string) {
  const requested = new URL(request.url).searchParams.get("redirect_uri");
  const fallback = `${requestOrigin}/`;

  if (!requested) {
    return { redirectURI: fallback };
  }

  return isSafeRedirectURI(requested, getAllowedOrigins(requestOrigin))
    ? { redirectURI: requested }
    : { error: "redirect_uri 不在应用白名单中", redirectURI: fallback };
}

function createProviderStartURL(origin: string, provider: LoginProviderId, redirectURI: string) {
  const url = new URL(`/api/auth/${provider}/start`, origin);

  url.searchParams.set("redirect_uri", redirectURI);

  return url.toString();
}

function createLoginErrorURL(origin: string, redirectURI: string, error?: string) {
  const url = new URL("/login", origin);

  url.searchParams.set("redirect_uri", redirectURI);
  if (error) {
    url.searchParams.set("error", error);
  }

  return url.toString();
}

function createLoginPageModel(origin: string, redirectURI: string, error?: string): LoginPageModel {
  return {
    appName: authConfig.app.name,
    error,
    providers: providerOrder.map((provider) => ({
      ...providerDefinitions[provider],
      enabled: authConfig.providers.includes(provider),
      href: createProviderStartURL(origin, provider, redirectURI),
      id: provider,
    })),
    redirectURI,
  };
}

function createBetterAuthRequest(sourceRequest: Request, origin: string, path: string, body?: unknown) {
  const headers = new Headers(sourceRequest.headers);

  if (body !== undefined) {
    headers.set("content-type", "application/json");
    if (!headers.has("origin")) {
      headers.set("origin", origin);
    }
  }

  return new Request(new URL(path, origin), {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method: body === undefined ? "GET" : "POST",
  });
}

async function readBetterAuthError(response: Response, provider: LoginProviderId) {
  try {
    const body = await response.clone().json() as { error?: string; message?: string };

    return body.message ?? body.error ?? `${providerDefinitions[provider].label} 登录未配置`;
  } catch {
    return `${providerDefinitions[provider].label} 登录未配置`;
  }
}

async function readProviderRedirectURL(response: Response) {
  const location = response.headers.get("location");

  if (location) {
    return location;
  }

  try {
    return (await response.clone().json() as { url?: string }).url;
  } catch {
    return undefined;
  }
}

async function handleLogin(request: Request, origin: string) {
  const { error: redirectError, redirectURI } = resolveRedirectURI(request, origin);
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");

  if (redirectError) {
    return json({ error: redirectError }, 400);
  }
  if (providerOrder.includes(provider as LoginProviderId)) {
    return redirect(createProviderStartURL(origin, provider as LoginProviderId, redirectURI));
  }

  return html(aiPmLoginPageComponent({
    model: createLoginPageModel(origin, redirectURI, url.searchParams.get("error") ?? undefined),
  }));
}

async function handleProviderStart(request: Request, origin: string, provider: LoginProviderId) {
  const { error: redirectError, redirectURI } = resolveRedirectURI(request, origin);

  if (redirectError) {
    return json({ error: redirectError }, 400);
  }
  if (!authConfig.providers.includes(provider)) {
    return redirect(createLoginErrorURL(origin, redirectURI, `${providerDefinitions[provider].label} 登录未启用`));
  }

  const errorCallbackURL = createLoginErrorURL(origin, redirectURI);
  const credentials = resolveAuthProviderCredentials();
  const body = provider === "feishu"
    ? {
        callbackURL: redirectURI,
        disableRedirect: true,
        errorCallbackURL,
        providerId: credentials.feishuProviders[0]?.providerId ?? "feishu",
      }
    : {
        callbackURL: redirectURI,
        disableRedirect: true,
        errorCallbackURL,
        provider,
        scopes: provider === "google" ? ["openid", "email", "profile"] : ["read:user", "user:email"],
      };
  const path = provider === "feishu" ? "/api/auth/sign-in/oauth2" : "/api/auth/sign-in/social";
  const response = await auth.handler(createBetterAuthRequest(request, origin, path, body));
  const providerURL = await readProviderRedirectURL(response);

  if (!response.ok || !providerURL) {
    return redirect(
      createLoginErrorURL(origin, redirectURI, await readBetterAuthError(response, provider)),
      new Headers(response.headers),
    );
  }

  return redirect(providerURL, new Headers(response.headers));
}

async function handleLogout(request: Request, origin: string) {
  const { error, redirectURI } = resolveRedirectURI(request, origin);
  const response = await auth.handler(createBetterAuthRequest(request, origin, "/api/auth/sign-out", {}));
  const requestedRedirectURI = new URL(request.url).searchParams.get("redirect_uri");

  // 即使回跳参数非法，也要先清理本地会话；随后固定回首页，不使用未信任地址。
  // 无参数时保留历史的相对 `/` Location，避免依赖该行为的客户端和回归脚本产生不必要变更。
  const location = error ? "/" : requestedRedirectURI ? redirectURI : "/";

  return redirect(location, new Headers(response.headers));
}

function createAuthRouteLogContext(request: Request) {
  const url = new URL(request.url);

  return {
    hasCookie: Boolean(request.headers.get("cookie")),
    hasRedirectURI: url.searchParams.has("redirect_uri"),
    pathname: url.pathname,
    provider: url.searchParams.get("provider") ?? undefined,
  };
}

async function handleAuthRequest(method: "GET" | "POST", request: Request) {
  const startedAt = Date.now();
  const path = new URL(request.url).pathname;
  const origin = resolveTrustedRequestOrigin(getRequestOriginFromRequest(request), aiPmAppOrigin);

  try {
    let response: Response;

    if (path === "/login") {
      response = await handleLogin(request, origin);
    } else if (path === "/logout") {
      response = await handleLogout(request, origin);
    } else {
      const providerMatch = path.match(/^\/api\/auth\/(feishu|google|github)\/start$/);

      response = providerMatch
        ? await handleProviderStart(request, origin, providerMatch[1] as LoginProviderId)
        : await auth.handler(request);
    }

    // 日志只记路径、状态和耗时，严禁记录 OAuth code、token 或 Cookie 值。
    console.info("[auth-route] handled", {
      ...createAuthRouteLogContext(request),
      durationMs: Date.now() - startedAt,
      hasLocation: Boolean(response.headers.get("location")),
      method,
      status: response.status,
    });

    return response;
  } catch (error) {
    console.error("[auth-route] failed", {
      ...createAuthRouteLogContext(request),
      durationMs: Date.now() - startedAt,
      error,
      method,
    });
    throw error;
  }
}

/** AI PM 自有认证路由：登录页和 provider start 由项目管理，OAuth 回调/会话 API 直接交给 Better Auth。 */
export async function GET(request: Request) {
  return handleAuthRequest("GET", request);
}

export async function POST(request: Request) {
  return handleAuthRequest("POST", request);
}
