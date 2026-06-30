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
import type { CSSProperties, PointerEvent, ReactNode, TouchEvent } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
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

type ReferenceGlassPanelVariant = "left" | "front" | "rear";
type ActiveTheoryGeometryHeader = {
  attributes?: Array<[string, number]>;
  name?: string;
  type?: number;
};

type StoryWorkItemVisual = {
  isFocused: boolean;
  opacity: number;
  transform: string;
  zIndex: number;
};

const ACTIVE_THEORY_DRACO_DECODER_PATH = "/landing/draco/";
const ACTIVE_THEORY_KTX2_TRANSCODER_PATH = "/landing/basis/";
const ACTIVE_THEORY_SPINE_BASE_COLOR_PATH = "/landing/active-theory-alien-cracked-basecolor.ktx2";
const ACTIVE_THEORY_SPINE_GEOMETRY_PATH = "/landing/active-theory-source-spine.bin";
const ACTIVE_THEORY_FLOWER_SPINE_POINT_CLOUD_PATH = "/landing/active-theory-flower-spine-1024.bin";
const ACTIVE_THEORY_SPINE_MATCAP_PATH = "/landing/active-theory-matcap-test.jpg";
const ACTIVE_THEORY_SPINE_MRO_PATH = "/landing/active-theory-cliffs-mro.ktx2";
const ACTIVE_THEORY_SPINE_NORMAL_PATH = "/landing/active-theory-damaged-road-normal.jpg";
const ACTIVE_THEORY_WORK_ENV_PATH = "/landing/active-theory-env1.jpg";
const ACTIVE_THEORY_WORK_NORMAL_PATH = "/landing/active-theory-waternormals.jpg";
const ACTIVE_THEORY_WORK_HOGWARTS_THUMB_PATH = "/landing/active-theory-hogwarts-thumb.jpg";
const ACTIVE_THEORY_WORK_HOGWARTS_LOGO_PATH = "/landing/active-theory-hogwarts-logo.jpg";
const STORY_WORK_TRACK_STEP = THREE.MathUtils.degToRad(50);
const STORY_WORK_ITEM_REPEAT = 3;
const STORY_WORK_CARD_RADIUS_X = 292;
const STORY_WORK_CARD_RADIUS_Z = 190;

function createSolidDataTexture(r: number, g: number, b: number) {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

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

const STORY_WORK_ITEM_SLOT_COUNT = storyScenes.length * STORY_WORK_ITEM_REPEAT;
const storyWorkItemSlots = Array.from({ length: STORY_WORK_ITEM_SLOT_COUNT }, (_, slotIndex) => {
  const sceneIndex = slotIndex % storyScenes.length;

  return {
    key: `${storyScenes[sceneIndex].key}-${Math.floor(slotIndex / storyScenes.length)}`,
    scene: storyScenes[sceneIndex],
    sceneIndex,
    slotIndex,
  };
});

function getInfiniteStorySlotOffset(slotIndex: number, progress: number, length = STORY_WORK_ITEM_SLOT_COUNT) {
  // Active Theory 的 WorkItems 是一串真实 view，而不是单张卡复用文案。
  // 这里用三轮 slot 做无界最近槽位：滚动持续累加时，同一张业务卡的拷贝会从上到下接力穿场，
  // 既避免 5 张卡过早折返，也避免靠单卡换内容伪装滚动。
  const nearestCycle = Math.round((progress - slotIndex) / length);

  return slotIndex + nearestCycle * length - progress;
}

function getStoryWorkItemVisualFromOffset(offset: number, impulse = 0): StoryWorkItemVisual {
  const absOffset = Math.abs(offset);
  const angle = -offset * STORY_WORK_TRACK_STEP;
  const focus = Math.max(0, 1 - absOffset * 0.58);
  const trackWindow = Math.max(0, 1 - absOffset / 7.2);
  const sourceRadius = STORY_WORK_CARD_RADIUS_X * (0.76 + trackWindow * 0.24);
  const x = Math.sin(angle) * sourceRadius;
  const y = -offset * 104;
  const z = Math.cos(angle) * STORY_WORK_CARD_RADIUS_Z + focus * 260 - absOffset * 30;
  const rotateX = THREE.MathUtils.clamp(offset * -0.044, -0.16, 0.16);
  const rotateY = -angle * 0.9 + THREE.MathUtils.clamp(impulse * 0.026, -0.16, 0.16);
  const rotateZ = Math.sin(angle) * 2.8;
  const scale = 0.42 + trackWindow * 0.24 + focus * 0.32;
  const opacity = Math.min(0.98, 0.11 + trackWindow * 0.5 + focus * 0.3 + Math.min(0.08, Math.abs(impulse) * 0.022));

  // 这套公式保留 Active Theory `WorkItems.positionViews()` 的核心：15 张真实 view 常驻、
  // 50 度步进、相邻卡片同时出现在一条轨道上。柱体本身仍然锁 x/z，
  // 横向半径只给卡片队列使用，避免用户滚动时误读成整根柱子左右漂移。
  return {
    isFocused: absOffset < 0.42,
    opacity,
    transform: `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateX(${rotateX.toFixed(4)}rad) rotateY(${rotateY.toFixed(4)}rad) rotateZ(${rotateZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
    zIndex: Math.round(20 + focus * 20 + trackWindow * 6 - absOffset),
  };
}

function getStoryWorkItemVisual(slotIndex: number, progress: number, impulse = 0): StoryWorkItemVisual {
  return getStoryWorkItemVisualFromOffset(getInfiniteStorySlotOffset(slotIndex, progress), impulse);
}

function getInitialStoryCardStyle(slotIndex: number, progress = 0) {
  const visual = getStoryWorkItemVisual(slotIndex, progress);

  // 首屏默认态不能完全依赖 requestAnimationFrame；
  // 浏览器后台截图或低功耗模式可能会延迟 RAF，若初始 opacity 是 0，用户就会看到“卡片消失”。
  // 这里用和运行时轨道一致的公式给 SSR/首帧一个可见布局，动画恢复后再由同一套 progress 接管。
  return {
    opacity: visual.opacity,
    transform: visual.transform,
    zIndex: visual.zIndex,
  };
}

function isLandingInteractiveTarget(target: EventTarget | null) {
  // 固定视口首页会把主容器主动聚焦来承接键盘滚动；
  // 但用户点到卡片或导航按钮时不应该被主容器抢焦点，否则卡片自己的 click/focus 交互容易被冲掉。
  return target instanceof HTMLElement && Boolean(target.closest("a,button,input,textarea,select,[role='button']"));
}

const THREE_PANEL_WIDTH = 880;
const THREE_PANEL_HEIGHT = 560;

const particleVertexShader = `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uGlobalOpacity;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float pulse = 0.58 + 0.42 * sin(uTime * 1.8 + aPhase);
    float depthScale = 7.2 / max(1.0, -mvPosition.z);
    gl_PointSize = aSize * uPixelRatio * depthScale * (0.82 + pulse * 0.24);
    vAlpha = aAlpha * uGlobalOpacity * (0.56 + pulse * 0.44);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = length(uv);
    float core = smoothstep(0.12, 0.0, distanceFromCenter);
    float halo = smoothstep(0.52, 0.04, distanceFromCenter) * 0.38;
    float alpha = (core * 0.76 + halo) * vAlpha;
    vec3 color = vColor * (core * 1.18 + halo * 0.68);

    if (alpha < 0.01) {
      discard;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

const activeTheoryFlowerPointVertexShader = `
  attribute vec4 random;
  varying vec4 vRandom;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vOffset;
  uniform float uFlowHeight;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uRotate;
  uniform float uScroll;
  uniform float uSizeBias;
  uniform float uSparkle;
  uniform float uTime;

  float activeTheoryHash(vec3 value) {
    return fract(sin(dot(value, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
  }

  void main() {
    vec3 transformed = position;
    vec3 originalPosition = position;
    float halfHeight = uFlowHeight * 0.5;
    float sourceScroll = fract(uScroll);
    float randomA = random.x;
    float randomB = random.y;
    float randomC = random.z;
    float randomD = random.w;
    float verticalProgress = sourceScroll * uFlowHeight + uTime * 0.026;
    transformed.y = mod(transformed.y + verticalProgress + halfHeight, uFlowHeight) - halfHeight;
    transformed.y += sin(position.x * 3.2 + position.z * 2.4 + uTime * 0.24 + uRotate * 0.08) * 0.012;

    // 源站 FlowerShader 不是把整组点云平移，而是用 uScroll/uRotate 在柱体内部做上升、下落和绕轴折射。
    // v113 开始不再用 position hash 伪随机，而是给几何写入独立 random attribute；
    // 这样 top spiral / bottom spiral 的稀疏粒子分布更接近镜像源码，也能让滚动时柱体真的“流动”。
    // 这些偏移都发生在点云局部坐标里，pillarGroup 和主 spine mesh 的 x/z 仍然保持锁定。
    if (transformed.x < 0.0) {
      transformed.z = -transformed.z;
      transformed.y -= 0.56;
    }
    transformed.x += 0.12;
    transformed.z -= 0.06;

    float topOffset = smoothstep(0.4, 0.0, sourceScroll) * pow(randomA, 28.0) * 1.68;
    topOffset *= 0.8 + sin(transformed.y * 0.2 + uTime * 0.02 + sourceScroll + randomC * 2.0) * 0.2;
    transformed.y += topOffset;

    float spiralMask = smoothstep(0.0, 0.5, abs(sourceScroll - 0.5));
    float spiralAngle = sourceScroll * 5.0 + length(transformed.xz) + transformed.y * 0.5 + uRotate * 2.0;
    transformed.x -= cos(spiralAngle) * 0.46 * spiralMask;
    transformed.z -= sin(spiralAngle) * 0.46 * spiralMask;

    float outerMask = step(0.95, randomB);
    float outerAngle = transformed.y * 0.5 + sin(uTime * 0.05 + randomD * 0.5 - uRotate * 0.2);
    transformed.x -= cos(outerAngle) * 3.05 * outerMask;
    transformed.z -= sin(outerAngle) * 3.05 * outerMask;

    if (transformed.x < 0.0) {
      transformed.x -= cos(-originalPosition.y * 0.06) * 0.34 - 0.4;
      transformed.z -= sin(-originalPosition.y * 0.06) * 0.34 - 0.22;
    } else {
      transformed.x -= cos(-originalPosition.y * 0.06 + 3.0) * 0.34 + 0.4;
      transformed.z -= sin(-originalPosition.y * 0.06 + 3.0) * 0.34 + 0.12;
    }

    transformed.y -= pow(sourceScroll, 4.0) * 2.8 * pow(randomD, 12.0);
    transformed.x -= cos(transformed.y) * 0.18 * pow(randomD, 4.0) * pow(sourceScroll, 3.5);
    transformed.z -= sin(transformed.y) * 0.18 * pow(randomD, 4.0) * pow(sourceScroll, 3.5);
    transformed.xz = mix(transformed.xz, vec2(0.0), pow(smoothstep(3.1, -3.1, transformed.y), 3.0) * 0.76);

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    float depthScale = 7.6 / max(1.0, -mvPosition.z);
    float localSparkle =
      0.52 + 0.48 * sin(position.x * 8.3 + position.y * 3.7 + position.z * 5.4 + uTime * 2.05 + uSparkle);
    float scanBand = smoothstep(0.82, 1.0, sin((position.y + sourceScroll * 5.2) * 4.2 + uTime * 0.7 + uRotate * 0.22) * 0.5 + 0.5);

    gl_PointSize = (1.05 + localSparkle * 1.45 + scanBand * 1.8) * uSizeBias * uPixelRatio * depthScale;
    vColor = mix(color, vec3(0.58, 0.98, 0.94), 0.14 + scanBand * 0.2 + outerMask * 0.08);
    vAlpha = uOpacity * (0.14 + localSparkle * 0.28 + scanBand * 0.42 + outerMask * 0.1);
    vOffset = length(transformed - originalPosition);
    vRandom = random;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const activeTheoryFlowerPointFragmentShader = `
  varying vec4 vRandom;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vOffset;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = length(uv);
    float core = smoothstep(0.18, 0.0, distanceFromCenter);
    float halo = smoothstep(0.54, 0.08, distanceFromCenter) * 0.34;
    float alpha = (core + halo) * vAlpha;

    if (alpha < 0.012) {
      discard;
    }

    vec3 sparkle = vec3(0.4 + sin(vRandom.y * 20.0));
    float displacementLight = smoothstep(0.04, 1.6, vOffset) * 0.16;
    vec3 color = mix(vColor, sparkle, pow(vRandom.x, 10.0) * displacementLight);

    gl_FragColor = vec4(color * (0.72 + core * 0.75 + displacementLight), alpha);
  }
`;

const liquidPillarVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float angle = atan(position.z, position.x);
    float wave =
      sin(position.y * 3.2 + uTime * 0.9 + angle * 1.4) * 0.075 +
      sin(position.y * 6.1 - uTime * 0.52 + angle * 3.0) * 0.038 +
      cos(angle * 7.0 + uTime * 0.42) * 0.032;
    transformed.xz *= 1.0 + wave;
    transformed.x += sin(position.y * 2.4 + uTime * 0.34) * 0.035;
    transformed.z += cos(position.y * 2.1 - uTime * 0.28) * 0.03;
    vPosition = transformed;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const liquidPillarFragmentShader = `
  uniform float uTime;
  uniform vec3 uAccent;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vPosition;

  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0))), 2.2);
    float oil =
      sin(vUv.y * 36.0 + uTime * 1.45 + vPosition.x * 4.0) * 0.5 + 0.5;
    float fracture =
      sin((vPosition.x + vPosition.z) * 18.0 - vUv.y * 12.0 + uTime * 0.72) * 0.5 + 0.5;
    float thinOil = pow(smoothstep(0.78, 1.0, oil), 2.4);
    float thinFracture = pow(smoothstep(0.84, 1.0, fracture), 2.8);
    float pulse = thinOil * 0.34 + thinFracture * 0.28;
    vec3 dark = vec3(0.005, 0.009, 0.014);
    vec3 cyan = vec3(0.07, 0.95, 0.9);
    vec3 violet = vec3(0.72, 0.18, 1.0);
    vec3 gold = vec3(1.0, 0.66, 0.18);
    vec3 slick = mix(cyan, violet, smoothstep(0.24, 0.86, oil));
    slick = mix(slick, gold, smoothstep(0.84, 0.99, fracture) * 0.52);
    slick = mix(slick, uAccent, 0.16);
    vec3 color = dark + slick * (rim * 0.54 + pulse);
    float alpha = 0.84;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createVolumetricParticleMaterial(globalOpacity: number) {
  // 用 shader 自己绘制柔边光斑，而不是依赖 PointsMaterial 的统一圆点；
  // 这样每个粒子都能拥有独立大小、透明度和呼吸节奏，视觉上更接近参考图里的体积光尘。
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fragmentShader: particleFragmentShader,
    transparent: true,
    uniforms: {
      uGlobalOpacity: { value: globalOpacity },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
    },
    vertexColors: true,
    vertexShader: particleVertexShader,
  });
}

function createActiveTheoryFlowerPointMaterial() {
  // 源站的 `flower_spine` 是围绕柱体的高密度点云，不是普通背景星点。
  // 这层 shader 使用源码同类的 uScroll/uRotate 相位：滚轮会让粒子沿 y 轴穿行并绕轴折射，
  // 但不会把点云整体推向左右，从交互语义上满足“柱子固定，只是从上到下滚动经过镜头”。
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: activeTheoryFlowerPointFragmentShader,
    transparent: true,
    uniforms: {
      uFlowHeight: { value: 6.4 },
      uOpacity: { value: 0.34 },
      uPixelRatio: { value: 1 },
      uRotate: { value: 0 },
      uScroll: { value: 0 },
      uSizeBias: { value: 1.18 },
      uSparkle: { value: 0 },
      uTime: { value: 0 },
    },
    vertexColors: true,
    vertexShader: activeTheoryFlowerPointVertexShader,
  });
}

function createGlowTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.3, `${color}90`);
    gradient.addColorStop(0.68, `${color}24`);
    gradient.addColorStop(1, `${color}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSmokeTexture(primaryColor: string, secondaryColor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, 512, 512);
    for (let index = 0; index < 96; index += 1) {
      const x = 128 + Math.sin(index * 12.9898) * 190 + Math.cos(index * 4.37) * 70;
      const y = 128 + Math.cos(index * 78.233) * 190 + Math.sin(index * 5.19) * 70;
      const radius = 42 + (index % 9) * 13;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, index % 2 === 0 ? `${primaryColor}8a` : `${secondaryColor}78`);
      gradient.addColorStop(0.46, index % 3 === 0 ? `${secondaryColor}32` : `${primaryColor}2c`);
      gradient.addColorStop(1, `${primaryColor}00`);
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createOilPatchTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, 512, 512);
    const palette = ["#7ce9ff", "#b083ff", "#ff7ccf", "#e2bf71", "#f5fbff"];

    // 这些贴片只服务于柱体表面的“油膜色斑”，不是装饰背景。
    // 参考录屏里的高光不是等距粒子，而是被粗糙玻璃折射成块状的蓝紫金光斑；
    // 用一张可复用的 CanvasTexture 挂在真实 3D 柱体上，可以保留动态实现且避免把参考帧静态贴上去。
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 42; index += 1) {
      const color = palette[index % palette.length];
      const x = 160 + Math.sin(index * 17.31) * 116 + Math.cos(index * 5.17) * 44;
      const y = 188 + Math.cos(index * 13.77) * 136 + Math.sin(index * 3.91) * 48;
      const radius = 28 + (index % 8) * 11;
      const patch = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      patch.addColorStop(0, `${color}b8`);
      patch.addColorStop(0.22, `${color}62`);
      patch.addColorStop(0.62, `${color}1e`);
      patch.addColorStop(1, `${color}00`);
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(index * 2.63) * Math.PI);
      context.scale(0.5 + (index % 4) * 0.18, 1.15 + (index % 5) * 0.2);
      context.fillStyle = patch;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }

    context.globalCompositeOperation = "destination-out";
    for (let index = 0; index < 18; index += 1) {
      const x = 120 + Math.sin(index * 21.2) * 160;
      const y = 190 + Math.cos(index * 12.8) * 150;
      const radius = 18 + (index % 6) * 10;
      const hole = context.createRadialGradient(x, y, 0, x, y, radius);
      hole.addColorStop(0, "rgba(0,0,0,0.35)");
      hole.addColorStop(0.46, "rgba(0,0,0,0.14)");
      hole.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = hole;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createOilSlickTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");

  if (context) {
    const baseGradient = context.createLinearGradient(0, 0, 1024, 1024);
    baseGradient.addColorStop(0, "#10191a");
    baseGradient.addColorStop(0.32, "#1b2321");
    baseGradient.addColorStop(0.58, "#08090b");
    baseGradient.addColorStop(0.82, "#1d171c");
    baseGradient.addColorStop(1, "#211810");
    context.fillStyle = baseGradient;
    context.fillRect(0, 0, 1024, 1024);

    const slickColors = ["#75e2ff", "#a78cff", "#f87fd1", "#e8c174", "#f2f7ff"];
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 196; index += 1) {
      const color = slickColors[index % slickColors.length];
      const x = 120 + ((Math.sin(index * 39.37) + 1) / 2) * 820;
      const y = 80 + ((Math.cos(index * 21.17) + 1) / 2) * 880;
      const radiusX = 28 + (index % 12) * 18;
      const radiusY = 11 + (index % 9) * 9;
      const rotation = Math.sin(index * 4.19) * Math.PI;
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);

      gradient.addColorStop(0, `${color}9c`);
      gradient.addColorStop(0.24, `${color}52`);
      gradient.addColorStop(0.68, `${color}16`);
      gradient.addColorStop(1, `${color}00`);

      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.scale(1, radiusY / radiusX);
      context.fillStyle = gradient;
      context.fillRect(-radiusX, -radiusX, radiusX * 2, radiusX * 2);
      context.restore();
    }

    for (let index = 0; index < 520; index += 1) {
      const color = slickColors[(index + 3) % slickColors.length];
      const x = ((Math.sin(index * 71.23) + 1) / 2) * 1024;
      const y = ((Math.cos(index * 53.91) + 1) / 2) * 1024;
      const radius = 1.2 + (index % 5) * 0.9;
      context.globalAlpha = 0.08 + (index % 7) * 0.014;
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(x, y, radius * (1.4 + (index % 4) * 0.3), radius, Math.sin(index * 3.7) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    // 参考柱体表面不是均匀反光，而是很多被玻璃折射后的碎片状色斑。
    // 这些高亮岛屿会随材质贴图滚动，补足纯 MeshPhysicalMaterial 难以表达的油膜颗粒。
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 78; index += 1) {
      const color = slickColors[(index + 1) % slickColors.length];
      const x = 180 + ((Math.sin(index * 22.17) + 1) / 2) * 680;
      const y = 80 + ((Math.cos(index * 31.43) + 1) / 2) * 860;
      const radius = 18 + (index % 7) * 8;
      const fleck = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      fleck.addColorStop(0, `${color}aa`);
      fleck.addColorStop(0.24, `${color}4a`);
      fleck.addColorStop(0.72, `${color}0c`);
      fleck.addColorStop(1, `${color}00`);
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(index * 6.7) * Math.PI);
      context.scale(0.42 + (index % 3) * 0.2, 1.1 + (index % 4) * 0.32);
      context.fillStyle = fleck;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }

    context.globalCompositeOperation = "multiply";
    context.globalAlpha = 0.18;
    for (let index = 0; index < 74; index += 1) {
      const x = 80 + ((Math.sin(index * 14.23) + 1) / 2) * 860;
      const y = 70 + ((Math.cos(index * 18.91) + 1) / 2) * 880;
      const radius = 28 + (index % 8) * 22;
      const shadow = context.createRadialGradient(x, y, 0, x, y, radius);
      shadow.addColorStop(0, "rgba(0,0,0,0.55)");
      shadow.addColorStop(0.48, "rgba(0,0,0,0.18)");
      shadow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = shadow;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    context.globalCompositeOperation = "screen";
    context.globalAlpha = 0.022;
    context.lineWidth = 2;
    for (let index = 0; index < 34; index += 1) {
      const y = 80 + index * 24 + Math.sin(index * 1.7) * 18;
      context.strokeStyle = slickColors[(index + 2) % slickColors.length];
      context.beginPath();
      context.moveTo(-80, y);
      context.bezierCurveTo(230, y - 110, 480, y + 94, 1120, y - 46);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.96, 1.28);
  return texture;
}

function createReferenceOilFilmTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");

  if (context) {
    const baseGradient = context.createRadialGradient(560, 420, 80, 512, 512, 760);
    baseGradient.addColorStop(0, "#10151a");
    baseGradient.addColorStop(0.28, "#06080d");
    baseGradient.addColorStop(0.58, "#111018");
    baseGradient.addColorStop(0.82, "#07090d");
    baseGradient.addColorStop(1, "#17110f");
    context.fillStyle = baseGradient;
    context.fillRect(0, 0, 1024, 1024);

    const palette = ["#65eaff", "#5d8bff", "#8d70ff", "#f167d7", "#ff4f5d", "#e3b45a", "#f6fbff"];

    // 参考 mp4 的柱体表面不是外部粒子，而是“嵌在湿润材质内部”的高频彩色碎光。
    // 这张纹理专门给参考柱体层使用：先铺暗底，再用大量短小椭圆和细划痕做内嵌油膜，
    // 比通用 oilTexture 更脏、更碎、更接近截图里的蓝紫/红金颗粒。
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 520; index += 1) {
      const color = palette[index % palette.length];
      const x = 64 + ((Math.sin(index * 43.71) + 1) / 2) * 896;
      const y = 52 + ((Math.cos(index * 37.13) + 1) / 2) * 920;
      const radius = 4 + (index % 12) * 2.45;
      const fleck = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      fleck.addColorStop(0, `${color}c8`);
      fleck.addColorStop(0.28, `${color}68`);
      fleck.addColorStop(0.74, `${color}16`);
      fleck.addColorStop(1, `${color}00`);
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(index * 11.17) * Math.PI);
      context.scale(0.36 + (index % 4) * 0.14, 1.48 + (index % 6) * 0.28);
      context.fillStyle = fleck;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }

    for (let bandIndex = 0; bandIndex < 16; bandIndex += 1) {
      const centerX = 220 + ((Math.sin(bandIndex * 5.17) + 1) / 2) * 590;
      const centerY = 72 + bandIndex * 58 + Math.sin(bandIndex * 1.9) * 26;
      const bandColor = palette[(bandIndex * 3) % palette.length];
      const band = context.createLinearGradient(centerX - 110, centerY - 56, centerX + 104, centerY + 72);
      band.addColorStop(0, `${bandColor}00`);
      band.addColorStop(0.24, `${bandColor}56`);
      band.addColorStop(0.48, "#ffffff3a");
      band.addColorStop(0.72, `${bandColor}28`);
      band.addColorStop(1, `${bandColor}00`);
      context.save();
      context.translate(centerX, centerY);
      context.rotate(-0.55 + Math.sin(bandIndex * 1.31) * 0.72);
      context.scale(0.62 + (bandIndex % 3) * 0.16, 0.18 + (bandIndex % 4) * 0.045);
      context.fillStyle = band;
      context.fillRect(-126, -76, 252, 152);
      context.restore();
    }

    context.globalAlpha = 0.22;
    context.lineWidth = 1.4;
    for (let index = 0; index < 132; index += 1) {
      const color = palette[(index + 2) % palette.length];
      const x = ((Math.sin(index * 27.91) + 1) / 2) * 1024;
      const y = ((Math.cos(index * 19.67) + 1) / 2) * 1024;
      const length = 34 + (index % 10) * 13;
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(index * 5.23) * Math.PI);
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(-length * 0.5, Math.sin(index) * 6);
      context.bezierCurveTo(-length * 0.1, -10, length * 0.28, 12, length * 0.55, Math.cos(index) * 5);
      context.stroke();
      context.restore();
    }
    context.globalAlpha = 1;

    context.globalCompositeOperation = "multiply";
    for (let index = 0; index < 148; index += 1) {
      const x = 70 + ((Math.sin(index * 16.61) + 1) / 2) * 884;
      const y = 70 + ((Math.cos(index * 29.37) + 1) / 2) * 884;
      const radius = 24 + (index % 8) * 13;
      const pore = context.createRadialGradient(x, y, 0, x, y, radius);
      pore.addColorStop(0, "rgba(0,0,0,0.54)");
      pore.addColorStop(0.42, "rgba(0,0,0,0.2)");
      pore.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = pore;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.1, 1.72);
  return texture;
}

function createReferenceSpineSubjectMaskTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1024;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);

    // 源视频主体裁切里仍然带着参考站前景玻璃卡片的右侧矩形边。
    // 这张 alpha 遮罩只保留左侧规整脊柱和卡片压住柱体时的少量折射，
    // 让视频层参与“实体柱体成型”，而不是在 Three 场景里露出一张平面视频的边界。
    for (let segmentIndex = 0; segmentIndex < 13; segmentIndex += 1) {
      const centerY = 56 + segmentIndex * 78 + Math.sin(segmentIndex * 1.27) * 12;
      const centerX = 86 + Math.sin(segmentIndex * 0.91) * 10;
      const radiusX = 64 + (segmentIndex % 4) * 6;
      const radiusY = 74 + (segmentIndex % 5) * 8;
      const alpha = segmentIndex <= 1 || segmentIndex >= 11 ? 0.72 : 0.94;
      const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusY);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(0.5, "rgba(255,255,255,0.62)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.save();
      context.translate(centerX, centerY);
      context.rotate(-0.08 + Math.sin(segmentIndex * 1.9) * 0.22);
      context.scale(radiusX / radiusY, 1);
      context.fillStyle = gradient;
      context.fillRect(-radiusY, -radiusY, radiusY * 2, radiusY * 2);
      context.restore();
    }

    context.globalCompositeOperation = "source-over";
    const spineBand = context.createLinearGradient(0, 0, canvas.width, 0);
    spineBand.addColorStop(0, "rgba(255,255,255,0)");
    spineBand.addColorStop(0.08, "rgba(255,255,255,0.62)");
    spineBand.addColorStop(0.28, "rgba(255,255,255,0.96)");
    spineBand.addColorStop(0.5, "rgba(255,255,255,0.78)");
    spineBand.addColorStop(0.66, "rgba(255,255,255,0.28)");
    spineBand.addColorStop(0.84, "rgba(255,255,255,0)");
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = spineBand;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const verticalFade = context.createLinearGradient(0, 0, 0, canvas.height);
    verticalFade.addColorStop(0, "rgba(255,255,255,0)");
    verticalFade.addColorStop(0.055, "rgba(255,255,255,0.78)");
    verticalFade.addColorStop(0.15, "rgba(255,255,255,1)");
    verticalFade.addColorStop(0.88, "rgba(255,255,255,1)");
    verticalFade.addColorStop(0.975, "rgba(255,255,255,0)");
    context.fillStyle = verticalFade;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // 参考柱体边缘不是整齐裁切线，而是被暗场和玻璃折射吃掉。
    // 用少量 subtract 形状打掉上下和右侧硬边，避免再次出现 v74 的竖向视频边。
    context.globalCompositeOperation = "destination-out";
    for (let biteIndex = 0; biteIndex < 22; biteIndex += 1) {
      const x = 144 + ((Math.sin(biteIndex * 2.41) + 1) / 2) * 88;
      const y = 34 + ((Math.cos(biteIndex * 3.17) + 1) / 2) * 956;
      const radiusX = 22 + (biteIndex % 5) * 9;
      const radiusY = 34 + (biteIndex % 7) * 11;
      const bite = context.createRadialGradient(x, y, 0, x, y, radiusY);
      bite.addColorStop(0, "rgba(0,0,0,0.42)");
      bite.addColorStop(0.52, "rgba(0,0,0,0.16)");
      bite.addColorStop(1, "rgba(0,0,0,0)");
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(biteIndex * 1.3) * Math.PI);
      context.scale(radiusX / radiusY, 1);
      context.fillStyle = bite;
      context.fillRect(-radiusY, -radiusY, radiusY * 2, radiusY * 2);
      context.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createOilBumpTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "#808080";
    context.fillRect(0, 0, 512, 512);
    context.globalCompositeOperation = "overlay";

    // 参考图里的柱体不是镜面塑料，而是有微小凹凸和湿润颗粒；
    // 这里用程序化灰度纹理作为 bumpMap，避免为了质感引入不可控的外部贴图。
    for (let index = 0; index < 760; index += 1) {
      const x = ((Math.sin(index * 18.91) + 1) / 2) * 512;
      const y = ((Math.cos(index * 27.17) + 1) / 2) * 512;
      const length = 10 + (index % 11) * 4;
      const alpha = 0.05 + (index % 5) * 0.025;
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(index * 9.13) * Math.PI);
      context.strokeStyle = index % 3 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      context.lineWidth = 1 + (index % 4) * 0.6;
      context.beginPath();
      context.moveTo(-length, Math.sin(index) * 4);
      context.bezierCurveTo(-length * 0.2, -8, length * 0.35, 9, length, Math.cos(index) * 4);
      context.stroke();
      context.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4.4, 5.2);
  return texture;
}

function createOilAlphaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (context) {
    const base = context.createLinearGradient(0, 0, 512, 512);
    base.addColorStop(0, "rgba(212,212,212,0.78)");
    base.addColorStop(0.42, "rgba(248,248,248,0.92)");
    base.addColorStop(0.72, "rgba(160,160,160,0.68)");
    base.addColorStop(1, "rgba(236,236,236,0.86)");
    context.fillStyle = base;
    context.fillRect(0, 0, 512, 512);

    // 参考柱体边缘像烟熏玻璃一样有不均匀透光，不是统一 opacity 的塑料壳。
    // alphaMap 用灰度把局部边缘压暗、压薄，让几何在旋转时有被玻璃吞掉的断续感。
    context.globalCompositeOperation = "destination-out";
    for (let index = 0; index < 96; index += 1) {
      const x = 42 + ((Math.sin(index * 19.31) + 1) / 2) * 428;
      const y = 28 + ((Math.cos(index * 23.77) + 1) / 2) * 456;
      const radiusX = 18 + (index % 8) * 11;
      const radiusY = 32 + (index % 7) * 13;
      const hole = context.createRadialGradient(0, 0, 0, 0, 0, radiusY);
      hole.addColorStop(0, "rgba(0,0,0,0.32)");
      hole.addColorStop(0.42, "rgba(0,0,0,0.16)");
      hole.addColorStop(1, "rgba(0,0,0,0)");
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(index * 4.1) * Math.PI);
      context.scale(radiusX / radiusY, 1);
      context.fillStyle = hole;
      context.fillRect(-radiusY, -radiusY, radiusY * 2, radiusY * 2);
      context.restore();
    }

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 0.32;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    for (let index = 0; index < 18; index += 1) {
      const y = 40 + index * 27 + Math.sin(index * 1.6) * 12;
      context.beginPath();
      context.moveTo(-20, y);
      context.bezierCurveTo(150, y - 70, 340, y + 80, 540, y - 18);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 2.2);
  return texture;
}

function createDarkStudioEnvironment() {
  const faces = [
    ["#020407", "#53d7ff"],
    ["#030309", "#a46dff"],
    ["#050507", "#f4e9d1"],
    ["#03030a", "#ff62c6"],
    ["#020406", "#37bfc2"],
    ["#040406", "#d9a35f"],
  ];
  const canvases = faces.map(([baseColor, lightColor], faceIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");

    if (context) {
      context.fillStyle = baseColor;
      context.fillRect(0, 0, 256, 256);
      const gradient = context.createLinearGradient(faceIndex % 2 ? 0 : 256, 0, faceIndex % 2 ? 256 : 0, 256);
      gradient.addColorStop(0, `${lightColor}00`);
      gradient.addColorStop(0.46, `${lightColor}2a`);
      gradient.addColorStop(0.54, `${lightColor}90`);
      gradient.addColorStop(0.62, `${lightColor}20`);
      gradient.addColorStop(1, `${lightColor}00`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);

      const bloom = context.createRadialGradient(128, 128, 0, 128, 128, 122);
      bloom.addColorStop(0, `${lightColor}3f`);
      bloom.addColorStop(0.38, `${lightColor}1d`);
      bloom.addColorStop(1, `${lightColor}00`);
      context.fillStyle = bloom;
      context.fillRect(0, 0, 256, 256);
    }

    return canvas;
  });
  const texture = new THREE.CubeTexture(canvases);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createVertebraBodyGeometry(segmentIndex: number) {
  const phase = segmentIndex * 0.73;
  const radialSegments = 78;
  const heightSegments = 28;
  const columns = radialSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const angleDistance = (angle: number, target: number) => {
    const diff = Math.atan2(Math.sin(angle - target), Math.cos(angle - target));
    return Math.abs(diff);
  };

  // 参考里的“柱子”更像一串半透明骨节，不是垂直圆柱被挤出折面。
  // 因此这里用椭球参数面做主体，再叠侧翼、背侧突起和前侧凹口；
  // 这样单节会有骨块的团块感，同时仍能被油膜贴图和实时灯光驱动。
  for (let row = 0; row <= heightSegments; row += 1) {
    const v = row / heightSegments;
    const yNorm = v * 2 - 1;
    const vertical = Math.abs(yNorm);
    const sphereEnvelope = Math.pow(Math.max(0.018, 1 - vertical * vertical), 0.4);
    const lip = Math.exp(-Math.pow((vertical - 0.62) / 0.18, 2)) * 0.15;
    const chippedCap = Math.exp(-Math.pow((vertical - 0.9) / 0.11, 2));
    const organicOffset = Math.sin(phase + yNorm * 2.4) * 0.006;

    for (let column = 0; column <= radialSegments; column += 1) {
      const u = column / radialSegments;
      const theta = u * Math.PI * 2;
      const processEnvelope = Math.exp(-Math.pow(yNorm / 0.6, 2));
      const sideProcess =
        (Math.exp(-Math.pow(angleDistance(theta, 0.08 + Math.sin(phase) * 0.08) / 0.36, 2)) * 1.08 +
          Math.exp(-Math.pow(angleDistance(theta, Math.PI - Math.cos(phase) * 0.08) / 0.38, 2)) * 0.92) *
        processEnvelope *
        0.16;
      const rearProcess = Math.exp(-Math.pow(angleDistance(theta, -Math.PI / 2 + Math.sin(phase) * 0.1) / 0.38, 2)) * Math.exp(-Math.pow((yNorm + 0.02) / 0.68, 2)) * 0.32;
      const frontNotch = -Math.exp(-Math.pow(angleDistance(theta, Math.PI / 2 + Math.cos(phase) * 0.08) / 0.4, 2)) * Math.exp(-Math.pow(yNorm / 0.72, 2)) * 0.27;
      const sideBite =
        -Math.exp(-Math.pow(angleDistance(theta, 0.72 + phase * 0.16) / 0.2, 2)) * Math.exp(-Math.pow((yNorm - 0.2) / 0.42, 2)) * 0.075 -
        Math.exp(-Math.pow(angleDistance(theta, -2.34 + phase * 0.12) / 0.22, 2)) * Math.exp(-Math.pow((yNorm + 0.28) / 0.36, 2)) * 0.068;
      const topBottomBite = -Math.exp(-Math.pow(angleDistance(theta, Math.PI / 2) / 0.68, 2)) * chippedCap * 0.092;
      const edgeChip =
        Math.sign(Math.sin(theta * 7.0 + phase * 1.8)) *
        Math.pow(Math.abs(Math.sin(theta * 3.5 + yNorm * 6.2 + phase)), 1.6) *
        (0.014 + chippedCap * 0.026);
      const boneFacets = Math.sin(theta * 2.2 + phase) * 0.03 + Math.sin(theta * 5.0 + yNorm * 3.8 + phase) * 0.023;
      const fineRipple = Math.sin(theta * 13.0 + phase) * 0.012 + Math.sin(yNorm * 14.0 + theta * 1.5 + phase) * 0.011;
      const radiusX = Math.max(
        0.04,
        (0.31 * sphereEnvelope + lip * 0.82 + sideProcess + topBottomBite + sideBite + boneFacets + fineRipple + edgeChip) *
          (1 + (segmentIndex % 2) * 0.006)
      );
      const radiusZ = Math.max(0.04, 0.24 * sphereEnvelope + lip * 0.34 + rearProcess + frontNotch + topBottomBite + sideBite * 0.7 + boneFacets * 0.58 + fineRipple * 0.46 + edgeChip * 0.7);
      const x = Math.cos(theta) * radiusX;
      const z = Math.sin(theta) * radiusZ;
      const y =
        yNorm * 0.34 +
        organicOffset +
        Math.sin(theta * 2.2 + phase) * 0.014 * (1 - vertical) +
        Math.sin(theta * 8.0 + phase) * chippedCap * 0.012;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let row = 0; row < heightSegments; row += 1) {
    for (let column = 0; column < radialSegments; column += 1) {
      const current = row * columns + column;
      const next = current + columns;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }

  const bottomCenterIndex = positions.length / 3;
  positions.push(0, -0.315 + Math.sin(phase) * 0.006, 0);
  uvs.push(0.5, 0);
  const topCenterIndex = positions.length / 3;
  positions.push(0, 0.315 + Math.cos(phase) * 0.006, 0);
  uvs.push(0.5, 1);
  for (let column = 0; column < radialSegments; column += 1) {
    indices.push(bottomCenterIndex, column + 1, column);
    const topRow = heightSegments * columns;
    indices.push(topCenterIndex, topRow + column, topRow + column + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createOrganicLobeGeometry(seed: number) {
  const phase = seed * 0.91;
  const axisSegments = 16;
  const radialSegments = 22;
  const columns = radialSegments + 1;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  for (let axisIndex = 0; axisIndex <= axisSegments; axisIndex += 1) {
    const t = axisIndex / axisSegments;
    const x = (t - 0.5) * 0.52;
    const endTaper = Math.pow(Math.sin(Math.PI * t), 0.66);
    const rootMass = Math.exp(-Math.pow((t - 0.34) / 0.24, 2)) * 0.12;
    const tipPinch = 0.9 - Math.max(0, t - 0.68) * 1.05;
    const bendY = Math.sin(t * Math.PI * 1.25 + phase) * 0.034;
    const bendZ = Math.cos(t * Math.PI * 1.12 + phase) * 0.034;

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const u = radialIndex / radialSegments;
      const angle = u * Math.PI * 2;
      const ridge =
        1 +
        Math.sin(angle * 3 + phase + t * 4.2) * 0.18 +
        Math.cos(angle * 5 - phase + t * 3.6) * 0.1 +
        Math.sin((x + Math.sin(angle)) * 24 + phase) * 0.055;
      const radiusY = (0.028 + endTaper * 0.068 * tipPinch + rootMass * 0.82) * ridge;
      const radiusZ = (0.022 + endTaper * 0.056 * tipPinch + rootMass * 0.64) * (1 + Math.cos(angle * 4 + phase) * 0.13);

      positions.push(x, Math.sin(angle) * radiusY + bendY, Math.cos(angle) * radiusZ + bendZ);
      uvs.push(t, u);
    }
  }

  for (let axisIndex = 0; axisIndex < axisSegments; axisIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const current = axisIndex * columns + radialIndex;
      const next = current + columns;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }

  const leftCap = positions.length / 3;
  positions.push(-0.26, Math.sin(phase) * 0.012, Math.cos(phase) * 0.012);
  uvs.push(0, 0.5);
  const rightCap = positions.length / 3;
  positions.push(0.26, Math.sin(phase + 1.2) * 0.01, Math.cos(phase + 1.2) * 0.01);
  uvs.push(1, 0.5);

  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    indices.push(leftCap, radialIndex + 1, radialIndex);
    const rightRow = axisSegments * columns;
    indices.push(rightCap, rightRow + radialIndex, rightRow + radialIndex + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createReferenceVertebraCoreGeometry(seed: number) {
  const phase = seed * 0.57;
  const radialSegments = 72;
  const heightSegments = 24;
  const columns = radialSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const angleDistance = (angle: number, target: number) => {
    const diff = Math.atan2(Math.sin(angle - target), Math.cos(angle - target));
    return Math.abs(diff);
  };

  // 参考视频里的主柱骨节比旧的随机椎骨更规整，像被玻璃卡片遮掉中段后的圆润骨块。
  // 这套几何只给“对齐参考图的主侧影”使用：少高频锯齿、多连续鼓包，让横突能从同一个实体里长出来。
  for (let row = 0; row <= heightSegments; row += 1) {
    const v = row / heightSegments;
    const yNorm = v * 2 - 1;
    const vertical = Math.abs(yNorm);
    const envelope = Math.pow(Math.max(0.02, 1 - vertical * vertical), 0.44);
    const rim = Math.exp(-Math.pow((vertical - 0.7) / 0.18, 2)) * 0.07;
    const waist = 1 - Math.exp(-Math.pow(yNorm / 0.36, 2)) * 0.1;

    for (let column = 0; column <= radialSegments; column += 1) {
      const u = column / radialSegments;
      const theta = u * Math.PI * 2;
      const rootEnvelope = Math.exp(-Math.pow((yNorm + 0.02) / 0.72, 2));
      const leftRoot = Math.exp(-Math.pow(angleDistance(theta, Math.PI + Math.sin(phase) * 0.06) / 0.5, 2)) * rootEnvelope * 0.1;
      const rightRoot = Math.exp(-Math.pow(angleDistance(theta, 0.04 + Math.cos(phase) * 0.05) / 0.45, 2)) * rootEnvelope * 0.08;
      const rearLift = Math.exp(-Math.pow(angleDistance(theta, -Math.PI / 2 + Math.sin(phase) * 0.08) / 0.5, 2)) * rootEnvelope * 0.06;
      const frontSaddle = -Math.exp(-Math.pow(angleDistance(theta, Math.PI / 2) / 0.58, 2)) * rootEnvelope * 0.05;
      const oilFacet = Math.sin(theta * 2.5 + phase + yNorm * 1.2) * 0.012 + Math.cos(theta * 5.5 - phase) * 0.006;
      const radiusX = Math.max(0.04, 0.27 * envelope * waist + rim + leftRoot + rightRoot + oilFacet);
      const radiusZ = Math.max(0.04, 0.19 * envelope + rim * 0.42 + rearLift + frontSaddle + oilFacet * 0.55);
      const x = Math.cos(theta) * radiusX;
      const y = yNorm * 0.32 + Math.sin(theta * 2 + phase) * 0.006 * (1 - vertical);
      const z = Math.sin(theta) * radiusZ;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let row = 0; row < heightSegments; row += 1) {
    for (let column = 0; column < radialSegments; column += 1) {
      const current = row * columns + column;
      const next = current + columns;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }

  const bottomCenterIndex = positions.length / 3;
  positions.push(0, -0.31 + Math.sin(phase) * 0.004, 0);
  uvs.push(0.5, 0);
  const topCenterIndex = positions.length / 3;
  positions.push(0, 0.31 + Math.cos(phase) * 0.004, 0);
  uvs.push(0.5, 1);
  for (let column = 0; column < radialSegments; column += 1) {
    indices.push(bottomCenterIndex, column + 1, column);
    const topRow = heightSegments * columns;
    indices.push(topCenterIndex, topRow + column, topRow + column + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createReferenceProcessGeometry(seed: number) {
  const phase = seed * 0.61;
  const axisSegments = 24;
  const radialSegments = 26;
  const columns = radialSegments + 1;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const centerAt = (t: number) => ({
    x: (t - 0.5) * 0.82,
    y: -0.032 * t + Math.sin(t * Math.PI * 1.05 + phase) * 0.018,
    z: Math.cos(t * Math.PI * 0.9 + phase) * 0.018,
  });

  // 参考柱体的横突末端是圆钝的 club 形，不是旧 lobe 那种带噪声的尖碎触手。
  // 这里沿 X 轴扫出一根平滑骨突：根部厚、颈部收、末端再鼓起，滚动时看起来像同一根骨柱的侧向结构。
  for (let axisIndex = 0; axisIndex <= axisSegments; axisIndex += 1) {
    const t = axisIndex / axisSegments;
    const center = centerAt(t);
    const rootMass = Math.exp(-Math.pow((t - 0.28) / 0.22, 2));
    const clubMass = Math.exp(-Math.pow((t - 0.84) / 0.2, 2));
    const tendon = Math.pow(Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t))), 0.58);
    const radiusBase = 0.035 + tendon * 0.048 + rootMass * 0.05 + clubMass * 0.054;

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const u = radialIndex / radialSegments;
      const angle = u * Math.PI * 2;
      const softFacet = 1 + Math.sin(angle * 2 + phase + t * 2.4) * 0.045 + Math.cos(angle * 4 - phase) * 0.025;
      const radiusY = radiusBase * softFacet * (1 + clubMass * 0.14);
      const radiusZ = radiusBase * (0.78 + rootMass * 0.18) * (1 + Math.cos(angle * 3 + phase) * 0.035);
      positions.push(center.x, Math.sin(angle) * radiusY + center.y, Math.cos(angle) * radiusZ + center.z);
      uvs.push(t, u);
    }
  }

  for (let axisIndex = 0; axisIndex < axisSegments; axisIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const current = axisIndex * columns + radialIndex;
      const next = current + columns;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }

  const leftCenter = centerAt(0);
  const leftCap = positions.length / 3;
  positions.push(leftCenter.x, leftCenter.y, leftCenter.z);
  uvs.push(0, 0.5);
  const rightCenter = centerAt(1);
  const rightCap = positions.length / 3;
  positions.push(rightCenter.x, rightCenter.y, rightCenter.z);
  uvs.push(1, 0.5);

  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    indices.push(leftCap, radialIndex + 1, radialIndex);
    const rightRow = axisSegments * columns;
    indices.push(rightCap, rightRow + radialIndex, rightRow + radialIndex + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createBoneChipGeometry(seed: number) {
  const phase = seed * 1.13;
  const outlineCount = 9;
  const halfDepth = 0.025 + (seed % 3) * 0.006;
  const positions: number[] = [0, 0, halfDepth, 0, 0, -halfDepth];
  const uvs: number[] = [0.5, 0.5, 0.5, 0.5];
  const indices: number[] = [];

  for (let index = 0; index < outlineCount; index += 1) {
    const angle = (index / outlineCount) * Math.PI * 2;
    const verticalBias = 1 + Math.sin(angle - Math.PI / 2) * 0.18;
    const jag = 0.8 + Math.sin(index * 2.7 + phase) * 0.18 + Math.cos(index * 4.9 + phase) * 0.09;
    const x = Math.cos(angle) * (0.11 + (seed % 5) * 0.006) * jag;
    const y = Math.sin(angle) * (0.25 + (seed % 4) * 0.018) * jag * verticalBias;
    positions.push(x, y, halfDepth, x * 0.9, y * 0.92, -halfDepth);
    uvs.push((x + 0.18) / 0.36, (y + 0.34) / 0.68, (x + 0.18) / 0.36, (y + 0.34) / 0.68);
  }

  for (let index = 0; index < outlineCount; index += 1) {
    const next = (index + 1) % outlineCount;
    const front = 2 + index * 2;
    const back = front + 1;
    const nextFront = 2 + next * 2;
    const nextBack = nextFront + 1;
    indices.push(0, front, nextFront, 1, nextBack, back, front, back, nextFront, nextFront, back, nextBack);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createReferenceSpineShardGeometry(points: Array<[number, number]>, depth = 0.07) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], pointIndex) => {
    if (pointIndex === 0) {
      shape.moveTo(x, y);
      return;
    }

    shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.014,
    bevelThickness: depth * 0.22,
    curveSegments: 18,
    depth,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

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

function normalizeActiveTheoryDracoAttributeName(attributeName: string) {
  // 源站的几何封装会把点云字段叫做 `positions/colors`，而 Three.js shader/BufferGeometry 期望的是
  // `position/color`。这里在解码入口统一归一化，避免后续材质和几何逻辑到处判断两套命名。
  if (attributeName === "positions") {
    return "position";
  }

  if (attributeName === "colors") {
    return "color";
  }

  if (attributeName === "uvs") {
    return "uv";
  }

  return attributeName;
}

async function loadActiveTheoryDracoGeometry(source: string) {
  // 镜像工程里的 `*.bin` 不是普通 JSON，而是「10 字节头 + JSON 元信息 + DRACO 数据」的自定义封装。
  // 首页需要在浏览器里异步恢复这段真实几何，才能让柱体轮廓接近源站 Work 场景；
  // 如果解码失败，调用方会继续保留现有程序化柱体，避免登录页因为视觉资产异常而白屏。
  const response = await fetch(source);

  if (!response.ok) {
    throw new Error(`Active Theory geometry load failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const headerPrefix = new TextDecoder().decode(new Uint8Array(buffer, 0, 2)).replace(/\0/g, "");
  const headerLength = Number(headerPrefix);

  if (!Number.isFinite(headerLength) || headerLength <= 0) {
    throw new Error("Active Theory geometry header is invalid");
  }

  const headerText = new TextDecoder().decode(new Uint8Array(buffer, 10, headerLength));
  const header = JSON.parse(headerText) as ActiveTheoryGeometryHeader;
  const attributeIDs: Record<string, number> = {};
  const attributeTypes: Record<string, string> = {};
  header.attributes?.forEach(([rawName], index) => {
    const normalizedName = normalizeActiveTheoryDracoAttributeName(rawName);
    attributeIDs[normalizedName] = index;
    // 源站 loader 里第二个数字会映射到 Geometry.TYPED_ARRAYS；当前镜像的 Work/spine/flower 资源均为 7，
    // 即 Float32Array。显式使用 Float32Array 可以复刻源码的 attribute-index 解码路径，
    // 避免 Three 默认语义解码拿不到 `flower_spine` 的 position/color。
    attributeTypes[normalizedName] = "Float32Array";
  });
  const dracoBuffer = buffer.slice(10 + headerLength);
  const loader = new DRACOLoader();
  loader.setDecoderPath(ACTIVE_THEORY_DRACO_DECODER_PATH);

  try {
    return await new Promise<THREE.BufferGeometry>((resolve, reject) => {
      const onGeometry = (geometry: THREE.BufferGeometry) => {
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        resolve(geometry);
      };
      const onError = (error: unknown) => reject(error);
      const loaderWithCustomAttributes = loader as DRACOLoader & {
        decodeDracoFile: (
          data: ArrayBuffer,
          callback: (geometry: THREE.BufferGeometry) => void,
          customAttributeIDs?: Record<string, number>,
          customAttributeTypes?: Record<string, string>,
          vertexColorSpace?: THREE.ColorSpace,
          onDecodeError?: (error: unknown) => void
        ) => void;
      };

      if (Object.keys(attributeIDs).length > 0 && loaderWithCustomAttributes.decodeDracoFile) {
        loaderWithCustomAttributes.decodeDracoFile(
          dracoBuffer,
          onGeometry,
          attributeIDs,
          attributeTypes,
          THREE.LinearSRGBColorSpace,
          onError
        );
        return;
      }

      loader.parse(
        dracoBuffer,
        onGeometry,
        onError
      );
    });
  } finally {
    loader.dispose();
  }
}

function buildActiveTheoryFlowerPointGeometry(sourceGeometry: THREE.BufferGeometry, maxPoints = 180000) {
  // `flower_spine-1024.bin` 是源码镜像里 7MB 的 DRACO 点云，桌面端直接全量渲染会把登录页变成显卡压力测试。
  // 源站资源本身有 128/256/512/1024 多档 LOD，但当前镜像目录只落地了 1024；
  // 因此这里做一次确定性抽样，保留原始形状和颜色分布，同时把运行时点数限制在首页可承受范围。
  const position = sourceGeometry.getAttribute("position") as THREE.BufferAttribute | undefined;

  if (!position || position.count === 0) {
    return sourceGeometry;
  }

  const sourceColor = sourceGeometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const stride = Math.max(1, Math.ceil(position.count / maxPoints));
  const targetCount = Math.ceil(position.count / stride);
  const cyan = new THREE.Color("#64f1ff");
  const violet = new THREE.Color("#a56dff");
  const magenta = new THREE.Color("#f46dcc");
  const gold = new THREE.Color("#e8b35e");
  const createRandomTuple = (sourceIndex: number, x: number, y: number, z: number) => {
    // 源站 FlowerParticleShader 依赖 `attribute vec4 random` 控制顶部稀疏拉伸、外侧甩出和底部螺旋。
    // DRACO 镜像里没有直接暴露这组 attribute，所以这里用源点坐标 + index 做确定性伪随机；
    // 稳定随机能保证刷新后形态不跳变，同时比 shader 里用 position hash 更接近源码“每粒子独立随机”的行为。
    const hash = (salt: number) => {
      const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + sourceIndex * 0.173 + salt * 19.19) * 43758.5453123;
      return value - Math.floor(value);
    };

    return [hash(1), hash(2), hash(3), hash(4)] as const;
  };

  if (stride === 1) {
    if (!sourceColor) {
      const colors = new Float32Array(position.count * 3);
      for (let index = 0; index < position.count; index += 1) {
        const heightMix = (Math.sin(position.getY(index) * 0.08) + 1) * 0.5;
        const paletteColor = cyan.clone().lerp(violet, heightMix).lerp(index % 5 === 0 ? magenta : gold, index % 7 === 0 ? 0.36 : 0.08);
        colors[index * 3] = paletteColor.r;
        colors[index * 3 + 1] = paletteColor.g;
        colors[index * 3 + 2] = paletteColor.b;
      }
      sourceGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    if (!sourceGeometry.getAttribute("random")) {
      const randomValues = new Float32Array(position.count * 4);
      for (let index = 0; index < position.count; index += 1) {
        const [a, b, c, d] = createRandomTuple(index, position.getX(index), position.getY(index), position.getZ(index));
        randomValues[index * 4] = a;
        randomValues[index * 4 + 1] = b;
        randomValues[index * 4 + 2] = c;
        randomValues[index * 4 + 3] = d;
      }
      sourceGeometry.setAttribute("random", new THREE.BufferAttribute(randomValues, 4));
    }

    sourceGeometry.center();
    sourceGeometry.computeBoundingBox();
    const size = sourceGeometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    const heightScale = 6.35 / Math.max(size.y, 0.001);
    sourceGeometry.scale(heightScale, heightScale, heightScale);
    return sourceGeometry;
  }

  const positions = new Float32Array(targetCount * 3);
  const colors = new Float32Array(targetCount * 3);
  const randomValues = new Float32Array(targetCount * 4);

  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    const sourceIndex = Math.min(position.count - 1, targetIndex * stride);
    const x = position.getX(sourceIndex);
    const y = position.getY(sourceIndex);
    const z = position.getZ(sourceIndex);
    positions[targetIndex * 3] = x;
    positions[targetIndex * 3 + 1] = y;
    positions[targetIndex * 3 + 2] = z;
    const [a, b, c, d] = createRandomTuple(sourceIndex, x, y, z);
    randomValues[targetIndex * 4] = a;
    randomValues[targetIndex * 4 + 1] = b;
    randomValues[targetIndex * 4 + 2] = c;
    randomValues[targetIndex * 4 + 3] = d;

    if (sourceColor) {
      colors[targetIndex * 3] = sourceColor.getX(sourceIndex);
      colors[targetIndex * 3 + 1] = sourceColor.getY(sourceIndex);
      colors[targetIndex * 3 + 2] = sourceColor.getZ(sourceIndex);
    } else {
      // 某些 DRACO 点云在默认语义里不会暴露 COLOR 属性；没有颜色时按高度合成青紫金油膜色，
      // 这样兜底仍然贴近参考视频的玻璃折射，而不是退化成一团白点。
      const heightMix = (Math.sin(position.getY(sourceIndex) * 0.08) + 1) * 0.5;
      const paletteColor = cyan.clone().lerp(violet, heightMix).lerp(targetIndex % 5 === 0 ? magenta : gold, targetIndex % 7 === 0 ? 0.36 : 0.08);
      colors[targetIndex * 3] = paletteColor.r;
      colors[targetIndex * 3 + 1] = paletteColor.g;
      colors[targetIndex * 3 + 2] = paletteColor.b;
    }
  }

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  pointGeometry.setAttribute("random", new THREE.BufferAttribute(randomValues, 4));
  pointGeometry.center();
  pointGeometry.computeBoundingBox();
  const size = pointGeometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const heightScale = 6.35 / Math.max(size.y, 0.001);
  pointGeometry.scale(heightScale, heightScale, heightScale);
  pointGeometry.computeBoundingSphere();
  sourceGeometry.dispose();
  return pointGeometry;
}

async function loadActiveTheorySpineKtx2Textures(renderer: THREE.WebGLRenderer) {
  const loader = new KTX2Loader();
  loader.setTranscoderPath(ACTIVE_THEORY_KTX2_TRANSCODER_PATH);
  loader.detectSupport(renderer);

  try {
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const baseColorTexture = await loader.loadAsync(ACTIVE_THEORY_SPINE_BASE_COLOR_PATH);
    const mroTexture = await loader.loadAsync(ACTIVE_THEORY_SPINE_MRO_PATH);
    [baseColorTexture, mroTexture].forEach((texture) => {
      texture.anisotropy = maxAnisotropy;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    });
    baseColorTexture.colorSpace = THREE.SRGBColorSpace;
    return [baseColorTexture, mroTexture] as const;
  } finally {
    loader.dispose();
  }
}

