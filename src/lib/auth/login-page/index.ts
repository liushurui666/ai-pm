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

function renderLoginMotionScript() {
  // Hosted Auth 登录页不经过 Next 客户端 bundle，这里只放一个轻量原生 canvas 动效。
  // 动效只负责营造 ActiveTheory 类似的空间流动感，不参与登录状态、OAuth state 或跳转逻辑，避免视觉层影响认证安全链路。
  return `<script>
(() => {
  const canvas = document.querySelector("[data-login-orbit]");
  const shell = document.querySelector(".login-shell");
  if (!canvas || !shell || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const particles = [];
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
    particles.length = 0;
    const amount = width < 760 ? 54 : 96;
    for (let index = 0; index < amount; index += 1) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 90 + Math.random() * Math.min(width, height) * 0.48,
        speed: 0.0014 + Math.random() * 0.0026,
        size: 0.7 + Math.random() * 1.9,
        drift: Math.random() * Math.PI * 2
      });
    }
  };

  const movePointer = (event) => {
    pointer.tx = (event.clientX / Math.max(width, 1) - 0.5) * 2;
    pointer.ty = (event.clientY / Math.max(height, 1) - 0.5) * 2;
  };

  const draw = () => {
    frame += 1;
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;
    context.clearRect(0, 0, width, height);

    const centerX = width * (0.43 + pointer.x * 0.018);
    const centerY = height * (0.5 + pointer.y * 0.018);
    const points = [];

    particles.forEach((particle, index) => {
      particle.angle += particle.speed;
      const wave = Math.sin(frame * 0.012 + particle.drift) * 28;
      const orbitX = Math.cos(particle.angle) * (particle.radius + wave);
      const orbitY = Math.sin(particle.angle * 0.62) * (particle.radius * 0.32 + wave * 0.3);
      const x = centerX + orbitX + pointer.x * 24;
      const y = centerY + orbitY + Math.sin(frame * 0.01 + index) * 10 + pointer.y * 18;
      points.push({ x, y, size: particle.size });
    });

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      for (let nextIndex = index + 1; nextIndex < points.length; nextIndex += 1) {
        const next = points[nextIndex];
        const dx = point.x - next.x;
        const dy = point.y - next.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 118) {
          context.strokeStyle = "rgba(104, 236, 222, " + (0.12 * (1 - distance / 118)) + ")";
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(next.x, next.y);
          context.stroke();
        }
      }
    }

    points.forEach((point, index) => {
      const pulse = 0.6 + Math.sin(frame * 0.04 + index) * 0.28;
      context.fillStyle = "rgba(116, 245, 226, " + (0.34 + pulse * 0.18) + ")";
      context.beginPath();
      context.arc(point.x, point.y, point.size + pulse, 0, Math.PI * 2);
      context.fill();
    });

    requestAnimationFrame(draw);
  };

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", movePointer, { passive: true });
  resize();
  draw();
})();
</script>`;
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
    <canvas class="login-orbit-canvas" data-login-orbit aria-hidden="true"></canvas>
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
        <div class="login-stage" aria-hidden="true">
          <div class="login-stage-core">
            <div class="login-core-ring login-core-ring-a"></div>
            <div class="login-core-ring login-core-ring-b"></div>
            <div class="login-core-pulse"></div>
            <div class="login-core-label">AI PM</div>
          </div>
          <div class="login-signal login-signal-left">
            <strong>版本发布</strong>
            <span>需求同步 · 任务拆解 · MR 跟进</span>
          </div>
          <div class="login-signal login-signal-right">
            <strong>Bug 修复</strong>
            <span>AI 归因 · 负责人匹配 · 通知闭环</span>
          </div>
          <div class="login-terminal">
            <span></span><span></span><span></span>
          </div>
        </div>
        <div class="login-copy">
          <div class="login-kicker">AI 项目交付中枢</div>
          <h1>让项目流动起来</h1>
          <p>统一需求、版本、任务、风险、Bug 与 MR 信号。登录后系统完成身份校验、权限控制、负责人匹配和机器人通知。</p>
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
  ${renderLoginMotionScript()}
</body>
</html>`;
};
