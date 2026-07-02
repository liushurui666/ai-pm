import * as THREE from "three";
import { aeroStoryChapters, type AeroAsset } from "./story-data";

export type LoadedAeroModel = {
  asset: AeroAsset;
  baseRotation: THREE.Euler;
  baseScale: number;
  emissiveMaterials: THREE.MeshStandardMaterial[];
  homePosition: THREE.Vector3;
  wrapper: THREE.Group;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function lerpTuple(
  from: [number, number, number],
  to: [number, number, number],
  progress: number
): [number, number, number] {
  return [
    lerp(from[0], to[0], progress),
    lerp(from[1], to[1], progress),
    lerp(from[2], to[2], progress),
  ];
}

export function getActiveChapterIndex(progress: number) {
  const maxIndex = aeroStoryChapters.length - 1;
  return clamp(Math.round(progress * maxIndex), 0, maxIndex);
}

export function getStoryState(progress: number) {
  const maxIndex = aeroStoryChapters.length - 1;
  const exactIndex = clamp(progress, 0, 1) * maxIndex;
  const fromIndex = clamp(Math.floor(exactIndex), 0, maxIndex);
  const toIndex = clamp(fromIndex + 1, 0, maxIndex);
  const localProgress = clamp(exactIndex - fromIndex, 0, 1);
  const from = aeroStoryChapters[fromIndex];
  const to = aeroStoryChapters[toIndex];

  return {
    accent: localProgress < 0.5 ? from.accent : to.accent,
    focus: lerpTuple(from.focus, to.focus, localProgress),
    yaw: lerp(from.cameraYaw, to.cameraYaw, localProgress),
  };
}

export function createStoryCurve() {
  return new THREE.CatmullRomCurve3(
    aeroStoryChapters.map((chapter) => new THREE.Vector3(...chapter.focus)),
    false,
    "catmullrom",
    0.34
  );
}

// 用真实 Three.js 粒子补足电影夜空的空间深度，避免用静态背景图伪造主视觉。
export function createStarField() {
  const count = 840;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colorA = new THREE.Color("#6ce7ff");
  const colorB = new THREE.Color("#f5c36c");
  const colorC = new THREE.Color("#d58cff");

  for (let index = 0; index < count; index += 1) {
    const radius = 4 + Math.random() * 9.6;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 7.2;
    const color = (index % 3 === 0 ? colorA : index % 3 === 1 ? colorB : colorC)
      .clone()
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.28);

    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 2.6;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
      size: 0.026,
      transparent: true,
      vertexColors: true,
    })
  );
}

// 底部网格只承担“漂浮航站坐标系”的暗示，透明度较低，避免抢掉真实 GLB 模型主体。
export function createRunwayGrid() {
  const vertices: number[] = [];
  const colors: number[] = [];
  const cyan = new THREE.Color("#4bd7ff");
  const amber = new THREE.Color("#f6c465");

  for (let line = -12; line <= 12; line += 1) {
    vertices.push(-7, -1.42, line * 0.52, 7, -1.42, line * 0.52);
    vertices.push(line * 0.52, -1.42, -7, line * 0.52, -1.42, 7);
    const color = line % 4 === 0 ? amber : cyan;
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    colors.push(cyan.r, cyan.g, cyan.b, cyan.r, cyan.g, cyan.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.16,
      transparent: true,
      vertexColors: true,
    })
  );
}

// 参考图有明显的云层和景深，这里用低成本点云做雾海，不引入重型后期或视频纹理。
export function createCinematicCloudBank() {
  const count = 620;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const blue = new THREE.Color("#5ddfff");
  const green = new THREE.Color("#86ffd1");
  const amber = new THREE.Color("#ffd27c");

  for (let index = 0; index < count; index += 1) {
    const radius = 1.8 + Math.random() * 5.4;
    const angle = Math.random() * Math.PI * 2;
    const color = (index % 5 === 0 ? amber : index % 2 === 0 ? blue : green)
      .clone()
      .lerp(new THREE.Color("#ffffff"), 0.18);

    positions[index * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 1.2;
    positions[index * 3 + 1] = -1.08 + (Math.random() - 0.5) * 0.5;
    positions[index * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 1.3;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.1,
      size: 0.085,
      transparent: true,
      vertexColors: true,
    })
  );
}

// 航线火花沿 CatmullRom 曲线离散分布，滚动时与主航线同步旋转，形成“任务节点被点亮”的电影感。
export function createRouteSparkles(curve: THREE.CatmullRomCurve3) {
  const count = 150;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color("#72e4ff");
  const amber = new THREE.Color("#f6c465");
  const magenta = new THREE.Color("#ff7ae6");

  for (let index = 0; index < count; index += 1) {
    const point = curve.getPointAt(index / Math.max(1, count - 1));
    const color = (index % 3 === 0 ? cyan : index % 3 === 1 ? amber : magenta).clone();
    positions[index * 3] = point.x + (Math.random() - 0.5) * 0.18;
    positions[index * 3 + 1] = point.y + 0.08 + (Math.random() - 0.5) * 0.14;
    positions[index * 3 + 2] = point.z + (Math.random() - 0.5) * 0.18;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.68,
      size: 0.04,
      transparent: true,
      vertexColors: true,
    })
  );
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });

  const fogTexture = object.userData?.fogTexture as THREE.Texture | undefined;
  fogTexture?.dispose();
}
