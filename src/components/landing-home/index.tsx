"use client";

import "./index.less";
import {
  ArrowRightOutlined,
  BranchesOutlined,
  BugOutlined,
  CodeOutlined,
  DashboardOutlined,
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

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function createPanelTexture(scene: StoryScene) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 576;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  // 玻璃板纹理只保留少量识别信息，让 WebGL 装置成为主角，避免重新变成“故事进度页”。
  const gradient = context.createRadialGradient(520, 250, 60, 520, 250, 760);
  gradient.addColorStop(0, "rgba(218,245,246,0.4)");
  gradient.addColorStop(0.35, "rgba(70,108,116,0.42)");
  gradient.addColorStop(1, "rgba(6,20,23,0.7)");
  context.fillStyle = gradient;
  drawRoundedRect(context, 24, 24, canvas.width - 48, canvas.height - 48, 54);
  context.fill();

  context.save();
  drawRoundedRect(context, 24, 24, canvas.width - 48, canvas.height - 48, 54);
  context.clip();

  for (let index = 0; index < 120; index += 1) {
    const x = Math.sin(index * 91.7) * 520 + 520;
    const y = Math.cos(index * 48.2) * 290 + 290;
    const radius = 26 + (index % 7) * 13;
    const blot = context.createRadialGradient(x, y, 0, x, y, radius);
    blot.addColorStop(0, `${scene.accent}66`);
    blot.addColorStop(0.46, "rgba(255,255,255,0.08)");
    blot.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = blot;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  context.globalAlpha = 0.18;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  for (let index = 0; index < 11; index += 1) {
    context.beginPath();
    context.moveTo(64, 96 + index * 38);
    context.bezierCurveTo(250, 78 + index * 28, 650, 138 + index * 22, 960, 82 + index * 36);
    context.stroke();
  }
  context.restore();

  context.strokeStyle = scene.accent;
  context.globalAlpha = 0.42;
  context.lineWidth = 5;
  drawRoundedRect(context, 26, 26, canvas.width - 52, canvas.height - 52, 54);
  context.stroke();

  context.globalAlpha = 1;
  context.fillStyle = "rgba(255,255,255,0.52)";
  context.font = "600 26px monospace";
  context.textAlign = "center";
  context.fillText("AI PM", canvas.width / 2, 180);

  context.fillStyle = "rgba(255,255,255,0.92)";
  context.shadowColor = scene.accent;
  context.shadowBlur = 26;
  context.font = "900 64px monospace";
  context.fillText(scene.label.toUpperCase(), canvas.width / 2, 286);

  context.shadowBlur = 0;
  context.fillStyle = "rgba(232,246,255,0.58)";
  context.font = "600 28px sans-serif";
  context.fillText(scene.metric, canvas.width / 2, 352);

  context.textAlign = "left";
  context.fillStyle = "rgba(255,255,255,0.42)";
  context.font = "500 20px monospace";
  scene.signals.forEach((signal, index) => {
    context.fillText(`// ${signal}`, 76 + index * 250, 494);
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

    const particleCount = 3200;
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

    const pillarGroup = new THREE.Group();
    pillarGroup.position.set(1.16, -0.06, -0.42);
    stage.add(pillarGroup);

    // 参考 Active Theory /work 的视觉重点不是显式进度条，而是中心光柱本身；
    // 这里用柱体、纵向线框和上升粒子组成一个“交付能量核”，滚轮只轻微改变色相和卡片位置。
    const pillarShellGeometry = new THREE.CylinderGeometry(0.72, 0.72, 4.9, 96, 1, true);
    const pillarShellMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0x6fffe2,
      depthWrite: false,
      opacity: 0.14,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const pillarShell = new THREE.Mesh(pillarShellGeometry, pillarShellMaterial);
    pillarGroup.add(pillarShell);

    const pillarCoreGeometry = new THREE.CylinderGeometry(0.18, 0.3, 5.8, 64, 1, true);
    const pillarCoreMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0x7fffe2,
      depthWrite: false,
      opacity: 0.34,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const pillarCore = new THREE.Mesh(pillarCoreGeometry, pillarCoreMaterial);
    pillarGroup.add(pillarCore);

    const organicPalette = ["#7ffff0", "#b787ff", "#3fb4ff", "#ffd37a"];
    const organicMeshes = Array.from({ length: 11 }, (_, chunkIndex) => {
      const geometry = new THREE.IcosahedronGeometry(0.44 + (chunkIndex % 3) * 0.09, 2);
      const position = geometry.attributes.position as THREE.BufferAttribute;
      for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
        const x = position.getX(vertexIndex);
        const y = position.getY(vertexIndex);
        const z = position.getZ(vertexIndex);
        const warp = 1 + Math.sin(x * 6.7 + chunkIndex) * 0.16 + Math.cos(z * 5.3 + y * 2.1) * 0.12;
        position.setXYZ(vertexIndex, x * warp, y * (0.86 + Math.sin(chunkIndex) * 0.14), z * warp);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(organicPalette[chunkIndex % organicPalette.length]),
        emissive: new THREE.Color(organicPalette[(chunkIndex + 1) % organicPalette.length]).multiplyScalar(0.18),
        metalness: 0.86,
        opacity: 0.72,
        roughness: 0.18,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const y = -2.7 + chunkIndex * 0.54;
      mesh.position.set(Math.sin(chunkIndex * 1.28) * 0.18, y, Math.cos(chunkIndex * 1.11) * 0.16);
      mesh.rotation.set(chunkIndex * 0.42, chunkIndex * 0.68, chunkIndex * 0.31);
      mesh.scale.set(1.2, 0.72 + (chunkIndex % 2) * 0.18, 0.92);
      pillarGroup.add(mesh);
      return mesh;
    });

    const spikeMaterial = new THREE.MeshStandardMaterial({
      color: 0xbffff7,
      emissive: 0x163f50,
      metalness: 0.72,
      opacity: 0.56,
      roughness: 0.24,
      transparent: true,
    });
    const spikeMeshes = Array.from({ length: 22 }, (_, spikeIndex) => {
      const geometry = new THREE.ConeGeometry(0.09 + (spikeIndex % 3) * 0.025, 0.48 + (spikeIndex % 4) * 0.08, 8);
      const mesh = new THREE.Mesh(geometry, spikeMaterial);
      const angle = spikeIndex * 1.72;
      const radius = 0.42 + (spikeIndex % 5) * 0.045;
      mesh.position.set(Math.cos(angle) * radius, -2.36 + (spikeIndex % 11) * 0.48, Math.sin(angle) * radius);
      mesh.rotation.set(Math.PI / 2 + Math.sin(angle) * 0.54, 0, -angle);
      pillarGroup.add(mesh);
      return mesh;
    });

    const pillarLineVertices: number[] = [];
    for (let lineIndex = 0; lineIndex < 72; lineIndex += 1) {
      const angle = (lineIndex / 72) * Math.PI * 2;
      const radius = 0.74 + Math.sin(lineIndex * 1.7) * 0.025;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      pillarLineVertices.push(x, -2.55, z, x * 0.9, 2.55, z * 0.9);
    }
    const pillarLineGeometry = new THREE.BufferGeometry();
    pillarLineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pillarLineVertices, 3));
    const pillarLineMaterial = new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0x98fff0,
      depthWrite: false,
      opacity: 0.26,
      transparent: true,
    });
    const pillarLines = new THREE.LineSegments(pillarLineGeometry, pillarLineMaterial);
    pillarGroup.add(pillarLines);

    const ringMeshes = Array.from({ length: 9 }, (_, ringIndex) => {
      const ringGeometry = new THREE.TorusGeometry(0.78 + ringIndex * 0.026, 0.006, 8, 128);
      const ringMaterial = new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: 0x6fffe2,
        depthWrite: false,
        opacity: 0.3,
        transparent: true,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -2.2 + ringIndex * 0.54;
      pillarGroup.add(ring);
      return ring;
    });

    const columnParticleCount = 1800;
    const columnParticlePositions = new Float32Array(columnParticleCount * 3);
    const columnParticleSeeds = new Float32Array(columnParticleCount * 4);
    const columnParticleColors = new Float32Array(columnParticleCount * 3);
    for (let index = 0; index < columnParticleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.54 + Math.random() * 1.1;
      const heightSeed = Math.random();
      columnParticleSeeds[index * 4] = angle;
      columnParticleSeeds[index * 4 + 1] = radius;
      columnParticleSeeds[index * 4 + 2] = heightSeed;
      columnParticleSeeds[index * 4 + 3] = 0.55 + Math.random() * 1.35;
      columnParticlePositions[index * 3] = Math.cos(angle) * radius;
      columnParticlePositions[index * 3 + 1] = heightSeed * 5.2 - 2.6;
      columnParticlePositions[index * 3 + 2] = Math.sin(angle) * radius;

      const color = baseColors[index % baseColors.length].clone().lerp(new THREE.Color("#ffffff"), 0.25 + Math.random() * 0.28);
      columnParticleColors[index * 3] = color.r;
      columnParticleColors[index * 3 + 1] = color.g;
      columnParticleColors[index * 3 + 2] = color.b;
    }
    const columnParticleGeometry = new THREE.BufferGeometry();
    columnParticleGeometry.setAttribute("position", new THREE.BufferAttribute(columnParticlePositions, 3));
    columnParticleGeometry.setAttribute("color", new THREE.BufferAttribute(columnParticleColors, 3));
    const columnParticleMaterial = new THREE.PointsMaterial({
      alphaTest: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: particleMaterial.map,
      opacity: 0.86,
      size: 0.043,
      transparent: true,
      vertexColors: true,
    });
    const columnParticles = new THREE.Points(columnParticleGeometry, columnParticleMaterial);
    pillarGroup.add(columnParticles);

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
      pillarShellMaterial.color.lerp(activeColor, 0.03);
      pillarCoreMaterial.color.lerp(activeColor, 0.03);
      pillarLineMaterial.color.lerp(activeColor.clone().lerp(new THREE.Color("#ffffff"), 0.28), 0.03);
      spikeMaterial.color.lerp(activeColor.clone().lerp(new THREE.Color("#ffffff"), 0.46), 0.025);
      ringMeshes.forEach((ring, ringIndex) => {
        const material = ring.material as THREE.MeshBasicMaterial;
        material.color.lerp(activeColor, 0.03);
        material.opacity = 0.16 + Math.sin(time * 1.12 + ringIndex) * 0.04 + ringIndex * 0.012;
        ring.rotation.z += 0.002 + ringIndex * 0.0003;
      });

      stage.rotation.y += 0.0022;
      particles.rotation.y -= 0.0009;
      particles.rotation.z = Math.sin(time * 0.18) * 0.06;
      spine.rotation.x += 0.003;
      spine.rotation.y += 0.006;
      pillarGroup.rotation.y -= 0.0034;
      pillarShell.scale.x = 1 + Math.sin(time * 1.3) * 0.035;
      pillarShell.scale.z = 1 + Math.cos(time * 1.1) * 0.035;
      pillarCore.scale.x = 1 + Math.sin(time * 1.9) * 0.09;
      pillarCore.scale.z = 1 + Math.sin(time * 1.9) * 0.09;
      pillarLines.rotation.y += 0.0048;
      organicMeshes.forEach((mesh, chunkIndex) => {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const paletteColor = new THREE.Color(organicPalette[(chunkIndex + activeIndexRef.current) % organicPalette.length]);
        material.color.lerp(paletteColor.lerp(activeColor, 0.34), 0.025);
        material.emissive.lerp(paletteColor.multiplyScalar(0.2), 0.025);
        mesh.rotation.x += 0.0018 + chunkIndex * 0.0001;
        mesh.rotation.y -= 0.0028;
        mesh.position.x = Math.sin(time * 0.65 + chunkIndex * 1.28) * 0.2;
        mesh.position.z = Math.cos(time * 0.7 + chunkIndex * 1.11) * 0.18;
      });
      spikeMeshes.forEach((mesh, spikeIndex) => {
        mesh.rotation.z -= 0.002 + spikeIndex * 0.00006;
      });

      const columnPositions = columnParticleGeometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < columnParticleCount; index += 1) {
        const angle = columnParticleSeeds[index * 4] + time * columnParticleSeeds[index * 4 + 3] * 0.42;
        const radius = columnParticleSeeds[index * 4 + 1] + Math.sin(time * 1.6 + index) * 0.035;
        const y = (((columnParticleSeeds[index * 4 + 2] + time * 0.062 * columnParticleSeeds[index * 4 + 3]) % 1) * 5.4) - 2.7;
        columnPositions.setXYZ(index, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      }
      columnPositions.needsUpdate = true;

      panelMeshes.forEach((mesh, index) => {
        const offset = getOffset(index);
        const absOffset = Math.abs(offset);
        const targetX = 1.26 + offset * 0.78;
        const targetY = Math.sin(time * 0.74 + index * 0.86) * 0.18 - absOffset * 0.08;
        const targetZ = -absOffset * 1.5 + (offset === 0 ? 0.84 : -0.72);
        const targetScale = offset === 0 ? 0.95 : 0.68 - absOffset * 0.08;
        const targetOpacity = offset === 0 ? 0.72 : Math.max(0.06, 0.2 - absOffset * 0.04);

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
      pillarShellGeometry.dispose();
      pillarShellMaterial.dispose();
      pillarCoreGeometry.dispose();
      pillarCoreMaterial.dispose();
      pillarLineGeometry.dispose();
      pillarLineMaterial.dispose();
      organicMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.MeshStandardMaterial).dispose();
      });
      spikeMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
      });
      spikeMaterial.dispose();
      ringMeshes.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.MeshBasicMaterial).dispose();
      });
      columnParticleGeometry.dispose();
      columnParticleMaterial.dispose();
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

      <aside className="landing-story-filter" aria-label="场景信号">
        <span>SIGNAL FIELD</span>
        {storyScenes.map((sceneItem, index) => (
          <button
            aria-pressed={activeIndex === index}
            className={activeIndex === index ? "is-active" : undefined}
            key={sceneItem.key}
            onClick={() => goToScene(index)}
            type="button"
          >
            {sceneItem.category}
          </button>
        ))}
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
          <span>SYSTEM SIGNAL</span>
          <strong>{activeScene.metric}</strong>
        </div>
        <ul>
          {activeScene.signals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      </section>

      <footer className="landing-story-footer">
        <span>WHEEL / TOUCH TO SHIFT THE FIELD</span>
      </footer>
    </main>
  );
}
