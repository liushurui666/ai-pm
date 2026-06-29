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

function createOilSlickTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");

  if (context) {
    const baseGradient = context.createLinearGradient(0, 0, 1024, 1024);
    baseGradient.addColorStop(0, "#091112");
    baseGradient.addColorStop(0.38, "#101718");
    baseGradient.addColorStop(0.68, "#050709");
    baseGradient.addColorStop(1, "#17120f");
    context.fillStyle = baseGradient;
    context.fillRect(0, 0, 1024, 1024);

    const slickColors = ["#75e2ff", "#a78cff", "#f87fd1", "#e8c174", "#f2f7ff"];
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 188; index += 1) {
      const color = slickColors[index % slickColors.length];
      const x = 120 + ((Math.sin(index * 39.37) + 1) / 2) * 820;
      const y = 80 + ((Math.cos(index * 21.17) + 1) / 2) * 880;
      const radiusX = 36 + (index % 10) * 16;
      const radiusY = 14 + (index % 8) * 8;
      const rotation = Math.sin(index * 4.19) * Math.PI;
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);

      gradient.addColorStop(0, `${color}8a`);
      gradient.addColorStop(0.3, `${color}40`);
      gradient.addColorStop(0.72, `${color}12`);
      gradient.addColorStop(1, `${color}00`);

      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.scale(1, radiusY / radiusX);
      context.fillStyle = gradient;
      context.fillRect(-radiusX, -radiusX, radiusX * 2, radiusX * 2);
      context.restore();
    }

    context.globalAlpha = 0.032;
    context.lineWidth = 2;
    for (let index = 0; index < 28; index += 1) {
      const y = 80 + index * 24 + Math.sin(index * 1.7) * 18;
      context.strokeStyle = slickColors[(index + 2) % slickColors.length];
      context.beginPath();
      context.moveTo(-80, y);
      context.bezierCurveTo(230, y - 90, 480, y + 84, 1120, y - 36);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.8, 3.4);
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
  const radialSegments = 96;
  const heightSegments = 22;
  const columns = radialSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const angleDistance = (angle: number, target: number) => {
    const diff = Math.atan2(Math.sin(angle - target), Math.cos(angle - target));
    return Math.abs(diff);
  };

  // 之前的挤出多边形太像机械积木，单根 shader 又像彩带软管。
  // 这里直接生成参数化椎体表面：上下有唇口，左右/后侧有不对称突起，
  // 并在顶点层加入微扰，让每一节都是可动画的真实 3D 几何。
  for (let row = 0; row <= heightSegments; row += 1) {
    const v = row / heightSegments;
    const yNorm = v * 2 - 1;
    const vertical = Math.abs(yNorm);
    const waist = 1 - vertical * vertical * 0.3;
    const lip = Math.exp(-Math.pow((vertical - 0.6) / 0.18, 2)) * 0.18;
    const organicOffset = Math.sin(phase + yNorm * 2.4) * 0.01;

    for (let column = 0; column <= radialSegments; column += 1) {
      const u = column / radialSegments;
      const theta = u * Math.PI * 2;
      const processEnvelope = Math.exp(-Math.pow(yNorm / 0.58, 2));
      const sideProcess =
        (Math.exp(-Math.pow(angleDistance(theta, 0) / 0.32, 2)) +
          Math.exp(-Math.pow(angleDistance(theta, Math.PI) / 0.32, 2)) * 0.88) *
        processEnvelope *
        0.18;
      const rearProcess = Math.exp(-Math.pow(angleDistance(theta, -Math.PI / 2) / 0.42, 2)) * Math.exp(-Math.pow((yNorm + 0.02) / 0.7, 2)) * 0.28;
      const frontNotch = -Math.exp(-Math.pow(angleDistance(theta, Math.PI / 2) / 0.46, 2)) * Math.exp(-Math.pow(yNorm / 0.8, 2)) * 0.17;
      const topBottomBite = -Math.exp(-Math.pow(angleDistance(theta, Math.PI / 2) / 0.74, 2)) * Math.exp(-Math.pow((vertical - 0.78) / 0.2, 2)) * 0.07;
      const boneFacets = Math.sin(theta * 3.0 + phase) * 0.032 + Math.sin(theta * 6.0 + yNorm * 4.2 + phase) * 0.02;
      const fineRipple = Math.sin(theta * 13.0 + phase) * 0.011 + Math.sin(yNorm * 14.0 + theta * 1.7 + phase) * 0.01;
      const radiusX = (0.34 * waist + lip + sideProcess + topBottomBite + boneFacets + fineRipple) * (1 + (segmentIndex % 2) * 0.008);
      const radiusZ = 0.29 * waist + lip * 0.34 + rearProcess + frontNotch + topBottomBite + boneFacets * 0.5 + fineRipple * 0.4;
      const x = Math.cos(theta) * radiusX;
      const z = Math.sin(theta) * radiusZ;
      const y = yNorm * 0.31 + organicOffset + Math.sin(theta * 3 + phase) * 0.018 * (1 - vertical);

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
  positions.push(0, -0.335 + Math.sin(phase) * 0.008, 0);
  uvs.push(0.5, 0);
  const topCenterIndex = positions.length / 3;
  positions.push(0, 0.335 + Math.cos(phase) * 0.008, 0);
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
  const axisSegments = 14;
  const radialSegments = 24;
  const columns = radialSegments + 1;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  for (let axisIndex = 0; axisIndex <= axisSegments; axisIndex += 1) {
    const t = axisIndex / axisSegments;
    const x = (t - 0.5) * 0.52;
    const endTaper = Math.pow(Math.sin(Math.PI * t), 0.7);
    const rootMass = Math.exp(-Math.pow((t - 0.36) / 0.26, 2)) * 0.1;
    const tipPinch = 0.86 - Math.max(0, t - 0.74) * 0.82;
    const bendY = Math.sin(t * Math.PI * 1.2 + phase) * 0.022;
    const bendZ = Math.cos(t * Math.PI * 1.1 + phase) * 0.026;

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const u = radialIndex / radialSegments;
      const angle = u * Math.PI * 2;
      const ridge =
        1 +
        Math.sin(angle * 3 + phase + t * 4.2) * 0.14 +
        Math.cos(angle * 5 - phase + t * 3.6) * 0.07 +
        Math.sin((x + Math.sin(angle)) * 21 + phase) * 0.04;
      const radiusY = (0.028 + endTaper * 0.068 * tipPinch + rootMass * 0.82) * ridge;
      const radiusZ = (0.022 + endTaper * 0.056 * tipPinch + rootMass * 0.64) * (1 + Math.cos(angle * 4 + phase) * 0.09);

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

  context.fillStyle = "rgba(11,10,8,0.18)";
  drawRoundedRect(context, 24, 24, canvas.width - 48, canvas.height - 48, 54);
  context.fill();

  context.globalAlpha = 0.06;
  context.strokeStyle = "#f4ebd0";
  context.lineWidth = 1.8;
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
    pillarGroup.position.set(-0.18, -0.08, -0.34);
    pillarGroup.rotation.y = -0.08;
    pillarGroup.scale.set(0.92, 1.32, 0.9);
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

    // 参考 Active Theory /work 的视觉重点不是显式进度条，而是中心光柱本身；
    // 这里用柱体、纵向线框和上升粒子组成一个“交付能量核”，滚轮只轻微改变色相和卡片位置。
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
    const oilBumpTexture = createOilBumpTexture();
    oilTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    oilBumpTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const oilBaseMaterial = new THREE.MeshPhysicalMaterial({
      bumpMap: oilBumpTexture,
      bumpScale: 0.062,
      clearcoat: 0.88,
      clearcoatRoughness: 0.24,
      color: new THREE.Color("#111719"),
      emissive: new THREE.Color("#5d4d78"),
      emissiveIntensity: 0.026,
      emissiveMap: oilTexture,
      envMapIntensity: 1.85,
      iridescence: 1,
      iridescenceIOR: 1.9,
      iridescenceThicknessRange: [110, 1720],
      map: oilTexture,
      metalness: 0.18,
      opacity: 0.94,
      roughness: 0.52,
      roughnessMap: oilBumpTexture,
      sheen: 0.5,
      sheenColor: new THREE.Color("#b59aff"),
      sheenRoughness: 0.42,
      specularColor: new THREE.Color("#c9eaff"),
      specularIntensity: 0.76,
      thickness: 0.72,
      transmission: 0.12,
      transparent: true,
    });

    const organicPalette = ["#6ee7ff", "#8e73ff", "#db5cff", "#ff6fc6", "#d7a261"];
    const organicMeshes: THREE.Mesh[] = [];
    const cavityGeometry = new THREE.SphereGeometry(0.18, 24, 12);
    const cavityMaterial = new THREE.MeshPhysicalMaterial({
      clearcoat: 0.4,
      color: new THREE.Color("#000104"),
      emissive: new THREE.Color("#01020a"),
      emissiveIntensity: 0.01,
      envMapIntensity: 0.35,
      metalness: 0.2,
      opacity: 0.68,
      roughness: 0.82,
      transparent: true,
    });
    const cavityMeshes: THREE.Mesh[] = [];
    const vertebraSegments = Array.from({ length: 8 }, (_, chunkIndex) => {
      const group = new THREE.Group();
      const baseY = -2.72 + chunkIndex * 0.78;
      const phase = chunkIndex * 0.91;
      const massVariation = 1 + Math.sin(phase * 1.37) * 0.1;
      const sideBias = chunkIndex % 2 === 0 ? 1 : -1;
      group.position.set(Math.sin(phase) * 0.032, baseY, Math.cos(phase * 0.8) * 0.03);
      group.rotation.set(0.035 * Math.sin(phase), sideBias * 0.08 + phase * 0.045, 0.04 * Math.cos(phase));
      pillarGroup.add(group);

      const meshes: THREE.Mesh[] = [];
      const makeMaterial = (accentIndex: number) => {
        const material = oilBaseMaterial.clone();
        material.emissive = new THREE.Color(organicPalette[accentIndex % organicPalette.length]);
        material.emissiveIntensity = 0.032 + (accentIndex % 4) * 0.006;
        material.color = new THREE.Color("#111719");
        return material;
      };

      const body = new THREE.Mesh(createVertebraBodyGeometry(chunkIndex), makeMaterial(chunkIndex));
      body.scale.set((0.94 + (chunkIndex % 2) * 0.02) * massVariation, 1.3, (0.98 + (chunkIndex % 2) * 0.03) * (1.02 - Math.sin(phase) * 0.02));
      group.add(body);
      meshes.push(body);

      const leftProcess = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 12), makeMaterial(chunkIndex + 1));
      leftProcess.position.set(-0.45 * massVariation, -0.035, -0.07 - Math.sin(phase) * 0.026);
      leftProcess.rotation.set(0.2 + Math.sin(phase) * 0.06, 0.2 + sideBias * 0.06, 0.46 + Math.cos(phase) * 0.06);
      leftProcess.scale.set(0.78 * massVariation, 0.74, 0.52);
      group.add(leftProcess);
      meshes.push(leftProcess);

      const rightProcess = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 24), makeMaterial(chunkIndex + 2));
      rightProcess.position.set(0.43 * (2 - massVariation), 0.025, 0.12 + Math.cos(phase) * 0.026);
      rightProcess.rotation.set(-0.16 + Math.cos(phase) * 0.06, -0.24 + sideBias * 0.06, -0.46 + Math.sin(phase) * 0.05);
      rightProcess.scale.set(0.72 * (2 - massVariation), 0.72, 0.5);
      group.add(rightProcess);
      meshes.push(rightProcess);

      const rearSpike = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 36), makeMaterial(chunkIndex + 3));
      rearSpike.position.set(Math.sin(phase) * 0.026, -0.02, -0.34);
      rearSpike.rotation.set(0.1 * Math.sin(phase), Math.PI / 2 + 0.14 + sideBias * 0.05, 0.16 * Math.cos(phase));
      rearSpike.scale.set(0.74, 0.7, 0.46);
      group.add(rearSpike);
      meshes.push(rearSpike);

      const lowerKnuckle = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 48), makeMaterial(chunkIndex + 4));
      lowerKnuckle.position.set(-0.14 * sideBias + Math.sin(phase) * 0.028, -0.17, 0.22);
      lowerKnuckle.rotation.set(0.36, -0.28 * sideBias, 0.48 * sideBias);
      lowerKnuckle.scale.set(0.34, 0.5, 0.34);
      group.add(lowerKnuckle);
      meshes.push(lowerKnuckle);

      const upperKnuckle = new THREE.Mesh(createOrganicLobeGeometry(chunkIndex + 60), makeMaterial(chunkIndex + 5));
      upperKnuckle.position.set(0.16 * sideBias + Math.cos(phase) * 0.028, 0.16, -0.21);
      upperKnuckle.rotation.set(-0.28, 0.2 * sideBias, -0.42 * sideBias);
      upperKnuckle.scale.set(0.34, 0.48, 0.32);
      group.add(upperKnuckle);
      meshes.push(upperKnuckle);

      // 参考柱体的“高级感”很大一部分来自黑色凹洞和油膜边缘，而不是纯亮面块。
      // 不做布尔切割，改用压扁的暗色椭球贴在骨节前侧，形成从当前视角可读的凹陷阴影。
      for (let cavityIndex = 0; cavityIndex < 2; cavityIndex += 1) {
        const cavity = new THREE.Mesh(cavityGeometry, cavityMaterial);
        const cavityPhase = phase + cavityIndex * 1.6;
        cavity.position.set(
          (cavityIndex === 0 ? -0.12 : 0.14) * sideBias + Math.sin(cavityPhase) * 0.035,
          -0.04 + cavityIndex * 0.12,
          0.29 + Math.cos(cavityPhase) * 0.03
        );
        cavity.rotation.set(0.28 + Math.sin(cavityPhase) * 0.1, sideBias * 0.38, Math.cos(cavityPhase) * 0.5);
        cavity.scale.set(0.64 + cavityIndex * 0.14, 0.32 + cavityIndex * 0.07, 0.12);
        group.add(cavity);
        cavityMeshes.push(cavity);
      }

      meshes.forEach((mesh) => organicMeshes.push(mesh));
      return { baseY, group, massVariation, meshes, phase, sideBias };
    });
    vertebraSegments.forEach((segment) => {
      segment.group.visible = true;
    });

    // 参考图里的柱体不是孤立骨块堆叠，而是有暗色油膜中轴把椎骨串在一起。
    // 这里用几条轻微扭动的 TubeGeometry 做“脊柱韧带”，减少节与节之间的断裂感；
    // 它们挂在 pillarGroup 上，所以滚轮推进时会和椎骨、玻璃卡片一起换面。
    const tendonMaterial = oilBaseMaterial.clone();
    tendonMaterial.color = new THREE.Color("#030508");
    tendonMaterial.emissive = new THREE.Color("#56f4ff");
    tendonMaterial.emissiveIntensity = 0.016;
    tendonMaterial.envMapIntensity = 1.22;
    tendonMaterial.opacity = 0.34;
    tendonMaterial.roughness = 0.54;
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
      pillarGroup.add(tendon);
      return tendon;
    });

    const chainGeometry = new THREE.TorusGeometry(0.16, 0.036, 14, 36);
    const chainMaterial = oilBaseMaterial.clone();
    chainMaterial.color = new THREE.Color("#05070c");
    chainMaterial.emissive = new THREE.Color("#5fe7ff");
    chainMaterial.emissiveIntensity = 0.035;
    chainMaterial.envMapIntensity = 1.2;
    chainMaterial.opacity = 0.52;
    chainMaterial.transparent = true;
    const chainLinks = Array.from({ length: 13 }, (_, linkIndex) => {
      const link = new THREE.Mesh(chainGeometry, chainMaterial);
      link.position.set(-0.94 + Math.sin(linkIndex * 0.64) * 0.025, -2.8 + linkIndex * 0.24, -0.82);
      link.rotation.set(Math.PI / 2, linkIndex % 2 === 0 ? 0.18 : Math.PI / 2 + 0.18, 0.1 * Math.sin(linkIndex));
      link.scale.set(0.64, 1.08, 0.64);
      pillarGroup.add(link);
      return link;
    });

    const fieldMaterial = oilBaseMaterial.clone();
    fieldMaterial.color = new THREE.Color("#05080d");
    fieldMaterial.emissive = new THREE.Color("#7dfff0");
    fieldMaterial.emissiveIntensity = 0.016;
    fieldMaterial.vertexColors = true;
    fieldMaterial.bumpMap = oilTexture;
    fieldMaterial.bumpScale = 0.035;
    fieldMaterial.depthWrite = false;
    fieldMaterial.opacity = 0.18;
    fieldMaterial.transparent = true;
    const organicField = new MarchingCubes(46, fieldMaterial, true, true, 120000);
    organicField.isolation = 62;
    organicField.position.set(0.02, 0, 0.02);
    organicField.scale.set(1.42, 2.68, 0.86);
    organicField.visible = true;
    pillarGroup.add(organicField);

    const fieldNodes = Array.from({ length: 8 }, (_, nodeIndex) => ({
      phase: nodeIndex * 0.71,
      y: 0.12 + nodeIndex * 0.11,
    }));

    const updateOrganicField = (time: number, activeColor: THREE.Color) => {
      organicField.reset();
      fieldNodes.forEach((node, nodeIndex) => {
        const nodeColor = new THREE.Color(organicPalette[(nodeIndex + activeIndexRef.current) % organicPalette.length]).lerp(activeColor, 0.18);
        const y = node.y + Math.sin(time * 0.44 + node.phase) * 0.01;
        const coreX = 0.5 + Math.sin(time * 0.24 + node.phase) * 0.045;
        const coreZ = 0.5 + Math.cos(time * 0.28 + node.phase) * 0.035;
        const strength = 0.48 + Math.sin(time * 0.58 + node.phase) * 0.04;
        const lobeAngle = node.phase * 2.4 + Math.sin(time * 0.16) * 0.32;
        const lobeX = Math.cos(lobeAngle) * (0.18 + (nodeIndex % 3) * 0.035);
        const lobeZ = Math.sin(lobeAngle) * 0.17;
        const rearX = Math.cos(lobeAngle + 2.2) * 0.14;
        const rearZ = Math.sin(lobeAngle + 2.2) * 0.2;

        organicField.addBall(coreX, y, coreZ, strength, 14.2, nodeColor);
        organicField.addBall(coreX + lobeX, y + 0.012, coreZ + lobeZ, 0.18, 16.2, nodeColor);
        organicField.addBall(coreX + rearX, y - 0.018, coreZ + rearZ, 0.12, 17.4, nodeColor);

        if (nodeIndex % 2 === 0) {
          organicField.addBall(coreX - lobeX * 0.65, y + 0.032, coreZ - lobeZ * 0.72, 0.095, 18.6, nodeColor);
        }
      });
      organicField.update();
    };

    const oilGlints = Array.from({ length: 16 }, (_, glintIndex) => {
      const color = organicPalette[glintIndex % organicPalette.length];
      const texture = createGlowTexture(color);
      const material = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: texture,
        opacity: 0.07 + (glintIndex % 5) * 0.016,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      const segmentIndex = glintIndex % vertebraSegments.length;
      const segment = vertebraSegments[segmentIndex];
      const angle = glintIndex * 2.21;
      sprite.position.set(
        Math.cos(angle) * (0.46 + (glintIndex % 4) * 0.06),
        segment.baseY + Math.sin(angle) * 0.12,
        Math.sin(angle) * 0.22 - 0.14
      );
      const scale = 0.2 + (glintIndex % 6) * 0.035;
      sprite.scale.set(scale * 3.25, scale * 0.72, 1);
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

    const columnParticleCount = 980;
    const columnParticlePositions = new Float32Array(columnParticleCount * 3);
    const columnParticleSeeds = new Float32Array(columnParticleCount * 4);
    const columnParticleColors = new Float32Array(columnParticleCount * 3);
    const columnParticleSizes = new Float32Array(columnParticleCount);
    const columnParticleAlphas = new Float32Array(columnParticleCount);
    const columnParticlePhases = new Float32Array(columnParticleCount);
    for (let index = 0; index < columnParticleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.22 + Math.pow(Math.random(), 2.05) * 0.86;
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
      columnParticleSizes[index] = 1.6 + Math.pow(Math.random(), 2.0) * 6.4;
      columnParticleAlphas[index] = 0.045 + Math.random() * 0.18;
      columnParticlePhases[index] = Math.random() * Math.PI * 2;
    }
    const columnParticleGeometry = new THREE.BufferGeometry();
    columnParticleGeometry.setAttribute("position", new THREE.BufferAttribute(columnParticlePositions, 3));
    columnParticleGeometry.setAttribute("color", new THREE.BufferAttribute(columnParticleColors, 3));
    columnParticleGeometry.setAttribute("aSize", new THREE.BufferAttribute(columnParticleSizes, 1));
    columnParticleGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(columnParticleAlphas, 1));
    columnParticleGeometry.setAttribute("aPhase", new THREE.BufferAttribute(columnParticlePhases, 1));
    const columnParticleMaterial = createVolumetricParticleMaterial(0.42);
    const columnParticles = new THREE.Points(columnParticleGeometry, columnParticleMaterial);
    pillarGroup.add(columnParticles);

    const panelMeshes = storyScenes.map((sceneItem, index) => {
      const geometry = new THREE.PlaneGeometry(THREE_PANEL_WIDTH / 245, THREE_PANEL_HEIGHT / 245, 12, 8);
      const material = new THREE.MeshBasicMaterial({
        depthTest: false,
        depthWrite: false,
        map: createPanelTexture(sceneItem),
        opacity: 0.86,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const initialOffset = index > storyScenes.length / 2 ? index - storyScenes.length : index;
      const initialAbsOffset = Math.abs(initialOffset);
      const initialAngle = initialOffset * 1.02;
      const initialScale = initialOffset === 0 ? 1.14 : Math.max(0.52, 0.78 - initialAbsOffset * 0.12);
      mesh.position.set(Math.sin(initialAngle) * 2.72 - 0.5, 0.04 - initialAbsOffset * 0.08, Math.cos(initialAngle) * 1.18 - 0.04 - initialAbsOffset * 0.22);
      mesh.rotation.set(initialOffset === 0 ? -0.018 : 0.018 * Math.sign(initialOffset), -initialAngle * 0.9 - 0.04, 0);
      mesh.scale.set(initialScale, initialScale, 1);
      material.opacity = initialOffset === 0 ? 0.975 : Math.max(0.06, 0.2 - initialAbsOffset * 0.075);
      mesh.renderOrder = initialOffset === 0 ? 8 : Math.max(1, 5 - initialAbsOffset);
      mesh.userData.index = index;
      stage.add(mesh);
      return mesh;
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

    const resize = () => {
      const rect = root.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      particleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      columnParticleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    };

    const getProgressDelta = (target: number, current: number) => {
      let delta = target - current;
      const half = storyScenes.length / 2;

      if (delta > half) {
        delta -= storyScenes.length;
      }

      if (delta < -half) {
        delta += storyScenes.length;
      }

      return delta;
    };

    const getVisualOffset = (index: number, progress: number) => {
      let offset = index - progress;
      const half = storyScenes.length / 2;

      while (offset > half) {
        offset -= storyScenes.length;
      }

      while (offset < -half) {
        offset += storyScenes.length;
      }

      return offset;
    };

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const time = performance.now() * 0.001;
      const activeColor = new THREE.Color(storyScenes[activeIndexRef.current].accent);
      const progressDelta = getProgressDelta(activeIndexRef.current, visualProgress);

      if (Math.abs(progressDelta) < 0.0008) {
        visualProgress += progressDelta;
      } else {
        visualProgress += progressDelta * 0.1;
      }

      // 参考 mp4 里滚动时不是单独翻卡片，而是整个中心装置一起换角度。
      // 所以这里用同一个 visualProgress 同时驱动卡片 carousel 和脊柱本体，
      // 保证用户滚轮推进时能看到柱体跟随故事段旋转，而不是固定在原地。
      const storyOrbit = visualProgress * 1.12;
      particleMaterial.uniforms.uTime.value = time;
      columnParticleMaterial.uniforms.uTime.value = time;
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

      oilTexture.offset.x = Math.sin(time * 0.045) * 0.035;
      oilTexture.offset.y = time * 0.032;
      stage.rotation.y = Math.sin(storyOrbit) * 0.06;
      particles.rotation.y -= 0.0009;
      particles.rotation.z = Math.sin(time * 0.18) * 0.06;
      liquidColumn.rotation.y = Math.sin(time * 0.2) * 0.18;
      liquidColumn.scale.x = 1 + Math.sin(time * 0.52) * 0.035;
      liquidColumn.scale.z = 1 + Math.cos(time * 0.48) * 0.035;
      spine.rotation.x += 0.003;
      spine.rotation.y += 0.006;
      pillarGroup.position.x = -0.18 + Math.sin(storyOrbit) * 0.28;
      pillarGroup.position.z = -0.34 + Math.cos(storyOrbit) * 0.12;
      pillarGroup.rotation.y = -0.08 - storyOrbit * 1.04;
      pillarGroup.rotation.x = Math.sin(storyOrbit * 0.72) * 0.085;
      pillarShell.scale.x = 1 + Math.sin(time * 1.3) * 0.035;
      pillarShell.scale.z = 1 + Math.cos(time * 1.1) * 0.035;
      pillarCore.scale.x = 1 + Math.sin(time * 1.9) * 0.09;
      pillarCore.scale.z = 1 + Math.sin(time * 1.9) * 0.09;
      pillarLines.rotation.y += 0.0048;
      spineTendons.forEach((tendon, tendonIndex) => {
        const material = tendon.material as THREE.MeshPhysicalMaterial;
        material.emissiveIntensity = 0.012 + Math.sin(time * 0.76 + tendonIndex) * 0.005;
        tendon.rotation.y = Math.sin(time * 0.18 + tendonIndex) * 0.045;
      });
      chainLinks.forEach((link, linkIndex) => {
        link.position.x = -0.72 + Math.sin(linkIndex * 0.64 + storyOrbit) * 0.035;
        link.rotation.z = 0.1 * Math.sin(linkIndex + storyOrbit);
      });
      vertebraSegments.forEach((segment, segmentIndex) => {
        segment.group.position.x = Math.sin(segment.phase + storyOrbit * 0.56) * 0.04;
        segment.group.position.y = segment.baseY;
        segment.group.position.z = Math.cos(segment.phase * 0.8 + storyOrbit * 0.5) * 0.042;
        segment.group.rotation.x = 0.04 * Math.sin(segment.phase + storyOrbit * 0.42);
        segment.group.rotation.y = segment.sideBias * 0.08 + segment.phase * 0.045 + storyOrbit * 0.42;
        segment.group.rotation.z = 0.048 * Math.cos(segment.phase + storyOrbit * 0.38);
        segment.group.scale.setScalar(segment.massVariation);

        segment.meshes.forEach((mesh, meshIndex) => {
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          const paletteColor = new THREE.Color(organicPalette[(segmentIndex + meshIndex + activeIndexRef.current) % organicPalette.length]);
          material.color.lerp(new THREE.Color("#12181a").lerp(paletteColor, 0.035), 0.02);
          material.emissive.lerp(paletteColor.multiplyScalar(0.034 + Math.sin(time * 0.7 + meshIndex) * 0.012), 0.025);
        });
      });
      oilGlints.forEach((item) => {
        const material = item.sprite.material as THREE.SpriteMaterial;
        const pulse = 0.62 + Math.sin(time * 1.05 + item.phase) * 0.28;
        material.opacity = Math.max(0.018, pulse * 0.075);
        item.sprite.scale.x += ((0.34 + pulse * 0.14) - item.sprite.scale.x) * 0.08;
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
        const offset = getVisualOffset(index, visualProgress);
        const absOffset = Math.abs(offset);
        const carouselAngle = offset * 1.02;
        const targetX = Math.sin(carouselAngle) * 2.72 - 0.5;
        const targetY = 0.04 - absOffset * 0.08;
        const targetZ = Math.cos(carouselAngle) * 1.18 - 0.04 - absOffset * 0.22;
        const targetScale = offset === 0 ? 1.14 : Math.max(0.52, 0.78 - absOffset * 0.12);
        const targetOpacity = offset === 0 ? 0.975 : Math.max(0.06, 0.2 - absOffset * 0.075);

        mesh.position.x += (targetX - mesh.position.x) * 0.065;
        mesh.position.y += (targetY - mesh.position.y) * 0.065;
        mesh.position.z += (targetZ - mesh.position.z) * 0.065;
        mesh.rotation.y += ((-carouselAngle * 0.9 - 0.04) - mesh.rotation.y) * 0.075;
        mesh.rotation.x += ((offset === 0 ? -0.018 : 0.018 * Math.sign(offset)) - mesh.rotation.x) * 0.075;
        mesh.scale.x += (targetScale - mesh.scale.x) * 0.07;
        mesh.scale.y += (targetScale - mesh.scale.y) * 0.07;
        mesh.renderOrder = offset === 0 ? 8 : Math.max(1, 5 - absOffset);

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
      organicMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.MeshPhysicalMaterial).dispose();
      });
      spineTendons.forEach((tendon) => {
        tendon.geometry.dispose();
        (tendon.material as THREE.Material).dispose();
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
      cavityGeometry.dispose();
      cavityMaterial.dispose();
      oilBaseMaterial.dispose();
      oilTexture.dispose();
      oilBumpTexture.dispose();
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
      <div className="landing-story-hero-asset" aria-hidden="true" />
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

    </main>
  );
}
