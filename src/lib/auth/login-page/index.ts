import type { LoginPageComponent, LoginProviderView } from "@/lib/auth/types";
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

function renderLoginProviderButton(provider: LoginProviderView, variant: "primary" | "secondary") {
  const providerLabel = escapeHtml(provider.label);

  // provider.href 由 AI PM 服务端根据当前 redirect_uri 和 OAuth 白名单生成；视觉层不接管 state 或回调校验。
  return `
    <a class="login-provider login-provider-${variant}" href="${escapeHtml(provider.href)}" aria-label="使用${providerLabel}登录">
      <span class="login-provider-icon ${escapeHtml(provider.iconClassName)}" aria-hidden="true">${provider.icon}</span>
      <span>${variant === "primary" ? `使用${providerLabel}登录` : providerLabel}</span>
    </a>`;
}

function renderLoginProviders(providers: LoginProviderView[], primaryProviderId = "feishu") {
  // 飞书是 AI PM 的主认证入口，Google/GitHub 作为备用身份；
  // 所有按钮都是服务端 provider start 链接，确保手写视觉不接管 OAuth state 或回跳安全校验。
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
  // 卡片的循环镜头感交给 CSS keyframes 处理，避免 JS 每帧读写 DOM 影响 OAuth 登录页的稳定性。
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
  // 顶级登录视觉拆成两个独立画布：Three.js 负责 3D 粒子空间，2D canvas 负责液态光场。
  // 这里刻意不做真实表单联动或业务请求，避免 Hosted Auth 页面视觉升级影响 OAuth state、回跳和 Cookie 处理。
  return `<script>
(() => {
  const threeCanvas = document.querySelector("[data-login-three]");
  const rippleCanvas = document.querySelector("[data-login-ripple]");
  const shell = document.querySelector(".login-shell");
  if (!shell || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let width = 0;
  let height = 0;
  let ratio = 1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const resize = () => {
    const rect = shell.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (rippleCanvas) {
      rippleCanvas.width = Math.floor(width * ratio);
      rippleCanvas.height = Math.floor(height * ratio);
      rippleCanvas.style.width = width + "px";
      rippleCanvas.style.height = height + "px";
    }
  };

  const trackPointer = (event) => {
    pointer.tx = (event.clientX / Math.max(width, 1) - 0.5) * 2;
    pointer.ty = (event.clientY / Math.max(height, 1) - 0.5) * 2;
  };

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", trackPointer, { passive: true });
  resize();

  const startRipple = () => {
    if (!rippleCanvas) return;
    const context = rippleCanvas.getContext("2d", { alpha: true });
    if (!context) return;
    let frame = 0;

    const drawLiquidField = () => {
      frame += 1;
      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const centerX = width * (0.53 + pointer.x * 0.035);
      const centerY = height * (0.69 + pointer.y * 0.025);
      const sceneWidth = Math.min(width, 1440);

      for (let band = 0; band < 20; band += 1) {
        const bandOffset = band / 20;
        const radiusX = sceneWidth * (0.18 + bandOffset * 0.34);
        const radiusY = radiusX * (0.18 + bandOffset * 0.04);
        const phase = frame * 0.012 + band * 0.42;
        context.beginPath();
        for (let step = 0; step <= 150; step += 1) {
          const progress = step / 150;
          const angle = -Math.PI * 1.05 + progress * Math.PI * 2.1;
          const wave = Math.sin(progress * 10 + phase) * sceneWidth * 0.008 + Math.cos(progress * 17 - phase * 0.7) * sceneWidth * 0.004;
          const x = centerX + Math.cos(angle) * (radiusX + wave) + Math.sin(phase * 0.7 + progress * 3.5) * 8;
          const y = centerY + Math.sin(angle) * (radiusY + wave * 0.32) + Math.cos(phase + progress * 4.2) * 5;
          if (step === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        const alpha = Math.max(0.025, 0.13 - bandOffset * 0.08);
        context.strokeStyle = band % 3 === 0
          ? "rgba(122, 255, 232, " + alpha + ")"
          : "rgba(72, 170, 255, " + (alpha * 0.72) + ")";
        context.lineWidth = 0.7 + bandOffset * 1.2;
        context.shadowBlur = 16;
        context.shadowColor = "rgba(84, 232, 255, " + (alpha * 1.7) + ")";
        context.stroke();
      }

      for (let ribbon = 0; ribbon < 5; ribbon += 1) {
        const y = centerY - sceneWidth * 0.055 + ribbon * sceneWidth * 0.027;
        const phase = frame * 0.018 + ribbon * 1.15;
        const gradient = context.createLinearGradient(centerX - sceneWidth * 0.32, y, centerX + sceneWidth * 0.28, y);
        gradient.addColorStop(0, "rgba(72, 195, 255, 0)");
        gradient.addColorStop(0.42, "rgba(111, 255, 224, 0.12)");
        gradient.addColorStop(0.58, "rgba(68, 156, 255, 0.08)");
        gradient.addColorStop(1, "rgba(72, 195, 255, 0)");
        context.beginPath();
        context.moveTo(centerX - sceneWidth * 0.34, y);
        for (let step = 0; step <= 72; step += 1) {
          const progress = step / 72;
          const x = centerX - sceneWidth * 0.34 + progress * sceneWidth * 0.68;
          const nextY = y + Math.sin(progress * Math.PI * 2.4 + phase) * (10 + ribbon * 2) + pointer.y * 7;
          context.lineTo(x, nextY);
        }
        context.strokeStyle = gradient;
        context.lineWidth = 12 - ribbon * 1.4;
        context.shadowBlur = 26;
        context.shadowColor = "rgba(80, 235, 255, 0.12)";
        context.stroke();
      }

      const gradient = context.createRadialGradient(centerX, centerY, 10, centerX, centerY, sceneWidth * 0.27);
      gradient.addColorStop(0, "rgba(111, 255, 222, 0.22)");
      gradient.addColorStop(0.36, "rgba(42, 176, 255, 0.08)");
      gradient.addColorStop(1, "rgba(6, 12, 24, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.ellipse(centerX, centerY, sceneWidth * 0.28, sceneWidth * 0.075, -0.04, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "source-over";

      requestAnimationFrame(drawLiquidField);
    };
    drawLiquidField();
  };

  const startFallbackParticles = () => {
    if (!threeCanvas) return;
    const context = threeCanvas.getContext("2d", { alpha: true });
    if (!context) return;
    const particles = Array.from({ length: 520 }, () => ({
      x: (Math.random() - 0.5) * 2.4,
      y: (Math.random() - 0.5) * 1.5,
      z: Math.random() * 2.2 + 0.25,
      size: Math.random() * 1.8 + 0.7
    }));
    let frame = 0;
    const drawFallback = () => {
      frame += 1;
      threeCanvas.width = Math.floor(width * ratio);
      threeCanvas.height = Math.floor(height * ratio);
      threeCanvas.style.width = width + "px";
      threeCanvas.style.height = height + "px";
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        const angle = frame * 0.003 + index * 0.011;
        const x3 = particle.x * Math.cos(angle) - particle.z * Math.sin(angle) * 0.3;
        const z3 = particle.z + particle.x * Math.sin(angle) * 0.28;
        const scale = 1 / Math.max(0.3, z3);
        const x = width * 0.5 + x3 * width * 0.32 * scale + pointer.x * 18;
        const y = height * 0.5 + particle.y * height * 0.38 * scale + pointer.y * 12;
        context.fillStyle = "rgba(118, 244, 232, " + Math.min(0.82, 0.18 + scale * 0.18) + ")";
        context.beginPath();
        context.arc(x, y, particle.size * scale, 0, Math.PI * 2);
        context.fill();
      });
      requestAnimationFrame(drawFallback);
    };
    drawFallback();
  };

  const startThreeParticles = async () => {
    if (!threeCanvas) return startFallbackParticles();
    try {
      const THREE = await import("https://unpkg.com/three@0.164.1/build/three.module.js");
      const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      camera.position.set(0, 0.25, 4.8);
      const field = new THREE.Group();
      scene.add(field);

      const spriteCanvas = document.createElement("canvas");
      spriteCanvas.width = 64;
      spriteCanvas.height = 64;
      const spriteContext = spriteCanvas.getContext("2d");
      if (spriteContext) {
        const spriteGradient = spriteContext.createRadialGradient(32, 32, 0, 32, 32, 32);
        spriteGradient.addColorStop(0, "rgba(210,255,252,0.95)");
        spriteGradient.addColorStop(0.32, "rgba(112,244,225,0.62)");
        spriteGradient.addColorStop(1, "rgba(112,244,225,0)");
        spriteContext.fillStyle = spriteGradient;
        spriteContext.fillRect(0, 0, 64, 64);
      }
      const particleTexture = new THREE.CanvasTexture(spriteCanvas);

      const count = 1850;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const radius = 0.45 + Math.random() * 3.1;
        const angle = Math.random() * Math.PI * 2;
        const heightBand = (Math.random() - 0.5) * 2.05;
        positions[index * 3] = Math.cos(angle) * radius;
        positions[index * 3 + 1] = heightBand + Math.sin(radius * 2.2) * 0.18;
        positions[index * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 0.72;
        colors[index * 3] = 0.22 + Math.random() * 0.2;
        colors[index * 3 + 1] = 0.78 + Math.random() * 0.2;
        colors[index * 3 + 2] = 0.82 + Math.random() * 0.18;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: 0.045,
        map: particleTexture,
        transparent: true,
        opacity: 0.62,
        vertexColors: true,
        depthWrite: false,
        alphaTest: 0.02,
        blending: THREE.AdditiveBlending
      });
      const cloud = new THREE.Points(geometry, material);
      field.add(cloud);

      const ringGeometry = new THREE.TorusGeometry(1.72, 0.006, 8, 180);
      const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x68f5dd, transparent: true, opacity: 0.18 });
      const rings = [0, 1, 2, 3].map((_, index) => {
        const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
        ring.rotation.x = Math.PI * 0.62;
        ring.rotation.z = index * 0.42;
        ring.scale.setScalar(1 + index * 0.32);
        ring.material.opacity = 0.18 - index * 0.025;
        field.add(ring);
        return ring;
      });

      const resizeThree = () => {
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      };
      resizeThree();
      window.addEventListener("resize", resizeThree);

      const animate = () => {
        pointer.x += (pointer.tx - pointer.x) * 0.035;
        pointer.y += (pointer.ty - pointer.y) * 0.035;
        field.rotation.y += 0.0024;
        field.rotation.x = -0.08 + pointer.y * 0.075;
        field.position.x = pointer.x * 0.12;
        field.position.y = pointer.y * 0.035;
        cloud.rotation.z += 0.0008;
        rings.forEach((ring, index) => {
          ring.rotation.z += 0.003 + index * 0.0012;
          ring.position.x = pointer.x * 0.08;
          ring.position.y = -0.66 + pointer.y * 0.055;
        });
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      };
      animate();
    } catch (error) {
      startFallbackParticles();
    }
  };

  startRipple();
  startThreeParticles();
})();
</script>`;
}

