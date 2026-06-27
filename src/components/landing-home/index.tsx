"use client";

import "./index.less";
import {
  ArrowRightOutlined,
  BranchesOutlined,
  BugOutlined,
  CodeOutlined,
  DashboardOutlined,
  FireOutlined,
  LoginOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode, TouchEvent, WheelEvent } from "react";
import * as THREE from "three";
import { ThemeToggleButton, useThemePreference } from "@/components/theme-mode";

type LandingHomeProps = {
  isAuthenticated: boolean;
  primaryHref: string;
  versionDashboardHref: string;
  workbenchHref: string;
};

type StoryScene = {
  key: string;
  index: string;
  label: string;
  category: string;
  title: string;
  kicker: string;
  description: string;
  metric: string;
  accent: string;
  icon: ReactNode;
  signals: string[];
};

const storyScenes: StoryScene[] = [
  {
    key: "command",
    index: "01",
    label: "Command OS",
    category: "system",
    title: "AI PM 项目作战舱",
    kicker: "需求、任务、Bug 和版本在同一块空间里实时推进。",
    description: "把项目现场做成一个可滚动的 3D 控制室：每次滑动都进入下一段交付故事，登录后直接回到真实工作台。",
    metric: "86% live health",
    accent: "#6fffe2",
    icon: <DashboardOutlined />,
    signals: ["版本健康", "任务流转", "风险自动亮起"],
  },
  {
    key: "requirement",
    index: "02",
    label: "Requirement Map",
    category: "websites",
    title: "需求先被拆成地图",
    kicker: "PRD、会议纪要和口头描述进入系统后，AI 先把验收点铺开。",
    description: "每条需求都带上角色、边界、前后端事项和测试风险，项目不再从群消息里重新拼上下文。",
    metric: "12 acceptance nodes",
    accent: "#7fb7ff",
    icon: <RadarChartOutlined />,
    signals: ["验收点", "边界条件", "需求版本"],
  },
  {
    key: "delivery",
    index: "03",
    label: "Delivery Pulse",
    category: "installations",
    title: "版本推进像现场回放",
    kicker: "阶段拖拽、负责人变化、延期任务和阻塞一起进入节奏盘。",
    description: "滚轮推进时，卡片、粒子和光场都在变换深度，模拟 Active Theory 式的固定视口滑动故事。",
    metric: "24 moves today",
    accent: "#d9ff7a",
    icon: <BranchesOutlined />,
    signals: ["阶段看板", "成员负载", "版本大屏"],
  },
  {
    key: "fix",
    index: "04",
    label: "AI Fix Loop",
    category: "XR / VR / AI",
    title: "Bug 进入代码闭环",
    kicker: "缺陷不只被记录，它会带着复现、附件、仓库和分支去生成 PR。",
    description: "研发看到的是能确认的修复任务，测试看到的是可回归的风险，管理者看到的是交付是否真的闭合。",
    metric: "5 PR pending",
    accent: "#ff8bd5",
    icon: <BugOutlined />,
    signals: ["复现材料", "AI 修复", "PR 确认"],
  },
  {
    key: "launch",
    index: "05",
    label: "Launch Lock",
    category: "multiplayer",
    title: "上线前最后锁定",
    kicker: "版本节奏、未验收项、阻塞风险和周报输出都在同一条主线。",
    description: "这不是营销页的几块卡片，而是把 AI PM 的交付链路压缩成一个可滑动的视觉经验。",
    metric: "ready to ship",
    accent: "#ffd36a",
    icon: <SafetyCertificateOutlined />,
    signals: ["上线校验", "周报导出", "风险回归"],
  },
];

const THREE_PANEL_WIDTH = 760;
const THREE_PANEL_HEIGHT = 430;