function createPanelTexture(scene: StoryScene) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  // 参考录屏里的主卡不是明亮 SaaS 玻璃，而是带暖灰油膜的烟熏屏；
  // 这里降低白雾和冷色占比，让柱体能像从卡片后方穿过，同时保留可读标题。
  const gradient = context.createRadialGradient(610, 338, 120, 540, 288, 860);
  gradient.addColorStop(0, "rgba(92,82,61,0.97)");
  gradient.addColorStop(0.34, "rgba(60,56,45,0.98)");
  gradient.addColorStop(0.64, "rgba(26,30,29,0.98)");
  gradient.addColorStop(1, "rgba(8,10,13,1)");
  context.fillStyle = gradient;
  drawRoundedRect(context, 24, 24, canvas.width - 48, canvas.height - 48, 54);
  context.fill();

  context.save();
  drawRoundedRect(context, 24, 24, canvas.width - 48, canvas.height - 48, 54);
  context.clip();

  for (let index = 0; index < 132; index += 1) {
    const x = Math.sin(index * 91.7) * 470 + 540;
    const y = Math.cos(index * 48.2) * 286 + 322;
    const radius = 34 + (index % 10) * 18;
    const blot = context.createRadialGradient(x, y, 0, x, y, radius);
    blot.addColorStop(0, index % 3 === 0 ? "rgba(220,126,255,0.07)" : "rgba(111,231,255,0.07)");
    blot.addColorStop(0.42, "rgba(238,224,190,0.055)");
    blot.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = blot;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const spineReflection = context.createLinearGradient(430, 52, 620, 596);
  spineReflection.addColorStop(0, "rgba(148,107,255,0)");
  spineReflection.addColorStop(0.24, "rgba(163,122,255,0.28)");
  spineReflection.addColorStop(0.46, "rgba(121,229,255,0.24)");
  spineReflection.addColorStop(0.68, "rgba(239,191,146,0.2)");
  spineReflection.addColorStop(1, "rgba(148,107,255,0)");
  context.fillStyle = spineReflection;
  context.globalAlpha = 0.34;
  context.fillRect(390, 26, 250, canvas.height - 52);

  // 参考屏幕上的柱体不是被完整看穿，而是被玻璃和烟雾折射成一团竖向投影。
  // 这里叠一层偏暖的中心雾面遮罩，弱化背后 3D 几何的锐利边缘，只留下油膜色块。
  const centralMist = context.createRadialGradient(510, 300, 20, 510, 300, 310);
  centralMist.addColorStop(0, "rgba(150,138,104,0.08)");
  centralMist.addColorStop(0.42, "rgba(96,88,69,0.055)");
  centralMist.addColorStop(1, "rgba(239,230,196,0)");
  context.fillStyle = centralMist;
  context.globalAlpha = 1;
  context.fillRect(260, 50, 500, canvas.height - 100);

  // 参考卡片表面能看到柱体油膜被投射成一簇蓝紫色散斑；
  // 这层只画在面板纹理里，不直接拷贝参考图，保证仍然是项目自己的程序化视觉。
  context.globalCompositeOperation = "screen";
  const projectionClusters = [
    { color: "rgba(112,226,255,", x: 500, y: 168, radius: 118, sx: 0.58, sy: 1.05 },
    { color: "rgba(204,132,255,", x: 438, y: 266, radius: 136, sx: 0.5, sy: 1.2 },
    { color: "rgba(235,192,128,", x: 574, y: 370, radius: 126, sx: 0.56, sy: 1.04 },
    { color: "rgba(255,148,214,", x: 488, y: 452, radius: 104, sx: 0.48, sy: 0.96 },
  ];
  projectionClusters.forEach((cluster, clusterIndex) => {
    const projection = context.createRadialGradient(0, 0, 0, 0, 0, cluster.radius);
    projection.addColorStop(0, `${cluster.color}0.34)`);
    projection.addColorStop(0.28, `${cluster.color}0.14)`);
    projection.addColorStop(0.72, `${cluster.color}0.035)`);
    projection.addColorStop(1, `${cluster.color}0)`);
    context.save();
    context.translate(cluster.x, cluster.y);
    context.rotate(-0.42 + clusterIndex * 0.22);
    context.scale(cluster.sx, cluster.sy);
    context.fillStyle = projection;
    context.fillRect(-cluster.radius, -cluster.radius, cluster.radius * 2, cluster.radius * 2);
    context.restore();
  });
  for (let index = 0; index < 76; index += 1) {
    const cluster = projectionClusters[index % projectionClusters.length];
    const color = cluster.color;
    const x = cluster.x + Math.sin(index * 13.11) * (44 + (index % 5) * 10);
    const y = cluster.y + Math.cos(index * 11.79) * (42 + (index % 4) * 12);
    const radius = 3.4 + (index % 5) * 1.8;
    const shard = context.createRadialGradient(x, y, 0, x, y, radius);
    shard.addColorStop(0, `${color}0.24)`);
    shard.addColorStop(0.52, `${color}0.08)`);
    shard.addColorStop(1, `${color}0)`);
    context.fillStyle = shard;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let index = 0; index < 28; index += 1) {
    const color = index % 4 === 0 ? "#7ceaff" : index % 4 === 1 ? "#b78aff" : index % 4 === 2 ? "#ff86d2" : "#e4bd74";
    const x = 492 + Math.sin(index * 2.08) * 92 + Math.cos(index * 5.3) * 28;
    const y = 150 + index * 12 + Math.cos(index * 1.74) * 54;
    const radius = 16 + (index % 6) * 8;
    const shard = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    shard.addColorStop(0, `${color}7a`);
    shard.addColorStop(0.24, `${color}34`);
    shard.addColorStop(0.68, `${color}0b`);
    shard.addColorStop(1, `${color}00`);
    context.save();
    context.translate(x, y);
    context.rotate(-0.36 + Math.sin(index * 0.9) * 0.42);
    context.scale(0.42 + (index % 3) * 0.18, 1.0 + (index % 4) * 0.18);
    context.fillStyle = shard;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }
  [
    { color: "#78efff", x: 580, y: 92, radius: 54, sx: 0.78, sy: 0.5 },
    { color: "#b58cff", x: 452, y: 146, radius: 76, sx: 1.02, sy: 0.62 },
    { color: "#f88bd6", x: 540, y: 206, radius: 66, sx: 0.9, sy: 0.58 },
    { color: "#76f6ec", x: 672, y: 230, radius: 44, sx: 0.72, sy: 0.42 },
    { color: "#e2bf73", x: 616, y: 330, radius: 58, sx: 1.1, sy: 0.52 },
    { color: "#9bf8ff", x: 540, y: 122, radius: 42, sx: 1.45, sy: 0.36 },
    { color: "#c69aff", x: 498, y: 172, radius: 48, sx: 0.62, sy: 0.5 },
    { color: "#ff95de", x: 604, y: 196, radius: 42, sx: 0.88, sy: 0.42 },
    { color: "#f0c36f", x: 632, y: 244, radius: 38, sx: 1.2, sy: 0.34 },
  ].forEach((fragment, fragmentIndex) => {
    // 参考画面里玻璃屏的色斑是几团可辨认的油膜折射，不是平均铺开的粒子。
    // 这里用更少、更大的局部色块压过均匀纹理，让面板投影向参考帧的“脏玻璃”质感靠拢。
    const projection = context.createRadialGradient(0, 0, 0, 0, 0, fragment.radius);
    projection.addColorStop(0, `${fragment.color}a0`);
    projection.addColorStop(0.22, `${fragment.color}55`);
    projection.addColorStop(0.58, `${fragment.color}18`);
    projection.addColorStop(1, `${fragment.color}00`);
    context.save();
    context.translate(fragment.x, fragment.y);
    context.rotate(-0.24 + fragmentIndex * 0.18);
    context.scale(fragment.sx, fragment.sy);
    context.fillStyle = projection;
    context.fillRect(-fragment.radius, -fragment.radius, fragment.radius * 2, fragment.radius * 2);
    context.restore();
  });
  context.globalCompositeOperation = "multiply";
  [
    { x: 520, y: 132, radius: 54, sx: 0.8, sy: 0.42 },
    { x: 472, y: 222, radius: 62, sx: 0.58, sy: 0.78 },
    { x: 608, y: 292, radius: 48, sx: 0.62, sy: 0.5 },
  ].forEach((shadow, shadowIndex) => {
    // 参考玻璃里亮斑旁边都有不规则暗污，能让油膜折射像真实脏玻璃。
    // 只加在中心投影区，避免整张主卡变脏导致 AI PM 标题不可读。
    const occlusion = context.createRadialGradient(0, 0, 0, 0, 0, shadow.radius);
    occlusion.addColorStop(0, "rgba(0,0,0,0.26)");
    occlusion.addColorStop(0.42, "rgba(0,0,0,0.1)");
    occlusion.addColorStop(1, "rgba(0,0,0,0)");
    context.save();
    context.translate(shadow.x, shadow.y);
    context.rotate(-0.42 + shadowIndex * 0.28);
    context.scale(shadow.sx, shadow.sy);
    context.fillStyle = occlusion;
    context.fillRect(-shadow.radius, -shadow.radius, shadow.radius * 2, shadow.radius * 2);
    context.restore();
  });
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 12; index += 1) {
    const color = index % 4 === 0 ? "#72e9ff" : index % 4 === 1 ? "#bf82ff" : index % 4 === 2 ? "#ff8dda" : "#e5c27b";
    const x = 470 + Math.sin(index * 2.4) * 116;
    const y = 104 + index * 38 + Math.cos(index * 1.7) * 28;
    const radius = 74 + (index % 4) * 18;
    const smear = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    smear.addColorStop(0, `${color}4f`);
    smear.addColorStop(0.28, `${color}22`);
    smear.addColorStop(0.7, `${color}08`);
    smear.addColorStop(1, `${color}00`);
    context.save();
    context.translate(x, y);
    context.rotate(-0.58 + Math.sin(index) * 0.32);
    context.scale(0.45 + (index % 3) * 0.12, 1.58 + (index % 2) * 0.42);
    context.fillStyle = smear;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }
  context.globalCompositeOperation = "multiply";
  for (let index = 0; index < 18; index += 1) {
    const x = 376 + ((Math.sin(index * 9.19) + 1) / 2) * 270;
    const y = 70 + ((Math.cos(index * 14.71) + 1) / 2) * 500;
    const radius = 22 + (index % 6) * 12;
    const pore = context.createRadialGradient(x, y, 0, x, y, radius);
    pore.addColorStop(0, "rgba(0,0,0,0.34)");
    pore.addColorStop(0.46, "rgba(0,0,0,0.12)");
    pore.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = pore;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.globalCompositeOperation = "source-over";

  context.fillStyle = "rgba(11,10,8,0.18)";
  drawRoundedRect(context, 24, 24, canvas.width - 48, canvas.height - 48, 54);
  context.fill();

  context.globalAlpha = 0.034;
  context.strokeStyle = "#f4ebd0";
  context.lineWidth = 1.25;
  for (let index = 0; index < 9; index += 1) {
    context.beginPath();
    context.moveTo(70, 128 + index * 38);
    context.bezierCurveTo(260, 86 + index * 30, 636, 158 + index * 22, 954, 102 + index * 36);
    context.stroke();
  }
  context.restore();

  context.strokeStyle = "#8a7b62";
  context.globalAlpha = 0.92;
  context.lineWidth = 10;
  drawRoundedRect(context, 26, 26, canvas.width - 52, canvas.height - 52, 54);
  context.stroke();

  context.strokeStyle = "rgba(211,190,142,0.86)";
  context.globalAlpha = 0.36;
  context.lineWidth = 4;
  drawRoundedRect(context, 31, 31, canvas.width - 62, canvas.height - 62, 49);
  context.stroke();

  context.globalAlpha = 1;
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.font = "600 24px monospace";
  context.textAlign = "center";
  context.fillText("AI PM", canvas.width / 2, 214);

  context.fillStyle = "rgba(255,255,255,0.98)";
  context.shadowColor = "#9fe9ff";
  context.shadowBlur = 22;
  context.font = "800 60px monospace";
  context.fillText(scene.label.toUpperCase(), canvas.width / 2, 326);

  context.shadowBlur = 0;
  context.fillStyle = "rgba(246,243,232,0.68)";
  context.font = "600 25px sans-serif";
  context.fillText(scene.metric.toUpperCase(), canvas.width / 2, 392);

  context.textAlign = "left";
  context.fillStyle = "rgba(255,255,255,0.42)";
  context.font = "500 18px monospace";
  scene.signals.forEach((signal, index) => {
    context.fillText(`// ${signal}`, 76 + index * 250, 552);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createReferenceGlassPanelTexture(variant: ReferenceGlassPanelVariant) {
  const canvas = document.createElement("canvas");
  canvas.width = variant === "front" ? 1024 : 760;
  canvas.height = variant === "front" ? 640 : 920;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const width = canvas.width;
  const height = canvas.height;
  const inset = variant === "rear" ? 34 : 28;
  const radius = variant === "front" ? 54 : 62;
  const accent = variant === "front" ? "#65d2ba" : variant === "left" ? "#8af6ed" : "#74d8ff";

  // 这组纹理专门补参考 mp4 里的“空间玻璃屏”关系：左侧大屏、前景油膜屏、后方暗屏。
  // 镜像证明源站前景屏不是普通文字卡，而是 WorkPaneUI + 项目媒体贴到玻璃 pane 上；
  // 这里用 Canvas 自生成低分辨率媒体投影、油膜和 UI3D 文本层，避免默认帧继续像一张干净产品卡。
  context.clearRect(0, 0, width, height);
  const baseGradient = context.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, variant === "front" ? "rgba(100,110,106,0.78)" : "rgba(129,199,187,0.22)");
  baseGradient.addColorStop(0.42, variant === "front" ? "rgba(72,82,80,0.72)" : variant === "rear" ? "rgba(20,34,38,0.14)" : "rgba(154,193,186,0.18)");
  baseGradient.addColorStop(1, variant === "front" ? "rgba(31,38,39,0.64)" : "rgba(8,12,16,0.08)");
  context.fillStyle = baseGradient;
  drawRoundedRect(context, inset, inset, width - inset * 2, height - inset * 2, radius);
  context.fill();

  context.save();
  drawRoundedRect(context, inset, inset, width - inset * 2, height - inset * 2, radius);
  context.clip();

  const haze = context.createRadialGradient(width * 0.48, height * 0.34, 0, width * 0.48, height * 0.34, Math.max(width, height) * 0.72);
  haze.addColorStop(0, variant === "front" ? "rgba(224,232,226,0.48)" : "rgba(215,249,239,0.2)");
  haze.addColorStop(0.48, variant === "front" ? "rgba(130,146,142,0.3)" : "rgba(130,180,174,0.08)");
  haze.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = haze;
  context.fillRect(0, 0, width, height);

  const diagonal = context.createLinearGradient(width * 0.12, height * 0.08, width * 0.88, height * 0.92);
  diagonal.addColorStop(0, "rgba(255,255,255,0)");
  diagonal.addColorStop(0.42, variant === "front" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.16)");
  diagonal.addColorStop(0.58, variant === "front" ? "rgba(122,255,238,0.05)" : "rgba(122,255,238,0.1)");
  diagonal.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = diagonal;
  context.globalAlpha = variant === "front" ? 0.22 : variant === "rear" ? 0.32 : 0.52;
  context.beginPath();
  context.moveTo(width * 0.04, height * 0.18);
  context.lineTo(width * 0.78, height * 0.04);
  context.lineTo(width * 0.62, height * 0.42);
  context.lineTo(width * 0.16, height * 0.62);
  context.closePath();
  context.fill();

  context.globalCompositeOperation = "screen";
  const mediaPatches =
    variant === "front"
      ? [
          { color: "#77e9f0", x: width * 0.32, y: height * 0.28, r: width * 0.2, sx: 1.14, sy: 0.42, rotation: -0.18 },
          { color: "#a477ff", x: width * 0.44, y: height * 0.38, r: width * 0.18, sx: 0.74, sy: 0.86, rotation: 0.36 },
          { color: "#d6d87a", x: width * 0.7, y: height * 0.24, r: width * 0.18, sx: 1.04, sy: 0.46, rotation: 0.18 },
          { color: "#5deabf", x: width * 0.57, y: height * 0.72, r: width * 0.24, sx: 1.28, sy: 0.42, rotation: -0.32 },
          { color: "#6aa5ff", x: width * 0.25, y: height * 0.67, r: width * 0.16, sx: 0.78, sy: 0.56, rotation: 0.24 },
        ]
      : [];
  mediaPatches.forEach((patch, patchIndex) => {
    // 参考 Work 卡片的内容面不是纯色玻璃，而是被项目视频/缩略图打脏的油彩投影。
    // 用多层低透明椭圆模拟那种媒体色块，会比继续放干净文案更接近源站视觉密度。
    const patchGradient = context.createRadialGradient(0, 0, 0, 0, 0, patch.r);
    patchGradient.addColorStop(0, `${patch.color}b4`);
    patchGradient.addColorStop(0.34, `${patch.color}5a`);
    patchGradient.addColorStop(0.68, `${patch.color}20`);
    patchGradient.addColorStop(1, `${patch.color}00`);
    context.save();
    context.translate(patch.x, patch.y);
    context.rotate(patch.rotation + patchIndex * 0.06);
    context.scale(patch.sx, patch.sy);
    context.fillStyle = patchGradient;
    context.beginPath();
    context.ellipse(0, 0, patch.r, patch.r, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
  [
    { color: "#78efff", x: width * 0.34, y: height * 0.24, r: width * 0.22, sx: 0.82, sy: 0.48 },
    { color: "#b38aff", x: width * 0.48, y: height * 0.5, r: width * 0.24, sx: 0.55, sy: 1.12 },
    { color: "#e1c27a", x: width * 0.62, y: height * 0.7, r: width * 0.18, sx: 1.1, sy: 0.42 },
  ].forEach((spot, spotIndex) => {
    const spotGradient = context.createRadialGradient(0, 0, 0, 0, 0, spot.r);
    spotGradient.addColorStop(0, `${spot.color}${variant === "front" ? "88" : "5a"}`);
    spotGradient.addColorStop(0.34, `${spot.color}24`);
    spotGradient.addColorStop(1, `${spot.color}00`);
    context.save();
    context.translate(spot.x, spot.y);
    context.rotate(-0.44 + spotIndex * 0.34);
    context.scale(spot.sx, spot.sy);
    context.fillStyle = spotGradient;
    context.fillRect(-spot.r, -spot.r, spot.r * 2, spot.r * 2);
    context.restore();
  });
  context.globalCompositeOperation = "source-over";

  context.globalAlpha = variant === "front" ? 0.1 : 0.22;
  context.strokeStyle = "rgba(220,255,248,0.66)";
  context.lineWidth = 1.2;
  for (let lineIndex = 0; lineIndex < 7; lineIndex += 1) {
    const y = height * (0.44 + lineIndex * 0.052);
    context.beginPath();
    context.moveTo(width * 0.16, y);
    context.lineTo(width * (0.5 + Math.sin(lineIndex) * 0.08), y - height * 0.035);
    context.stroke();
  }

  if (variant === "front") {
    // 源站 WorkPaneUI 是 1024 贴图里绘制 title/client/copy/logo，再由 pane shader 折射；
    // 这里把文字做成低分辨率投影感，而不是清晰产品标语，视觉上更像参考卡片里的媒体标题。
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 0.08;
    context.fillStyle = "rgba(7, 10, 12, 0.86)";
    context.fillRect(width * 0.1, height * 0.17, width * 0.8, height * 0.56);

    context.globalCompositeOperation = "screen";
    context.globalAlpha = 0.24;
    context.strokeStyle = "rgba(198,255,238,0.42)";
    context.lineWidth = 2;
    for (let bandIndex = 0; bandIndex < 5; bandIndex += 1) {
      context.beginPath();
      context.moveTo(width * (0.16 + bandIndex * 0.03), height * (0.2 + bandIndex * 0.11));
      context.bezierCurveTo(width * 0.36, height * (0.12 + bandIndex * 0.08), width * 0.64, height * (0.32 + bandIndex * 0.05), width * 0.82, height * (0.22 + bandIndex * 0.1));
      context.stroke();
    }

    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 0.96;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "600 28px Georgia, serif";
    context.fillStyle = "rgba(255,250,232,0.68)";
    context.shadowColor = "rgba(151,210,255,0.68)";
    context.shadowBlur = 16;
    context.fillText("Harry Potter", width * 0.5, height * 0.27);

    context.font = "400 92px 'Helvetica Neue', Arial, sans-serif";
    context.fillStyle = "rgba(244,252,255,0.98)";
    context.shadowColor = "rgba(106,225,255,0.76)";
    context.shadowBlur = 26;
    context.fillText("WELCOME TO", width * 0.5, height * 0.44);
    context.fillText("HOGWARTS", width * 0.5, height * 0.58);

    context.font = "600 20px 'Courier New', monospace";
    context.fillStyle = "rgba(235,255,246,0.16)";
    context.shadowBlur = 8;
    context.fillText("ACTIVE THEORY WORK PANE", width * 0.5, height * 0.7);

    context.shadowBlur = 0;
    context.globalAlpha = 0.28;
    context.strokeStyle = "rgba(164,255,239,0.5)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(width * 0.22, height * 0.75);
    context.lineTo(width * 0.78, height * 0.75);
    context.stroke();
  }

  context.restore();

  context.globalCompositeOperation = "source-over";
  context.globalAlpha = variant === "front" ? 0.48 : 0.58;
  context.strokeStyle = accent;
  context.lineWidth = variant === "front" ? 5.6 : 5.6;
  drawRoundedRect(context, inset, inset, width - inset * 2, height - inset * 2, radius);
  context.stroke();

  context.globalAlpha = variant === "front" ? 0.18 : 0.24;
  context.strokeStyle = "rgba(255,255,255,0.86)";
  context.lineWidth = 1.8;
  drawRoundedRect(context, inset + 7, inset + 7, width - (inset + 7) * 2, height - (inset + 7) * 2, radius - 8);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWorkPaneMediaMaterial(mediaTexture: THREE.Texture, logoTexture: THREE.Texture) {
  // 源站 WorkItem 是两层：项目 thumbnail 进入 pane 的 tMap，projectLogo/title 由 WorkPaneUI 再贴到 pane_ui。
  // 这里把真实 Hogwarts CMS 素材作为一层低透明投影塞回前景屏，
  // 再由现有 Canvas UI 与折射层压住它，避免继续只靠手绘假卡片。
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      tLogo: { value: logoTexture },
      tMedia: { value: mediaTexture },
      uOpacity: { value: 0.36 },
      uScroll: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tLogo;
      uniform sampler2D tMedia;
      uniform float uOpacity;
      uniform float uScroll;
      uniform float uTime;
      varying vec2 vUv;

      float roundedPanelMask(vec2 uv) {
        vec2 p = abs(uv - 0.5) - vec2(0.465, 0.392);
        float d = length(max(p, 0.0)) + min(max(p.x, p.y), 0.0);
        return 1.0 - smoothstep(0.0, 0.034, d);
      }

      vec3 sampleSoftMedia(vec2 uv) {
        vec3 color = texture2D(tMedia, uv).rgb * 0.48;
        color += texture2D(tMedia, uv + vec2(0.006, 0.0)).rgb * 0.15;
        color += texture2D(tMedia, uv - vec2(0.006, 0.0)).rgb * 0.15;
        color += texture2D(tMedia, uv + vec2(0.0, 0.006)).rgb * 0.11;
        color += texture2D(tMedia, uv - vec2(0.0, 0.006)).rgb * 0.11;
        return color;
      }

      void main() {
        vec2 mediaUv = vUv;
        mediaUv.x = 0.5 + (mediaUv.x - 0.5) * 1.04 + sin(uTime * 0.2 + vUv.y * 4.4) * 0.006 + uScroll * 0.01;
        mediaUv.y = 0.5 + (mediaUv.y - 0.5) * 0.98 + cos(uTime * 0.16 + vUv.x * 3.2) * 0.005;

        vec3 media = sampleSoftMedia(mediaUv);
        float luma = dot(media, vec3(0.299, 0.587, 0.114));
        float saturation = max(media.r, max(media.g, media.b)) - min(media.r, min(media.g, media.b));
        vec3 cinematic = pow(media, vec3(0.86)) * vec3(0.58, 0.72, 0.72);
        cinematic += vec3(0.1, 0.38, 0.32) * smoothstep(0.18, 0.78, luma + saturation * 0.4) * 0.2;
        cinematic += vec3(0.44, 0.3, 0.68) * smoothstep(0.2, 0.72, saturation) * 0.14;

        vec2 logoUv = vec2((vUv.x - 0.36) / 0.28, (vUv.y - 0.64) / 0.14);
        vec4 logo = texture2D(tLogo, logoUv);
        float inLogo = step(0.0, logoUv.x) * step(logoUv.x, 1.0) * step(0.0, logoUv.y) * step(logoUv.y, 1.0);
        float logoAlpha = smoothstep(0.24, 0.74, dot(logo.rgb, vec3(0.299, 0.587, 0.114))) * inLogo;
        vec3 logoGlow = vec3(0.86, 0.96, 1.0) * logoAlpha * 1.18;

        float mask = roundedPanelMask(vUv);
        float mediaBody = smoothstep(0.08, 0.68, luma + saturation * 0.5);
        float glassFalloff = smoothstep(0.02, 0.16, vUv.x) * smoothstep(0.98, 0.84, vUv.x) * smoothstep(0.02, 0.14, vUv.y) * smoothstep(0.98, 0.84, vUv.y);
        float ripple = 0.88 + sin(uTime * 0.72 + vUv.y * 18.0 + vUv.x * 4.0) * 0.12;
        float alpha = mask * glassFalloff * uOpacity * ripple * (0.18 + mediaBody * 0.48 + logoAlpha * 0.8);

        gl_FragColor = vec4(cinematic + logoGlow, alpha);
      }
    `,
  });
}

function createWorkRefractionPanelMaterial(baseTexture: THREE.Texture, normalTexture: THREE.Texture, envTexture: THREE.Texture, opacity: number) {
  // 源站 WorkItemShader 的玻璃屏不是单层透明图，而是把 normal、水纹、环境贴图和屏幕纹理做折射混合。
  // 这里保留 AI PM 自有文案纹理，但用镜像里的 `waternormals` 与 `env1` 重新做一层前景折射；
  // 这样主屏会有参考里的厚玻璃、油膜和暗色折射，而不是普通半透明 CanvasTexture。
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      uBase: { value: baseTexture },
      uEnv: { value: envTexture },
      uNormal: { value: normalTexture },
      uOpacity: { value: opacity },
      uScroll: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uBase;
      uniform sampler2D uEnv;
      uniform sampler2D uNormal;
      uniform float uOpacity;
      uniform float uScroll;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      float edgeMask(vec2 uv) {
        float x = smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.86, uv.x);
        float y = smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.86, uv.y);
        return x * y;
      }

      void main() {
        vec2 normalUv = vUv * vec2(1.18, 0.78) + vec2(uTime * 0.012 + uScroll * 0.014, uTime * 0.026);
        vec3 normalSample = texture2D(uNormal, normalUv).rgb * 2.0 - 1.0;
        float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal + normalSample * 0.08), normalize(vViewDir))), 1.18);
        vec2 refractUv = vUv + normalSample.xy * (0.012 + fresnel * 0.022);
        vec4 base = texture2D(uBase, refractUv);
        vec3 env = texture2D(uEnv, vec2(vUv.x + normalSample.x * 0.04 + uTime * 0.006, vUv.y - normalSample.y * 0.035)).rgb;
        float edge = edgeMask(vUv);
        float panelBody = smoothstep(0.78, 0.18, length(vUv - vec2(0.5)));
        float scan = 0.92 + sin(uTime * 0.84 + vUv.y * 16.0 + normalSample.x * 1.4) * 0.08;
        vec3 glassTint = vec3(0.055, 0.072, 0.07);
        vec3 color = base.rgb * 0.84 + env * (0.18 + fresnel * 0.32) + glassTint;
        color += vec3(0.2, 0.68, 0.58) * fresnel * 0.15;
        color += vec3(0.46, 0.2, 0.7) * smoothstep(0.54, 0.94, abs(normalSample.x)) * 0.08;
        float alpha = uOpacity * (0.24 + panelBody * 0.58 + fresnel * 0.42) * edge * scan;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function createSourceSpineShaderMaterial(options: {
  accent: THREE.Color;
  baseColorTexture: THREE.Texture;
  matcapTexture: THREE.Texture;
  mroTexture: THREE.Texture;
  normalTexture: THREE.Texture;
  opacity: number;
  phase: number;
  refractionTexture: THREE.Texture;
}) {
  // 源站 Work 页的 `SpineShader` 不是标准 PBR 材质：它用 normal、matcap、refraction 和 uReflection
  // 混出“黑色湿润骨体 + 青紫油膜边缘”。这里不再继续调 `MeshPhysicalMaterial` 参数，
  // 而是把镜像里可验证的 uniform 协议落到一个本地 ShaderMaterial：
  // - `uNormalStrength` 固定为源站的 0.19；
  // - `uReflection` 固定为源站的 [2.7, 0.85]；
  // - `matcap-test` 与 `damaged_road_normal` 参与主色，而不是只做一层很薄的外壳；
  // - 源站真实 `tRefraction` 来自 Work 场景的 MRT pass，这里用同一段参考动态柱体材质
  //   作为近似输入，避免退回静态 env 采样后柱体缺少 mp4 里的湿润流动高光。
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      tBaseColor: { value: options.baseColorTexture },
      tMatcap: { value: options.matcapTexture },
      tMRO: { value: options.mroTexture },
      tNormal: { value: options.normalTexture },
      tRefraction: { value: options.refractionTexture },
      uAccent: { value: options.accent },
      uLight: { value: new THREE.Vector4(1, 1, 1, 0.4) },
      uNormalStrength: { value: 0.19 },
      uOpacity: { value: options.opacity },
      uPhase: { value: options.phase },
      uReflection: { value: new THREE.Vector2(2.7, 0.85) },
      uScroll: { value: 0 },
      uSpineScroll: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uPhase;
      uniform float uSpineScroll;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vEyePos;
      varying vec3 vMPos;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec3 transformedPosition = position;
        float sourceScroll = fract(uSpineScroll);
        float particleSeed = abs(sin(position.x * 7.3 + position.z * 5.1 + uPhase * 1.7));
        float topLift = smoothstep(0.4, 0.0, sourceScroll) * pow(particleSeed, 12.0) * 0.12;
        float bottomDrop = pow(sourceScroll, 4.0) * smoothstep(-0.9, 1.8, transformedPosition.y) * 0.22;
        float verticalPull = sourceScroll * 0.16;
        float spiralMask = smoothstep(0.0, 0.5, abs(sourceScroll - 0.5)) * 0.018;
        float spiral = sourceScroll * 5.0 + transformedPosition.y * 0.5 + uPhase * 2.0 + uTime * 0.025;

        // 源站 FlowerParticleShader 会把顶部/底部粒子按 uScroll 纵向推开。
        // 这里把同样的“上升/下落相位”压到 spine mesh 的顶点里，但振幅只做内部折光，
        // 绝不改变外层 pillarGroup 的 x/z 坐标，避免用户滚动时误以为整根柱子横向偏移。
        transformedPosition.y += topLift - bottomDrop - verticalPull;
        transformedPosition.x -= cos(spiral) * spiralMask;
        transformedPosition.z -= sin(spiral) * spiralMask;
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
        vec4 worldPosition = modelMatrix * vec4(transformedPosition, 1.0);
        vec4 viewPosition = modelViewMatrix * vec4(transformedPosition, 1.0);
        vMPos = worldPosition.xyz / worldPosition.w;
        vEyePos = viewPosition.xyz;
        vWorldPosition = worldPosition.xyz;
        vViewDir = normalize(cameraPosition - vMPos);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D tBaseColor;
      uniform sampler2D tMatcap;
      uniform sampler2D tMRO;
      uniform sampler2D tNormal;
      uniform sampler2D tRefraction;
      uniform vec2 uReflection;
      uniform vec3 uAccent;
      uniform vec4 uLight;
      uniform float uNormalStrength;
      uniform float uOpacity;
      uniform float uPhase;
      uniform float uScroll;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vEyePos;
      varying vec3 vMPos;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      const float PI = 3.14159265359;

      float prange(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
        float oldRange = oldMax - oldMin;
        float newRange = newMax - newMin;
        return (((oldValue - oldMin) * newRange) / oldRange) + newMin;
      }

      float pcrange(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
        return clamp(prange(oldValue, oldMin, oldMax, newMin, newMax), min(newMax, newMin), max(newMin, newMax));
      }

      vec2 reflectMatcap(vec3 worldPos, vec3 worldNormal) {
        vec3 viewDir = normalize(cameraPosition - worldPos);
        vec3 x = normalize(vec3(viewDir.z, 0.0, -viewDir.x));
        vec3 y = cross(viewDir, x);
        return vec2(dot(x, worldNormal), dot(y, worldNormal)) * 0.495 + 0.5;
      }

      vec3 unpackNormalFBR(vec3 eyePos, vec3 surfNorm, sampler2D normalMap, float intensity, float scale, vec2 uv) {
        vec3 q0 = dFdx(eyePos.xyz);
        vec3 q1 = dFdy(eyePos.xyz);
        vec2 st0 = dFdx(uv.st);
        vec2 st1 = dFdy(uv.st);
        vec3 n = normalize(surfNorm);
        vec3 q1perp = cross(q1, n);
        vec3 q0perp = cross(n, q0);
        vec3 tangent = q1perp * st0.x + q0perp * st1.x;
        vec3 bitangent = q1perp * st0.y + q0perp * st1.y;
        float det = max(dot(tangent, tangent), dot(bitangent, bitangent));
        float scaleFactor = det == 0.0 ? 0.0 : inversesqrt(det);
        vec3 mapN = texture2D(normalMap, uv * scale).xyz * 2.0 - 1.0;
        mapN.xy *= intensity;
        return normalize(tangent * (mapN.x * scaleFactor) + bitangent * (mapN.y * scaleFactor) + n * mapN.z);
      }

      float geometricOcclusion(float ndl, float ndv, float roughness) {
        float r = roughness;
        float attenuationL = 2.0 * ndl / (ndl + sqrt(r * r + (1.0 - r * r) * (ndl * ndl)));
        float attenuationV = 2.0 * ndv / (ndv + sqrt(r * r + (1.0 - r * r) * (ndv * ndv)));
        return attenuationL * attenuationV;
      }

      float microfacetDistribution(float roughness, float ndh) {
        float roughnessSq = roughness * roughness;
        float f = (ndh * roughnessSq - ndh) * ndh + 1.0;
        return roughnessSq / (PI * f * f);
      }

      vec3 getFBR(vec3 baseColor, vec2 uv, vec3 normal) {
        vec3 mro = texture2D(tMRO, uv).rgb;
        float roughness = mro.g;
        vec2 aUv = reflectMatcap(vMPos, normal);
        vec2 bUv = ((aUv - 0.5) * 0.5 - vec2(0.1)) + 0.5;
        vec2 matcapUv = mix(aUv, bUv, roughness);
        vec3 view = normalize(cameraPosition - vMPos);
        vec3 light = normalize(uLight.xyz);
        vec3 halfVector = normalize((light + view) / 2.0);
        float ndl = pcrange(clamp(dot(normal, light), 0.001, 1.0), 0.0, 1.0, 0.4, 1.0);
        float ndv = pcrange(clamp(abs(dot(normal, view)), 0.001, 1.0), 0.0, 1.0, 0.4, 1.0);
        float ndh = clamp(dot(normal, halfVector), 0.0, 1.0);
        float g = geometricOcclusion(ndl, ndv, roughness);
        float d = microfacetDistribution(roughness, ndh);
        vec3 specular = g * d / (4.0 * ndl * ndv) * uAccent;
        vec3 lightColor = ndl * specular * uLight.w;
        return ((baseColor * texture2D(tMatcap, matcapUv).rgb) + lightColor) * max(mro.b, 0.08);
      }

      void main() {
        vec2 uv = vUv;
        uv.x += vWorldPosition.x * 0.2;
        uv += vec2(uScroll * 0.012 + sin(uTime * 0.08 + uPhase) * 0.004, 0.0);
        vec3 baseColor = texture2D(tBaseColor, uv).rgb;
        vec3 normal = unpackNormalFBR(vEyePos, vWorldNormal, tNormal, uNormalStrength, 1.0, vUv);
        normal.y -= vWorldPosition.y * 0.02;
        vec3 color = getFBR(baseColor, uv, normal);
        vec2 screenUv = vec2(
          0.5 + normal.x * 0.1 * uReflection.x + vWorldPosition.x * 0.012 + uScroll * 0.018,
          0.5 + normal.y * 0.1 * uReflection.x + vWorldPosition.y * 0.006
        );
        float fresnel = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewDir))), 0.0, 1.0), 2.4);
        float oilBand = smoothstep(0.22, 0.92, sin((vWorldPosition.y + uPhase) * 3.6 + uTime * 0.18) * 0.5 + 0.5);
        vec2 refractionUv = clamp(screenUv + vec2(sin(uTime * 0.17 + uPhase) * 0.012, cos(uTime * 0.13 + uPhase) * 0.01), vec2(0.02), vec2(0.98));
        vec3 refraction = pow(max(texture2D(tRefraction, refractionUv).rgb, 0.0), vec3(0.82));
        color += refraction * uReflection.y * (0.36 + fresnel * 0.34 + oilBand * 0.08);
        color += uAccent * fresnel * (0.12 + oilBand * 0.1);
        color = pow(max(color * 1.22, 0.0), vec3(1.18));

        float alpha = uOpacity * (0.72 + fresnel * 0.22);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export function LandingHome({ isAuthenticated, primaryHref, versionDashboardHref, workbenchHref }: LandingHomeProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<HTMLElement>(null);
  const scrollSectionRef = useRef<HTMLElement>(null);
  const storyCardRefs = useRef<Array<HTMLElement | null>>([]);
  const activeIndexRef = useRef(0);
  const nativeScrollProgressRef = useRef(0);
  const scrollTargetRef = useRef(0);
  const scrollImpulseRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);
  const pointerStartRef = useRef<number | null>(null);
  const { cycleMode, effectiveTheme, mode: themeMode } = useThemePreference();

  const activeScene = storyScenes[activeIndex];
  const primaryLabel = isAuthenticated ? "进入工作台" : "登录并进入工作台";

  const sceneStyle = useMemo(
    () => ({
      "--scene-accent": activeScene.accent,
      "--scene-index": activeIndex,
      "--story-scroll-screens": storyScenes.length * 8,
    }) as CSSProperties,
    [activeIndex, activeScene.accent]
  );

  const syncActiveIndexFromProgress = useCallback((progress: number) => {
    const normalizedIndex = ((Math.round(progress) % storyScenes.length) + storyScenes.length) % storyScenes.length;
    if (activeIndexRef.current === normalizedIndex) {
      return;
    }

    activeIndexRef.current = normalizedIndex;
    setActiveIndex(normalizedIndex);
  }, []);

  const applyStoryCardDomProgress = useCallback((progress: number, impulse = 0) => {
    storyCardRefs.current.forEach((node, slotIndex) => {
      if (!node) {
        return;
      }

      const visual = getStoryWorkItemVisual(slotIndex, progress, impulse);
      const slot = storyWorkItemSlots[slotIndex];

      // 前景 DOM 卡片是 WebGL WorkItem 的清晰交互层：滚轮或触摸一到就即时更新，
      // 不完全等待 RAF 插值。这里驱动的是 15 个循环 slot，而不是 5 个业务文案本体；
      // 这样向下滚动时所有卡片会像源码 WorkItems 一样接力穿过镜头，不会退化成一张卡片换内容。
      node.dataset.active = visual.isFocused && slot?.sceneIndex === activeIndexRef.current ? "true" : "false";
      node.style.opacity = String(visual.opacity);
      node.style.zIndex = String(visual.zIndex);
      node.style.transform = visual.transform;
    });
  }, []);

  const pushInfiniteScroll = useCallback((delta: number) => {
    scrollTargetRef.current += delta;
    scrollImpulseRef.current = Math.max(-3.8, Math.min(3.8, scrollImpulseRef.current + delta * 1.25));
    applyStoryCardDomProgress(scrollTargetRef.current, scrollImpulseRef.current);
    syncActiveIndexFromProgress(scrollTargetRef.current);
  }, [applyStoryCardDomProgress, syncActiveIndexFromProgress]);

  const goToScene = useCallback((nextIndex: number) => {
    const normalizedIndex = ((nextIndex % storyScenes.length) + storyScenes.length) % storyScenes.length;
    const cycleBase = Math.round(scrollTargetRef.current / storyScenes.length) * storyScenes.length;
    const candidates = [
      cycleBase + normalizedIndex - storyScenes.length,
      cycleBase + normalizedIndex,
      cycleBase + normalizedIndex + storyScenes.length,
    ];
    let closestTarget = candidates[0];

    for (const candidate of candidates) {
      if (Math.abs(candidate - scrollTargetRef.current) < Math.abs(closestTarget - scrollTargetRef.current)) {
        closestTarget = candidate;
      }
    }

    scrollImpulseRef.current = Math.max(-2.2, Math.min(2.2, (closestTarget - scrollTargetRef.current) * 0.92));
    scrollTargetRef.current = closestTarget;
    applyStoryCardDomProgress(scrollTargetRef.current, scrollImpulseRef.current);
    activeIndexRef.current = normalizedIndex;
    setActiveIndex(normalizedIndex);

    const scrollSection = scrollSectionRef.current;

    if (scrollSection) {
      const sectionTop = window.scrollY + scrollSection.getBoundingClientRect().top;
      const scrollUnit = Math.max(320, window.innerHeight * 0.72);
      window.scrollTo({
        behavior: "smooth",
        top: sectionTop + Math.max(0, closestTarget) * scrollUnit,
      });
    }
  }, [applyStoryCardDomProgress]);

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

    pushInfiniteScroll((start - end) / 240);
  }, [pushInfiniteScroll]);

  const handleTouchMove = useCallback(() => undefined, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    // 固定视口页面没有原生滚动条，用户点一下空白画面后应能直接用键盘继续推进故事。
    // 如果点的是卡片/按钮/链接，则把焦点留给真实交互元素；源站 WorkItem 也是每张卡自己承接 hover/click。
    if (!isLandingInteractiveTarget(event.target)) {
      event.currentTarget.focus({ preventScroll: true });
    }

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

    // Pointer 事件作为 touch 的兜底：移动浏览器和自动化环境对 TouchEvent 的实现不完全一致。
    pushInfiniteScroll((start - event.clientY) / 240);
  }, [pushInfiniteScroll]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const root = experienceRef.current;

    if (!root) {
      return;
    }

    const syncNativeScrollProgress = () => {
      const scrollSection = scrollSectionRef.current;

      if (!scrollSection) {
        return;
      }

      const rect = scrollSection.getBoundingClientRect();
      const scrollUnit = Math.max(320, window.innerHeight * 0.72);
      const nativeProgress = Math.max(0, -rect.top / scrollUnit);
      const nativeDelta = nativeProgress - nativeScrollProgressRef.current;

      if (Math.abs(nativeDelta) <= 0.0008) {
        return;
      }

      // 浏览器滚动事件先把 DOM WorkItem 推到位，RAF 再继续平滑 WebGL。
      // 这样触控板惯性、浏览器自动滚动和自动化滚动都是真实进度，不会看成单张卡片停在首帧。
      nativeScrollProgressRef.current = nativeProgress;
      scrollTargetRef.current = nativeProgress;
      scrollImpulseRef.current = Math.max(-3.8, Math.min(3.8, scrollImpulseRef.current + nativeDelta * 1.35));
      applyStoryCardDomProgress(nativeProgress, scrollImpulseRef.current);
      syncActiveIndexFromProgress(nativeProgress);
    };

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      const isInsideExperience = event.target instanceof Node && root.contains(event.target);
      const isDocumentWheel =
        event.target === window ||
        event.target === document ||
        event.target === document.body ||
        event.target === document.documentElement;

      if (!isInsideExperience && !isDocumentWheel) {
        return;
      }

      // 页面现在提供真实滚动高度，滚轮不再被 preventDefault 拦截；
      // 这里仅记录滚动速度给光效/卡片惯性用，真正的 progress 由动画帧主动读取 scrollY。
      const wheelImpulse = Math.max(-1.35, Math.min(1.35, event.deltaY / 360));
      scrollImpulseRef.current = Math.max(-3.8, Math.min(3.8, scrollImpulseRef.current + wheelImpulse * 1.15));
    };

    window.addEventListener("scroll", syncNativeScrollProgress, { passive: true });
    window.addEventListener("wheel", handleNativeWheel, { capture: true, passive: true });
    syncNativeScrollProgress();

    return () => {
      window.removeEventListener("scroll", syncNativeScrollProgress);
      window.removeEventListener("wheel", handleNativeWheel, { capture: true });
    };
  }, [applyStoryCardDomProgress, syncActiveIndexFromProgress]);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;

    const scene = new THREE.Scene();
    const environmentTexture = createDarkStudioEnvironment();
    scene.environment = environmentTexture;
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.set(0, 0.2, 7.2);

    const stage = new THREE.Group();
    scene.add(stage);

    const ambient = new THREE.AmbientLight(0xd8ecff, 0.18);
    scene.add(ambient);

    const pointLight = new THREE.PointLight(0x75dfff, 3.2, 20);
    pointLight.position.set(-2.9, 2.55, 4);
    scene.add(pointLight);

    const magentaLight = new THREE.PointLight(0xb277ff, 6.4, 12);
    magentaLight.position.set(1.35, 1.95, 2.8);
    scene.add(magentaLight);

    const cyanLight = new THREE.PointLight(0x43cfff, 3.7, 14);
    cyanLight.position.set(-1.15, -0.52, 3.2);
    scene.add(cyanLight);

    const goldLight = new THREE.PointLight(0xffbd65, 2.9, 9);
    goldLight.position.set(2.15, -1.72, 2.3);
    scene.add(goldLight);

    const rimLight = new THREE.SpotLight(0xb9f2ff, 11.8, 10, Math.PI * 0.22, 0.76, 1.05);
    rimLight.position.set(-3.1, 2.25, 3.7);
    rimLight.target.position.set(0.2, 0, -0.6);
    scene.add(rimLight);
    scene.add(rimLight.target);

    const purpleRimLight = new THREE.SpotLight(0xff65d4, 8.7, 9, Math.PI * 0.26, 0.82, 1.1);
    purpleRimLight.position.set(2.7, -0.1, 3.25);
    purpleRimLight.target.position.set(0.16, -0.1, -0.55);
    scene.add(purpleRimLight);
    scene.add(purpleRimLight.target);

    const particleCount = 3600;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const particleSizes = new Float32Array(particleCount);
    const particleAlphas = new Float32Array(particleCount);
    const particlePhases = new Float32Array(particleCount);
    const baseColors = ["#75e8ff", "#9d7dff", "#ff6fce", "#d8ae6a", "#edf6ff"].map((color) => new THREE.Color(color));

    for (let index = 0; index < particleCount; index += 1) {
      const isLocalCloud = Math.random() < 0.82;
      const radius = isLocalCloud ? 0.3 + Math.pow(Math.random(), 2.4) * 1.55 : 2.4 + Math.random() * 4.2;
      const angle = Math.random() * Math.PI * 2;
      const depth = (Math.random() - 0.5) * (isLocalCloud ? 1.2 : 5.2);
      particlePositions[index * 3] = (isLocalCloud ? -0.2 : 0) + Math.cos(angle) * radius;
      particlePositions[index * 3 + 1] = (Math.random() - 0.5) * (isLocalCloud ? 5.8 : 4.8) + Math.sin(radius) * 0.2;
      particlePositions[index * 3 + 2] = (isLocalCloud ? -0.16 : 0) + Math.sin(angle) * radius + depth;

      const color = baseColors[index % baseColors.length].clone().lerp(new THREE.Color("#ffffff"), isLocalCloud ? 0.18 + Math.random() * 0.28 : Math.random() * 0.12);
      particleColors[index * 3] = color.r;
      particleColors[index * 3 + 1] = color.g;
      particleColors[index * 3 + 2] = color.b;
      particleSizes[index] = isLocalCloud ? 1.8 + Math.pow(Math.random(), 2.25) * 7.4 : 1.1 + Math.random() * 2;
      particleAlphas[index] = isLocalCloud ? 0.045 + Math.random() * 0.19 : 0.016 + Math.random() * 0.05;
      particlePhases[index] = Math.random() * Math.PI * 2;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
    particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(particleSizes, 1));
    particleGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(particleAlphas, 1));
    particleGeometry.setAttribute("aPhase", new THREE.BufferAttribute(particlePhases, 1));
    const particleMaterial = createVolumetricParticleMaterial(0.38);
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    stage.add(particles);

    const pillarGroup = new THREE.Group();
    pillarGroup.position.set(0.02, -0.02, -0.38);
    pillarGroup.rotation.y = -0.04;
    pillarGroup.scale.set(0.9, 1.18, 0.84);
    stage.add(pillarGroup);

    const liquidColumnGeometry = new THREE.CylinderGeometry(0.5, 0.46, 5.8, 128, 72, true);
    const liquidColumnMaterial = new THREE.ShaderMaterial({
      depthWrite: true,
      fragmentShader: liquidPillarFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uAccent: { value: new THREE.Color(storyScenes[0].accent) },
        uTime: { value: 0 },
      },
      vertexShader: liquidPillarVertexShader,
    });
    const liquidColumn = new THREE.Mesh(liquidColumnGeometry, liquidColumnMaterial);
    liquidColumn.position.set(0, 0, -0.04);
    liquidColumn.visible = false;
    pillarGroup.add(liquidColumn);

    const glowConfigs = [
      { color: "#8ae8ff", opacity: 0.16, phase: 0.2, position: new THREE.Vector3(0.1, 0.28, -1.05), scale: 2.65 },
      { color: "#9e7cff", opacity: 0.16, phase: 1.7, position: new THREE.Vector3(-0.12, -1.3, -0.92), scale: 2.25 },
      { color: "#ff72cc", opacity: 0.13, phase: 2.9, position: new THREE.Vector3(0.42, 1.18, -0.98), scale: 1.95 },
      { color: "#d8a65f", opacity: 0.1, phase: 4.1, position: new THREE.Vector3(0.7, -0.25, -1.18), scale: 1.62 },
    ];
    const glowSprites = glowConfigs.map((config) => {
      const texture = createGlowTexture(config.color);
      const material = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: texture,
        opacity: config.opacity,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(config.position);
      sprite.scale.set(config.scale, config.scale, 1);
      stage.add(sprite);
      return { ...config, sprite };
    });

    const smokeConfigs = [
      { opacity: 0.18, phase: 0.6, position: new THREE.Vector3(0.0, 1.1, -0.74), rotation: -0.3, scaleX: 2.4, scaleY: 1.8 },
      { opacity: 0.16, phase: 1.9, position: new THREE.Vector3(0.12, 0.1, -0.66), rotation: 0.42, scaleX: 2.7, scaleY: 2.08 },
      { opacity: 0.15, phase: 3.2, position: new THREE.Vector3(-0.08, -1.18, -0.84), rotation: -0.72, scaleX: 2.18, scaleY: 1.72 },
      { opacity: 0.11, phase: 4.8, position: new THREE.Vector3(0.55, -0.34, -0.92), rotation: 0.18, scaleX: 1.9, scaleY: 1.3 },
    ];
    const smokeTexture = createSmokeTexture("#7de8ff", "#a77bff");
    const smokeSprites = smokeConfigs.map((config) => {
      const material = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: smokeTexture,
        opacity: config.opacity,
        rotation: config.rotation,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(config.position);
      sprite.scale.set(config.scaleX, config.scaleY, 1);
      stage.add(sprite);
      return { ...config, sprite };
    });

    // 参考 Active Theory /work 的视觉重点不是显式进度条，而是中心柱体和玻璃屏一起换面；
    // 这里保留隐藏的柱壳/线框作为历史兼容层，但真正可见的动效由下方椎骨柱体、油膜粒子和滚轮轨道驱动。
    const pillarShellGeometry = new THREE.CylinderGeometry(0.72, 0.72, 4.9, 96, 1, true);
    const pillarShellMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0x6fffe2,
      depthWrite: false,
      opacity: 0.012,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const pillarShell = new THREE.Mesh(pillarShellGeometry, pillarShellMaterial);
    pillarShell.visible = false;
    pillarGroup.add(pillarShell);

    const pillarCoreGeometry = new THREE.CylinderGeometry(0.18, 0.3, 5.8, 64, 1, true);
    const pillarCoreMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0x7fffe2,
      depthWrite: false,
      opacity: 0.024,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const pillarCore = new THREE.Mesh(pillarCoreGeometry, pillarCoreMaterial);
    pillarCore.visible = false;
    pillarGroup.add(pillarCore);

    const oilTexture = createOilSlickTexture();
    const referenceOilTexture = createReferenceOilFilmTexture();
    const referenceSpineSubjectMaskTexture = createReferenceSpineSubjectMaskTexture();
    const referenceSpineFieldTexture = new THREE.TextureLoader().load("/landing/reference-spine-field-wide-v67.png");
    const referenceSpineRimTexture = new THREE.TextureLoader().load("/landing/reference-spine-rim-wide-v67.png");
    const activeTheorySpineMatcapTexture = new THREE.TextureLoader().load(ACTIVE_THEORY_SPINE_MATCAP_PATH);
    const activeTheorySpineNormalTexture = new THREE.TextureLoader().load(ACTIVE_THEORY_SPINE_NORMAL_PATH);
    const activeTheoryWorkEnvTexture = new THREE.TextureLoader().load(ACTIVE_THEORY_WORK_ENV_PATH);
    const activeTheoryWorkNormalTexture = new THREE.TextureLoader().load(ACTIVE_THEORY_WORK_NORMAL_PATH);
    const activeTheoryWorkHogwartsThumbTexture = new THREE.TextureLoader().load(ACTIVE_THEORY_WORK_HOGWARTS_THUMB_PATH);
    const activeTheoryWorkHogwartsLogoTexture = new THREE.TextureLoader().load(ACTIVE_THEORY_WORK_HOGWARTS_LOGO_PATH);
    activeTheoryWorkHogwartsThumbTexture.colorSpace = THREE.SRGBColorSpace;
    activeTheoryWorkHogwartsThumbTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    activeTheoryWorkHogwartsLogoTexture.colorSpace = THREE.SRGBColorSpace;
    activeTheoryWorkHogwartsLogoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const activeTheorySpineBaseColorFallbackTexture = createSolidDataTexture(4, 7, 9);
    const activeTheorySpineMroFallbackTexture = createSolidDataTexture(255, 170, 255);
    const activeTheorySpineSourceTexturePromise = loadActiveTheorySpineKtx2Textures(renderer).catch(() => null);
    let activeTheorySpineBaseColorTexture: THREE.Texture = activeTheorySpineBaseColorFallbackTexture;
    let activeTheorySpineMroTexture: THREE.Texture = activeTheorySpineMroFallbackTexture;
    // 参考视频里的柱体默认并不是推进故事线，而是有细密的油膜/粒子呼吸。
    // 这里把用户提供 mp4 中同一柱体的短裁切做成 VideoTexture，只作为微弱动态材质层叠加到柱体组内；
    // 这样不会把整张网页截图当背景，也能避免单帧贴图看起来“死”和“不跟视频一个级别”。
    const referenceSpineMotionVideo = document.createElement("video");
    referenceSpineMotionVideo.autoplay = true;
    referenceSpineMotionVideo.loop = true;
    referenceSpineMotionVideo.muted = true;
    referenceSpineMotionVideo.playsInline = true;
    referenceSpineMotionVideo.preload = "auto";
    referenceSpineMotionVideo.src = "/landing/reference-spine-motion-v68.mp4";
    referenceSpineMotionVideo.playbackRate = 0.62;
    void referenceSpineMotionVideo.play().catch(() => undefined);
    const referenceSpineMotionTexture = new THREE.VideoTexture(referenceSpineMotionVideo);
    // v76 用更宽的源视频主体裁切保留参考柱体左侧真实骨节边缘；
    // 再叠加同帧动态 mask 和运行时有机 mask，避免宽裁切里的前景玻璃卡片重新变成矩形贴片。
    const referenceSpineSubjectVideo = document.createElement("video");
    referenceSpineSubjectVideo.autoplay = true;
    referenceSpineSubjectVideo.loop = true;
    referenceSpineSubjectVideo.muted = true;
    referenceSpineSubjectVideo.playsInline = true;
    referenceSpineSubjectVideo.preload = "auto";
    referenceSpineSubjectVideo.src = "/landing/reference-spine-subject-wide-v76.mp4";
    referenceSpineSubjectVideo.playbackRate = 0.62;
    void referenceSpineSubjectVideo.play().catch(() => undefined);
    const referenceSpineSubjectTexture = new THREE.VideoTexture(referenceSpineSubjectVideo);
    const referenceSpineSubjectMaskVideo = document.createElement("video");
    referenceSpineSubjectMaskVideo.autoplay = true;
    referenceSpineSubjectMaskVideo.loop = true;
    referenceSpineSubjectMaskVideo.muted = true;
    referenceSpineSubjectMaskVideo.playsInline = true;
    referenceSpineSubjectMaskVideo.preload = "auto";
    referenceSpineSubjectMaskVideo.src = "/landing/reference-spine-subject-mask-v76.mp4";
    referenceSpineSubjectMaskVideo.playbackRate = 0.62;
    void referenceSpineSubjectMaskVideo.play().catch(() => undefined);
    const referenceSpineSubjectDynamicMaskTexture = new THREE.VideoTexture(referenceSpineSubjectMaskVideo);
    const oilBumpTexture = createOilBumpTexture();
    const oilAlphaTexture = createOilAlphaTexture();
    const oilPatchTexture = createOilPatchTexture();
    oilTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    referenceOilTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    referenceSpineSubjectMaskTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    referenceSpineFieldTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    referenceSpineFieldTexture.colorSpace = THREE.SRGBColorSpace;
    referenceSpineRimTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    referenceSpineRimTexture.colorSpace = THREE.SRGBColorSpace;
    activeTheorySpineMatcapTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    activeTheorySpineMatcapTexture.colorSpace = THREE.SRGBColorSpace;
    activeTheorySpineNormalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    activeTheorySpineNormalTexture.wrapS = THREE.RepeatWrapping;
    activeTheorySpineNormalTexture.wrapT = THREE.RepeatWrapping;
    activeTheoryWorkEnvTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    activeTheoryWorkEnvTexture.colorSpace = THREE.SRGBColorSpace;
    activeTheoryWorkEnvTexture.wrapS = THREE.RepeatWrapping;
    activeTheoryWorkEnvTexture.wrapT = THREE.RepeatWrapping;
    activeTheoryWorkNormalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    activeTheoryWorkNormalTexture.wrapS = THREE.RepeatWrapping;
    activeTheoryWorkNormalTexture.wrapT = THREE.RepeatWrapping;
    activeTheorySpineBaseColorFallbackTexture.colorSpace = THREE.SRGBColorSpace;
    activeTheorySpineBaseColorFallbackTexture.wrapS = THREE.RepeatWrapping;
    activeTheorySpineBaseColorFallbackTexture.wrapT = THREE.RepeatWrapping;
    activeTheorySpineMroFallbackTexture.wrapS = THREE.RepeatWrapping;
    activeTheorySpineMroFallbackTexture.wrapT = THREE.RepeatWrapping;
    referenceSpineMotionTexture.colorSpace = THREE.SRGBColorSpace;
    referenceSpineMotionTexture.generateMipmaps = false;
    referenceSpineMotionTexture.magFilter = THREE.LinearFilter;
    referenceSpineMotionTexture.minFilter = THREE.LinearFilter;
    referenceSpineSubjectTexture.colorSpace = THREE.SRGBColorSpace;
    referenceSpineSubjectTexture.generateMipmaps = false;
    referenceSpineSubjectTexture.magFilter = THREE.LinearFilter;
    referenceSpineSubjectTexture.minFilter = THREE.LinearFilter;
    referenceSpineSubjectDynamicMaskTexture.generateMipmaps = false;
    referenceSpineSubjectDynamicMaskTexture.magFilter = THREE.LinearFilter;
    referenceSpineSubjectDynamicMaskTexture.minFilter = THREE.LinearFilter;
    oilBumpTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    oilAlphaTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    oilPatchTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const oilBaseMaterial = new THREE.MeshPhysicalMaterial({
      alphaMap: oilAlphaTexture,
      bumpMap: oilBumpTexture,
      bumpScale: 0.104,
      clearcoat: 0.32,
      clearcoatRoughness: 0.68,
      color: new THREE.Color("#242d2d"),
      emissive: new THREE.Color("#6e617a"),
      emissiveIntensity: 0.056,
      emissiveMap: oilTexture,
      envMapIntensity: 0.68,
      iridescence: 1,
      iridescenceIOR: 1.9,
      iridescenceThicknessRange: [110, 1720],
      map: oilTexture,
      metalness: 0.015,
      opacity: 0.82,
      roughness: 0.74,
      roughnessMap: oilBumpTexture,
      sheen: 0.5,
      sheenColor: new THREE.Color("#b59aff"),
      sheenRoughness: 0.82,
      specularColor: new THREE.Color("#c9eaff"),
      specularIntensity: 0.34,
      thickness: 0.82,
      transmission: 0.18,
      transparent: true,
    });

    const organicPalette = ["#6ee7ff", "#8e73ff", "#db5cff", "#ff6fc6", "#d7a261"];
    const organicMeshes: THREE.Mesh[] = [];
    const activeTheoryFlowerPointMaterial = createActiveTheoryFlowerPointMaterial();
    const activeTheorySpineInstances: Array<{
      basePosition: THREE.Vector3;
      baseRotation: THREE.Euler;
      baseScale: THREE.Vector3;
      highlight: THREE.Mesh;
      mesh: THREE.Mesh;
      phase: number;
    }> = [];
    let activeTheorySpineGeometry: THREE.BufferGeometry | null = null;
    let activeTheoryFlowerPointGeometry: THREE.BufferGeometry | null = null;
    let activeTheoryFlowerPointCloud: THREE.Points | null = null;
    let activeTheorySpineReady = false;
    let sceneDisposed = false;
    const makeOilMaterial = (accentIndex: number) => {
      const material = oilBaseMaterial.clone();
      material.emissive = new THREE.Color(organicPalette[accentIndex % organicPalette.length]);
      material.emissiveIntensity = 0.036 + (accentIndex % 4) * 0.006;
      material.color = new THREE.Color("#24302f");
      return material;
    };
    const makeCrownMaterial = (accentIndex: number) => {
      const material = oilBaseMaterial.clone();
      // 参考顶部骨片要承担明确剪影，不能继续套用主体 alphaMap；
      // 主体 alphaMap 会按旧椎骨 UV 把新挤出面吃得过透明，导致轮廓读不出来。
      material.alphaMap = null;
      material.blending = THREE.AdditiveBlending;
      material.color = new THREE.Color("#2a3231");
      material.depthTest = false;
      material.depthWrite = false;
      material.emissive = new THREE.Color(organicPalette[accentIndex % organicPalette.length]);
      material.emissiveIntensity = 0.22;
      material.envMapIntensity = 1.42;
      material.opacity = 0.92;
      material.roughness = 0.44;
      material.side = THREE.DoubleSide;
      material.specularIntensity = 0.72;
      material.transparent = true;
      return material;
    };
    const makeReferenceSpineMaterial = (accentIndex: number, opacity = 0.82) => {
      const material = oilBaseMaterial.clone();
      // 主柱必须像参考录屏那样“暗体里透出油膜”，不能继续用随机碎片的轻薄透明度。
      // 这里单独加重环境反射、clearcoat 和局部自发光，让规则骨节在默认静止帧里也有可读光影。
      material.alphaMap = null;
      material.bumpScale = 0.112;
      material.clearcoat = 0.92;
      material.clearcoatRoughness = 0.28;
      material.color = new THREE.Color("#080d10");
      material.emissive = new THREE.Color(organicPalette[accentIndex % organicPalette.length]);
      material.emissiveMap = referenceOilTexture;
      material.emissiveIntensity = 0.136 + (accentIndex % 3) * 0.018;
      material.envMapIntensity = 1.96;
      material.map = referenceOilTexture;
      material.metalness = 0.02;
      material.opacity = opacity;
      material.roughness = 0.32;
      material.sheen = 0.88;
      material.specularIntensity = 1.08;
      material.thickness = 1.12;
      material.transmission = 0.08;
      material.transparent = true;
      return material;
    };
    const makeSourceProfileMaterial = (accentIndex: number, opacity = 0.58) => {
      const material = oilBaseMaterial.clone();
      // 这层专门复刻参考视频里那根规整侧向骨柱的主剪影。
      // v55 的挤出多边形虽然能补形，但默认帧会露出平面切片；
      // 这里改回圆润湿润的 mesh 材质，让补形层只像骨体，不像贴片。
      material.alphaMap = null;
      material.bumpScale = 0.124;
      material.clearcoat = 0.94;
      material.clearcoatRoughness = 0.22;
      material.color = new THREE.Color("#030609");
      material.depthWrite = false;
      material.emissive = new THREE.Color(organicPalette[accentIndex % organicPalette.length]);
      material.emissiveMap = referenceOilTexture;
      material.emissiveIntensity = 0.15 + (accentIndex % 4) * 0.018;
      material.envMapIntensity = 2.12;
      material.map = referenceOilTexture;
      material.metalness = 0.026;
      material.opacity = opacity;
      material.roughness = 0.24;
      material.sheen = 0.92;
      material.side = THREE.DoubleSide;
      material.specularIntensity = 1.18;
      material.thickness = 1.34;
      material.transmission = 0.07;
      material.transparent = true;
      return material;
    };
    const cavityGeometry = new THREE.SphereGeometry(0.18, 24, 12);
    const cavityMaterial = new THREE.MeshPhysicalMaterial({
      clearcoat: 0.28,
      color: new THREE.Color("#010406"),
      emissive: new THREE.Color("#07101a"),
      emissiveIntensity: 0.018,
      envMapIntensity: 0.22,
      metalness: 0.08,
      opacity: 0.48,
      roughness: 0.9,
      transparent: true,
    });
    const deepCavityMaterial = new THREE.MeshPhysicalMaterial({
      clearcoat: 0.12,
      color: new THREE.Color("#020407"),
      depthWrite: false,
      emissive: new THREE.Color("#07131a"),
      emissiveIntensity: 0.014,
      envMapIntensity: 0.16,
      metalness: 0.02,
      opacity: 0.56,
      roughness: 1,
      transparent: true,
    });
    const cavityMeshes: THREE.Mesh[] = [];
    const vertebraSegments = Array.from({ length: 8 }, (_, chunkIndex) => {
      const group = new THREE.Group();
      const baseY = -2.7 + chunkIndex * 0.76;
      const phase = chunkIndex * 0.91;
      const massVariation = 0.98 + Math.sin(phase * 1.37) * 0.045;
      const sideBias = chunkIndex % 2 === 0 ? 1 : -1;
      const isTopExposedSegment = chunkIndex >= 6;
      const isBottomExposedSegment = chunkIndex <= 1;
      group.position.set(Math.sin(phase) * 0.026, baseY, Math.cos(phase * 0.8) * 0.026);
      group.rotation.set(0.028 * Math.sin(phase), sideBias * 0.06 + phase * 0.04, 0.034 * Math.cos(phase));
      pillarGroup.add(group);

      const meshes: THREE.Mesh[] = [];
      const exposedScale = isTopExposedSegment ? 0.78 : isBottomExposedSegment ? 1.18 : 1;
      const body = new THREE.Mesh(createVertebraBodyGeometry(chunkIndex), makeOilMaterial(chunkIndex));
      body.scale.set(
        (1.08 + (chunkIndex % 2) * 0.028) * massVariation * exposedScale,
        isTopExposedSegment ? 0.98 : isBottomExposedSegment ? 1.28 : 1.38,
        (1.0 + (chunkIndex % 2) * 0.032) * (1.02 - Math.sin(phase) * 0.018) * exposedScale
      );
      group.add(body);
      meshes.push(body);

      const leftProcess = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 12), makeOilMaterial(chunkIndex + 1));
      leftProcess.position.set(-0.43 * massVariation, -0.02, -0.08 - Math.sin(phase) * 0.026);
      leftProcess.rotation.set(0.18 + Math.sin(phase) * 0.05, 0.18 + sideBias * 0.04, 0.42 + Math.cos(phase) * 0.06);
      leftProcess.scale.set(0.68 * massVariation, 0.62, 0.46);
      group.add(leftProcess);
      meshes.push(leftProcess);

      const rightProcess = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 24), makeOilMaterial(chunkIndex + 2));
      rightProcess.position.set(0.42 * (2 - massVariation), 0.02, 0.06 + Math.cos(phase) * 0.026);
      rightProcess.rotation.set(-0.18 + Math.cos(phase) * 0.05, -0.18 + sideBias * 0.04, -0.42 + Math.sin(phase) * 0.06);
      rightProcess.scale.set(0.64 * (2 - massVariation), 0.6, 0.44);
      group.add(rightProcess);
      meshes.push(rightProcess);

      const rearSpike = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 36), makeOilMaterial(chunkIndex + 3));
      rearSpike.position.set(Math.sin(phase) * 0.026, -0.012, -0.4);
      rearSpike.rotation.set(0.1 * Math.sin(phase), Math.PI / 2 + 0.12 + sideBias * 0.04, 0.14 * Math.cos(phase));
      rearSpike.scale.set(0.8, 0.64, 0.38);
      group.add(rearSpike);
      meshes.push(rearSpike);

      const lowerKnuckle = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 48), makeOilMaterial(chunkIndex + 4));
      lowerKnuckle.position.set(-0.16 * sideBias + Math.sin(phase) * 0.028, -0.18, 0.24);
      lowerKnuckle.rotation.set(0.34, -0.24 * sideBias, 0.44 * sideBias);
      lowerKnuckle.scale.set(0.32, 0.44, 0.28);
      group.add(lowerKnuckle);
      meshes.push(lowerKnuckle);

      const upperKnuckle = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 60), makeOilMaterial(chunkIndex + 5));
      upperKnuckle.position.set(0.16 * sideBias + Math.cos(phase) * 0.028, 0.18, -0.24);
      upperKnuckle.rotation.set(-0.28, 0.18 * sideBias, -0.4 * sideBias);
      upperKnuckle.scale.set(0.32, 0.42, 0.27);
      group.add(upperKnuckle);
      meshes.push(upperKnuckle);

      for (let chipIndex = 0; chipIndex < 6; chipIndex += 1) {
        const chip = new THREE.Mesh(createBoneChipGeometry(chunkIndex * 7 + chipIndex), makeOilMaterial(chunkIndex + chipIndex + 6));
        const chipAngle = phase + chipIndex * 1.18 + (chipIndex % 2 === 0 ? 0.36 : -0.18);
        const chipRadius = 0.36 + (chipIndex % 3) * 0.048;
        chip.position.set(
          Math.cos(chipAngle) * chipRadius * (chipIndex === 2 ? 0.72 : 1),
          -0.2 + chipIndex * 0.1 + Math.sin(chipAngle) * 0.035,
          Math.sin(chipAngle) * 0.28 + (chipIndex === 1 ? 0.22 : -0.04)
        );
        chip.rotation.set(0.36 + Math.sin(chipAngle) * 0.5, -chipAngle + Math.PI / 2, 0.42 * sideBias + Math.cos(chipAngle) * 0.34);
        chip.scale.set(0.52 + (chipIndex % 2) * 0.16, 0.76 + (chipIndex % 3) * 0.14, 0.64);
        group.add(chip);
        meshes.push(chip);
      }

      if (chunkIndex >= 5 || chunkIndex <= 1) {
        const crownConfigs = [
          { angle: 0.08, x: 0.6 * sideBias, y: 0.2, z: 0.2, scaleX: 1.06, scaleY: 1.02, tilt: 0.78 * sideBias },
          { angle: 1.74, x: -0.58 * sideBias, y: -0.02, z: 0.24, scaleX: 0.96, scaleY: 0.92, tilt: -0.68 * sideBias },
          { angle: -1.1, x: 0.16 * sideBias, y: -0.26, z: -0.12, scaleX: 0.76, scaleY: 0.84, tilt: 0.5 * sideBias },
        ];

        // 录屏里的柱体上下露出部分有更大的侧向骨片，轮廓比中段更“张开”。
        // 这里只在会露出卡片上下边缘的段落加大骨片，避免整根柱体变成杂乱碎片堆。
        crownConfigs.forEach((config, crownIndex) => {
          const crown = new THREE.Mesh(createBoneChipGeometry(chunkIndex * 23 + crownIndex + 160), makeOilMaterial(chunkIndex + crownIndex + 12));
          crown.position.set(config.x + Math.sin(phase + crownIndex) * 0.04, config.y, config.z + Math.cos(phase + crownIndex) * 0.03);
          crown.rotation.set(0.48 + Math.sin(config.angle + phase) * 0.34, -config.angle + Math.PI / 2, config.tilt);
          crown.scale.set(config.scaleX, config.scaleY, 0.72);
          group.add(crown);
          meshes.push(crown);
        });
      }

      // 参考柱体的“高级感”很大一部分来自黑色凹洞和油膜边缘，而不是纯亮面块。
      // 不做布尔切割，改用压扁的暗色椭球贴在骨节前侧，形成从当前视角可读的凹陷阴影。
      for (let cavityIndex = 0; cavityIndex < 3; cavityIndex += 1) {
        const cavity = new THREE.Mesh(cavityGeometry, cavityMaterial);
        const cavityPhase = phase + cavityIndex * 1.6;
        cavity.position.set(
          (cavityIndex === 0 ? -0.14 : cavityIndex === 1 ? 0.16 : 0.02) * sideBias + Math.sin(cavityPhase) * 0.04,
          -0.1 + cavityIndex * 0.105,
          0.27 + Math.cos(cavityPhase) * 0.04 - (cavityIndex === 2 ? 0.16 : 0)
        );
        cavity.rotation.set(0.28 + Math.sin(cavityPhase) * 0.18, sideBias * (0.32 + cavityIndex * 0.12), Math.cos(cavityPhase) * 0.7);
        cavity.scale.set(0.44 + cavityIndex * 0.09, 0.16 + cavityIndex * 0.04, 0.07);
        group.add(cavity);
        cavityMeshes.push(cavity);
      }

      if (chunkIndex >= 6 || chunkIndex <= 1) {
        const shadowMouth = new THREE.Mesh(cavityGeometry, cavityMaterial);
        shadowMouth.position.set(0.02 * sideBias, chunkIndex >= 6 ? 0.08 : -0.06, 0.35);
        shadowMouth.rotation.set(0.24, sideBias * 0.22, Math.sin(phase) * 0.34);
        shadowMouth.scale.set(0.92, 0.32, 0.08);
        group.add(shadowMouth);
        cavityMeshes.push(shadowMouth);
      }

      if (isTopExposedSegment) {
        // 参考图顶部不是一大团厚重紫黑体块，而是少量骨片围绕黑腔展开；
        // 旧随机骨节保留为背后的体积阴影，但必须降权，否则前景参考骨片再怎么加都会被吞掉。
        meshes.forEach((mesh, meshIndex) => {
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          material.depthWrite = false;
          material.emissiveIntensity *= 0.55;
          material.opacity = meshIndex === 0 ? 0.34 : 0.24;
          material.transparent = true;
        });
      }

      meshes.forEach((mesh) => organicMeshes.push(mesh));
      return { baseY, group, massVariation, meshes, phase, sideBias };
    });
    vertebraSegments.forEach((segment) => {
      segment.group.visible = true;
      // v49 对照参考后发现，旧随机骨节层会在主柱外侧形成过多不规则尖刺；
      // 参考视频的主体更规整，随机层只能做背后暗体积，不能继续和新主脊柱争抢轮廓。
      segment.meshes.forEach((mesh, meshIndex) => {
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        material.depthWrite = false;
        material.emissiveIntensity *= 0.34;
        material.envMapIntensity *= 0.42;
        material.opacity = meshIndex === 0 ? 0.12 : 0.075;
        material.transparent = true;
        mesh.renderOrder = 1;
      });
    });

    const referenceStackSegments: Array<{
      body: THREE.Mesh;
      group: THREE.Group;
      lobeA: THREE.Mesh;
      lobeB: THREE.Mesh;
      mouth: THREE.Mesh;
      phase: number;
      y: number;
    }> = [];
    Array.from({ length: 10 }, (_, stackIndex) => {
      const group = new THREE.Group();
      const phase = stackIndex * 0.67;
      const y = -3.08 + stackIndex * 0.66;
      const side = 1;
      const sideProfile = 0.32 + Math.sin(phase) * 0.05;
      group.position.set(0.06 + Math.sin(phase) * 0.034, y, 0.5 + Math.cos(phase) * 0.022);
      group.rotation.set(0.06 * Math.sin(phase), sideProfile, 0.04 * Math.cos(phase));
      group.scale.set(1.02, 1.0, 0.92);
      pillarGroup.add(group);

      // 这条主柱负责对齐参考视频的侧向脊柱轮廓：节距更大，主骨块偏扁，侧突基本统一向左伸出。
      // 参考不是正面均匀串珠，若继续左右交替会显得像装饰柱而不是录屏里的脊柱雕塑。
      const body = new THREE.Mesh(createReferenceVertebraCoreGeometry(stackIndex + 96), makeReferenceSpineMaterial(stackIndex, 0.11));
      body.position.set(0.08, 0, 0.02);
      body.rotation.set(0.02 * Math.sin(phase), 0.08, -0.02 * Math.cos(phase));
      body.scale.set(1.22 + (stackIndex % 3) * 0.035, 0.92, 0.74);
      body.renderOrder = 5;
      group.add(body);

      const lobeA = new THREE.Mesh(createReferenceProcessGeometry(stackIndex + 140), makeReferenceSpineMaterial(stackIndex + 2, 0.12));
      lobeA.position.set(-0.5 * side + Math.sin(phase) * 0.035, -0.06, 0.02);
      lobeA.rotation.set(0.18, 0.16 * side, 0.28 * side);
      lobeA.scale.set(0.88, 0.72, 0.58);
      lobeA.renderOrder = 5;
      group.add(lobeA);

      const lobeB = new THREE.Mesh(createReferenceProcessGeometry(stackIndex + 168), makeReferenceSpineMaterial(stackIndex + 3, 0.07));
      lobeB.position.set(-0.28 * side + Math.cos(phase) * 0.03, -0.2, -0.16);
      lobeB.rotation.set(-0.1, -0.08 * side, 0.12 * side);
      lobeB.scale.set(0.42, 0.48, 0.42);
      lobeB.renderOrder = 4;
      group.add(lobeB);

      const mouth = new THREE.Mesh(cavityGeometry, deepCavityMaterial.clone());
      const mouthMaterial = mouth.material as THREE.MeshPhysicalMaterial;
      mouthMaterial.depthWrite = false;
      mouthMaterial.opacity = 0.48;
      mouth.position.set(-0.12 * side, 0.02, 0.42);
      mouth.rotation.set(0.16, 0.24 * side, 0.14 * side);
      mouth.scale.set(0.7, 0.15, 0.05);
      mouth.renderOrder = 6;
      group.add(mouth);

      [body, lobeA, lobeB].forEach((mesh) => organicMeshes.push(mesh));
      cavityMeshes.push(mouth);
      referenceStackSegments.push({ body, group, lobeA, lobeB, mouth, phase, y });
      return group;
    });

    const sourceProfileSegments: Array<{
      basePosition: THREE.Vector3;
      baseRotation: THREE.Euler;
      baseScale: THREE.Vector3;
      group: THREE.Group;
      processBlade: THREE.Mesh;
      lowerProcess: THREE.Mesh;
      notch: THREE.Mesh;
      phase: number;
      processRoot: THREE.Mesh;
      sideBody: THREE.Mesh;
      sideProcess: THREE.Mesh;
    }> = [];
    const sourceProfileConfigs = Array.from({ length: 10 }, (_, segmentIndex) => {
      const phase = segmentIndex * 0.74;
      const y = 2.48 - segmentIndex * 0.56;
      const isOuter = segmentIndex % 2 === 0;
      return {
        accent: 96 + segmentIndex,
        phase,
        position: new THREE.Vector3(-0.06 + Math.sin(phase) * 0.014, y, 0.84 + Math.cos(phase) * 0.022),
        rotation: new THREE.Euler(0.07 + Math.sin(phase) * 0.014, -0.02 + Math.cos(phase) * 0.016, -0.012 + Math.sin(phase) * 0.014),
        scale: new THREE.Vector3(isOuter ? 0.84 : 0.78, 0.82 + (segmentIndex % 3) * 0.018, 0.88),
      };
    });

    sourceProfileConfigs.forEach((config, segmentIndex) => {
      const group = new THREE.Group();
      group.position.copy(config.position);
      group.rotation.copy(config.rotation);
      group.scale.copy(config.scale);
      pillarGroup.add(group);
      const edgeFade = segmentIndex <= 1 ? 0.56 : segmentIndex >= sourceProfileConfigs.length - 2 ? 0.68 : 1;

      // 参考视频里的柱体是“一个整体侧影被故事卡片切开”，不是每节独立朝不同方向浮动。
      // v58 继续把参考层从“随机骨节”收敛成专用规则骨块：
      // 主体用更平滑的椎骨核心，横突用圆钝 club 形扫掠体，避免默认帧出现鱼鳞状尖刺。
      const sideBody = new THREE.Mesh(createReferenceVertebraCoreGeometry(config.accent + 220), makeSourceProfileMaterial(config.accent, 0.26 * edgeFade));
      const sideBodyMaterial = sideBody.material as THREE.MeshPhysicalMaterial;
      sideBodyMaterial.envMapIntensity *= edgeFade;
      sideBodyMaterial.specularIntensity *= edgeFade;
      sideBody.position.set(0.16, 0.02, 0.0);
      sideBody.rotation.set(0.02, 0.16, segmentIndex % 2 === 0 ? 0.02 : -0.02);
      sideBody.scale.set(0.98, 0.58, 0.54);
      sideBody.renderOrder = 6;
      group.add(sideBody);

      // 参考里横突不是从主柱边缘硬插出来，而是有一段湿润的根部团块把主体和侧突糊在一起。
      // 这块小骨根专门解决 v59 仍然偏“程序化拼接”的问题，让侧突根部更像同一块扫描/雕塑模型。
      const processRoot = new THREE.Mesh(createReferenceVertebraCoreGeometry(config.accent + 280), makeSourceProfileMaterial(config.accent + 1, 0.2 * edgeFade));
      const processRootMaterial = processRoot.material as THREE.MeshPhysicalMaterial;
      processRootMaterial.envMapIntensity *= edgeFade;
      processRootMaterial.specularIntensity *= edgeFade;
      processRoot.position.set(-0.16, -0.02, 0.02);
      processRoot.rotation.set(0.02, 0.1, segmentIndex % 2 === 0 ? 0.08 : -0.06);
      processRoot.scale.set(0.68, 0.42, 0.36);
      processRoot.renderOrder = 6.5;
      group.add(processRoot);

      const sideProcess = new THREE.Mesh(createReferenceProcessGeometry(config.accent + 240), makeSourceProfileMaterial(config.accent + 2, 0.22 * edgeFade));
      const sideProcessMaterial = sideProcess.material as THREE.MeshPhysicalMaterial;
      sideProcessMaterial.envMapIntensity *= edgeFade;
      sideProcessMaterial.specularIntensity *= edgeFade;
      sideProcess.position.set(-0.42, -0.04, 0.04);
      sideProcess.rotation.set(0.06, 0.2, 0.08);
      sideProcess.scale.set(0.84, 0.96, 0.72);
      sideProcess.renderOrder = 7;
      group.add(sideProcess);

      // 参考柱体的边缘有扫描资产一样的片状硬轮廓；纯圆管横突会变成“蓝紫串珠”。
      // 这层扁平骨片贴在横突外侧，只负责远景剪影和红蓝折光，不能替代主体体积。
      const processBlade = new THREE.Mesh(
        createReferenceSpineShardGeometry(
          [
            [-0.36, 0.1],
            [-0.08, 0.24],
            [0.28, 0.14],
            [0.34, -0.06],
            [0.08, -0.2],
            [-0.34, -0.12],
          ],
          0.045
        ),
        makeSourceProfileMaterial(config.accent + 3, 0.24)
      );
      const processBladeMaterial = processBlade.material as THREE.MeshPhysicalMaterial;
      // 扁平骨片只应该提供参考里的暗色硬剪影；如果沿用高 clearcoat/envMap，
      // 顶部会出现白色多边形高光，反而暴露程序化贴片感。
      processBladeMaterial.clearcoat = 0.38;
      processBladeMaterial.clearcoatRoughness = 0.68;
      processBladeMaterial.color = new THREE.Color("#020407");
      processBladeMaterial.emissiveIntensity = 0.052;
      processBladeMaterial.envMapIntensity = 0.66;
      processBladeMaterial.opacity = (segmentIndex <= 1 ? 0.06 : 0.14) * edgeFade;
      processBladeMaterial.roughness = 0.68;
      processBladeMaterial.specularIntensity = 0.34;
      processBlade.position.set(-0.5, -0.02, 0.1);
      processBlade.rotation.set(0.12, -0.04, segmentIndex % 2 === 0 ? 0.22 : -0.08);
      processBlade.scale.set(0.74, 0.66, 1);
      processBlade.renderOrder = 7.5;
      group.add(processBlade);

      const lowerProcess = new THREE.Mesh(createReferenceProcessGeometry(config.accent + 260), makeSourceProfileMaterial(config.accent + 4, 0.14 * edgeFade));
      const lowerProcessMaterial = lowerProcess.material as THREE.MeshPhysicalMaterial;
      lowerProcessMaterial.envMapIntensity *= edgeFade;
      lowerProcessMaterial.specularIntensity *= edgeFade;
      lowerProcess.position.set(-0.22, -0.24, -0.04);
      lowerProcess.rotation.set(-0.06, -0.06, -0.14);
      lowerProcess.scale.set(0.46, 0.64, 0.44);
      lowerProcess.renderOrder = 5;
      group.add(lowerProcess);

      const notch = new THREE.Mesh(cavityGeometry, deepCavityMaterial.clone());
      const notchMaterial = notch.material as THREE.MeshPhysicalMaterial;
      notchMaterial.depthWrite = false;
      notchMaterial.opacity = 0.46;
      notch.position.set(0.08, 0.04, 0.24);
      notch.rotation.set(0.16, 0.18, segmentIndex % 2 === 0 ? -0.12 : 0.1);
      notch.scale.set(0.46, 0.13, 0.05);
      notch.renderOrder = 7;
      group.add(notch);

      [sideBody, processRoot, sideProcess, processBlade, lowerProcess].forEach((mesh) => organicMeshes.push(mesh));
      cavityMeshes.push(notch);
      sourceProfileSegments.push({
        basePosition: config.position.clone(),
        baseRotation: config.rotation.clone(),
        baseScale: config.scale.clone(),
        group,
        processBlade,
        lowerProcess,
        notch,
        phase: config.phase,
        processRoot,
        sideBody,
        sideProcess,
      });
    });

    void loadActiveTheoryDracoGeometry(ACTIVE_THEORY_FLOWER_SPINE_POINT_CLOUD_PATH)
      .then((sourceGeometry) => {
        if (sceneDisposed) {
          sourceGeometry.dispose();
          return;
        }

        const pointGeometry = buildActiveTheoryFlowerPointGeometry(sourceGeometry);

        if (sceneDisposed) {
          pointGeometry.dispose();
          return;
        }

        activeTheoryFlowerPointGeometry = pointGeometry;
        const pointCloud = new THREE.Points(pointGeometry, activeTheoryFlowerPointMaterial);
        // 源站 Work 场景的 flower 层是固定在柱体纵轴上的点云体积层；
        // 它只跟随柱体本地坐标和 shader 的 scroll 相位，不参与卡片轨道的 x/z 位移，
        // 这样用户滚轮向下时看到的是“柱体从上到下穿过”，而不是整根柱子被拖到左右两侧。
        pointCloud.position.set(-0.02, 0.02, 0.82);
        pointCloud.rotation.set(-0.04, THREE.MathUtils.degToRad(100), 0.02);
        pointCloud.scale.set(1.06, 1.08, 0.92);
        pointCloud.renderOrder = 8.6;
        pillarGroup.add(pointCloud);
        activeTheoryFlowerPointCloud = pointCloud;
      })
      .catch(() => {
        // 点云是高保真视觉层，不参与登录、跳转或工作台入口。
        // 失败时继续使用已有柱体/视频层，避免视觉资产缺失影响未登录用户进入系统。
      });

    void loadActiveTheoryDracoGeometry(ACTIVE_THEORY_SPINE_GEOMETRY_PATH)
      .then(async (sourceGeometry) => {
        if (sceneDisposed) {
          sourceGeometry.dispose();
          return;
        }

        const sourceTextures = await activeTheorySpineSourceTexturePromise;
        if (sourceTextures) {
          [activeTheorySpineBaseColorTexture, activeTheorySpineMroTexture] = sourceTextures;
        }

        if (sceneDisposed) {
          sourceGeometry.dispose();
          sourceTextures?.forEach((texture) => texture.dispose());
          return;
        }

        activeTheorySpineGeometry = sourceGeometry;
        activeTheorySpineReady = true;

        // 参考 Work 场景的 `spine.bin` 只是一枚骨节资产，源站通过 `SpineInstancer` 把它实例化成中轴。
        // 这里不再继续堆手写随机几何，而是把同源 DRACO mesh 复制成一串规则骨节；
        // 这样默认帧的柱体轮廓、滚动时的换面和参考 mp4 的结构关系会更接近。
        // 源站真实逻辑是 40 个实例、每节 y 方向错开 0.65、每节 y 轴旋转 0.4 弧度。
        // 上一版只放 17 节且间距过密，虽然可见高度够了，但顶部会变成一根密集光柱；
        // 这里按镜像里的 SpineInstancer 节奏完整复制，超出视口的节段留作滚动/旋转时的连续体积。
        sourceProfileSegments.forEach((segment) => {
          [segment.sideBody, segment.processRoot, segment.sideProcess, segment.processBlade, segment.lowerProcess].forEach((mesh) => {
            const fallbackMaterial = mesh.material as THREE.MeshPhysicalMaterial;
            fallbackMaterial.opacity = Math.min(fallbackMaterial.opacity, 0.055);
            fallbackMaterial.envMapIntensity *= 0.38;
            fallbackMaterial.emissiveIntensity *= 0.42;
          });
          const notchMaterial = segment.notch.material as THREE.MeshPhysicalMaterial;
          notchMaterial.opacity = Math.min(notchMaterial.opacity, 0.16);
        });
        const sourceInstanceCount = 40;
        Array.from({ length: sourceInstanceCount }, (_, instanceIndex) => {
          const phase = instanceIndex * 0.4;
          const material = createSourceSpineShaderMaterial({
            accent: new THREE.Color(organicPalette[(instanceIndex + activeIndexRef.current) % organicPalette.length]).lerp(new THREE.Color("#d1fff4"), 0.32),
            baseColorTexture: activeTheorySpineBaseColorTexture,
            matcapTexture: activeTheorySpineMatcapTexture,
            mroTexture: activeTheorySpineMroTexture,
            normalTexture: activeTheorySpineNormalTexture,
            opacity: 0.54,
            phase,
            refractionTexture: referenceSpineMotionTexture,
          });

          const mesh = new THREE.Mesh(sourceGeometry, material);
          const highlightMaterial = new THREE.MeshMatcapMaterial({
            // 源站 SpineShader 会把 refraction/matcap/normal 混在一起输出，直接换成普通物理材质会缺少那种湿润的彩色边缘。
            // 这层同几何 matcap 外壳只负责提供薄薄的油膜反光，不参与深度写入，避免把主体骨节涂成一整根亮柱。
            blending: THREE.AdditiveBlending,
            color: new THREE.Color("#94ecff"),
            depthTest: false,
            depthWrite: false,
            matcap: activeTheorySpineMatcapTexture,
            opacity: 0.065,
            side: THREE.DoubleSide,
            transparent: true,
          });
          const highlight = new THREE.Mesh(sourceGeometry, highlightMaterial);
          const basePosition = new THREE.Vector3(0, 4 - instanceIndex * 0.65, 1.1);
          const baseRotation = new THREE.Euler(0.08, instanceIndex * 0.4, 0.02);
          // 镜像里的 `MESH_Element_5_Workscale` 是 [3.5, 3.5, 3.5]，说明源站脊柱不是细柱；
          // 我们不能直接套 3.5，否则会压住登录入口，但需要比旧版更厚，才能接近参考里的规则实体截面。
          const baseScale = new THREE.Vector3(2.04, 1.58, 1.82);
          mesh.position.copy(basePosition);
          mesh.rotation.copy(baseRotation);
          mesh.scale.copy(baseScale);
          mesh.renderOrder = 7.9;
          highlight.position.copy(basePosition);
          highlight.rotation.copy(baseRotation);
          highlight.scale.copy(baseScale).multiplyScalar(1.014);
          highlight.renderOrder = 8.08;
          pillarGroup.add(mesh);
          pillarGroup.add(highlight);
          activeTheorySpineInstances.push({ basePosition, baseRotation, baseScale, highlight, mesh, phase });
          organicMeshes.push(mesh);
          organicMeshes.push(highlight);
        });
      })
      .catch(() => {
        // 几何恢复失败时只降级为现有程序化柱体；登录页不能因为视觉资产加载失败而影响用户进入系统。
      });

    const exposedHeroShapes = [
      { accent: 18, position: new THREE.Vector3(-0.04, 2.3, 0.2), rotation: new THREE.Euler(0.14, -0.12, 0.02), scale: new THREE.Vector3(1.12, 1.02, 0.9) },
      { accent: 22, position: new THREE.Vector3(0.02, -2.34, 0.28), rotation: new THREE.Euler(-0.12, 0.22, -0.1), scale: new THREE.Vector3(1.78, 0.9, 1.22) },
    ];
    exposedHeroShapes.forEach((config, shapeIndex) => {
      // 参考画面里卡片上下露出的不是细碎串珠，而是被玻璃遮掉中段后的“大块椎骨切面”。
      // 这里额外放两块跟随柱体旋转的主骨块，专门负责第一屏构图的上下轮廓，不影响滚动故事逻辑。
      const heroShape = new THREE.Mesh(createVertebraBodyGeometry(config.accent), makeOilMaterial(config.accent));
      const heroMaterial = heroShape.material as THREE.MeshPhysicalMaterial;
      heroMaterial.emissiveIntensity = 0.064;
      heroMaterial.envMapIntensity = 0.66;
      if (shapeIndex === 0) {
        heroMaterial.depthWrite = false;
        heroMaterial.opacity = 0.44;
      }
      heroMaterial.specularIntensity = 0.3;
      heroShape.position.copy(config.position);
      heroShape.rotation.copy(config.rotation);
      heroShape.scale.copy(config.scale);
      heroShape.renderOrder = 4;
      pillarGroup.add(heroShape);
      organicMeshes.push(heroShape);

      const heroMouth = new THREE.Mesh(cavityGeometry, deepCavityMaterial);
      heroMouth.position.set(config.position.x + (shapeIndex === 0 ? 0.0 : -0.04), config.position.y + (shapeIndex === 0 ? -0.02 : -0.02), config.position.z + (shapeIndex === 0 ? 0.48 : 0.28));
      heroMouth.rotation.set(0.18, shapeIndex === 0 ? -0.16 : 0.24, shapeIndex === 0 ? 0.02 : -0.08);
      heroMouth.scale.set(shapeIndex === 0 ? 0.58 : 1.0, shapeIndex === 0 ? 1.18 : 0.34, 0.08);
      pillarGroup.add(heroMouth);
      cavityMeshes.push(heroMouth);
    });

    [
      { accent: 31, position: new THREE.Vector3(-0.5, 2.2, 0.38), rotation: new THREE.Euler(0.28, 0.34, 0.5), scale: new THREE.Vector3(0.58, 0.72, 0.58) },
      { accent: 32, position: new THREE.Vector3(0.56, 2.14, 0.54), rotation: new THREE.Euler(0.12, -0.22, -0.06), scale: new THREE.Vector3(0.6, 0.56, 0.52) },
      { accent: 33, position: new THREE.Vector3(-0.56, -2.36, 0.38), rotation: new THREE.Euler(-0.18, 0.42, 0.62), scale: new THREE.Vector3(0.72, 0.78, 0.62) },
    ].forEach((config) => {
      // 卡片上下露出的横向骨片也要和参考主柱保持同一种圆钝语言；
      // 如果继续使用旧噪声 lobe，会在第一屏边缘出现不属于参考的尖刺轮廓。
      const wing = new THREE.Mesh(createReferenceProcessGeometry(config.accent), makeOilMaterial(config.accent));
      const wingMaterial = wing.material as THREE.MeshPhysicalMaterial;
      wingMaterial.emissiveIntensity = 0.044;
      wingMaterial.envMapIntensity = 0.6;
      if (config.accent !== 33) {
        wingMaterial.depthWrite = false;
        wingMaterial.opacity = 0.34;
      }
      wing.position.copy(config.position);
      wing.rotation.copy(config.rotation);
      wing.scale.copy(config.scale);
      pillarGroup.add(wing);
      organicMeshes.push(wing);
    });

    [
      { position: new THREE.Vector3(-0.28, 2.42, 0.58), rotation: new THREE.Euler(0.12, 0.18, -0.16), scale: new THREE.Vector3(0.42, 0.12, 0.04) },
      { position: new THREE.Vector3(0.22, 2.16, 0.6), rotation: new THREE.Euler(0.18, -0.2, 0.16), scale: new THREE.Vector3(0.36, 0.12, 0.04) },
      { position: new THREE.Vector3(-0.06, 1.98, 0.62), rotation: new THREE.Euler(0.22, 0.08, -0.12), scale: new THREE.Vector3(0.34, 0.1, 0.035) },
    ].forEach((config) => {
      // 参考柱体上方最有辨识度的是“黑色中空洞”，不是单纯暗色材质。
      // 黑洞必须藏在油膜体块里，不能像单独贴上去的黑色碎片；因此用压扁椭球埋到前侧深处。
      const hollow = new THREE.Mesh(cavityGeometry, deepCavityMaterial);
      hollow.position.copy(config.position);
      hollow.rotation.copy(config.rotation);
      hollow.scale.copy(config.scale);
      hollow.renderOrder = 8;
      pillarGroup.add(hollow);
      cavityMeshes.push(hollow);
    });

    [
      { accent: 41, position: new THREE.Vector3(0.68, 2.12, 0.78), rotation: new THREE.Euler(0.1, -0.18, -0.02), scale: new THREE.Vector3(0.56, 0.68, 0.5) },
      { accent: 42, position: new THREE.Vector3(-0.48, 2.08, 0.62), rotation: new THREE.Euler(0.2, 0.44, 0.42), scale: new THREE.Vector3(0.48, 0.62, 0.48) },
      { accent: 43, position: new THREE.Vector3(0.02, 2.0, 0.9), rotation: new THREE.Euler(0.42, -0.08, 0.02), scale: new THREE.Vector3(0.32, 0.56, 0.42) },
    ].forEach((config) => {
      // 右侧长骨片和下方小凸起决定参考图的上缘剪影；
      // v58 开始不再用尖噪声 lobe 做前景横片，统一改成圆钝骨突，减少用户指出的“跟参考不是一个东西”的碎片感。
      const fin = new THREE.Mesh(createReferenceProcessGeometry(config.accent), makeOilMaterial(config.accent));
      const finMaterial = fin.material as THREE.MeshPhysicalMaterial;
      finMaterial.emissiveIntensity = 0.052;
      finMaterial.envMapIntensity = 0.72;
      finMaterial.depthWrite = false;
      finMaterial.opacity = 0.34;
      fin.position.copy(config.position);
      fin.rotation.copy(config.rotation);
      fin.scale.copy(config.scale);
      pillarGroup.add(fin);
      organicMeshes.push(fin);
    });

    [
      { accent: 44, position: new THREE.Vector3(0.0, 2.02, 1.08), rotation: new THREE.Euler(0.28, -0.08, 0.12), scale: new THREE.Vector3(0.36, 0.56, 0.36) },
      { accent: 45, position: new THREE.Vector3(-0.28, 2.3, 1.02), rotation: new THREE.Euler(0.36, 0.16, -0.22), scale: new THREE.Vector3(0.34, 0.38, 0.3) },
      { accent: 46, position: new THREE.Vector3(0.36, 2.38, 1.0), rotation: new THREE.Euler(0.24, -0.18, 0.18), scale: new THREE.Vector3(0.28, 0.32, 0.26) },
    ].forEach((config) => {
      // 参考洞口下沿有几颗高亮的蓝紫/青色油膜结节，能把黑洞从一团黑色里“抠”出来。
      // 这里补两个前景小骨点，位置跟随柱体旋转，默认只做微弱光晕，不承担故事文案。
      const bead = new THREE.Mesh(createOrganicLobeGeometry(config.accent), makeOilMaterial(config.accent));
      const beadMaterial = bead.material as THREE.MeshPhysicalMaterial;
      beadMaterial.emissiveIntensity = 0.08;
      beadMaterial.envMapIntensity = 0.84;
      bead.position.copy(config.position);
      bead.rotation.copy(config.rotation);
      bead.scale.copy(config.scale);
      bead.renderOrder = 10;
      pillarGroup.add(bead);
      organicMeshes.push(bead);
    });

    const topCavityMaterial = deepCavityMaterial.clone();
    topCavityMaterial.color = new THREE.Color("#010204");
    topCavityMaterial.depthTest = false;
    topCavityMaterial.depthWrite = false;
    topCavityMaterial.emissive = new THREE.Color("#02080e");
    topCavityMaterial.emissiveIntensity = 0.018;
    topCavityMaterial.opacity = 0.88;
    const topCavity = new THREE.Mesh(cavityGeometry, topCavityMaterial);
    topCavity.position.set(0.02, 2.52, 1.64);
    topCavity.rotation.set(0.18, -0.05, -0.04);
    topCavity.scale.set(0.58, 1.86, 0.08);
    topCavity.renderOrder = 42;
    pillarGroup.add(topCavity);
    cavityMeshes.push(topCavity);

    const topCavitySlitMaterial = new THREE.MeshBasicMaterial({
      color: 0x020508,
      depthTest: false,
      depthWrite: false,
      opacity: 0.38,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const topCavitySlit = new THREE.Mesh(
      createReferenceSpineShardGeometry(
        [
          [-0.1, 0.44],
          [0.12, 0.38],
          [0.16, 0.08],
          [0.1, -0.34],
          [-0.04, -0.46],
          [-0.16, -0.26],
          [-0.14, 0.22],
        ],
        0.035
      ),
      topCavitySlitMaterial
    );
    topCavitySlit.position.set(-0.02, 2.48, 1.78);
    topCavitySlit.rotation.set(0.2, -0.04, -0.04);
    topCavitySlit.scale.set(0.46, 0.6, 1);
    topCavitySlit.renderOrder = 48;
    pillarGroup.add(topCavitySlit);
    organicMeshes.push(topCavitySlit);

    const cavityRimConfigs = [
      { color: "#7df2ff", opacity: 0.48, position: new THREE.Vector3(-0.16, 2.18, 1.82), rotation: -0.28, scale: new THREE.Vector3(0.2, 0.1, 1) },
      { color: "#cf8cff", opacity: 0.44, position: new THREE.Vector3(0.16, 2.26, 1.84), rotation: 0.22, scale: new THREE.Vector3(0.22, 0.09, 1) },
      { color: "#f0a6dc", opacity: 0.38, position: new THREE.Vector3(-0.26, 2.56, 1.82), rotation: -0.52, scale: new THREE.Vector3(0.18, 0.08, 1) },
    ];
    cavityRimConfigs.forEach((config, rimIndex) => {
      // 参考黑腔下沿有几处非常亮的青紫油膜点，黑洞是否“像”很依赖这些边缘光。
      // 这里用同一套挤出骨片几何做小油膜结节，仍跟随柱体整体滚动和旋转。
      const rim = new THREE.Mesh(
        createReferenceSpineShardGeometry(
          [
            [-0.24, 0.1],
            [-0.04, 0.22],
            [0.24, 0.12],
            [0.28, -0.08],
            [0.02, -0.2],
            [-0.26, -0.08],
          ],
          0.025
        ),
        new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          color: config.color,
          depthTest: false,
          depthWrite: false,
          opacity: config.opacity,
          side: THREE.DoubleSide,
          transparent: true,
        })
      );
      rim.position.copy(config.position);
      rim.rotation.set(0.18, -0.06 + rimIndex * 0.04, config.rotation);
      rim.scale.copy(config.scale);
      rim.renderOrder = 49 + rimIndex;
      pillarGroup.add(rim);
      organicMeshes.push(rim);
    });

    const referenceCrownPieces: Array<{ basePosition: THREE.Vector3; baseRotation: THREE.Euler; baseScale: THREE.Vector3; mesh: THREE.Mesh; phase: number }> = [];
    const referenceCrownConfigs = [
      {
        accent: 71,
        position: new THREE.Vector3(-0.1, 2.72, 1.72),
        rotation: new THREE.Euler(0.2, -0.12, 0.04),
        scale: new THREE.Vector3(1.64, 1.18, 1),
        points: [
          [-0.34, 0.46],
          [-0.04, 0.62],
          [0.3, 0.52],
          [0.38, 0.18],
          [0.18, -0.02],
          [-0.14, -0.08],
          [-0.38, 0.12],
        ],
      },
      {
        accent: 72,
        position: new THREE.Vector3(-0.48, 2.38, 1.74),
        rotation: new THREE.Euler(0.24, 0.16, -0.22),
        scale: new THREE.Vector3(1.28, 0.96, 1),
        points: [
          [-0.38, 0.18],
          [-0.08, 0.34],
          [0.22, 0.22],
          [0.16, -0.06],
          [-0.08, -0.22],
          [-0.42, -0.12],
        ],
      },
      {
        accent: 73,
        position: new THREE.Vector3(0.56, 2.34, 1.78),
        rotation: new THREE.Euler(0.16, -0.18, -0.02),
        scale: new THREE.Vector3(1.72, 0.8, 1),
        points: [
          [-0.34, 0.1],
          [0.24, 0.24],
          [0.56, 0.1],
          [0.42, -0.1],
          [0.02, -0.2],
          [-0.36, -0.12],
        ],
      },
      {
        accent: 74,
        position: new THREE.Vector3(-0.04, 2.08, 1.76),
        rotation: new THREE.Euler(0.34, -0.08, 0.08),
        scale: new THREE.Vector3(0.9, 0.92, 1),
        points: [
          [-0.22, 0.16],
          [0.04, 0.26],
          [0.24, 0.02],
          [0.08, -0.28],
          [-0.2, -0.22],
          [-0.34, -0.02],
        ],
      },
      {
        accent: 75,
        position: new THREE.Vector3(0.26, 2.64, 1.82),
        rotation: new THREE.Euler(0.2, -0.18, 0.28),
        scale: new THREE.Vector3(0.72, 0.72, 1),
        points: [
          [-0.2, 0.18],
          [0.02, 0.36],
          [0.24, 0.18],
          [0.18, -0.12],
          [-0.04, -0.22],
          [-0.24, -0.04],
        ],
      },
    ];
    referenceCrownConfigs.forEach((config, pieceIndex) => {
      // 参考里的顶部轮廓有明确的中轴和少量规则骨片；
      // 这组挤出面负责复刻那种“脏玻璃包着骨片”的主剪影，避免旧随机碎片继续抢形。
      const mesh = new THREE.Mesh(createReferenceSpineShardGeometry(config.points as Array<[number, number]>), makeCrownMaterial(config.accent));
      const material = mesh.material as THREE.MeshPhysicalMaterial;
      material.clearcoat = 0.58;
      material.depthTest = false;
      material.depthWrite = false;
      material.emissiveIntensity = 0.038;
      material.envMapIntensity = 0.6;
      material.opacity = 0.38;
      material.roughness = 0.62;
      material.specularIntensity = 0.28;
      material.transparent = true;
      mesh.position.copy(config.position);
      mesh.rotation.copy(config.rotation);
      mesh.scale.copy(config.scale);
      mesh.renderOrder = 34 + pieceIndex;
      pillarGroup.add(mesh);
      organicMeshes.push(mesh);
      referenceCrownPieces.push({
        basePosition: config.position.clone(),
        baseRotation: config.rotation.clone(),
        baseScale: config.scale.clone(),
        mesh,
        phase: pieceIndex * 0.73,
      });
    });

    // 参考视频里的柱体不是只有硬几何边界，玻璃屏前后会看到一层随柱体走的烟熏油膜。
    // 这里把几片半透明雾面 sprite 挂到 pillarGroup 内部，滚动时和椎骨一起旋转，避免视觉上像单独贴在页面上的背景雾。
    const pillarVeils = Array.from({ length: 6 }, (_, veilIndex) => {
      const material = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: smokeTexture,
        opacity: 0.05 + veilIndex * 0.008,
        rotation: veilIndex * 0.42,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(Math.sin(veilIndex * 1.3) * 0.12, -2.08 + veilIndex * 0.82, -0.1 + Math.cos(veilIndex) * 0.08);
      sprite.scale.set(1.08 + (veilIndex % 2) * 0.28, 1.34 + (veilIndex % 3) * 0.22, 1);
      sprite.renderOrder = 5;
      pillarGroup.add(sprite);
      return { material, phase: veilIndex * 0.74, sprite };
    });

    // 参考图里的柱体不是孤立骨块堆叠，而是有暗色油膜中轴把椎骨串在一起。
    // 这里用几条轻微扭动的 TubeGeometry 做“脊柱韧带”，减少节与节之间的断裂感；
    // 它们挂在 pillarGroup 上，所以滚轮推进时会和椎骨、玻璃卡片一起换面。
    const tendonMaterial = oilBaseMaterial.clone();
    tendonMaterial.color = new THREE.Color("#030508");
    tendonMaterial.emissive = new THREE.Color("#56f4ff");
    tendonMaterial.emissiveIntensity = 0.004;
    tendonMaterial.envMapIntensity = 0.34;
    tendonMaterial.opacity = 0.028;
    tendonMaterial.roughness = 0.78;
    tendonMaterial.transparent = true;
    const spineTendons = Array.from({ length: 5 }, (_, tendonIndex) => {
      const angleOffset = tendonIndex * Math.PI * 0.5 + 0.28;
      const radius = tendonIndex % 2 === 0 ? 0.12 : 0.22;
      const points = Array.from({ length: 8 }, (_, pointIndex) => {
        const progress = pointIndex / 7;
        const y = -3.08 + progress * 6.16;
        const twist = angleOffset + progress * Math.PI * 1.15 + Math.sin(progress * Math.PI * 3 + tendonIndex) * 0.18;
        return new THREE.Vector3(Math.cos(twist) * radius, y, Math.sin(twist) * radius - 0.18);
      });
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, 112, tendonIndex % 2 === 0 ? 0.023 : 0.018, 10, false);
      const tendon = new THREE.Mesh(geometry, tendonMaterial.clone());
      tendon.renderOrder = 2;
      // 新的规则主脊柱已经承担连接感，旧 Tube 韧带在对照图里会变成几根生硬黑杆；
      // 参考视频没有这种直线结构，所以保留资源和动画代码但默认不显示，避免破坏柱体剪影。
      tendon.visible = false;
      pillarGroup.add(tendon);
      return tendon;
    });

    const chainGeometry = new THREE.TorusGeometry(0.16, 0.036, 14, 36);
    const chainMaterial = oilBaseMaterial.clone();
    chainMaterial.color = new THREE.Color("#05070c");
    chainMaterial.emissive = new THREE.Color("#5fe7ff");
    chainMaterial.emissiveIntensity = 0.018;
    chainMaterial.envMapIntensity = 0.92;
    chainMaterial.opacity = 0.18;
    chainMaterial.transparent = true;
    const chainLinks = Array.from({ length: 9 }, (_, linkIndex) => {
      const link = new THREE.Mesh(chainGeometry, chainMaterial);
      link.position.set(-1.12 + Math.sin(linkIndex * 0.64) * 0.025, -2.72 + linkIndex * 0.22, -1.02);
      link.rotation.set(Math.PI / 2, linkIndex % 2 === 0 ? 0.18 : Math.PI / 2 + 0.18, 0.1 * Math.sin(linkIndex));
      link.scale.set(0.52, 0.92, 0.52);
      pillarGroup.add(link);
      return link;
    });

    const fieldMaterial = oilBaseMaterial.clone();
    fieldMaterial.color = new THREE.Color("#05080d");
    fieldMaterial.emissive = new THREE.Color("#7dfff0");
    fieldMaterial.emissiveIntensity = 0.008;
    fieldMaterial.vertexColors = true;
    fieldMaterial.bumpMap = oilTexture;
    fieldMaterial.bumpScale = 0.035;
    fieldMaterial.depthWrite = false;
    fieldMaterial.opacity = 0.02;
    fieldMaterial.transparent = true;
    const organicField = new MarchingCubes(46, fieldMaterial, true, true, 120000);
    organicField.isolation = 66;
    organicField.position.set(0.02, 0, 0.02);
    organicField.scale.set(1.14, 2.68, 0.66);
    organicField.visible = true;
    pillarGroup.add(organicField);

    // 这一层不是页面背景图，而是从用户提供的 mp4 参考帧提取出的宽柱体材质场：
    // 黑底在 AdditiveBlending 下不会覆盖 UI，只把参考里的红蓝油膜、侧向骨节亮边和玻璃卡片遮挡关系投回 3D 柱体。
    // 它挂在 pillarGroup 内，滚轮推进时和几何柱体一起转动，专门解决“柱子不像同一根参考柱”的视觉差距。
    const referenceSpineFieldGeometry = new THREE.PlaneGeometry(1.92, 6.16, 1, 1);
    const referenceSpineFieldMaterial = new THREE.MeshBasicMaterial({
      alphaTest: 0.035,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color("#f6fbff"),
      depthTest: false,
      depthWrite: false,
      map: referenceSpineFieldTexture,
      opacity: 0.46,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const referenceSpineField = new THREE.Mesh(referenceSpineFieldGeometry, referenceSpineFieldMaterial);
    referenceSpineField.position.set(-0.56, 0.06, 1.06);
    referenceSpineField.rotation.set(0.018, -0.07, 0.01);
    referenceSpineField.renderOrder = 7.35;
    pillarGroup.add(referenceSpineField);

    const referenceSpineGhostMaterial = referenceSpineFieldMaterial.clone();
    referenceSpineGhostMaterial.opacity = 0.15;
    const referenceSpineGhost = new THREE.Mesh(referenceSpineFieldGeometry, referenceSpineGhostMaterial);
    referenceSpineGhost.position.set(-0.28, -0.04, 0.72);
    referenceSpineGhost.rotation.set(-0.015, 0.16, -0.024);
    referenceSpineGhost.scale.set(0.82, 0.98, 1);
    referenceSpineGhost.renderOrder = 5.8;
    pillarGroup.add(referenceSpineGhost);

    // 动态短循环来自同一段参考 mp4 的柱体裁切，只提供源视频级的细碎高光和玻璃遮挡微动。
    // 直接用 MeshBasicMaterial 会把参考视频里的暗色玻璃面板也加到页面里，形成“贴了一张矩形视频”的廉价感；
    // 这里用亮度/饱和度抠像 shader，只留下彩色油膜、高光和边缘粒子，让它更像嵌在柱体里的发光材质。
    const referenceSpineMotionMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uMap: { value: referenceSpineMotionTexture },
        uOpacity: { value: 0.15 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          vec4 video = texture2D(uMap, vUv);
          float maxChannel = max(max(video.r, video.g), video.b);
          float minChannel = min(min(video.r, video.g), video.b);
          float saturation = maxChannel - minChannel;
          float luma = dot(video.rgb, vec3(0.2126, 0.7152, 0.0722));
          float colorKey = smoothstep(0.03, 0.18, saturation);
          float lightKey = smoothstep(0.075, 0.38, luma);
          float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.98, 0.82, vUv.x);
          float verticalFade = smoothstep(0.02, 0.13, vUv.y) * smoothstep(0.99, 0.86, vUv.y);
          float foregroundPanelDimming = 1.0 - smoothstep(0.62, 0.86, vUv.x) * 0.58;
          float scanPulse = 0.92 + sin(uTime * 0.82 + vUv.y * 10.0) * 0.08;
          float alpha = max(colorKey * 1.08, lightKey * 0.52) * edgeFade * verticalFade * foregroundPanelDimming * uOpacity * scanPulse;
          vec3 color = pow(video.rgb, vec3(0.82)) * vec3(0.96, 1.08, 1.18);

          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const referenceSpineMotion = new THREE.Mesh(referenceSpineFieldGeometry, referenceSpineMotionMaterial);
    referenceSpineMotion.position.set(-0.57, 0.06, 1.18);
    referenceSpineMotion.rotation.set(0.018, -0.074, 0.012);
    referenceSpineMotion.renderOrder = 7.48;
    pillarGroup.add(referenceSpineMotion);

    // 这层是 v76 的关键：素材层面改成更宽的 mp4 柱体主体，再由“动态视频 mask + 有机轮廓 mask”共同裁切。
    // 它仍然是 pillarGroup 里的 3D mesh，滚轮推进时只做纵向油膜相位；视觉主形来自源视频柱子，
    // 从而减少“程序化骨节 + 一层光效”的割裂感，更接近用户要求的同一根规整油膜柱体。
    const referenceSpineSubjectGeometry = new THREE.PlaneGeometry(1.88, 6.28, 1, 1);
    const referenceSpineSubjectMaterial = new THREE.ShaderMaterial({
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uDynamicMask: { value: referenceSpineSubjectDynamicMaskTexture },
        uMap: { value: referenceSpineSubjectTexture },
        uMask: { value: referenceSpineSubjectMaskTexture },
        uOpacity: { value: 1.08 },
        uScroll: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uDynamicMask;
        uniform sampler2D uMap;
        uniform sampler2D uMask;
        uniform float uOpacity;
        uniform float uScroll;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          vec4 video = texture2D(uMap, vUv);
          vec4 dynamicMaskSample = texture2D(uDynamicMask, vUv);
          vec4 organicMaskSample = texture2D(uMask, vUv);
          float maxChannel = max(max(video.r, video.g), video.b);
          float minChannel = min(min(video.r, video.g), video.b);
          float saturation = maxChannel - minChannel;
          float luma = dot(video.rgb, vec3(0.2126, 0.7152, 0.0722));
          float organicMask = organicMaskSample.a;
          float dynamicMask = smoothstep(0.06, 0.72, dynamicMaskSample.r);
          float bodyMatte = smoothstep(0.018, 0.12, luma + saturation * 0.48);
          float chromaMatte = smoothstep(0.026, 0.18, saturation);
          float lumaMatte = smoothstep(0.04, 0.34, luma);
          float edgeFade = smoothstep(0.012, 0.09, vUv.x) * smoothstep(0.93, 0.64, vUv.x);
          float verticalFade = smoothstep(0.01, 0.075, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          vec2 flowUv = vUv + vec2(
            sin(vUv.y * 7.0 + uTime * 0.34 + uScroll * 0.8) * 0.01,
            cos(vUv.x * 5.4 - uTime * 0.22) * 0.006
          );
          float rightPanelCull = 1.0 - smoothstep(0.56, 0.88, vUv.x) * 0.64;
          float scrollBreath = 1.0 + min(0.16, abs(uScroll) * 0.05);
          float scanPulse = 0.94 + sin(uTime * 0.7 + vUv.y * 12.0 + uScroll * 0.8) * 0.06;
          float sourceMatte = max(bodyMatte * 0.9, max(chromaMatte * 0.86, lumaMatte * 0.52));
          float pillarMask = organicMask * mix(0.72, 1.24, dynamicMask);
          float alpha = sourceMatte * pillarMask * edgeFade * verticalFade * rightPanelCull * scanPulse * scrollBreath * uOpacity;
          vec3 darkBody = video.rgb * vec3(0.68, 0.78, 0.96);
          vec3 oilHighlight = pow(video.rgb, vec3(0.72)) * vec3(1.06, 1.14, 1.26);
          vec3 color = mix(darkBody, oilHighlight, smoothstep(0.045, 0.22, saturation + luma * 0.28 + dynamicMask * 0.08));
          color += vec3(0.03, 0.055, 0.08) * bodyMatte;
          // 镜像里的 HomeLogoShader 走 normal/refraction/fresnel 多层叠加；
          // 这里不复制第三方 shader，只补同类型的滚动折射和边缘彩虹，
          // 让柱体默认保持规则实体，滚轮时能产生参考里的油膜换面。
          float edgeBand = smoothstep(0.04, 0.22, abs(flowUv.x - 0.42)) * smoothstep(0.96, 0.58, flowUv.x);
          vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.34, 0.67) + flowUv.y * 0.28 + uTime * 0.025 + uScroll * 0.035));
          color += rainbow * edgeBand * (0.075 + abs(uScroll) * 0.015) * pillarMask;

          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const referenceSpineSubject = new THREE.Mesh(referenceSpineSubjectGeometry, referenceSpineSubjectMaterial);
    referenceSpineSubject.position.set(-1.02, 0.08, 1.34);
    referenceSpineSubject.rotation.set(0.016, -0.078, 0.012);
    referenceSpineSubject.renderOrder = 8.42;
    pillarGroup.add(referenceSpineSubject);

    // v77 专门补参考视频里的“前景玻璃卡片压住柱体”的遮挡关系。
    // 之前只抽柱体主体，会让我们的 AI PM 卡片和源视频卡片各自叠一层，柱体剪影就不像同一个 mp4；
    // 这层仍然采样同一段参考视频，只保留玻璃边缘、烟熏面和轻微彩色折射，作为柱体前方的低透明遮挡。
    const referenceSpineOcclusionMaterial = new THREE.ShaderMaterial({
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uMap: { value: referenceSpineMotionTexture },
        uOpacity: { value: 0.32 },
        uScroll: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        uniform float uScroll;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          vec4 video = texture2D(uMap, vUv);
          float maxChannel = max(max(video.r, video.g), video.b);
          float minChannel = min(min(video.r, video.g), video.b);
          float saturation = maxChannel - minChannel;
          float luma = dot(video.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec2 panelCenter = vec2(0.68, 0.52);
          vec2 panelHalfSize = vec2(0.47, 0.31);
          vec2 panelDistance = abs(vUv - panelCenter) - panelHalfSize;
          float roundedPanel = 1.0 - smoothstep(0.0, 0.055, length(max(panelDistance, 0.0)) + min(max(panelDistance.x, panelDistance.y), 0.0));
          float leftEdge = smoothstep(0.28, 0.34, vUv.x) * smoothstep(0.39, 0.34, vUv.x);
          float topBottomEdge =
            smoothstep(0.25, 0.31, vUv.y) * smoothstep(0.36, 0.31, vUv.y) +
            smoothstep(0.72, 0.66, vUv.y) * smoothstep(0.61, 0.66, vUv.y);
          float smokyInterior = smoothstep(0.025, 0.22, luma + saturation * 0.34);
          float glassMask = roundedPanel * (0.22 + smokyInterior * 0.56 + leftEdge * 0.42 + topBottomEdge * 0.2);
          float verticalFade = smoothstep(0.12, 0.24, vUv.y) * smoothstep(0.95, 0.76, vUv.y);
          float scrollPulse = 0.94 + min(0.12, abs(uScroll) * 0.04);
          float scan = 0.96 + sin(uTime * 0.38 + vUv.y * 8.0) * 0.04;
          vec3 smoke = mix(vec3(0.035, 0.05, 0.06), pow(video.rgb, vec3(0.86)) * vec3(0.9, 1.02, 1.12), 0.56);
          float alpha = glassMask * verticalFade * scrollPulse * scan * uOpacity;

          gl_FragColor = vec4(smoke, alpha);
        }
      `,
    });
    const referenceSpineOcclusion = new THREE.Mesh(referenceSpineFieldGeometry, referenceSpineOcclusionMaterial);
    referenceSpineOcclusion.position.set(-0.55, 0.02, 1.48);
    referenceSpineOcclusion.rotation.set(0.018, -0.075, 0.012);
    referenceSpineOcclusion.renderOrder = 8.5;
    pillarGroup.add(referenceSpineOcclusion);

    // 第二张参考贴图只保留彩色骨节棱线。它比通用粒子更接近原视频里的规则柱体轮廓，
    // 但仍作为随柱体旋转的材质层存在，避免把整张参考图硬贴成静态背景。
    const referenceSpineRimMaterial = new THREE.MeshBasicMaterial({
      alphaTest: 0.025,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color("#d8fdff"),
      depthTest: false,
      depthWrite: false,
      map: referenceSpineRimTexture,
      opacity: 0.32,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const referenceSpineRim = new THREE.Mesh(referenceSpineFieldGeometry, referenceSpineRimMaterial);
    referenceSpineRim.position.set(-0.58, 0.06, 1.14);
    referenceSpineRim.rotation.set(0.018, -0.075, 0.012);
    referenceSpineRim.renderOrder = 8.34;
    pillarGroup.add(referenceSpineRim);

    const fieldNodes = Array.from({ length: 10 }, (_, nodeIndex) => ({
      phase: nodeIndex * 0.71,
      y: 0.08 + nodeIndex * 0.095,
    }));

    const updateOrganicField = (time: number, activeColor: THREE.Color) => {
      organicField.reset();
      fieldNodes.forEach((node, nodeIndex) => {
        const nodeColor = new THREE.Color(organicPalette[(nodeIndex + activeIndexRef.current) % organicPalette.length]).lerp(activeColor, 0.18);
        const y = node.y + Math.sin(time * 0.44 + node.phase) * 0.01;
        const coreX = 0.5 + Math.sin(time * 0.24 + node.phase) * 0.045;
        const coreZ = 0.5 + Math.cos(time * 0.28 + node.phase) * 0.035;
        const strength = 0.43 + Math.sin(time * 0.58 + node.phase) * 0.035;
        const lobeAngle = node.phase * 2.4 + Math.sin(time * 0.16) * 0.32;
        const lobeX = Math.cos(lobeAngle) * (0.18 + (nodeIndex % 3) * 0.035);
        const lobeZ = Math.sin(lobeAngle) * 0.17;
        const rearX = Math.cos(lobeAngle + 2.2) * 0.14;
        const rearZ = Math.sin(lobeAngle + 2.2) * 0.2;

        organicField.addBall(coreX, y, coreZ, strength, 15.2, nodeColor);
        organicField.addBall(coreX + lobeX, y + 0.012, coreZ + lobeZ, 0.15, 17.4, nodeColor);
        organicField.addBall(coreX + rearX, y - 0.018, coreZ + rearZ, 0.1, 18.8, nodeColor);

        if (nodeIndex % 2 === 0) {
          organicField.addBall(coreX - lobeX * 0.65, y + 0.032, coreZ - lobeZ * 0.72, 0.08, 19.2, nodeColor);
        }
      });
      organicField.update();
    };

    const surfaceOilPatches = [
      { opacity: 0.78, phase: 0.2, position: new THREE.Vector3(-0.16, 2.48, 0.86), rotation: -0.36, scaleX: 0.88, scaleY: 0.46 },
      { opacity: 0.68, phase: 1.1, position: new THREE.Vector3(0.34, 2.22, 0.98), rotation: 0.18, scaleX: 0.72, scaleY: 0.34 },
      { opacity: 0.54, phase: 2.3, position: new THREE.Vector3(-0.04, 1.88, 0.96), rotation: -0.1, scaleX: 0.62, scaleY: 0.4 },
      { opacity: 0.42, phase: 3.1, position: new THREE.Vector3(-0.22, -2.02, 0.64), rotation: 0.18, scaleX: 0.72, scaleY: 0.46 },
      { opacity: 0.5, phase: 4.0, position: new THREE.Vector3(0.26, -2.38, 0.62), rotation: -0.32, scaleX: 0.82, scaleY: 0.48 },
      { opacity: 0.6, phase: 5.2, position: new THREE.Vector3(0.52, 2.5, 0.78), rotation: 0.48, scaleX: 0.56, scaleY: 0.3 },
      { opacity: 0.48, phase: 6.0, position: new THREE.Vector3(-0.5, 2.12, 0.84), rotation: -0.62, scaleX: 0.44, scaleY: 0.34 },
    ].map((config) => {
      const material = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        map: oilPatchTexture,
        opacity: config.opacity,
        rotation: config.rotation,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(config.position);
      sprite.scale.set(config.scaleX, config.scaleY, 1);
      sprite.renderOrder = 7;
      pillarGroup.add(sprite);
      return { ...config, material, sprite };
    });

    const oilGlints = Array.from({ length: 22 }, (_, glintIndex) => {
      const color = organicPalette[glintIndex % organicPalette.length];
      const texture = createGlowTexture(color);
      const material = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        map: texture,
        opacity: 0.07 + (glintIndex % 5) * 0.014,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      const segmentIndex = glintIndex % vertebraSegments.length;
      const segment = vertebraSegments[segmentIndex];
      const angle = glintIndex * 2.21;
      sprite.position.set(
        Math.cos(angle) * (0.38 + (glintIndex % 4) * 0.05),
        segment.baseY + Math.sin(angle) * 0.18,
        Math.sin(angle) * 0.2 + 0.06
      );
      const scale = 0.12 + (glintIndex % 7) * 0.028;
      sprite.scale.set(scale * 3.1, scale * 0.78, 1);
      sprite.renderOrder = 6;
      pillarGroup.add(sprite);
      return { phase: glintIndex * 0.53, sprite };
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
      opacity: 0.018,
      transparent: true,
    });
    const pillarLines = new THREE.LineSegments(pillarLineGeometry, pillarLineMaterial);
    pillarLines.visible = false;
    pillarGroup.add(pillarLines);

    const ringMeshes = Array.from({ length: 9 }, (_, ringIndex) => {
      const ringGeometry = new THREE.TorusGeometry(0.78 + ringIndex * 0.026, 0.006, 8, 128);
      const ringMaterial = new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: 0x6fffe2,
        depthWrite: false,
        opacity: 0.018,
        transparent: true,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -2.2 + ringIndex * 0.54;
      ring.visible = false;
      pillarGroup.add(ring);
      return ring;
    });

    const columnParticleCount = 1380;
    const columnParticlePositions = new Float32Array(columnParticleCount * 3);
    const columnParticleSeeds = new Float32Array(columnParticleCount * 4);
    const columnParticleColors = new Float32Array(columnParticleCount * 3);
    const columnParticleSizes = new Float32Array(columnParticleCount);
    const columnParticleAlphas = new Float32Array(columnParticleCount);
    const columnParticlePhases = new Float32Array(columnParticleCount);
    for (let index = 0; index < columnParticleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.18 + Math.pow(Math.random(), 2.05) * 1.0;
      const heightSeed = Math.random();
      columnParticleSeeds[index * 4] = angle;
      columnParticleSeeds[index * 4 + 1] = radius;
      columnParticleSeeds[index * 4 + 2] = heightSeed;
      columnParticleSeeds[index * 4 + 3] = 0.55 + Math.random() * 1.35;
      columnParticlePositions[index * 3] = Math.cos(angle) * radius;
      columnParticlePositions[index * 3 + 1] = heightSeed * 5.2 - 2.6;
      columnParticlePositions[index * 3 + 2] = Math.sin(angle) * radius;

      const color = baseColors[index % baseColors.length].clone().lerp(new THREE.Color("#ffffff"), 0.2 + Math.random() * 0.26);
      columnParticleColors[index * 3] = color.r;
      columnParticleColors[index * 3 + 1] = color.g;
      columnParticleColors[index * 3 + 2] = color.b;
      columnParticleSizes[index] = 1.4 + Math.pow(Math.random(), 2.0) * 5.8;
      columnParticleAlphas[index] = 0.058 + Math.random() * 0.2;
      columnParticlePhases[index] = Math.random() * Math.PI * 2;
    }
    const columnParticleGeometry = new THREE.BufferGeometry();
    columnParticleGeometry.setAttribute("position", new THREE.BufferAttribute(columnParticlePositions, 3));
    columnParticleGeometry.setAttribute("color", new THREE.BufferAttribute(columnParticleColors, 3));
    columnParticleGeometry.setAttribute("aSize", new THREE.BufferAttribute(columnParticleSizes, 1));
    columnParticleGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(columnParticleAlphas, 1));
    columnParticleGeometry.setAttribute("aPhase", new THREE.BufferAttribute(columnParticlePhases, 1));
    const columnParticleMaterial = createVolumetricParticleMaterial(0.7);
    const columnParticles = new THREE.Points(columnParticleGeometry, columnParticleMaterial);
    pillarGroup.add(columnParticles);
    const workTrackStep = STORY_WORK_TRACK_STEP;

    const fleckPalette = ["#6ff0ff", "#5d8bff", "#9b72ff", "#f16bdc", "#ff5c68", "#e0b261", "#f8fbff"];
    const fleckTextures = fleckPalette.map((color) => createGlowTexture(color));
    const spineFlecks = Array.from({ length: 236 }, (_, fleckIndex) => {
      const texture = fleckTextures[fleckIndex % fleckTextures.length];
      const material = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        map: texture,
        opacity: 0.112 + (fleckIndex % 5) * 0.018,
        rotation: Math.sin(fleckIndex * 1.9) * Math.PI,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      const lane = fleckIndex % 11;
      const y = -2.86 + ((fleckIndex * 0.31) % 5.78);
      const side = lane < 8 ? -1 : 1;
      const x = (side < 0 ? -0.46 : 0.08) + Math.sin(fleckIndex * 1.37) * 0.16;
      const z = 0.82 + Math.cos(fleckIndex * 0.91) * 0.1;
      const scale = 0.018 + (fleckIndex % 7) * 0.005;

      // 参考柱体表面有很多贴在骨块上的高频青紫/红金碎光，不是空间里均匀漂浮的大粒子。
      // 这些 sprite 挂在柱体本地坐标里，只做极短的椭圆闪片，补足材质贴图在远景里不够锐的问题。
      sprite.position.set(x, y, z);
      sprite.scale.set(scale * (2.8 + (fleckIndex % 4) * 0.5), scale * (0.48 + (fleckIndex % 3) * 0.08), 1);
      sprite.renderOrder = 9;
      pillarGroup.add(sprite);
      return {
        baseOpacity: 0.112 + (fleckIndex % 5) * 0.018,
        basePosition: sprite.position.clone(),
        baseScale: sprite.scale.clone(),
        material,
        phase: fleckIndex * 0.47,
        sprite,
      };
    });

    const referenceGlassPanels = [
      {
        angle: -1.26,
        height: 3.18,
        opacity: 0.038,
        radiusX: 2.68,
        radiusZ: 0.66,
        renderOrder: 3.25,
        sourceIndex: -1,
        variant: "left" as const,
        width: 2.18,
        y: 0.54,
      },
      {
        angle: 0.03,
        height: 2.98,
        opacity: 0.046,
        radiusX: 0.86,
        radiusZ: 0.82,
        renderOrder: 4.85,
        sourceIndex: 0,
        variant: "front" as const,
        width: 5.05,
        y: 0.12,
      },
      {
        angle: 2.62,
        height: 1.9,
        opacity: 0.03,
        radiusX: 1.78,
        radiusZ: 0.84,
        renderOrder: 2.9,
        sourceIndex: 1,
        variant: "rear" as const,
        width: 1.46,
        y: 1.16,
      },
    ].map((config) => {
      const texture = createReferenceGlassPanelTexture(config.variant);
      const geometry = new THREE.PlaneGeometry(config.width, config.height, 12, 8);
      const material = new THREE.MeshBasicMaterial({
        depthTest: false,
        depthWrite: false,
        map: texture,
        opacity: config.opacity,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const mediaMaterial =
        config.variant === "front" ? createWorkPaneMediaMaterial(activeTheoryWorkHogwartsThumbTexture, activeTheoryWorkHogwartsLogoTexture) : null;
      const mediaMesh = mediaMaterial ? new THREE.Mesh(geometry, mediaMaterial) : null;
      const refractionMaterial =
        config.variant === "front" ? createWorkRefractionPanelMaterial(texture, activeTheoryWorkNormalTexture, activeTheoryWorkEnvTexture, config.opacity * 0.72) : null;
      const refractionMesh = refractionMaterial ? new THREE.Mesh(geometry, refractionMaterial) : null;

      // 这些屏幕只保留参考 mp4 里的空间玻璃氛围，不能再冒充主滚动卡片；
      // 真正的 WorkItem 轨道由下方循环 slot 生成，避免用户滚动时只看到一张大卡在切换。
      if (mediaMesh) {
        // 源站 pane 的真实项目媒体只作为低透明背景投影，不能盖过 AI PM 自己的多卡片滚动轨道。
        mediaMesh.renderOrder = config.renderOrder + 0.025;
        stage.add(mediaMesh);
      }
      mesh.renderOrder = config.renderOrder;
      stage.add(mesh);
      if (refractionMesh) {
        // 只有前景主屏需要 WorkItem 式厚玻璃折射；左右远景屏保持更轻，避免整屏变成一堆高亮卡片。
        refractionMesh.renderOrder = config.renderOrder + 0.08;
        stage.add(refractionMesh);
      }
      return { ...config, geometry, material, mediaMaterial, mediaMesh, mesh, refractionMaterial, refractionMesh, texture };
    });

    const panelMeshes = storyWorkItemSlots.map(({ scene: sceneItem, sceneIndex, slotIndex }) => {
      const geometry = new THREE.PlaneGeometry(THREE_PANEL_WIDTH / 245, THREE_PANEL_HEIGHT / 245, 12, 8);
      const material = new THREE.MeshBasicMaterial({
        depthTest: false,
        depthWrite: false,
        map: createPanelTexture(sceneItem),
        opacity: 0.18,
        side: THREE.DoubleSide,
        toneMapped: false,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const backplateGeometry = new THREE.PlaneGeometry(THREE_PANEL_WIDTH / 232, THREE_PANEL_HEIGHT / 232, 1, 1);
      const backplateMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sceneItem.accent).lerp(new THREE.Color("#d8fff7"), 0.34),
        depthTest: false,
        depthWrite: false,
        opacity: 0.035,
        side: THREE.DoubleSide,
        toneMapped: false,
        transparent: true,
      });
      const backplate = new THREE.Mesh(backplateGeometry, backplateMaterial);
      const initialOffset = getInfiniteStorySlotOffset(slotIndex, 0);
      const initialAbsOffset = Math.abs(initialOffset);
      const initialAngle = -initialOffset * workTrackStep;
      const initialFocus = Math.max(0, 1 - initialAbsOffset * 0.58);
      const initialTrackWindow = Math.max(0, 1 - initialAbsOffset / 7.2);
      const initialCardRadiusX = 0.68 + initialTrackWindow * 0.32;
      const initialScale = 0.44 + initialTrackWindow * 0.22 + initialFocus * 0.48;
      mesh.position.set(
        0.18 + Math.sin(initialAngle) * initialCardRadiusX,
        0.12 - initialOffset * 0.52,
        1.55 + Math.cos(initialAngle) * 0.5 + initialFocus * 0.56 - initialAbsOffset * 0.06
      );
      mesh.rotation.set(THREE.MathUtils.clamp(initialOffset * -0.044, -0.16, 0.16), -initialAngle * 0.9 - 0.04, Math.sin(initialAngle) * 0.035);
      mesh.scale.set(initialScale, initialScale, 1);
      backplate.position.copy(mesh.position);
      backplate.position.z -= 0.018;
      backplate.rotation.copy(mesh.rotation);
      backplate.scale.set(initialScale * 1.04, initialScale * 1.04, 1);
      // 这些卡片对应源站 WorkItem：所有项目卡都一直存在于同一条无界轨道上。
      // v115 把横向半径只还给卡片队列，柱体和 camera x/z 继续锁死；
      // 这样能看到多张卡片沿同一条轨道转面接力，而不是一张卡片在原地换文案。
      material.opacity = Math.min(0.34, 0.032 + initialTrackWindow * 0.11 + initialFocus * 0.2);
      mesh.renderOrder = initialOffset === 0 ? 30 : Math.max(20, 28 - initialAbsOffset);
      backplate.renderOrder = mesh.renderOrder - 0.2;
      mesh.userData.index = sceneIndex;
      mesh.userData.slotIndex = slotIndex;
      // 纹理面本身有烟熏和油膜，离轴时可能被暗背景吃掉；
      // 背板模拟源站 WorkPane 的折射边缘，只负责把所有卡片“托出来”，不改变滚动轨道。
      stage.add(backplate);
      stage.add(mesh);
      return { backplate, backplateGeometry, backplateMaterial, geometry, material, mesh, sceneIndex, slotIndex };
    });

    const spineGeometry = new THREE.TorusKnotGeometry(0.76, 0.055, 180, 12, 2, 5);
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d161a,
      emissive: 0x071017,
      metalness: 0.86,
      opacity: 0.035,
      roughness: 0.28,
      transparent: true,
    });
    const spine = new THREE.Mesh(spineGeometry, spineMaterial);
    spine.position.set(0.25, -0.05, -1.15);
    spine.visible = false;
    stage.add(spine);

    let animationFrame = 0;
    let width = 1;
    let height = 1;
    let visualProgress = 0;
    const pillarBasePosition = new THREE.Vector3(-0.62, -0.02, -0.36);
    const cameraBasePosition = new THREE.Vector3(0, 0.2, 7.2);
    const cameraTargetPosition = cameraBasePosition.clone();
    const cameraLookAtTarget = new THREE.Vector3(-0.58, -0.04, -0.35);
    const cameraBaseLookAt = new THREE.Vector3(-0.58, -0.04, -0.35);

    const resize = () => {
      const rect = root.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      particleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      columnParticleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      activeTheoryFlowerPointMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    };

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const time = performance.now() * 0.001;
      const activeColor = new THREE.Color(storyScenes[activeIndexRef.current].accent);
      const scrollSection = scrollSectionRef.current;

      if (scrollSection) {
        const rect = scrollSection.getBoundingClientRect();
        const scrollUnit = Math.max(320, window.innerHeight * 0.72);
        const nativeProgress = Math.max(0, -rect.top / scrollUnit);
        const nativeDelta = nativeProgress - nativeScrollProgressRef.current;

        if (Math.abs(nativeDelta) > 0.0008) {
          // 和源站的 Scroll rig 对齐：每一帧主动读取真实 scrollY，而不是等 wheel/click 事件。
          // 这样用户连续滚、触控板惯性和浏览器自动滚动都会推进同一条多卡片轨道；
          // 柱体后续只使用这个 progress 的 y 向循环，不再吃 x/z 轨道。
          nativeScrollProgressRef.current = nativeProgress;
          scrollTargetRef.current = nativeProgress;
          scrollImpulseRef.current = Math.max(-3.8, Math.min(3.8, scrollImpulseRef.current + nativeDelta * 1.35));
        }
      }

      const progressDelta = scrollTargetRef.current - visualProgress;

      if (Math.abs(progressDelta) < 0.0008) {
        visualProgress += progressDelta;
      } else {
        visualProgress += progressDelta * 0.13;
      }
      syncActiveIndexFromProgress(visualProgress);

      // 参考 Work 页是无界 scroll rig：滚动位置持续累加，柱体和卡片按同一个轨道推进。
      // 不再让 3D 回到 normalized activeIndex，否则用户一停手柱体就会“自己回正”。
      const scrollImpulse = scrollImpulseRef.current;
      scrollImpulseRef.current += (0 - scrollImpulseRef.current) * 0.046;
      const scrollFollow = Math.max(-1.9, Math.min(1.9, scrollImpulse));
      const motionProgress = visualProgress + scrollFollow * 0.18;
      const sourceScrollProgress = THREE.MathUtils.euclideanModulo(motionProgress, 1);
      const sourceScrollSpin = motionProgress * workTrackStep;
      const sourceSpineTravel = motionProgress * 0.86;
      const pillarVerticalPhase = motionProgress * 0.42 + scrollFollow * 0.025;
      particleMaterial.uniforms.uTime.value = time;
      columnParticleMaterial.uniforms.uTime.value = time;
      activeTheoryFlowerPointMaterial.uniforms.uTime.value = time;
      activeTheoryFlowerPointMaterial.uniforms.uScroll.value = sourceScrollProgress;
      activeTheoryFlowerPointMaterial.uniforms.uRotate.value = sourceScrollSpin;
      activeTheoryFlowerPointMaterial.uniforms.uSparkle.value = time * 0.42 + Math.abs(scrollImpulse) * 0.18;
      activeTheoryFlowerPointMaterial.uniforms.uOpacity.value = 0.28 + Math.min(0.12, Math.abs(scrollImpulse) * 0.034);
      liquidColumnMaterial.uniforms.uTime.value = time;
      liquidColumnMaterial.uniforms.uAccent.value.lerp(activeColor, 0.03);
      if (organicField.visible) {
        updateOrganicField(time, activeColor);
      }
      pointLight.color.lerp(activeColor, 0.035);
      magentaLight.intensity = 4.2 + Math.sin(time * 0.8) * 0.7;
      cyanLight.intensity = 4.9 + Math.cos(time * 0.7) * 0.8;
      goldLight.intensity = 1.8 + Math.sin(time * 0.6 + 1.3) * 0.4;
      rimLight.intensity = 7.4 + Math.sin(time * 0.52) * 1.1;
      purpleRimLight.intensity = 5.1 + Math.cos(time * 0.44) * 0.85;
      spineMaterial.color.lerp(activeColor, 0.025);
      spineMaterial.emissive.lerp(activeColor.clone().multiplyScalar(0.18), 0.025);
      pillarShellMaterial.color.lerp(activeColor, 0.03);
      pillarCoreMaterial.color.lerp(activeColor, 0.03);
      pillarLineMaterial.color.lerp(activeColor.clone().lerp(new THREE.Color("#ffffff"), 0.28), 0.03);
      ringMeshes.forEach((ring, ringIndex) => {
        const material = ring.material as THREE.MeshBasicMaterial;
        material.color.lerp(activeColor, 0.03);
        material.opacity = 0.008 + Math.sin(time * 1.12 + ringIndex) * 0.004 + ringIndex * 0.0014;
        ring.rotation.z += 0.002 + ringIndex * 0.0003;
      });
      glowSprites.forEach((item) => {
        const material = item.sprite.material as THREE.SpriteMaterial;
        const pulse = 0.82 + Math.sin(time * 0.78 + item.phase) * 0.18;
        material.opacity = item.opacity * pulse;
        item.sprite.scale.set(item.scale * pulse, item.scale * pulse, 1);
        item.sprite.position.y = item.position.y + Math.sin(time * 0.42 + item.phase) * 0.08;
      });
      smokeSprites.forEach((item) => {
        const material = item.sprite.material as THREE.SpriteMaterial;
        const pulse = 0.9 + Math.sin(time * 0.34 + item.phase) * 0.1;
        material.opacity = item.opacity * pulse;
        material.rotation = item.rotation + Math.sin(time * 0.2 + item.phase) * 0.08;
        item.sprite.scale.set(item.scaleX * pulse, item.scaleY * pulse, 1);
      });
      pillarVeils.forEach((item, veilIndex) => {
        const pulse = 0.9 + Math.sin(time * 0.28 + item.phase) * 0.1;
        item.material.opacity = (0.045 + veilIndex * 0.007) * pulse;
        item.material.rotation = veilIndex * 0.42 + Math.sin(time * 0.18 + item.phase) * 0.1;
        item.sprite.position.x = Math.sin(time * 0.16 + item.phase) * 0.12;
        item.sprite.scale.set((1.05 + (veilIndex % 2) * 0.28) * pulse, (1.32 + (veilIndex % 3) * 0.24) * pulse, 1);
      });

      oilTexture.offset.x = Math.sin(time * 0.045) * 0.035;
      oilTexture.offset.y = time * 0.032;
      // 参考柱体的油膜颗粒会有很慢的内向漂移；专用贴图单独滚动，
      // 避免和通用油膜同步后看起来像一层整齐的页面滤镜。
      referenceOilTexture.offset.x = Math.sin(time * 0.06) * 0.04 + Math.sin(sourceScrollSpin * 0.18) * 0.012;
      referenceOilTexture.offset.y = time * 0.046 + sourceScrollProgress * 0.62;
      referenceSpineFieldMaterial.opacity = 0.47 + Math.sin(time * 0.2) * 0.03 + Math.min(0.08, Math.abs(scrollImpulse) * 0.02);
      referenceSpineGhostMaterial.opacity = 0.13 + Math.cos(time * 0.18) * 0.018 + Math.min(0.045, Math.abs(scrollImpulse) * 0.012);
      referenceSpineMotionMaterial.uniforms.uTime.value = time;
      referenceSpineMotionMaterial.uniforms.uOpacity.value = 0.22 + Math.sin(time * 0.31 + 0.4) * 0.026 + Math.min(0.08, Math.abs(scrollImpulse) * 0.022);
      referenceSpineSubjectMaterial.uniforms.uTime.value = time;
      referenceSpineSubjectMaterial.uniforms.uScroll.value = sourceScrollProgress + scrollFollow * 0.018;
      referenceSpineSubjectMaterial.uniforms.uOpacity.value = 1.14 + Math.sin(time * 0.26 + 0.7) * 0.04 + Math.min(0.16, Math.abs(scrollFollow) * 0.04);
      referenceSpineOcclusionMaterial.uniforms.uTime.value = time;
      referenceSpineOcclusionMaterial.uniforms.uScroll.value = sourceScrollProgress + scrollFollow * 0.018;
      referenceSpineOcclusionMaterial.uniforms.uOpacity.value = 0.38 + Math.sin(time * 0.22 + 0.2) * 0.022 + Math.min(0.1, Math.abs(scrollFollow) * 0.026);
      referenceSpineRimMaterial.opacity = 0.42 + Math.sin(time * 0.22 + 0.9) * 0.04 + Math.min(0.12, Math.abs(scrollImpulse) * 0.028);
      referenceSpineField.position.x = -0.38;
      referenceSpineField.rotation.y = -0.075 + Math.sin(time * 0.1) * 0.003;
      referenceSpineGhost.position.x = -0.1;
      referenceSpineGhost.rotation.y = 0.12 + Math.sin(time * 0.13) * 0.003;
      referenceSpineMotion.position.x = -0.38;
      referenceSpineMotion.rotation.y = -0.08 + Math.sin(time * 0.12 + 0.08) * 0.003;
      referenceSpineSubject.position.x = -0.62;
      referenceSpineSubject.position.z = 1.36 + Math.cos(time * 0.11 + 0.2) * 0.003;
      referenceSpineSubject.rotation.y = -0.09 + Math.sin(time * 0.12) * 0.004;
      referenceSpineSubject.rotation.z = 0.006 + Math.sin(time * 0.1) * 0.002;
      referenceSpineSubject.scale.set(1.12, 1.025, 1);
      referenceSpineOcclusion.position.x = -0.38;
      referenceSpineOcclusion.position.z = 1.48 + Math.cos(time * 0.11 + 0.14) * 0.003;
      referenceSpineOcclusion.rotation.y = -0.08 + Math.sin(time * 0.12 + 0.1) * 0.003;
      referenceSpineRim.position.x = -0.38;
      referenceSpineRim.rotation.y = -0.08 + Math.sin(time * 0.12 + 0.08) * 0.003;
      referenceGlassPanels.forEach((panel, panelIndex) => {
        const staticX = panel.variant === "front" ? -0.62 : panel.variant === "left" ? -2.38 : 1.42;
        const staticZ = panel.variant === "front" ? 1.36 : panel.variant === "left" ? 0.82 : 0.38;
        const staticRotationY = panel.variant === "front" ? -0.08 : panel.variant === "left" ? 0.48 : -0.62;
        const staticRotationX = panel.variant === "front" ? -0.02 : 0.026 * Math.sign(panel.angle);
        const targetY = panel.y + Math.sin(time * 0.18 + panelIndex) * 0.008;
        const targetOpacity = panel.opacity * (0.72 + Math.sin(time * 0.22 + panelIndex) * 0.08) + Math.min(0.014, Math.abs(scrollImpulse) * 0.006);

        // 这三片大玻璃只当作参考图里的环境折射层，不能再吃 WorkItem 轨道。
        // 如果它们继续按卡片 offset 横向移动，视觉上会像“只有一张大卡片在拖着柱体走”；
        // 主交互已经交给下方 15 个 WorkItem slot，这里只保留极轻的景深呼吸。
        panel.mesh.position.x += (staticX - panel.mesh.position.x) * 0.16;
        panel.mesh.position.y += (targetY - panel.mesh.position.y) * 0.16;
        panel.mesh.position.z += (staticZ - panel.mesh.position.z) * 0.16;
        panel.mesh.rotation.y += (staticRotationY - panel.mesh.rotation.y) * 0.14;
        panel.mesh.rotation.x += (staticRotationX - panel.mesh.rotation.x) * 0.12;
        panel.material.opacity += (targetOpacity - panel.material.opacity) * 0.08;
        if (panel.mediaMesh && panel.mediaMaterial) {
          panel.mediaMesh.position.copy(panel.mesh.position);
          panel.mediaMesh.rotation.copy(panel.mesh.rotation);
          panel.mediaMesh.scale.copy(panel.mesh.scale);
          panel.mediaMaterial.uniforms.uTime.value = time;
          panel.mediaMaterial.uniforms.uScroll.value = sourceScrollProgress;
          panel.mediaMaterial.uniforms.uOpacity.value = Math.min(0.08, panel.material.opacity * 0.48 + Math.abs(scrollImpulse) * 0.006);
        }
        if (panel.refractionMesh && panel.refractionMaterial) {
          panel.refractionMesh.position.copy(panel.mesh.position);
          panel.refractionMesh.rotation.copy(panel.mesh.rotation);
          panel.refractionMesh.scale.copy(panel.mesh.scale);
          panel.refractionMaterial.uniforms.uTime.value = time;
          panel.refractionMaterial.uniforms.uScroll.value = sourceScrollProgress;
          panel.refractionMaterial.uniforms.uOpacity.value = Math.min(0.1, panel.material.opacity * 0.58 + Math.abs(scrollImpulse) * 0.007);
        }
      });
      stage.rotation.y = 0;
      particles.rotation.y -= 0.0009;
      particles.rotation.z = Math.sin(time * 0.18) * 0.06;
      liquidColumn.rotation.y = Math.sin(time * 0.2) * 0.18;
      liquidColumn.scale.x = 1 + Math.sin(time * 0.52) * 0.035;
      liquidColumn.scale.z = 1 + Math.cos(time * 0.48) * 0.035;
      spine.rotation.x += 0.003;
      spine.rotation.y += 0.006;
      // 源码里的柱体不会被滚轮推到左右两侧；滚动感来自 shader 相位、实例队列和 WorkItem target。
      // 所以这里把 position 和滚动旋转都锁住，只保留时间驱动的极轻微油膜呼吸，保证用户向下滚动时看到的是
      // “柱内从上到下流动”，而不是整根柱子产生 x/z 漂移或绕屏幕横向回正。
      pillarGroup.position.copy(pillarBasePosition);
      pillarGroup.rotation.set(0, -0.08, 0);
      if (activeTheoryFlowerPointCloud) {
        activeTheoryFlowerPointCloud.position.x = -0.02;
        activeTheoryFlowerPointCloud.position.y = 0.02 + Math.sin(time * 0.16) * 0.006;
        activeTheoryFlowerPointCloud.position.z = 0.82;
        activeTheoryFlowerPointCloud.rotation.y = THREE.MathUtils.degToRad(100) + Math.sin(time * 0.08) * 0.003;
      }
      pillarShell.scale.x = 1 + Math.sin(time * 1.3) * 0.035;
      pillarShell.scale.z = 1 + Math.cos(time * 1.1) * 0.035;
      pillarCore.scale.x = 1 + Math.sin(time * 1.9) * 0.09;
      pillarCore.scale.z = 1 + Math.sin(time * 1.9) * 0.09;
      pillarLines.rotation.y += 0.0048;
      spineTendons.forEach((tendon, tendonIndex) => {
        const material = tendon.material as THREE.MeshPhysicalMaterial;
        material.emissiveIntensity = 0.006 + Math.sin(time * 0.76 + tendonIndex) * 0.003;
        tendon.rotation.y = Math.sin(time * 0.18 + tendonIndex) * 0.045;
      });
      chainLinks.forEach((link, linkIndex) => {
        link.position.x = -1.12 + Math.sin(linkIndex * 0.64 + time * 0.18) * 0.018;
        link.position.y = -2.72 + linkIndex * 0.22 + Math.sin(pillarVerticalPhase + linkIndex * 0.28) * 0.018;
        link.rotation.z = 0.1 * Math.sin(linkIndex + time * 0.22);
      });
      vertebraSegments.forEach((segment, segmentIndex) => {
        const verticalBreath = Math.sin(time * 0.18 + pillarVerticalPhase + segment.phase) * 0.012;
        segment.group.position.x = Math.sin(segment.phase + time * 0.12) * 0.004;
        segment.group.position.y = segment.baseY + verticalBreath;
        segment.group.position.z = Math.cos(segment.phase * 0.8 + time * 0.1) * 0.004;
        segment.group.rotation.x = 0.012 * Math.sin(segment.phase + time * 0.14);
        segment.group.rotation.y = segment.sideBias * 0.055 + segment.phase * 0.032 + Math.sin(time * 0.1 + segment.phase) * 0.006;
        segment.group.rotation.z = 0.012 * Math.cos(segment.phase + time * 0.12);
        segment.group.scale.setScalar(segment.massVariation);

        segment.meshes.forEach((mesh, meshIndex) => {
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          const paletteColor = new THREE.Color(organicPalette[(segmentIndex + meshIndex + activeIndexRef.current) % organicPalette.length]);
          material.color.lerp(new THREE.Color("#24302f").lerp(paletteColor, 0.045), 0.02);
          material.emissive.lerp(paletteColor.multiplyScalar(0.042 + Math.sin(time * 0.7 + meshIndex) * 0.01), 0.025);
        });
      });
      referenceStackSegments.forEach((segment, segmentIndex) => {
        const pulse = Math.sin(time * 0.42 + segment.phase) * 0.018;
        // 用户明确指出柱体滚动不能左右偏移，兜底骨块也必须锁定 x 轴。
        segment.group.position.x = 0;
        segment.group.position.y = segment.y + pulse;
        segment.group.position.z = 0.47 + Math.cos(time * 0.16 + segment.phase) * 0.012;
        segment.group.rotation.x = Math.sin(time * 0.16 + segment.phase) * 0.006;
        segment.group.rotation.y = (segmentIndex % 2 === 0 ? 0.08 : -0.08) + Math.sin(time * 0.12 + segment.phase) * 0.004;
        segment.group.rotation.z = Math.cos(time * 0.14 + segment.phase) * 0.005;
        segment.group.scale.set(0.96 + pulse * 0.8, 1.02 - pulse * 0.45, 0.9 + pulse * 0.5);

        [segment.body, segment.lobeA, segment.lobeB].forEach((mesh, meshIndex) => {
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          const paletteColor = new THREE.Color(organicPalette[(segmentIndex + meshIndex + activeIndexRef.current) % organicPalette.length]);
          material.emissive.lerp(paletteColor.multiplyScalar(0.078 + Math.sin(time * 0.64 + segment.phase + meshIndex) * 0.018), 0.03);
          material.envMapIntensity = 1.34 + Math.sin(time * 0.3 + segment.phase) * 0.14 + Math.min(0.26, Math.abs(scrollImpulse) * 0.08);
        });
      });
      sourceProfileSegments.forEach((segment, segmentIndex) => {
        const localPulse = Math.sin(time * 0.28 + segment.phase);

        // 源帧柱体默认几乎不漂移，只保留油膜呼吸；滚动时由外层 pillarGroup 负责整体换面。
        // 这里的微动只让单节在同一根柱子里有轻微折光，避免重新变成旧版那种“各飘各的碎片”。
        segment.group.position.x = segment.basePosition.x;
        segment.group.position.y = segment.basePosition.y + localPulse * 0.006;
        segment.group.position.z = segment.basePosition.z + Math.cos(time * 0.22 + segment.phase) * 0.003;
        segment.group.rotation.x = segment.baseRotation.x + Math.sin(time * 0.14 + segment.phase) * 0.002;
        segment.group.rotation.y = segment.baseRotation.y + Math.sin(time * 0.16 + segment.phase) * 0.003;
        segment.group.rotation.z = segment.baseRotation.z + Math.sin(time * 0.18 + segment.phase) * 0.002;
        segment.group.scale.set(
          segment.baseScale.x * (1 + localPulse * 0.006),
          segment.baseScale.y * (1 - localPulse * 0.005),
          segment.baseScale.z
        );

        const edgeFade = segmentIndex <= 1 ? 0.56 : segmentIndex >= sourceProfileSegments.length - 2 ? 0.68 : 1;
        [segment.sideBody, segment.processRoot, segment.sideProcess, segment.processBlade, segment.lowerProcess].forEach((mesh, meshIndex) => {
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          const paletteColor = new THREE.Color(organicPalette[(segmentIndex + meshIndex + activeIndexRef.current) % organicPalette.length]);
          if (activeTheorySpineReady) {
            // `spine.bin` 加载成功后，程序化兜底骨块只保留极弱的暗部厚度。
            // 如果仍按旧动画每帧拉高发光/反射，画面会变成两套柱体叠加，和源站规则 instancer 的整体感相冲突。
            material.opacity = Math.min(material.opacity, 0.05 * edgeFade);
            material.emissive.lerp(paletteColor.multiplyScalar(0.018 * edgeFade), 0.035);
            material.envMapIntensity = (0.42 + Math.min(0.1, Math.abs(scrollImpulse) * 0.025)) * edgeFade;
          } else {
            material.emissive.lerp(paletteColor.multiplyScalar((0.102 + Math.sin(time * 0.5 + segment.phase + meshIndex) * 0.022) * edgeFade), 0.035);
            material.envMapIntensity = (1.86 + Math.sin(time * 0.25 + segment.phase) * 0.2 + Math.min(0.34, Math.abs(scrollImpulse) * 0.08)) * edgeFade;
          }
        });

        const notchMaterial = segment.notch.material as THREE.MeshPhysicalMaterial;
        notchMaterial.opacity = activeTheorySpineReady ? 0.12 + Math.sin(time * 0.44 + segment.phase) * 0.018 : 0.52 + Math.sin(time * 0.44 + segment.phase) * 0.05;
      });
      activeTheorySpineInstances.forEach((item, instanceIndex) => {
        const material = item.mesh.material as THREE.ShaderMaterial;
        const highlightMaterial = item.highlight.material as THREE.MeshMatcapMaterial;
        const spineLoopHeight = Math.max(0.65, activeTheorySpineInstances.length * 0.65);
        const baseDistanceFromTop = instanceIndex * 0.65;
        const stackY = 4 - THREE.MathUtils.euclideanModulo(baseDistanceFromTop + sourceSpineTravel, spineLoopHeight);
        const pulse = Math.sin(time * 0.38 + item.phase);

        // `spine.bin` 是柱体的真实骨节。用户这次明确要求滚动只体现为“从上到下”的柱体推进，
        // 所以实例只沿 y 轴做无界循环，x/z 与每节自身旋转全部锁在源站 `SpineInstancer` 的规则队列上。
        // 这样保留无限滚动连续性，同时避免旧实现里用 scrolledIndex 改旋转导致柱体左右扭偏。
        item.mesh.position.x = item.basePosition.x;
        item.mesh.position.y = stackY + pulse * 0.006;
        item.mesh.position.z = item.basePosition.z;
        item.mesh.rotation.x = item.baseRotation.x + Math.sin(time * 0.13 + item.phase) * 0.002;
        item.mesh.rotation.y = item.baseRotation.y + Math.sin(time * 0.11 + item.phase) * 0.002;
        item.mesh.rotation.z = item.baseRotation.z + Math.cos(time * 0.1 + item.phase) * 0.002;
        item.mesh.scale.set(
          item.baseScale.x * (1 + pulse * 0.006),
          item.baseScale.y * (1 - pulse * 0.004),
          item.baseScale.z * (1 + Math.sin(time * 0.25 + instanceIndex) * 0.005)
        );
        item.highlight.position.copy(item.mesh.position);
        item.highlight.rotation.copy(item.mesh.rotation);
        item.highlight.scale.copy(item.mesh.scale).multiplyScalar(1.014);
        material.uniforms.uTime.value = time;
        material.uniforms.uScroll.value = sourceScrollProgress + scrollFollow * 0.018;
        material.uniforms.uSpineScroll.value = sourceScrollProgress;
        material.uniforms.uOpacity.value = 0.48 + Math.sin(time * 0.3 + item.phase) * 0.036 + Math.min(0.1, Math.abs(scrollFollow) * 0.032);
        (material.uniforms.uAccent.value as THREE.Color).lerp(
          new THREE.Color(organicPalette[(instanceIndex + activeIndexRef.current) % organicPalette.length]).lerp(new THREE.Color("#d1fff4"), 0.34),
          0.035
        );
        highlightMaterial.opacity = 0.058 + Math.sin(time * 0.42 + item.phase) * 0.018 + Math.min(0.042, Math.abs(scrollImpulse) * 0.018);
        highlightMaterial.color.lerp(new THREE.Color(organicPalette[(instanceIndex + activeIndexRef.current) % organicPalette.length]).lerp(new THREE.Color("#bffcff"), 0.42), 0.035);
      });
      spineFlecks.forEach((item, fleckIndex) => {
        const pulse = 0.62 + Math.sin(time * 1.2 + item.phase) * 0.3 + Math.min(0.32, Math.abs(scrollImpulse) * 0.1);
        item.material.opacity = item.baseOpacity * pulse;
        item.material.rotation = Math.sin(item.phase) * Math.PI + Math.sin(time * 0.32 + item.phase + pillarVerticalPhase) * 0.2;
        item.sprite.position.x = item.basePosition.x + Math.sin(time * 0.28 + item.phase) * 0.006;
        item.sprite.position.y = item.basePosition.y + Math.cos(time * 0.24 + item.phase) * 0.018 + Math.sin(pillarVerticalPhase + fleckIndex * 0.07) * 0.012;
        item.sprite.scale.set(
          item.baseScale.x * (0.88 + pulse * 0.22 + (fleckIndex % 3) * 0.035),
          item.baseScale.y * (0.86 + pulse * 0.18),
          1
        );
      });
      surfaceOilPatches.forEach((item, patchIndex) => {
        const pulse = 0.74 + Math.sin(time * 0.55 + item.phase) * 0.16 + Math.min(0.22, Math.abs(scrollImpulse) * 0.09);
        item.material.opacity = item.opacity * pulse;
        item.material.rotation = item.rotation + Math.sin(time * 0.22 + item.phase + pillarVerticalPhase) * 0.06;
        item.sprite.position.x = item.position.x + Math.sin(time * 0.18 + item.phase) * 0.006;
        item.sprite.position.y = item.position.y + Math.sin(pillarVerticalPhase + patchIndex * 0.19) * 0.014;
        item.sprite.position.z = item.position.z + Math.cos(time * 0.2 + patchIndex) * 0.025;
        item.sprite.scale.set(item.scaleX * (0.94 + pulse * 0.1), item.scaleY * (0.96 + pulse * 0.08), 1);
      });
      referenceCrownPieces.forEach((item) => {
        const material = item.mesh.material as THREE.MeshPhysicalMaterial;
        const slowPulse = Math.sin(time * 0.32 + item.phase);
        item.mesh.position.y = item.basePosition.y + slowPulse * 0.012;
        item.mesh.position.z = item.basePosition.z + Math.cos(time * 0.26 + item.phase) * 0.01;
        item.mesh.rotation.y = item.baseRotation.y + Math.sin(time * 0.2 + item.phase) * 0.018;
        item.mesh.rotation.z = item.baseRotation.z + Math.sin(time * 0.24 + item.phase) * 0.018;
        item.mesh.scale.set(
          item.baseScale.x * (1 + slowPulse * 0.012),
          item.baseScale.y * (1 - slowPulse * 0.008),
          item.baseScale.z
        );
        material.emissiveIntensity = 0.068 + Math.sin(time * 0.58 + item.phase) * 0.016;
      });
      oilGlints.forEach((item) => {
        const material = item.sprite.material as THREE.SpriteMaterial;
        const pulse = 0.62 + Math.sin(time * 1.05 + item.phase) * 0.28;
        material.opacity = Math.max(0.016, pulse * 0.072);
        item.sprite.scale.x += ((0.32 + pulse * 0.14) - item.sprite.scale.x) * 0.08;
      });

      const columnPositions = columnParticleGeometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < columnParticleCount; index += 1) {
        const angle = columnParticleSeeds[index * 4] + time * columnParticleSeeds[index * 4 + 3] * 0.42;
        const radius = columnParticleSeeds[index * 4 + 1] + Math.sin(time * 1.6 + index) * 0.035;
        const verticalSeed = THREE.MathUtils.euclideanModulo(
          columnParticleSeeds[index * 4 + 2] - time * 0.046 * columnParticleSeeds[index * 4 + 3] - pillarVerticalPhase * 0.12,
          1
        );
        const y = (verticalSeed * 5.4) - 2.7;
        columnPositions.setXYZ(index, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      }
      columnPositions.needsUpdate = true;

      panelMeshes.forEach((panel) => {
        const { backplate, backplateMaterial, mesh, material } = panel;
        const offset = getInfiniteStorySlotOffset(panel.slotIndex, motionProgress);
        const absOffset = Math.abs(offset);
        const focus = Math.max(0, 1 - absOffset * 0.58);
        const trackWindow = Math.max(0, 1 - absOffset / 7.2);
        const carouselAngle = -offset * workTrackStep;
        const cardRadiusX = 0.68 + trackWindow * 0.32;
        const targetX = 0.18 + Math.sin(carouselAngle) * cardRadiusX;
        const targetY = 0.12 - offset * 0.52;
        const targetZ = 1.55 + Math.cos(carouselAngle) * 0.5 + focus * 0.56 - absOffset * 0.06;
        const targetScale = 0.44 + trackWindow * 0.22 + focus * 0.48;
        const scrollBoost = Math.min(0.12, Math.abs(scrollImpulse) * 0.035);
        const targetOpacity = Math.min(0.34, 0.032 + trackWindow * 0.11 + focus * 0.2 + scrollBoost * 0.14);

        // 这段回到源站 `positionViews` 的多 view / 50 度转面 / 相邻 target 插值逻辑：
        // 卡片在自身轨道上有横向半径和景深，柱体和镜头仍锁 x/z，只沿 y 扫描。
        // 用户滚动时看到的是多张 WorkItem 接力穿场，而不是柱子被卡片轨道拖着左右跑。
        mesh.position.x += (targetX - mesh.position.x) * 0.16;
        mesh.position.y += (targetY - mesh.position.y) * 0.16;
        mesh.position.z += (targetZ - mesh.position.z) * 0.16;
        const targetRotationY = -carouselAngle * 0.9 - 0.04;
        const targetRotationX = THREE.MathUtils.clamp(offset * -0.044, -0.16, 0.16);
        const targetRotationZ = Math.sin(carouselAngle) * 0.035;
        mesh.rotation.y += (targetRotationY - mesh.rotation.y) * 0.16;
        mesh.rotation.x += (targetRotationX - mesh.rotation.x) * 0.1;
        mesh.rotation.z += (targetRotationZ - mesh.rotation.z) * 0.1;
        mesh.scale.x += (targetScale - mesh.scale.x) * 0.1;
        mesh.scale.y += (targetScale - mesh.scale.y) * 0.1;
        mesh.renderOrder = Math.round(22 + focus * 10 + trackWindow * 3 - absOffset);
        backplate.position.copy(mesh.position);
        backplate.position.z -= 0.018;
        backplate.rotation.copy(mesh.rotation);
        backplate.scale.set(mesh.scale.x * 1.04, mesh.scale.y * 1.04, 1);
        backplate.renderOrder = mesh.renderOrder - 0.2;

        material.opacity += (targetOpacity - material.opacity) * 0.12;
        // WebGL 里的大 WorkPane 只承担源站式玻璃投影和景深层次；
        // 真正可读、可点击的业务卡片在 DOM 轨道里。这里压低背板/纹理不透明度，
        // 避免 3D 面片变成一整块廉价彩色矩形，把柱体和多卡片关系盖住。
        backplateMaterial.opacity += ((0.012 + trackWindow * 0.026 + focus * 0.044 + scrollBoost * 0.06) - backplateMaterial.opacity) * 0.12;
      });
      // DOM 前景轨道和 WebGL WorkItem 使用同一个无界 progress。
      // 它只改变卡片自身的轨道坐标/转面/透明度，不改变柱体坐标；这样即使 WebGL 暗场很重，
      // 用户也能稳定看见“所有卡片沿同一条真实轨道接力穿行”的滚动关系。
      applyStoryCardDomProgress(motionProgress, scrollImpulse);

      // 源站是真实 camera.group 在相邻 WorkItem target 间插值；这里为了满足“柱子不左右偏移”，
      // 只保留 y 方向的镜头扫描，让滚轮像沿着柱体上下观察，同时避免 x/z 变化造成柱体横漂错觉。
      const cameraScanY = Math.sin(pillarVerticalPhase * Math.PI * 0.7) * 0.12 + scrollFollow * 0.035;
      cameraTargetPosition.set(cameraBasePosition.x, cameraBasePosition.y + cameraScanY, cameraBasePosition.z);
      camera.position.lerp(cameraTargetPosition, 0.12);
      cameraLookAtTarget.set(cameraBaseLookAt.x, cameraBaseLookAt.y + cameraScanY * 0.58, cameraBaseLookAt.z);
      camera.lookAt(cameraLookAtTarget);

      renderer.render(scene, camera);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      sceneDisposed = true;
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
      environmentTexture.dispose();
      renderer.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      glowSprites.forEach((item) => {
        const material = item.sprite.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      });
      smokeSprites.forEach((item) => {
        (item.sprite.material as THREE.SpriteMaterial).dispose();
      });
      smokeTexture.dispose();
      pillarShellGeometry.dispose();
      pillarShellMaterial.dispose();
      pillarCoreGeometry.dispose();
      pillarCoreMaterial.dispose();
      liquidColumnGeometry.dispose();
      liquidColumnMaterial.dispose();
      pillarLineGeometry.dispose();
      pillarLineMaterial.dispose();
      const disposedGeometries = new Set<THREE.BufferGeometry>();
      const disposedMaterials = new Set<THREE.Material>();
      organicMeshes.forEach((mesh) => {
        if (!disposedGeometries.has(mesh.geometry)) {
          disposedGeometries.add(mesh.geometry);
          mesh.geometry.dispose();
        }

        const material = mesh.material as THREE.Material;
        if (!disposedMaterials.has(material)) {
          disposedMaterials.add(material);
          material.dispose();
        }
      });
      if (activeTheorySpineGeometry && !disposedGeometries.has(activeTheorySpineGeometry)) {
        activeTheorySpineGeometry.dispose();
      }
      if (activeTheoryFlowerPointGeometry && !disposedGeometries.has(activeTheoryFlowerPointGeometry)) {
        activeTheoryFlowerPointGeometry.dispose();
      }
      activeTheoryFlowerPointMaterial.dispose();
      spineTendons.forEach((tendon) => {
        tendon.geometry.dispose();
        (tendon.material as THREE.Material).dispose();
      });
      pillarVeils.forEach((item) => {
        item.material.dispose();
      });
      tendonMaterial.dispose();
      chainGeometry.dispose();
      chainMaterial.dispose();
      organicField.geometry.dispose();
      fieldMaterial.dispose();
      oilGlints.forEach((item) => {
        const material = item.sprite.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      });
      spineFlecks.forEach((item) => {
        item.material.dispose();
      });
      fleckTextures.forEach((texture) => texture.dispose());
      surfaceOilPatches.forEach((item) => {
        item.material.dispose();
      });
      cavityGeometry.dispose();
      cavityMaterial.dispose();
      deepCavityMaterial.dispose();
      topCavityMaterial.dispose();
      oilBaseMaterial.dispose();
      oilTexture.dispose();
      referenceOilTexture.dispose();
      referenceSpineFieldGeometry.dispose();
      referenceSpineSubjectGeometry.dispose();
      referenceSpineFieldMaterial.dispose();
      referenceSpineGhostMaterial.dispose();
      referenceSpineMotionMaterial.dispose();
      referenceSpineSubjectMaterial.dispose();
      referenceSpineOcclusionMaterial.dispose();
      referenceSpineRimMaterial.dispose();
      referenceSpineFieldTexture.dispose();
      activeTheorySpineMatcapTexture.dispose();
      activeTheorySpineNormalTexture.dispose();
      activeTheoryWorkEnvTexture.dispose();
      activeTheoryWorkNormalTexture.dispose();
      activeTheoryWorkHogwartsThumbTexture.dispose();
      activeTheoryWorkHogwartsLogoTexture.dispose();
      activeTheorySpineBaseColorTexture.dispose();
      activeTheorySpineMroTexture.dispose();
      if (activeTheorySpineBaseColorTexture !== activeTheorySpineBaseColorFallbackTexture) {
        activeTheorySpineBaseColorFallbackTexture.dispose();
      }
      if (activeTheorySpineMroTexture !== activeTheorySpineMroFallbackTexture) {
        activeTheorySpineMroFallbackTexture.dispose();
      }
      void activeTheorySpineSourceTexturePromise.then((textures) => {
        textures?.forEach((texture) => {
          if (texture !== activeTheorySpineBaseColorTexture && texture !== activeTheorySpineMroTexture) {
            texture.dispose();
          }
        });
      });
      referenceSpineSubjectMaskTexture.dispose();
      referenceSpineMotionTexture.dispose();
      referenceSpineSubjectTexture.dispose();
      referenceSpineSubjectDynamicMaskTexture.dispose();
      referenceSpineMotionVideo.pause();
      referenceSpineMotionVideo.removeAttribute("src");
      referenceSpineMotionVideo.load();
      referenceSpineSubjectVideo.pause();
      referenceSpineSubjectVideo.removeAttribute("src");
      referenceSpineSubjectVideo.load();
      referenceSpineSubjectMaskVideo.pause();
      referenceSpineSubjectMaskVideo.removeAttribute("src");
      referenceSpineSubjectMaskVideo.load();
      referenceSpineRimTexture.dispose();
      oilBumpTexture.dispose();
      oilAlphaTexture.dispose();
      oilPatchTexture.dispose();
      ringMeshes.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.MeshBasicMaterial).dispose();
      });
      columnParticleGeometry.dispose();
      columnParticleMaterial.dispose();
      spineGeometry.dispose();
      spineMaterial.dispose();
      panelMeshes.forEach((panel) => {
        panel.geometry.dispose();
        panel.material.map?.dispose();
        panel.material.dispose();
        panel.backplateGeometry.dispose();
        panel.backplateMaterial.dispose();
      });
      referenceGlassPanels.forEach((panel) => {
        panel.geometry.dispose();
        panel.texture.dispose();
        panel.material.dispose();
        panel.mediaMaterial?.dispose();
        panel.refractionMaterial?.dispose();
      });
    };
  }, [applyStoryCardDomProgress, syncActiveIndexFromProgress]);

  return (
    <main
      aria-label="AI PM 滚动故事首页"
      className="landing-home landing-home--story"
      ref={scrollSectionRef}
      style={sceneStyle}
    >
      <section
        aria-label="AI PM 滚动故事舞台"
        className="landing-story-viewport"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        ref={experienceRef}
        tabIndex={0}
      >
      <div className="landing-story-hero-asset" aria-hidden="true" />
      <canvas aria-hidden="true" className="landing-story-canvas" ref={canvasRef} />
      <div className="landing-story-workitem-rail">
        {storyWorkItemSlots.map(({ key, scene, sceneIndex, slotIndex }) => (
          <button
            aria-label={`查看 ${scene.title}`}
            aria-pressed={activeIndex === sceneIndex}
            className="landing-story-workitem-card"
            data-active={activeIndex === sceneIndex && Math.abs(getInfiniteStorySlotOffset(slotIndex, activeIndex)) < 0.42 ? "true" : "false"}
            data-story-index={sceneIndex}
            data-story-key={scene.key}
            data-story-slot={slotIndex}
            key={key}
            onClick={() => goToScene(sceneIndex)}
            onFocus={() => goToScene(sceneIndex)}
            onPointerDown={() => goToScene(sceneIndex)}
            ref={(node) => {
              storyCardRefs.current[slotIndex] = node;
            }}
            style={{ "--card-accent": scene.accent, ...getInitialStoryCardStyle(slotIndex, activeIndex) } as CSSProperties}
            type="button"
          >
            <span>{scene.label}</span>
            <strong>{scene.title}</strong>
            <p>{scene.kicker}</p>
            <small>{scene.metric}</small>
          </button>
        ))}
      </div>
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
          <DashboardOutlined />
          AI PM / LIVE WORKBENCH
        </span>
        <h1>
          AI PM 项目作战舱
        </h1>
        <p className="landing-story-copy__kicker">需求、任务、Bug 和版本在同一块空间里实时推进。</p>
        <p>登录后回到真实工作台，项目交付、负责人和风险状态在同一个视场里被持续校准。</p>
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

      </section>
    </main>
  );
}
