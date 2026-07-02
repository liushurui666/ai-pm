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

// 星空和云雾是运行时效果，避免把大面积透明粒子烘进 GLB 造成模型难维护。
export function createStarField() {
  const count = 760;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color("#75e9ff");
  const white = new THREE.Color("#ffffff");
  const amber = new THREE.Color("#ffd078");

  for (let index = 0; index < count; index += 1) {
    const radius = 4.2 + Math.random() * 8.8;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 5.6;
    const color = (index % 5 === 0 ? amber : index % 2 === 0 ? cyan : white).clone();

    color.lerp(new THREE.Color("#ffffff"), Math.random() * 0.2);
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
      opacity: 0.58,
      size: 0.024,
      transparent: true,
      vertexColors: true,
    })
  );
}

// 参考图的“云海”不能只靠背景渐变，否则 GLB 会像漂在平面上；这里用低成本点云制造纵深。
export function createCloudBank() {
  const count = 880;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const blue = new THREE.Color("#6edcff");
  const green = new THREE.Color("#74ffd4");
  const grey = new THREE.Color("#b8c6cf");

  for (let index = 0; index < count; index += 1) {
    const radius = 1.4 + Math.random() * 5.2;
    const angle = Math.random() * Math.PI * 2;
    const color = (index % 4 === 0 ? green : index % 2 === 0 ? blue : grey).clone();

    positions[index * 3] = Math.cos(angle) * radius + 0.42 + (Math.random() - 0.5) * 1.2;
    positions[index * 3 + 1] = -0.98 + (Math.random() - 0.5) * 0.42;
    positions[index * 3 + 2] = Math.sin(angle) * radius + 0.3 + (Math.random() - 0.5) * 1.4;
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
      opacity: 0.11,
      size: 0.11,
      transparent: true,
      vertexColors: true,
    })
  );
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
      opacity: 0.12,
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

    if (!mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material.dispose());
  });
}
