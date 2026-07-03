import * as THREE from "three";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createCurveFromPoints(points: [number, number, number][]) {
  return new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    false,
    "catmullrom",
    0.32
  );
}

export function vectorFromTuple(tuple: [number, number, number]) {
  return new THREE.Vector3(tuple[0], tuple[1], tuple[2]);
}

export function sampleTupleKeyframes(
  keyframes: { progress: number; value: [number, number, number] }[],
  progress: number
) {
  // 滚动镜头必须按关键帧插值，不能用多套散落的 if 分支，否则后续回 Blender 调锚点时很难追踪。
  const safeProgress = clamp(progress, 0, 1);
  const nextIndex = keyframes.findIndex((frame) => frame.progress >= safeProgress);
  const upper = keyframes[nextIndex === -1 ? keyframes.length - 1 : nextIndex];
  const lower = keyframes[Math.max(0, (nextIndex === -1 ? keyframes.length : nextIndex) - 1)];
  const span = Math.max(0.0001, upper.progress - lower.progress);
  const localProgress = clamp((safeProgress - lower.progress) / span, 0, 1);

  return vectorFromTuple(lower.value).lerp(vectorFromTuple(upper.value), localProgress);
}

// 星空和云雾继续由运行时生成，避免把大面积透明粒子烘进 GLB，导致 Blender 回归成本过高。
export function createStarField() {
  const count = 680;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color("#75e9ff");
  const white = new THREE.Color("#ffffff");
  const amber = new THREE.Color("#ffd078");

  for (let index = 0; index < count; index += 1) {
    const radius = 4.2 + Math.random() * 9.4;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 5.9;
    const color = (index % 7 === 0 ? amber : index % 2 === 0 ? cyan : white).clone();

    color.lerp(new THREE.Color("#ffffff"), Math.random() * 0.18);
    positions[index * 3] = Math.cos(angle) * radius + 0.7;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 1.9;
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
      opacity: 0.34,
      size: 0.018,
      transparent: true,
      vertexColors: true,
    })
  );
}

export function createCloudBank() {
  const group = new THREE.Group();
  const count = 1280;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const blue = new THREE.Color("#6edcff");
  const green = new THREE.Color("#74ffd4");
  const grey = new THREE.Color("#b8c6cf");

  for (let index = 0; index < count; index += 1) {
    const radius = 1.2 + Math.random() * 6.8;
    const angle = Math.random() * Math.PI * 2;
    const color = (index % 4 === 0 ? green : index % 2 === 0 ? blue : grey).clone();

    // 云海压在浮岛底部，提供目标图那种“平台悬在云层上”的深度感；
    // 保持点云而不是大纹理，避免继续增加 GLB 体积和首屏网络负担。
    positions[index * 3] = Math.cos(angle) * radius + 0.68 + (Math.random() - 0.5) * 2.2;
    positions[index * 3 + 1] = -1.08 + (Math.random() - 0.5) * 0.26;
    positions[index * 3 + 2] = Math.sin(angle) * radius + 0.3 + (Math.random() - 0.5) * 2.35;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const cloudPoints = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.13,
      size: 0.056,
      transparent: true,
      vertexColors: true,
    })
  );
  group.add(cloudPoints);

  const texture = createCloudSheetTexture();
  for (let index = 0; index < 12; index += 1) {
    const material = new THREE.SpriteMaterial({
      blending: THREE.NormalBlending,
      color: index % 3 === 0 ? "#6f9aaa" : "#8ca0aa",
      depthWrite: false,
      map: texture,
      opacity: 0.09 + (index % 3) * 0.018,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    const angle = (index / 12) * Math.PI * 2;
    const radius = 1.4 + (index % 5) * 0.55;

    sprite.position.set(Math.cos(angle) * radius + 0.72, -1.1 + (index % 4) * 0.042, Math.sin(angle) * radius + 0.46);
    sprite.scale.set(2.2 + (index % 4) * 0.58, 0.78 + (index % 3) * 0.22, 1);
    sprite.userData.phase = index * 0.53;
    group.add(sprite);
  }

  group.userData.cloudSheetTexture = texture;
  return group;
}

function createCloudSheetTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = context.createRadialGradient(128, 64, 8, 128, 64, 126);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.46)");
  gradient.addColorStop(0.32, "rgba(144, 196, 216, 0.26)");
  gradient.addColorStop(0.66, "rgba(78, 106, 124, 0.12)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createRunwayGrid() {
  const vertices: number[] = [];
  const colors: number[] = [];
  const cyan = new THREE.Color("#4bd7ff");
  const amber = new THREE.Color("#f6c465");

  for (let line = -14; line <= 14; line += 1) {
    vertices.push(-7, -1.36, line * 0.48, 7, -1.36, line * 0.48);
    vertices.push(line * 0.48, -1.36, -7, line * 0.48, -1.36, 7);
    const color = line % 5 === 0 ? amber : cyan;
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
      opacity: 0.018,
      transparent: true,
      vertexColors: true,
    })
  );
}

export function disposeObject(object: THREE.Object3D) {
  // Three.js 不会自动释放几何和材质；Aero 首页后续会反复调试刷新，这里必须主动清理。
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    if (!mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const textureMaterial = material as THREE.Material & { map?: THREE.Texture | null };

      textureMaterial.map?.dispose();
      material.dispose();
    });
  });

  const texture = object.userData.cloudSheetTexture as THREE.Texture | undefined;
  texture?.dispose();
}
