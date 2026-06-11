import { LandingHome } from "@/components/landing-home";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { unifiedAuthConfig } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { getRequestOriginFromHeaders, resolveTrustedRequestOrigin } from "@/lib/auth/request-origin";
import { getAiPmAuthLoginHref, isAuthServiceConfigured } from "@/lib/auth/unified-auth";

export const dynamic = "force-dynamic";

const defaultAuthOrigin = unifiedAuthConfig.auth?.origin ?? unifiedAuthConfig.app?.origin ?? "http://localhost:3004";

export default async function Home() {
  const authEnabled = isAuthServiceConfigured();
  const session = authEnabled ? await getSession() : null;
  const requestOrigin = resolveTrustedRequestOrigin(
    getRequestOriginFromHeaders(await headers()),
    defaultAuthOrigin
  );
  const workbenchHref = "/workbench";
  const versionDashboardPath = "/workbench?view=versionDashboard";

  // 首页只服务未登录访客的产品介绍；一旦已有统一认证会话，根路由必须直接进入工作台。
  // 这样 OAuth 回跳到 `/`、用户手动输入首页地址或登录态刷新时，都不会再看到宣传页。
  if (!authEnabled || session) {
    redirect(workbenchHref);
  }

  // 能走到这里说明当前请求没有登录态，首页 CTA 只负责发起登录并带回真实业务入口。
  const primaryHref = getAiPmAuthLoginHref(workbenchHref, {
    appBaseURL: requestOrigin,
    authBaseURL: requestOrigin
  });
  const versionDashboardHref = getAiPmAuthLoginHref(versionDashboardPath, {
    appBaseURL: requestOrigin,
    authBaseURL: requestOrigin
  });

  return (
    <LandingHome
      isAuthenticated={false}
      primaryHref={primaryHref}
      versionDashboardHref={versionDashboardHref}
      workbenchHref={workbenchHref}
    />
  );
}
