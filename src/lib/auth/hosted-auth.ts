import {
  createFileAuthStore,
  createHostedAuthLoginPageComponent,
  createHostedAuthRouteHandlers,
} from "@rc-tool/unified-auth-hosted-service";

const DEFAULT_APP_URL = "http://localhost:3004";
const DEFAULT_AUTH_STORE_FILE = ".auth/unified-auth-store.json";

function readEnv(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function resolveAppBaseURL() {
  return readEnv("AUTH_SERVICE_URL", readEnv("APP_URL", DEFAULT_APP_URL)).replace(/\/$/, "");
}

function resolveRedirectURI() {
  return readEnv("AUTH_ALLOWED_REDIRECT_URI", `${resolveAppBaseURL()}/`);
}

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

/**
 * AI PM 内嵌统一认证路由。
 *
 * 这里把 SDK 的 Hosted Auth Service 挂到 AI PM 自己的 Next.js 路由上，让登录页、OAuth start/callback
 * 和 session/context 查询都发生在同一个 origin 下。这样本地开发不再需要单独启动 3005 端口，也能避免
 * 跨站 Cookie、回跳域名和业务项目端口不一致导致的登录状态丢失。
 * 登录页外观直接通过 SDK 组件 props 固定在代码里，避免业务运行时再维护 AUTH_LOGIN_* 这类全局样式环境变量。
 */
export const hostedAuth = createHostedAuthRouteHandlers({
  allowDevLogin: readEnv("AUTH_ALLOW_DEV_LOGIN", "true") !== "false",
  applications: [
    {
      allowedRedirectURIs: [resolveRedirectURI()],
      clientId: readEnv("AUTH_CLIENT_ID", "ai-pm"),
      loginPageComponent: aiPmLoginPageComponent,
      name: readEnv("AUTH_CLIENT_NAME", "AI PM"),
      redirectURI: resolveRedirectURI(),
    },
  ],
  authBaseURL: resolveAppBaseURL(),
  feishu: {
    appId: readEnv("FEISHU_APP_ID") || undefined,
    appSecret: readEnv("FEISHU_APP_SECRET") || undefined,
    redirectURI: readEnv("FEISHU_REDIRECT_URI") || undefined,
  },
  github: {
    clientId: readEnv("GITHUB_CLIENT_ID") || undefined,
    clientSecret: readEnv("GITHUB_CLIENT_SECRET") || undefined,
    redirectURI: readEnv("GITHUB_REDIRECT_URI") || undefined,
  },
  google: {
    clientId: readEnv("GOOGLE_CLIENT_ID") || undefined,
    clientSecret: readEnv("GOOGLE_CLIENT_SECRET") || undefined,
    redirectURI: readEnv("GOOGLE_REDIRECT_URI") || undefined,
  },
  sessionSecret: readEnv("AUTH_SESSION_SECRET", "ai-pm-local-auth-secret"),
  // AI PM 自己的业务数据库是 MySQL；认证 SDK 的 Prisma store 面向独立认证库。
  // 内嵌模式先用 file store，保证跑 npx init 后不需要额外准备第二套数据库。
  store: createFileAuthStore({
    filePath: readEnv("AUTH_STORE_FILE", DEFAULT_AUTH_STORE_FILE),
  }),
});

export const GET = hostedAuth.GET;
export const POST = hostedAuth.POST;
