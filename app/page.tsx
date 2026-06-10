import { LandingHome } from "@/components/landing-home";
import { headers } from "next/headers";
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
  const canEnterWorkbench = !authEnabled || Boolean(session);
  const workbenchHref = "/workbench";
  const versionDashboardPath = "/workbench?view=versionDashboard";

  // 首页只负责公开产品叙事和入口分流；未登录访客不加载工作台，避免触发成员权限和业务接口副作用。
  const primaryHref = canEnterWorkbench ? workbenchHref : getAiPmAuthLoginHref(workbenchHref, {
    appBaseURL: requestOrigin,
    authBaseURL: requestOrigin
  });
  const versionDashboardHref = canEnterWorkbench ? versionDashboardPath : getAiPmAuthLoginHref(versionDashboardPath, {
    appBaseURL: requestOrigin,
    authBaseURL: requestOrigin
  });

  return (
    <LandingHome
      isAuthenticated={canEnterWorkbench}
      primaryHref={primaryHref}
      versionDashboardHref={versionDashboardHref}
      workbenchHref={workbenchHref}
    />
  );
}
