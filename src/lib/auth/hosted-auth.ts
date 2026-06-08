import {
  createHostedAuthLoginPageComponent,
  createHostedAuthRouteHandlers,
} from "@rc-tool/unified-auth-hosted-service";
import { auth } from "@/lib/auth/server";
import { unifiedAuthConfig } from "@/lib/auth/config";

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
 * 和 session/context 查询都发生在同一个 origin 下。这样本地开发不需要单独认证服务，也能避免
 * 跨站 Cookie、回跳域名和业务项目端口不一致导致的登录状态丢失。
 * 旧版自维护存储和 provider callback 代码已经移除；这些状态现在全部由 Better Auth 通过 SDK 标准
 * Drizzle schema 写入独立 PostgreSQL 认证库。
 */
export const hostedAuth = createHostedAuthRouteHandlers({
  auth,
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
});

export const GET = hostedAuth.GET;
export const POST = hostedAuth.POST;
