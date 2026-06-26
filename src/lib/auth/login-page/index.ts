import type {
  HostedAuthLoginPageComponent,
  HostedAuthLoginProviderView,
} from "@rc-tool/unified-auth-hosted-service";
import { aiPmLoginPageStyles } from "@/lib/auth/login-page/styles";

function escapeHtml(value: unknown) {
  // 登录页会把 query error、client_id 和 SDK provider 文案拼进 HTML 字符串；
  // 统一转义这些动态值，避免认证入口因为视觉自定义引入 XSS 风险。
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findProvider(providers: HostedAuthLoginProviderView[], id: string) {
  return providers.find((provider) => provider.enabled && provider.id === id);
}

function renderProviderHotspot(
  provider: HostedAuthLoginProviderView | undefined,
  className: string,
  label: string,
) {
  if (!provider) {
    return "";
  }

  // 参考图本身已经包含按钮视觉，真实链接只覆盖对应坐标区域；
  // 这样既能 1:1 还原视觉，又不破坏 Unified Auth SDK 生成的 OAuth state 和 redirect_uri。
  return `<a class="login-hotspot ${className}" href="${escapeHtml(provider.href)}" aria-label="${escapeHtml(label)}"></a>`;
}

function renderLoginHotspots(providers: HostedAuthLoginProviderView[]) {
  const enabledProviders = providers.filter((provider) => provider.enabled);
  const primaryProvider = findProvider(enabledProviders, "feishu") ?? enabledProviders[0];
  const googleProvider = findProvider(enabledProviders, "google");
  const githubProvider = findProvider(enabledProviders, "github");

  if (!primaryProvider) {
    return `<div class="login-provider-empty">当前没有可用登录方式，请联系管理员完成 OAuth 配置。</div>`;
  }

  return `
    <nav class="login-hotspots" aria-label="登录方式">
      ${renderProviderHotspot(primaryProvider, "login-hotspot-feishu", `使用${primaryProvider.label}登录`)}
      ${renderProviderHotspot(googleProvider, "login-hotspot-google", "使用 Google 登录")}
      ${renderProviderHotspot(githubProvider, "login-hotspot-github", "使用 GitHub 登录")}
    </nav>`;
}

function renderLoginError(error?: string) {
  // 参考图里保留了“会话信息”输入框的红色状态；当真实登录带 error 时，
  // 额外给出一行可访问文本，避免只靠背景图导致用户无法知道失败原因。
  return error ? `<div class="login-error" role="alert">${escapeHtml(error)}</div>` : "";
}

export const aiPmLoginPageComponent: HostedAuthLoginPageComponent = ({ model }) => {
  // 这个登录页的目标是按既定效果图做像素级还原：复杂星空、浮层卡片和右侧登录卡片都来自设计图资产。
  // 认证行为仍由 SDK provider 链接负责；页面不手写 OAuth 地址，也不参与会话写入。
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="/icon.svg" />
  <title>AI PM 统一登录</title>
  <style>${aiPmLoginPageStyles}</style>
</head>
<body>
  <main class="login-shell" aria-label="AI PM 统一登录">
    <section class="login-artboard">
      <h1 class="login-sr-title">用 AI 驱动项目交付</h1>
      <p class="login-sr-description">统一管理项目、任务、需求、风险与 Bug，通过企业身份认证进入 AI PM 工作台。</p>
      ${renderLoginError(model.error)}
      ${renderLoginHotspots(model.providers)}
      <div class="login-client-id" aria-hidden="true">client_id: ${escapeHtml(model.clientId)}</div>
    </section>
  </main>
</body>
</html>`;
};