const featureIcons = {
  cube: "<svg viewBox='0 0 24 24'><path d='M12 3 4.5 7.2v8.6L12 20l7.5-4.2V7.2L12 3Z'/><path d='M12 11.8V20M4.8 7.4l7.2 4.4 7.2-4.4'/></svg>",
  task: "<svg viewBox='0 0 24 24'><path d='M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2Z'/><path d='m8 12 2 2 5-6M8 17h7'/></svg>",
  shield: "<svg viewBox='0 0 24 24'><path d='M12 3 5 6v5.4c0 4.2 2.8 7.4 7 9.1 4.2-1.7 7-4.9 7-9.1V6l-7-3Z'/><path d='m9 12 2 2 4-5'/></svg>",
  bug: "<svg viewBox='0 0 24 24'><path d='M8 8h8v8a4 4 0 0 1-8 0V8Z'/><path d='M9 4l2 4M15 4l-2 4M4 13h4M16 13h4M5 18l3-2M16 16l3 2'/></svg>",
};

export const aiPmLoginPageComponent: LoginPageComponent = ({ model }) => {
  // 登录页是认证系统公开入口：视觉完全手写，OAuth state、provider 回调和数据库会话仍交由 Better Auth 处理。
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
    <canvas class="login-three-canvas" data-login-three aria-hidden="true"></canvas>
    <canvas class="login-ripple-canvas" data-login-ripple aria-hidden="true"></canvas>
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
      <div class="login-status"><i></i>AI PM 安全认证</div>
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
        <p>请选择企业认证方式进入 AI PM，账号与会话安全存储在独立认证数据库。</p>
        ${renderLoginError(model.error)}
        ${renderLoginProviders(model.providers)}
        <div class="login-footer">由 AI PM 认证服务保护账号安全</div>
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