function createPanelTexture(scene: StoryScene) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 576;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  // WebGL 卡片文字用 canvas texture 一次性绘制，运行时只更新 3D 位置，避免每帧操作 DOM 造成卡顿。
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "rgba(7,18,32,0.92)");
  gradient.addColorStop(0.52, "rgba(13,37,56,0.78)");
  gradient.addColorStop(1, "rgba(2,8,16,0.94)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = scene.accent;
  context.globalAlpha = 0.55;
  context.lineWidth = 3;
  context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  context.globalAlpha = 0.24;
  for (let index = 0; index < 16; index += 1) {
    context.beginPath();
    context.moveTo(24, 96 + index * 24);
    context.lineTo(canvas.width - 24, 96 + index * 18);
    context.stroke();
  }

  context.globalAlpha = 1;
  context.fillStyle = scene.accent;
  context.font = "700 30px monospace";
  context.fillText(`AI PM / ${scene.index}`, 60, 82);

  context.fillStyle = "rgba(255,255,255,0.88)";
  context.font = "900 76px monospace";
  const titleParts = scene.title.split(" ");
  context.fillText(titleParts.slice(0, 2).join(" "), 60, 224);
  context.fillText(titleParts.slice(2).join(" ") || scene.label, 60, 310);

  context.fillStyle = "rgba(232,246,255,0.72)";
  context.font = "600 30px sans-serif";
  context.fillText(scene.metric, 62, 382);

  context.fillStyle = "rgba(255,255,255,0.52)";
  context.font = "500 22px sans-serif";
  scene.signals.forEach((signal, index) => {
    context.fillText(`-> ${signal}`, 64, 442 + index * 34);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function LandingHome({ isAuthenticated, primaryHref, versionDashboardHref, workbenchHref }: LandingHomeProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<HTMLElement>(null);
  const activeIndexRef = useRef(0);
  const wheelLockRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);
  const pointerStartRef = useRef<number | null>(null);
  const gestureLockRef = useRef(0);
  const { cycleMode, effectiveTheme, mode: themeMode } = useThemePreference();

  const activeScene = storyScenes[activeIndex];
  const nextScene = storyScenes[(activeIndex + 1) % storyScenes.length];
  const primaryLabel = isAuthenticated ? "进入工作台" : "登录并进入工作台";

  const sceneStyle = useMemo(
    () => ({
      "--scene-accent": activeScene.accent,
      "--scene-index": activeIndex,
    }) as CSSProperties,
    [activeIndex, activeScene.accent]
  );

  const goToScene = useCallback((nextIndex: number) => {
    const normalizedIndex = (nextIndex + storyScenes.length) % storyScenes.length;
    activeIndexRef.current = normalizedIndex;
    setActiveIndex(normalizedIndex);
  }, []);

  const goToSceneByGesture = useCallback((direction: 1 | -1) => {
    const now = performance.now();

    // 真实移动浏览器可能会为同一次上滑同时派发 TouchEvent 和 PointerEvent；
    // 这里用短锁把“一次手势”归并成一次分镜推进，避免手机上轻轻滑一下直接跳两屏。
    if (now - gestureLockRef.current < 520) {
      return;
    }

    gestureLockRef.current = now;
    goToScene(activeIndexRef.current + direction);
  }, [goToScene]);

  const handleWheel = useCallback((event: WheelEvent<HTMLElement>) => {
    const now = performance.now();

    // Active Theory 的 /work 不是原生长页面滚动，而是滚轮推进固定舞台；
    // 这里做一个短锁，避免触控板连续 delta 把故事一下跳完。
    if (Math.abs(event.deltaY) < 28 || now - wheelLockRef.current < 620) {
      return;
    }

    wheelLockRef.current = now;
    goToScene(activeIndexRef.current + (event.deltaY > 0 ? 1 : -1));
  }, [goToScene]);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    touchStartRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchEnd = useCallback((event: TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    const end = event.changedTouches[0]?.clientY ?? null;
    touchStartRef.current = null;

    if (start === null || end === null || Math.abs(start - end) < 36) {
      return;
    }

    goToSceneByGesture(start > end ? 1 : -1);
  }, [goToSceneByGesture]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") {
      return;
    }

    pointerStartRef.current = event.clientY;
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;

    if (start === null || Math.abs(start - event.clientY) < 42) {
      return;
    }

    // Pointer 事件作为 touch 的兜底：移动浏览器和自动化环境对 TouchEvent 的实现不完全一致，
    // 双通道可以保证固定视口故事在手机上也能用“上滑/下滑”推进，而不是只能点击底部分镜。
    goToSceneByGesture(start > event.clientY ? 1 : -1);
  }, [goToSceneByGesture]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        goToScene(activeIndexRef.current + 1);
      }

      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        goToScene(activeIndexRef.current - 1);
      }
    };

    // 固定视口滚动故事没有原生滚动条，键盘事件需要挂到 window；
    // 否则焦点落在链接或按钮上时，方向键不会推进分镜。
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToScene]);

  useEffect(() => {
    const root = experienceRef.current;
    const canvas = canvasRef.current;

    if (!root || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.set(0, 0.2, 7.2);

    const stage = new THREE.Group();
    scene.add(stage);

    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);

    const pointLight = new THREE.PointLight(0x7fffe2, 3.2, 20);
    pointLight.position.set(-2.6, 2.8, 4);
    scene.add(pointLight);

    const particleCount = 2600;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const baseColors = storyScenes.map((sceneItem) => new THREE.Color(sceneItem.accent));

    for (let index = 0; index < particleCount; index += 1) {
      const radius = 1.2 + Math.random() * 5.4;
      const angle = Math.random() * Math.PI * 2;
      const depth = (Math.random() - 0.5) * 4.8;
      particlePositions[index * 3] = Math.cos(angle) * radius;
      particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 3.9 + Math.sin(radius) * 0.24;
      particlePositions[index * 3 + 2] = Math.sin(angle) * radius + depth;

      const color = baseColors[index % baseColors.length].clone().lerp(new THREE.Color("#ffffff"), Math.random() * 0.18);
      particleColors[index * 3] = color.r;
      particleColors[index * 3 + 1] = color.g;
      particleColors[index * 3 + 2] = color.b;
    }

    const particleSprite = document.createElement("canvas");
    particleSprite.width = 48;
    particleSprite.height = 48;
    const spriteContext = particleSprite.getContext("2d");
    if (spriteContext) {
      const gradient = spriteContext.createRadialGradient(24, 24, 0, 24, 24, 24);
      gradient.addColorStop(0, "rgba(255,255,255,0.92)");
      gradient.addColorStop(0.34, "rgba(126,255,226,0.48)");
      gradient.addColorStop(1, "rgba(126,255,226,0)");
      spriteContext.fillStyle = gradient;
      spriteContext.fillRect(0, 0, 48, 48);
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
    const particleMaterial = new THREE.PointsMaterial({
      alphaTest: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: new THREE.CanvasTexture(particleSprite),
      opacity: 0.74,
      size: 0.052,
      transparent: true,
      vertexColors: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    stage.add(particles);

    const panelMeshes = storyScenes.map((sceneItem, index) => {
      const geometry = new THREE.PlaneGeometry(THREE_PANEL_WIDTH / 260, THREE_PANEL_HEIGHT / 260, 12, 8);
      const material = new THREE.MeshBasicMaterial({
        map: createPanelTexture(sceneItem),
        opacity: 0.78,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.index = index;
      stage.add(mesh);
      return mesh;
    });

    const spineGeometry = new THREE.TorusKnotGeometry(0.76, 0.055, 180, 12, 2, 5);
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: 0x7fffe2,
      emissive: 0x143f5d,
      metalness: 0.86,
      opacity: 0.58,
      roughness: 0.28,
      transparent: true,
    });
    const spine = new THREE.Mesh(spineGeometry, spineMaterial);
    spine.position.set(0.25, -0.05, -1.15);
    stage.add(spine);

    let animationFrame = 0;
    let width = 1;
    let height = 1;

    const resize = () => {
      const rect = root.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const getOffset = (index: number) => {
      let offset = index - activeIndexRef.current;
      const half = storyScenes.length / 2;
      if (offset > half) offset -= storyScenes.length;
      if (offset < -half) offset += storyScenes.length;
      return offset;
    };

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const time = performance.now() * 0.001;
      const activeColor = new THREE.Color(storyScenes[activeIndexRef.current].accent);
      pointLight.color.lerp(activeColor, 0.035);
      spineMaterial.color.lerp(activeColor, 0.025);
      spineMaterial.emissive.lerp(activeColor.clone().multiplyScalar(0.18), 0.025);

      stage.rotation.y += 0.0022;
      particles.rotation.y -= 0.0009;
      particles.rotation.z = Math.sin(time * 0.18) * 0.06;
      spine.rotation.x += 0.003;
      spine.rotation.y += 0.006;

      panelMeshes.forEach((mesh, index) => {
        const offset = getOffset(index);
        const absOffset = Math.abs(offset);
        const targetX = offset * 2.56;
        const targetY = Math.sin(time * 0.74 + index * 0.86) * 0.24 - absOffset * 0.07;
        const targetZ = -absOffset * 1.34 + (offset === 0 ? 1.18 : -0.58);
        const targetScale = offset === 0 ? 1.28 : 0.86 - absOffset * 0.09;
        const targetOpacity = offset === 0 ? 0.92 : Math.max(0.15, 0.36 - absOffset * 0.06);

        mesh.position.x += (targetX - mesh.position.x) * 0.065;
        mesh.position.y += (targetY - mesh.position.y) * 0.065;
        mesh.position.z += (targetZ - mesh.position.z) * 0.065;
        mesh.rotation.y += ((-offset * 0.32) - mesh.rotation.y) * 0.075;
        mesh.rotation.x += ((offset === 0 ? -0.04 : 0.06 * offset) - mesh.rotation.x) * 0.075;
        mesh.scale.x += (targetScale - mesh.scale.x) * 0.07;
        mesh.scale.y += (targetScale - mesh.scale.y) * 0.07;

        const material = mesh.material as THREE.MeshBasicMaterial;
        material.opacity += (targetOpacity - material.opacity) * 0.08;
      });

      renderer.render(scene, camera);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
      renderer.dispose();
      particleGeometry.dispose();
      particleMaterial.map?.dispose();
      particleMaterial.dispose();
      spineGeometry.dispose();
      spineMaterial.dispose();
      panelMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      });
    };
  }, []);

  return (
    <main
      aria-label="AI PM 滚动故事首页"
      className="landing-home landing-home--story"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      onWheel={handleWheel}
      ref={experienceRef}
      style={sceneStyle}
      tabIndex={0}
    >
      <canvas aria-hidden="true" className="landing-story-canvas" ref={canvasRef} />
      <div className="landing-story-vignette" aria-hidden="true" />
      <div className="landing-story-noise" aria-hidden="true" />

      <header className="landing-story-nav">
        <Link className="landing-brand" href="/">
          <span className="landing-brand__mark" aria-hidden="true">
            <span className="landing-brand-board">
              <span className="landing-brand-board__card landing-brand-board__card--one" />
              <span className="landing-brand-board__card landing-brand-board__card--two" />
              <span className="landing-brand-board__card landing-brand-board__card--three" />
              <span className="landing-brand-board__node" />
            </span>
          </span>
          <span>
            <strong>AI PM</strong>
            <small>智能项目管理平台</small>
          </span>
        </Link>

        <nav aria-label="首页故事导航" className="landing-story-nav__links">
          <button type="button" onClick={() => goToScene(0)}>Work</button>
          <a href={primaryHref}>Login</a>
          <a href={workbenchHref}>Workbench</a>
        </nav>

        <div className="landing-story-nav__tools">
          <ThemeToggleButton
            effectiveTheme={effectiveTheme}
            mode={themeMode}
            onClick={cycleMode}
          />
        </div>
      </header>

      <aside className="landing-story-filter" aria-label="故事分镜筛选">
        <span>WHAT ARE YOU LOOKING FOR?</span>
        {storyScenes.map((sceneItem, index) => (
          <button
            aria-pressed={activeIndex === index}
            className={activeIndex === index ? "is-active" : undefined}
            key={sceneItem.key}
            onClick={() => goToScene(index)}
            type="button"
          >
            {"->"} {sceneItem.category}
          </button>
        ))}
        <a className="landing-story-filter__ask" href={primaryHref}>
          ASK AI PM ANYTHING...
        </a>
      </aside>

      <section className="landing-story-copy" aria-live="polite">
        <span className="landing-story-copy__eyebrow">
          {activeScene.icon}
          {activeScene.index} / {activeScene.label}
        </span>
        <h1>
          {activeScene.title}
        </h1>
        <p className="landing-story-copy__kicker">{activeScene.kicker}</p>
        <p>{activeScene.description}</p>
        <div className="landing-story-copy__actions">
          <a className="landing-story-button landing-story-button--primary" href={primaryHref}>
            <LoginOutlined />
            <span>{primaryLabel}</span>
            <ArrowRightOutlined />
          </a>
          <a className="landing-story-button" href={versionDashboardHref}>
            <CodeOutlined />
            <span>打开版本大屏</span>
          </a>
        </div>
      </section>

      <section className="landing-story-console" aria-label="当前分镜状态">
        <div>
          <span>NOW PLAYING</span>
          <strong>{activeScene.metric}</strong>
        </div>
        <ul>
          {activeScene.signals.map((signal) => (
            <li key={signal}>
              <FireOutlined />
              {signal}
            </li>
          ))}
        </ul>
      </section>

      <footer className="landing-story-footer">
        <div className="landing-story-counter">
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <i />
          <span>{String(storyScenes.length).padStart(2, "0")}</span>
        </div>
        <div className="landing-story-progress" aria-hidden="true">
          {storyScenes.map((sceneItem, index) => (
            <button
              aria-label={`切换到 ${sceneItem.label}`}
              className={activeIndex === index ? "is-active" : undefined}
              key={sceneItem.key}
              onClick={() => goToScene(index)}
              type="button"
            />
          ))}
        </div>
        <div className="landing-story-next">
          <span>NEXT</span>
          <strong>{nextScene.label}</strong>
        </div>
      </footer>
    </main>
  );
}
