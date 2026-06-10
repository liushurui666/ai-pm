import {
  createHostedAuthLoginPageComponent,
  createHostedAuthRouteHandlers,
} from "@rc-tool/unified-auth-hosted-service";
import { auth } from "@/lib/auth/server";
import { unifiedAuthConfig } from "@/lib/auth/config";
import {
  getRequestOriginFromRequest,
  normalizeRequestOrigin,
  resolveTrustedRequestOrigin,
} from "@/lib/auth/request-origin";

const aiPmLoginPageComponent = createHostedAuthLoginPageComponent({
  backgroundImageUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1800&q=80",
  brandLabel: "AI 项目管理平台",
  brandName: "AI PM",
  heroDescription: "登录后系统会使用统一身份完成访问控制、负责人选择和机器人通知；项目、任务、风险与 Bug 数据仍由 AI PM 站内持久化管理。",
  heroTitle: "用企业账号安全登录",
  panelDescription: "请选择企业认证方式进入 AI PM。认证、回调和会话由 Unified Auth SDK 黑盒处理。",
  panelTitle: "统一登录",
  primaryProvider: "feishu",
  statusText: "AI PM Unified Auth"
});

const aiPmAppOrigin = (unifiedAuthConfig.app?.origin ?? "http://localhost:3004").replace(/\/$/, "");
const aiPmAllowedRedirectPaths = [
  "/",
  "/workbench",
  "/workbench?view=projects",
  "/workbench?view=versionDashboard",
  "/workbench?view=tasks",
  "/workbench?view=bugs",
  "/workbench?view=requirements",
  "/workbench?view=members"
];

function isSafeDynamicRedirectURI(value: string | null, allowedOrigins: string[]) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const allowedOriginSet = new Set(allowedOrigins);

    // 只允许当前应用同源的首页、工作台和 Bug 深链，避免把登录接口变成开放重定向。
    return allowedOriginSet.has(url.origin) && (
      url.pathname === "/" ||
      url.pathname === "/workbench" ||
      url.pathname.startsWith("/bugs/")
    );
  } catch {
    return false;
  }
}

function createAllowedRedirectURIs(origin: string, request: Request) {
  const origins = Array.from(new Set([aiPmAppOrigin, origin].map((item) => normalizeRequestOrigin(item))));
  const requestedRedirectURI = new URL(request.url).searchParams.get("redirect_uri");
  const dynamicRedirectURI = isSafeDynamicRedirectURI(requestedRedirectURI, origins) ? requestedRedirectURI : undefined;

  return [
    ...origins.flatMap((allowedOrigin) => aiPmAllowedRedirectPaths.map((path) => new URL(path, `${allowedOrigin}/`).toString())),
    ...(dynamicRedirectURI ? [dynamicRedirectURI] : [])
  ];
}

function createHostedAuthForRequest(request: Request) {
  const requestOrigin = resolveTrustedRequestOrigin(getRequestOriginFromRequest(request), aiPmAppOrigin);

  return createHostedAuthRouteHandlers({
    // Hosted Auth 的回跳白名单是精确匹配；这里按当前请求 origin 动态补齐，避免访问域名和 APP_URL 不一致时登录后回到另一个 host 丢 Cookie。
    allowedRedirectURIs: createAllowedRedirectURIs(requestOrigin, request),
    auth,
    authBaseURL: requestOrigin,
    authProviders: {
      google: {
        // Google 登录只用于 AI PM 身份识别；显式申请 OIDC 基础资料，保证 Better Auth 能稳定拿到邮箱、昵称和头像。
        scopes: ["openid", "email", "profile"],
      },
      github: {
        // GitHub 登录同样不申请仓库权限，只补齐 read:user/user:email，避免用户资料缺少名称、头像或公开邮箱为空。
        scopes: ["read:user", "user:email"],
      },
    },
    config: unifiedAuthConfig,
    loginPageComponent: aiPmLoginPageComponent,
    redirectURI: `${requestOrigin}/`,
    siteURL: requestOrigin,
  });
}

/**
 * AI PM 内嵌统一认证路由。
 *
 * 这里把 SDK 的 Hosted Auth Service 挂到 AI PM 自己的 Next.js 路由上，让登录页、OAuth start/callback
 * 和 session/context 查询都发生在同一个 origin 下。这样本地开发不需要单独认证服务，也能避免
 * 跨站 Cookie、回跳域名和业务项目端口不一致导致的登录状态丢失。
 * 旧版自维护存储和 provider callback 代码已经移除；这些状态现在全部由 Better Auth 通过 SDK 标准
 * Drizzle schema 写入独立 PostgreSQL 认证库。
 */
export async function GET(request: Request) {
  return createHostedAuthForRequest(request).GET(request);
}

export async function POST(request: Request) {
  return createHostedAuthForRequest(request).POST(request);
}
