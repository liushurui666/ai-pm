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

function renderLoginProviderButton(provider: HostedAuthLoginProviderView, variant: "primary" | "secondary") {
  const providerLabel = escapeHtml(provider.label);

  // provider.href 由 Unified Auth SDK 根据当前 redirect_uri 和 OAuth 配置生成，
  // 这里只负责渲染按钮，不手写 start/callback 地址，避免破坏 SDK 的 state 与回跳校验。
  return `
    <a class="login-provider login-provider-${variant}" href="${escapeHtml(provider.href)}" aria-label="使用${providerLabel}登录">
      <span class="login-provider-icon ${escapeHtml(provider.iconClassName)}" aria-hidden="true">${provider.icon}</span>
      <span>${variant === "primary" ? `使用${providerLabel}登录` : providerLabel}</span>
    </a>`;
}

function renderLoginProviders(providers: HostedAuthLoginProviderView[], primaryProviderId = "feishu") {
  // 飞书仍是 AI PM 的主登录入口，Google/GitHub 作为备用企业身份；
  // 如果环境未配置任何 provider，则给出明确空态，而不是渲染不可点击按钮。
  const enabledProviders = providers.filter((provider) => provider.enabled);
  const primaryProvider = enabledProviders.find((provider) => provider.id === primaryProviderId) ?? enabledProviders[0];

  if (!primaryProvider) {
    return `<div class="login-provider-empty">当前没有可用登录方式，请联系管理员完成 OAuth 配置。</div>`;
  }

  const secondaryProviders = enabledProviders.filter((provider) => provider.id !== primaryProvider.id);

  return `
    <section class="login-providers" aria-label="登录方式">
      ${renderLoginProviderButton(primaryProvider, "primary")}
      ${secondaryProviders.length ? `
      <div class="login-divider"><span>其他登录方式</span></div>
      <div class="login-provider-grid">
        ${secondaryProviders.map((provider) => renderLoginProviderButton(provider, "secondary")).join("")}
      </div>` : ""}
    </section>`;
}

function renderLoginError(error?: string) {
  return error ? `<div class="login-error">${escapeHtml(error)}</div>` : "";
}

export const aiPmLoginPageComponent: HostedAuthLoginPageComponent = ({ model }) => {
  // 登录页是认证系统的公开入口，只负责展示品牌首屏并把 provider 链接交还给 SDK。
  // OAuth state、redirect_uri 白名单、Cookie 和回调仍由 Unified Auth 黑盒处理，避免视觉改版影响登录安全链路。
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
  <main class="login-shell">
    <header class="login-topbar">
      <div class="login-brand" aria-label="AI PM">
        <div class="login-mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 7.5A3.5 3.5 0 0 1 9.5 4h5A3.5 3.5 0 0 1 18 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-5A3.5 3.5 0 0 1 6 16.5v-9Z" stroke="currentColor" stroke-width="1.7"/>
            <path d="M9 8h6M9 12h6M9 16h3.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <strong>AI PM</strong>
          <span>智能项目管理平台</span>
        </div>
      </div>
      <div class="login-status">AI PM Unified Auth</div>
    </header>

    <section class="login-main">
      <section class="login-hero" aria-label="AI PM 登录介绍">
        <div class="login-copy">
          <div class="login-kicker">AI 项目作战室</div>
          <h1>用 AI 驱动项目交付</h1>
          <p>把需求、版本、任务、风险与 Bug 收束到同一个交付工作台。登录后 AI PM 会完成身份校验、权限控制、负责人匹配和机器人通知。</p>
          <div class="login-flow" aria-label="交付链路">
            <span>需求</span>
            <span>版本</span>
            <span>任务</span>
            <span>Bug</span>
            <span>MR</span>
          </div>
        </div>
      </section>

      <section class="login-panel" aria-labelledby="login-title">
        <div class="login-panel-kicker">AI PM 统一登录</div>
        <h2 id="login-title">选择企业认证方式</h2>
        <p>认证、回调和会话由 Unified Auth SDK 处理；AI PM 只读取身份结果并进入对应工作区。</p>
        ${renderLoginError(model.error)}
        ${renderLoginProviders(model.providers)}
        <div class="login-footer">client_id: ${escapeHtml(model.clientId)}</div>
      </section>
    </section>
  </main>
</body>
</html>`;
};
