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

  // provider.href 由 Unified Auth SDK 根据当前 redirect_uri 和 OAuth 配置生成；
  // 视觉层只渲染真实可点击按钮，不再用截图热区覆盖，避免“看起来能点但不是手动实现”的问题。
  return `
    <a class="login-provider login-provider-${variant}" href="${escapeHtml(provider.href)}" aria-label="使用${providerLabel}登录">
      <span class="login-provider-icon ${escapeHtml(provider.iconClassName)}" aria-hidden="true">${provider.icon}</span>
      <span>${variant === "primary" ? `使用${providerLabel}登录` : providerLabel}</span>
    </a>`;
}

function renderLoginProviders(providers: HostedAuthLoginProviderView[], primaryProviderId = "feishu") {
  // 飞书是 AI PM 的主认证入口，Google/GitHub 作为备用身份；
  // 所有按钮都是 SDK provider 链接，确保手写视觉不接管 OAuth state 或回跳安全校验。
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

function renderFloatingCard(
  className: string,
  title: string,
  status: string,
  meta: string,
  variant: "blue" | "green" | "gold" = "green",
) {
  // 漂浮项目卡片按参考图手写为 DOM：标题、状态、任务/Bug/成员指标和头像点阵都可独立响应缩放。
  return `
    <article class="login-project-card ${className}">
      <div class="login-project-card-head">
        <strong>${escapeHtml(title)}</strong>
        <span class="login-card-status login-card-status-${variant}">${escapeHtml(status)}</span>
      </div>
      <p>新一代 AI 驱动的项目管理平台</p>
      <div class="login-card-meta">
        <span>任务 ${escapeHtml(meta)}</span>
        <span>Bug ${variant === "gold" ? "1" : variant === "blue" ? "2" : "6"}</span>
        <span>成员 ${variant === "blue" ? "4" : "8"}</span>
      </div>
      <div class="login-avatar-row" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><em>+3</em>
      </div>
    </article>`;
}

function renderFeature(icon: string, title: string, description: string) {
  return `
    <div class="login-feature">
      <div class="login-feature-icon" aria-hidden="true">${icon}</div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </div>`;
}

function renderLoginError(error?: string) {
  // 正常 OAuth 登录不需要用户填写任何“会话信息”；只有 Auth Service 明确返回错误时，
  // 才显示一条解释性提示，避免把错误态伪装成可输入表单。
  return error ? `<div class="login-error" role="alert">${escapeHtml(error)}</div>` : "";
}

function renderMotionScript() {
  // 参考图的复杂空间感用轻量 canvas 手写：星点、连接线和流动轨迹都在本页即时绘制。
  // 脚本只处理视觉动效，不读取 Cookie、不发请求、不干预认证按钮点击，降低 Hosted Auth 页面风险。
  return `<script>
(() => {
  const canvas = document.querySelector("[data-login-space]");
  const shell = document.querySelector(".login-shell");
  if (!canvas || !shell || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  const stars = [];
  const stream = [];
  let width = 0;
  let height = 0;
  let ratio = 1;
  let frame = 0;

  const resize = () => {
    const rect = shell.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    stars.length = 0;
    stream.length = 0;
    const starCount = width < 760 ? 90 : 190;
    for (let index = 0; index < starCount; index += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.85,
        size: Math.random() * 1.7 + 0.35,
        alpha: Math.random() * 0.52 + 0.12,
        speed: Math.random() * 0.16 + 0.03
      });
    }
    for (let index = 0; index < 68; index += 1) {
      stream.push({
        offset: Math.random(),
        lane: Math.random(),
        speed: Math.random() * 0.0018 + 0.001,
        size: Math.random() * 2.2 + 0.8
      });
    }
  };

  const draw = () => {
    frame += 1;
    context.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      star.y += star.speed;
      if (star.y > height * 0.88) star.y = Math.random() * 60;
      const pulse = Math.sin(frame * 0.025 + star.x) * 0.16;
      context.fillStyle = "rgba(168, 231, 255, " + Math.max(0, star.alpha + pulse) + ")";
      context.beginPath();
      context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      context.fill();
    });

    const originX = width * 0.47;
    const originY = height * 0.72;
    stream.forEach((point, index) => {
      point.offset = (point.offset + point.speed) % 1;
      const t = point.offset;
      const direction = index % 2 === 0 ? 1 : -1;
      const radius = width * (0.12 + point.lane * 0.24);
      const angle = -Math.PI * 0.9 + t * Math.PI * 1.65 * direction;
      const x = originX + Math.cos(angle) * radius;
      const y = originY + Math.sin(angle) * radius * 0.34 - t * height * 0.2;
      context.fillStyle = "rgba(102, 244, 218, " + (0.14 + t * 0.44) + ")";
      context.beginPath();
      context.arc(x, y, point.size, 0, Math.PI * 2);
      context.fill();
    });

    requestAnimationFrame(draw);
  };

  window.addEventListener("resize", resize);
  resize();
  draw();
})();
</script>`;
}

const featureIcons = {
  cube: "<svg viewBox='0 0 24 24'><path d='M12 3 4.5 7.2v8.6L12 20l7.5-4.2V7.2L12 3Z'/><path d='M12 11.8V20M4.8 7.4l7.2 4.4 7.2-4.4'/></svg>",
  task: "<svg viewBox='0 0 24 24'><path d='M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2Z'/><path d='m8 12 2 2 5-6M8 17h7'/></svg>",
  shield: "<svg viewBox='0 0 24 24'><path d='M12 3 5 6v5.4c0 4.2 2.8 7.4 7 9.1 4.2-1.7 7-4.9 7-9.1V6l-7-3Z'/><path d='m9 12 2 2 4-5'/></svg>",
  bug: "<svg viewBox='0 0 24 24'><path d='M8 8h8v8a4 4 0 0 1-8 0V8Z'/><path d='M9 4l2 4M15 4l-2 4M4 13h4M16 13h4M5 18l3-2M16 16l3 2'/></svg>",
};

export const aiPmLoginPageComponent: HostedAuthLoginPageComponent = ({ model }) => {
  // 登录页是认证系统公开入口：视觉完全手写实现，OAuth state、provider 链接和 redirect_uri 仍交由 Unified Auth SDK 管理。
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
    <canvas class="login-space-canvas" data-login-space aria-hidden="true"></canvas>
    <header class="login-topbar">
      <div class="login-brand" aria-label="AI PM">
        <div class="login-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M13.2 2 5 13.4h6.1L9.9 22 19 9.4h-6.2L13.2 2Z"/></svg>
        </div>
        <div>
          <strong>AI PM</strong>
          <span>智能项目管理平台</span>
        </div>
      </div>
      <div class="login-status"><i></i>AI PM Unified Auth</div>
    </header>

    <section class="login-main">
      <section class="login-hero" aria-label="AI PM 登录介绍">
        <div class="login-copy">
          <div class="login-kicker">新一代 AI 驱动的项目管理平台</div>
          <h1>用 AI 驱动项目交付</h1>
          <p>统一管理项目、任务、需求、风险与 Bug，<br />让协作更智能，交付更高效，决策更精准。</p>
        </div>

        <div class="login-capabilities" aria-label="AI PM 核心能力">
          ${renderFeature(featureIcons.cube, "项目全景掌控", "AI 洞察项目健康度")}
          ${renderFeature(featureIcons.task, "智能任务协同", "自动化跟进与提醒")}
          ${renderFeature(featureIcons.shield, "风险主动预警", "提前识别，降低不确定性")}
          ${renderFeature(featureIcons.bug, "Bug 闭环管理", "从发现到解决全链路追踪")}
        </div>

        <div class="login-scene" aria-hidden="true">
          <div class="login-orbit login-orbit-a"></div>
          <div class="login-orbit login-orbit-b"></div>
          <div class="login-orbit login-orbit-c"></div>
          <div class="login-platform">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="login-mountains"></div>
          ${renderFloatingCard("login-project-card-main", "AI PM 平台重构", "进行中", "48/62")}
          ${renderFloatingCard("login-project-card-top", "智能需求分析引擎", "规划中", "12/20", "blue")}
          ${renderFloatingCard("login-project-card-back", "移动端适配升级", "进行中", "24/36")}
          ${renderFloatingCard("login-project-card-side", "数据可视化升级", "进行中", "24/36")}
          ${renderFloatingCard("login-project-card-low", "AI 助手集成", "开发中", "8/16", "gold")}
        </div>

        <div class="login-stats" aria-label="平台数据">
          <div><strong>10K+</strong><span>企业项目在使用</span></div>
          <div><strong>98%</strong><span>项目交付准时率提升</span></div>
          <div><strong>60%</strong><span>团队协作效率提升</span></div>
        </div>
      </section>

      <section class="login-panel" aria-labelledby="login-title">
        <div class="login-panel-kicker">AI PM 统一登录</div>
        <h2 id="login-title">统一登录</h2>
        <p>请选择企业认证方式进入 AI PM，认证、回调和会话由 Unified Auth SDK 黑盒处理。</p>
        ${renderLoginError(model.error)}
        ${renderLoginProviders(model.providers)}
        <div class="login-footer">client_id: ${escapeHtml(model.clientId)}</div>
      </section>
    </section>

    <footer class="login-page-footer" aria-label="页脚">
      <span>© 2025 AI PM. 保留所有权利。</span>
      <a href="#">隐私政策</a>
      <a href="#">服务条款</a>
      <a href="#">帮助中心</a>
    </footer>
  </main>
  ${renderMotionScript()}
</body>
</html>`;
};
