"use client";

import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ROBOT_MODEL_PATH, robotStoryChapters } from "../story-data";
import type { RobotStoryChapter } from "../story-data";

type UseRobotStorySceneOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  pointerRef: RefObject<{ active: number; x: number; y: number }>;
  setActiveChapterIndex: (index: number) => void;
  setSceneReady: (ready: boolean) => void;
};

type RobotRuntime = {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  activeBaseAction: THREE.AnimationAction | null;
  lastGestureKey: string;
  cyberRig?: CyberRobotRig;
  bones: {
    head?: THREE.Bone;
    neck?: THREE.Bone;
    spine?: THREE.Bone;
    leftArm?: THREE.Bone;
    rightArm?: THREE.Bone;
  };
  face?: THREE.Mesh;
};

type CyberRobotRig = {
  group: THREE.Group;
  accentMaterials: Array<THREE.MeshBasicMaterial | THREE.SpriteMaterial | THREE.PointsMaterial>;
  armorMaterials: THREE.MeshStandardMaterial[];
  coreLight: THREE.PointLight;
  eyeLights: THREE.PointLight[];
  scanBand: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  coreRings: Array<THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>>;
  haloRings: Array<THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>>;
  circuitPlates: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>;
};

type ScenePanel = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
};

const tmpCameraPosition = new THREE.Vector3();
const tmpCameraLookAt = new THREE.Vector3();
const tmpRobotPosition = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpLightColor = new THREE.Color();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function interpolateChapterVector(
  current: RobotStoryChapter,
  next: RobotStoryChapter,
  field: "cameraPosition" | "cameraLookAt" | "robotPosition",
  ratio: number,
  target: THREE.Vector3
) {
  const from = current[field];
  const to = next[field];

  target.set(
    THREE.MathUtils.lerp(from[0], to[0], ratio),
    THREE.MathUtils.lerp(from[1], to[1], ratio),
    THREE.MathUtils.lerp(from[2], to[2], ratio)
  );

  return target;
}

function createParticles() {
  const particleCount = 1200;
  const positions = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount);

  for (let index = 0; index < particleCount; index += 1) {
    const radius = 2.4 + Math.random() * 7.8;
    const angle = Math.random() * Math.PI * 2;
    const height = -0.8 + Math.random() * 4.8;

    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 1.2;
    seeds[index] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.PointsMaterial({
    color: 0x8ff7ff,
    depthWrite: false,
    opacity: 0.56,
    size: 0.018,
    sizeAttenuation: true,
    transparent: true,
  });

  return new THREE.Points(geometry, material);
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  const size = 128;
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = context.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.22, "rgba(118,255,245,0.82)");
  gradient.addColorStop(0.58, "rgba(70,120,255,0.22)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createCircuitTexture() {
  const canvas = document.createElement("canvas");
  const size = 256;
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  context.clearRect(0, 0, size, size);
  context.strokeStyle = "rgba(125,255,240,0.82)";
  context.lineWidth = 2;

  // 用 canvas 生成科技线路纹理，避免引入外部贴图，同时让机器人周围 HUD 面板有真实细节。
  for (let row = 0; row < 7; row += 1) {
    const y = 28 + row * 32;
    context.beginPath();
    context.moveTo(18, y);
    context.lineTo(62 + row * 7, y);
    context.lineTo(82 + row * 7, y + 14);
    context.lineTo(188, y + 14);
    context.stroke();
  }

  context.fillStyle = "rgba(255,255,255,0.95)";
  for (let index = 0; index < 22; index += 1) {
    const x = 20 + ((index * 43) % 210);
    const y = 22 + ((index * 31) % 204);
    context.fillRect(x, y, 4, 4);
  }

  context.strokeStyle = "rgba(255,95,183,0.58)";
  context.strokeRect(10, 10, size - 20, size - 20);
  context.strokeRect(34, 34, size - 68, size - 68);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createCyberRobotRig() {
  const group = new THREE.Group();
  const accentMaterials: CyberRobotRig["accentMaterials"] = [];
  const armorMaterials: THREE.MeshStandardMaterial[] = [];
  const glowTexture = createGlowTexture();
  const circuitTexture = createCircuitTexture();
  const additiveDepthFree = {
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  } as const;

  const createAccentMaterial = (color: number, opacity: number) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      opacity,
      side: THREE.DoubleSide,
      ...additiveDepthFree,
    });

    accentMaterials.push(material);
    return material;
  };

  const createSprite = (position: THREE.Vector3, scale: number, opacity: number) => {
    const material = new THREE.SpriteMaterial({
      color: 0x63f7ff,
      map: glowTexture,
      opacity,
      ...additiveDepthFree,
    });
    const sprite = new THREE.Sprite(material);

    sprite.position.copy(position);
    sprite.scale.setScalar(scale);
    accentMaterials.push(material);
    group.add(sprite);

    return sprite;
  };

  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0x93fff7,
    opacity: 0.96,
    ...additiveDepthFree,
  });
  accentMaterials.push(eyeMaterial);

  [-0.18, 0.18].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 12), eyeMaterial);
    eye.position.set(x, 1.6, 0.34);
    group.add(eye);
    createSprite(new THREE.Vector3(x, 1.6, 0.38), 0.34, 0.64);
  });

  const coreMaterial = createAccentMaterial(0x63f7ff, 0.9);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.105, 2), coreMaterial);
  core.position.set(0, 0.95, 0.36);
  group.add(core);
  createSprite(new THREE.Vector3(0, 0.95, 0.38), 0.62, 0.5);

  const coreRings: CyberRobotRig["coreRings"] = [];
  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.17 + index * 0.06, 0.004, 8, 96),
      createAccentMaterial(index === 1 ? 0xff5fb7 : 0x63f7ff, 0.72 - index * 0.1)
    );

    ring.position.set(0, 0.95, 0.35);
    ring.rotation.x = Math.PI / 2 + index * 0.42;
    ring.rotation.y = index * 0.64;
    coreRings.push(ring);
    group.add(ring);
  }

  const haloRings: CyberRobotRig["haloRings"] = [];
  [0.66, 0.86, 1.08].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.006, 8, 160),
      createAccentMaterial(index === 2 ? 0xffd36a : 0x63f7ff, 0.18 + index * 0.06)
    );

    ring.position.y = 0.55 + index * 0.36;
    ring.rotation.x = Math.PI / 2;
    haloRings.push(ring);
    group.add(ring);
  });

  const shellMaterial = createAccentMaterial(0x63f7ff, 0.055);
  shellMaterial.wireframe = true;
  const bodyShell = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 1.18, 8, 18), shellMaterial);
  bodyShell.position.set(0, 0.95, 0.02);
  bodyShell.scale.set(0.92, 1.05, 0.62);
  bodyShell.visible = false;
  group.add(bodyShell);

  const scanBand = new THREE.Mesh(
    new THREE.PlaneGeometry(1.72, 0.12, 1, 1),
    createAccentMaterial(0x63f7ff, 0.3)
  );
  scanBand.position.set(0, 1.12, 0.52);
  scanBand.visible = false;
  group.add(scanBand);

  const circuitPlates: CyberRobotRig["circuitPlates"] = [];
  // 线路和警示片已经在 Blender 中被写进模型面片材质，这里不再创建运行时贴片，
  // 避免用户看到“贴上去”的感觉；运行时只保留灯光和核心能量辅助。
  const runtimeCircuitPlateCount = 0;
  for (let index = 0; index < runtimeCircuitPlateCount; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + 0.28;
    const plateMaterial = new THREE.MeshBasicMaterial({
      color: index % 2 === 0 ? 0x63f7ff : 0xff5fb7,
      map: circuitTexture,
      opacity: 0.2,
      side: THREE.DoubleSide,
      ...additiveDepthFree,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.28), plateMaterial);

    plate.position.set(Math.cos(angle) * 0.96, 1.05 + Math.sin(index) * 0.2, Math.sin(angle) * 0.42 + 0.08);
    plate.rotation.set(0.08, -angle + Math.PI / 2, 0.03);
    circuitPlates.push(plate);
    accentMaterials.push(plateMaterial);
    group.add(plate);
  }

  const coreLight = new THREE.PointLight(0x63f7ff, 6, 3.2);
  coreLight.position.set(0, 1.03, 0.42);
  const eyeLights = [-0.22, 0.22].map((x) => {
    const light = new THREE.PointLight(0x63f7ff, 1.8, 1.6);
    light.position.set(x, 1.6, 0.45);
    group.add(light);
    return light;
  });

  group.add(coreLight);

  return {
    accentMaterials,
    armorMaterials,
    circuitPlates,
    coreLight,
    coreRings,
    eyeLights,
    group,
    haloRings,
    scanBand,
  } satisfies CyberRobotRig;
}

function createSignalPanels() {
  const panels: ScenePanel[] = [];
  const materialColors = [0x63f7ff, 0x8f7dff, 0xd8ff6d, 0xff5fb7, 0xffd36a];

  for (let index = 0; index < robotStoryChapters.length; index += 1) {
    const angle = (index / robotStoryChapters.length) * Math.PI * 2;
    const material = new THREE.MeshBasicMaterial({
      color: materialColors[index],
      depthWrite: false,
      opacity: 0.18,
      side: THREE.DoubleSide,
      transparent: true,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.72, 8, 4), material);
    const basePosition = new THREE.Vector3(Math.cos(angle) * 2.25, 1.22 + index * 0.08, Math.sin(angle) * 1.15 - 0.5);
    const baseRotation = new THREE.Euler(0.08, -angle + Math.PI / 2, 0);

    mesh.position.copy(basePosition);
    mesh.rotation.copy(baseRotation);
    panels.push({ mesh, basePosition, baseRotation });
  }

  return panels;
}

function createGroundSystem() {
  const group = new THREE.Group();
  const grid = new THREE.GridHelper(12, 36, 0x2eefff, 0x1a2a4c);

  // 地面网格只提供“作战舱坐标系”的空间线索，透明度很低，避免抢掉机器人主体。
  if (Array.isArray(grid.material)) {
    grid.material.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.24;
    });
  } else {
    grid.material.transparent = true;
    grid.material.opacity = 0.24;
  }

  grid.position.y = -0.02;
  group.add(grid);

  for (let index = 0; index < 5; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05 + index * 0.58, 0.006, 8, 128),
      new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? 0x63f7ff : 0xff5fb7,
        depthWrite: false,
        opacity: 0.18 - index * 0.018,
        transparent: true,
      })
    );

    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.018 + index * 0.003;
    group.add(ring);
  }

  return group;
}

function collectRobotBones(model: THREE.Group) {
  const bones: RobotRuntime["bones"] = {};

  model.traverse((object) => {
    if (!(object instanceof THREE.Bone)) {
      return;
    }

    const name = object.name.toLowerCase();

    if (!bones.head && name.includes("head")) {
      bones.head = object;
    } else if (!bones.neck && name.includes("neck")) {
      bones.neck = object;
    } else if (!bones.spine && name.includes("spine")) {
      bones.spine = object;
    } else if (!bones.leftArm && name.includes("left") && (name.includes("arm") || name.includes("shoulder"))) {
      bones.leftArm = object;
    } else if (!bones.rightArm && name.includes("right") && (name.includes("arm") || name.includes("shoulder"))) {
      bones.rightArm = object;
    }
  });

  return bones;
}

function normalizeRobotModel(model: THREE.Group) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const targetHeight = 2.08;
  const scale = size.y > 0 ? targetHeight / size.y : 0.46;

  // Blender 派生 GLB 可能因为重新导出而改变根节点尺度或中心点。
  // 这里按包围盒统一归一化，保证后续镜头、胸核灯光和滚动分镜不依赖某个导出器的隐式坐标。
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const normalizedBox = new THREE.Box3().setFromObject(model);
  const normalizedCenter = normalizedBox.getCenter(new THREE.Vector3());

  model.position.set(
    -normalizedCenter.x,
    -normalizedBox.min.y,
    -normalizedCenter.z
  );
}

function prepareRobotRuntime(gltfScene: THREE.Group, animations: THREE.AnimationClip[]) {
  const model = gltfScene;
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  const cyberRig = createCyberRobotRig();
  let face: THREE.Mesh | undefined;

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;

      if (object.material instanceof THREE.MeshStandardMaterial) {
        object.material = object.material.clone();
        object.material.envMapIntensity = 1.18;

        // Blender 派生模型已经把主体 PBR 材质写进 GLB；Three 这里只接管少量发光嵌片的呼吸强度，
        // 不再重写 baseColor/metalness/roughness，避免运行时材质覆盖造成“糊一层”的视觉。
        const materialName = object.material.name.toLowerCase();

        if (materialName.includes("optic") || materialName.includes("circuit") || materialName.includes("warning")) {
          cyberRig.armorMaterials.push(object.material);
        }
      }

      if (object.morphTargetDictionary && object.morphTargetInfluences) {
        face = object;
      }
    }
  });

  normalizeRobotModel(model);

  animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    actions.set(clip.name, action);

    if (["Jump", "Yes", "No", "Wave", "Punch", "ThumbsUp"].includes(clip.name)) {
      action.clampWhenFinished = true;
      action.loop = THREE.LoopOnce;
    }
  });

  const idleAction = actions.get("Idle") ?? null;

  if (idleAction) {
    idleAction.enabled = true;
    idleAction.setEffectiveTimeScale(1);
    idleAction.setEffectiveWeight(1);
    idleAction.play();
  }

  return {
    actions,
    activeBaseAction: idleAction,
    bones: collectRobotBones(model),
    cyberRig,
    face,
    lastGestureKey: "",
    mixer,
    model,
  } satisfies RobotRuntime;
}

function fadeToBaseAction(runtime: RobotRuntime, actionName: string, duration = 0.5) {
  const nextAction = runtime.actions.get(actionName);

  if (!nextAction || runtime.activeBaseAction === nextAction) {
    return;
  }

  const previousAction = runtime.activeBaseAction;
  runtime.activeBaseAction = nextAction;
  nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
  previousAction?.fadeOut(duration);
}

function playGesture(runtime: RobotRuntime, actionName: string, chapterKey: string) {
  const gestureKey = `${chapterKey}:${actionName}`;
  const action = runtime.actions.get(actionName);

  if (!action || runtime.lastGestureKey === gestureKey) {
    return;
  }

  runtime.lastGestureKey = gestureKey;
  action.reset().setEffectiveTimeScale(actionName === "Jump" ? 0.84 : 1).setEffectiveWeight(1).fadeIn(0.16).play();

  const handleFinished = (event: { action: THREE.AnimationAction }) => {
    if (event.action !== action) {
      return;
    }

    runtime.mixer.removeEventListener("finished", handleFinished);
    action.fadeOut(0.22);
    runtime.activeBaseAction?.reset().fadeIn(0.28).play();
  };

  runtime.mixer.addEventListener("finished", handleFinished);
}

function updateFace(runtime: RobotRuntime, chapterIndex: number, elapsed: number) {
  const face = runtime.face;

  if (!face?.morphTargetDictionary || !face.morphTargetInfluences) {
    return;
  }

  // RobotExpressive 的表情是 morph target；分镜切换时只做轻量表情权重，
  // 避免和骨骼动作争抢注意力，但能让近景更像真正的电影镜头。
  Object.entries(face.morphTargetDictionary).forEach(([name, targetIndex]) => {
    const lowerName = name.toLowerCase();
    const isSmile = lowerName.includes("smile") || lowerName.includes("happy");
    const isAngry = lowerName.includes("angry") || lowerName.includes("sad");
    let targetWeight = 0;

    if (chapterIndex === 3 && isAngry) {
      targetWeight = 0.42;
    } else if ((chapterIndex === 1 || chapterIndex === 4) && isSmile) {
      targetWeight = 0.5 + Math.sin(elapsed * 1.4) * 0.08;
    }

    face.morphTargetInfluences![targetIndex] = THREE.MathUtils.lerp(
      face.morphTargetInfluences![targetIndex] ?? 0,
      targetWeight,
      0.08
    );
  });
}

function updateBoneDirecting(runtime: RobotRuntime, chapterIndex: number, pointer: { active: number; x: number; y: number }, elapsed: number) {
  const lookX = pointer.x * 0.18 * pointer.active;
  const lookY = -pointer.y * 0.12 * pointer.active;
  const chapterPulse = Math.sin(elapsed * 1.6 + chapterIndex) * 0.035;

  // 动画剪辑负责大动作，骨骼叠加只负责“导演手调”的细节：
  // 头部看向鼠标、风险分镜压低脊柱、需求分镜抬右臂，强化分镜特写。
  if (runtime.bones.head) {
    runtime.bones.head.rotation.y = THREE.MathUtils.lerp(runtime.bones.head.rotation.y, lookX, 0.08);
    runtime.bones.head.rotation.x = THREE.MathUtils.lerp(runtime.bones.head.rotation.x, lookY + chapterPulse, 0.08);
  }

  if (runtime.bones.neck) {
    runtime.bones.neck.rotation.y = THREE.MathUtils.lerp(runtime.bones.neck.rotation.y, lookX * 0.45, 0.07);
  }

  if (runtime.bones.spine) {
    const riskLean = chapterIndex === 3 ? 0.14 : 0;
    runtime.bones.spine.rotation.x = THREE.MathUtils.lerp(runtime.bones.spine.rotation.x, riskLean, 0.06);
    runtime.bones.spine.rotation.z = THREE.MathUtils.lerp(runtime.bones.spine.rotation.z, pointer.x * 0.045, 0.05);
  }

  if (runtime.bones.rightArm && chapterIndex === 1) {
    runtime.bones.rightArm.rotation.z = THREE.MathUtils.lerp(runtime.bones.rightArm.rotation.z, -0.24, 0.06);
  }

  if (runtime.bones.leftArm && chapterIndex === 3) {
    runtime.bones.leftArm.rotation.z = THREE.MathUtils.lerp(runtime.bones.leftArm.rotation.z, 0.2, 0.06);
  }
}

function updateCyberRobotRig(
  runtime: RobotRuntime,
  activeChapter: RobotStoryChapter,
  chapterIndex: number,
  transitionPunch: number,
  pointer: { active: number; x: number; y: number },
  elapsed: number
) {
  const cyberRig = runtime.cyberRig;

  if (!cyberRig) {
    return;
  }

  const pulse = 0.5 + Math.sin(elapsed * 4.2 + chapterIndex) * 0.5;
  const accentColor = tmpColor.set(activeChapter.accent);
  const energy = 0.78 + pulse * 0.22 + transitionPunch * 0.42;

  // 全息装甲和灯光统一吃当前分镜强调色，让“故事章节切换”在机器人身体上也有反馈。
  cyberRig.group.rotation.y = THREE.MathUtils.lerp(cyberRig.group.rotation.y, pointer.x * 0.08 * pointer.active, 0.04);
  cyberRig.accentMaterials.forEach((material) => {
    material.color.lerp(accentColor, 0.08);
  });

  cyberRig.armorMaterials.forEach((material) => {
    material.emissive.lerp(accentColor, 0.025);
    material.emissiveIntensity = 0.42 + pulse * 0.28 + transitionPunch * 0.36;
  });

  cyberRig.coreLight.color.lerp(accentColor, 0.08);
  cyberRig.coreLight.intensity = 4.5 + energy * 4;
  cyberRig.eyeLights.forEach((light) => {
    light.color.lerp(accentColor, 0.08);
    light.intensity = 1.7 + energy * 1.4;
  });

  cyberRig.coreRings.forEach((ring, index) => {
    ring.rotation.z += 0.018 + index * 0.006;
    ring.rotation.y += 0.012 + transitionPunch * 0.01;
    ring.scale.setScalar(1 + pulse * 0.04 + transitionPunch * 0.1);
    ring.material.opacity = 0.58 + pulse * 0.24;
  });

  cyberRig.haloRings.forEach((ring, index) => {
    ring.rotation.z += 0.006 + index * 0.003;
    ring.position.y = 0.48 + index * 0.34 + Math.sin(elapsed * 1.6 + index) * 0.035;
    ring.material.opacity = 0.06 + transitionPunch * 0.08 + pulse * 0.05;
  });

  cyberRig.scanBand.position.y = 0.42 + THREE.MathUtils.euclideanModulo(elapsed * 0.42 + chapterIndex * 0.17, 1.42);
  cyberRig.scanBand.scale.x = 0.8 + transitionPunch * 0.38;
  cyberRig.scanBand.material.opacity = 0.18 + pulse * 0.16 + transitionPunch * 0.22;

  cyberRig.circuitPlates.forEach((plate, index) => {
    const orbit = elapsed * 0.18 + index * 1.26 + chapterIndex * 0.2;
    const focusBoost = index === chapterIndex ? 0.28 : 0;

    plate.position.x = Math.cos(orbit) * (0.9 + focusBoost);
    plate.position.z = Math.sin(orbit) * 0.48 + 0.08;
    plate.position.y = 1.02 + Math.sin(orbit * 1.8) * 0.2;
    plate.rotation.y = -orbit + Math.PI / 2;
    plate.material.opacity = 0.12 + focusBoost + transitionPunch * 0.1;
  });
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }

    if (child instanceof THREE.Points) {
      child.geometry.dispose();

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }

    if (child instanceof THREE.Sprite) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => {
          material.map?.dispose();
          material.dispose();
        });
      } else {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
  });
}

// Three.js 运行时完全封装在 hook 内部，React 只接收当前分镜索引。
// 这样滚动监听、RAF、模型加载和资源释放都有同一处生命周期，避免视觉页卸载后仍然占用 GPU。
export function useRobotStoryScene({
  canvasRef,
  pointerRef,
  rootRef,
  setActiveChapterIndex,
  setSceneReady,
}: UseRobotStorySceneOptions) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;

    if (!canvas || !root) {
      return;
    }

    let disposed = false;
    let runtime: RobotRuntime | null = null;
    let frameId = 0;
    let scrollProgress = 0;
    let activeChapterIndex = -1;
    let previousFrameTime = performance.now();
    const startedAt = previousFrameTime;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    const robotPivot = new THREE.Group();
    const groundSystem = createGroundSystem();
    const particles = createParticles();
    const signalPanels = createSignalPanels();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x02040a, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

    scene.fog = new THREE.FogExp2(0x02040a, 0.082);

    const ambientLight = new THREE.HemisphereLight(0xb8f7ff, 0x080412, 1.1);
    const keyLight = new THREE.SpotLight(0x63f7ff, 32, 18, Math.PI * 0.18, 0.42, 1.4);
    const rimLight = new THREE.PointLight(0xff5fb7, 12, 10);
    const launchLight = new THREE.PointLight(0xffd36a, 0, 14);

    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.position.set(-2.8, 5.6, 3.4);
    keyLight.target.position.set(0, 1.1, 0);
    rimLight.position.set(3.2, 2.4, -3.8);
    launchLight.position.set(0, 3.2, 3.8);

    scene.add(ambientLight, keyLight, keyLight.target, rimLight, launchLight, robotPivot, groundSystem, particles);
    signalPanels.forEach((panel) => scene.add(panel.mesh));

    const loader = new GLTFLoader();
    loader.load(
      ROBOT_MODEL_PATH,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        runtime = prepareRobotRuntime(gltf.scene, gltf.animations);
        robotPivot.add(runtime.model);
        if (runtime.cyberRig) {
          robotPivot.add(runtime.cyberRig.group);
        }
        setSceneReady(true);
      },
      undefined,
      () => {
        if (!disposed) {
          setSceneReady(false);
        }
      }
    );

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const updateScrollProgress = () => {
      const rootTop = window.scrollY + root.getBoundingClientRect().top;
      const scrollable = Math.max(1, root.offsetHeight - window.innerHeight);
      scrollProgress = clamp((window.scrollY - rootTop) / scrollable, 0, 1);
    };

    const applyChapterState = (chapterIndex: number) => {
      const chapter = robotStoryChapters[chapterIndex];

      if (!chapter || chapterIndex === activeChapterIndex) {
        return;
      }

      activeChapterIndex = chapterIndex;
      setActiveChapterIndex(chapterIndex);

      if (runtime) {
        fadeToBaseAction(runtime, chapter.baseAction, reducedMotion ? 0.18 : 0.5);
        playGesture(runtime, chapter.gestureAction, chapter.key);
      }
    };

    const animate = () => {
      if (disposed) {
        return;
      }

      const now = performance.now();
      const elapsed = (now - startedAt) / 1000;
      const delta = Math.min((now - previousFrameTime) / 1000, 0.033);

      previousFrameTime = now;
      const chapterFloat = scrollProgress * (robotStoryChapters.length - 1);
      const chapterIndex = clamp(Math.round(chapterFloat), 0, robotStoryChapters.length - 1);
      const fromIndex = clamp(Math.floor(chapterFloat), 0, robotStoryChapters.length - 1);
      const toIndex = clamp(fromIndex + 1, 0, robotStoryChapters.length - 1);
      const localRatio = smoothStep(chapterFloat - fromIndex);
      const currentChapter = robotStoryChapters[fromIndex];
      const nextChapter = robotStoryChapters[toIndex];
      const activeChapter = robotStoryChapters[chapterIndex];
      const transitionPunch = Math.sin(localRatio * Math.PI);
      const pointer = pointerRef.current;

      applyChapterState(chapterIndex);

      interpolateChapterVector(currentChapter, nextChapter, "cameraPosition", localRatio, tmpCameraPosition);
      interpolateChapterVector(currentChapter, nextChapter, "cameraLookAt", localRatio, tmpCameraLookAt);
      interpolateChapterVector(currentChapter, nextChapter, "robotPosition", localRatio, tmpRobotPosition);

      const pointerBoost = reducedMotion ? 0 : pointer.active;
      camera.position.lerp(
        tmpCameraPosition.add(new THREE.Vector3(pointer.x * 0.12 * pointerBoost, -pointer.y * 0.07 * pointerBoost, -transitionPunch * 0.18)),
        0.08
      );
      camera.fov = THREE.MathUtils.lerp(camera.fov, 38 - transitionPunch * 3.8 + chapterIndex * 0.45, 0.06);
      camera.updateProjectionMatrix();
      camera.lookAt(tmpCameraLookAt);
      camera.rotation.z += THREE.MathUtils.degToRad(pointer.x * 0.36 * pointerBoost);

      robotPivot.position.lerp(tmpRobotPosition, 0.08);
      robotPivot.rotation.y = THREE.MathUtils.lerp(
        robotPivot.rotation.y,
        THREE.MathUtils.lerp(currentChapter.robotRotationY, nextChapter.robotRotationY, localRatio),
        0.06
      );

      groundSystem.rotation.y += reducedMotion ? 0.0008 : 0.0028;
      particles.rotation.y -= reducedMotion ? 0.0004 : 0.0016;
      (particles.material as THREE.PointsMaterial).opacity = 0.36 + transitionPunch * 0.22;

      tmpColor.set(activeChapter.accent);
      tmpLightColor.copy(tmpColor).lerp(new THREE.Color(0xb8f7ff), 0.48);
      keyLight.color.lerp(tmpLightColor, 0.06);
      rimLight.color.lerp(tmpColor, 0.04);
      launchLight.intensity = THREE.MathUtils.lerp(launchLight.intensity, chapterIndex === 4 ? 18 : 3 + transitionPunch * 5, 0.05);

      signalPanels.forEach((panel, index) => {
        const distance = Math.abs(index - chapterFloat);
        const focus = clamp(1 - distance, 0, 1);

        panel.mesh.position.copy(panel.basePosition);
        panel.mesh.position.y += Math.sin(elapsed * 1.4 + index) * 0.035 + focus * 0.18;
        panel.mesh.rotation.copy(panel.baseRotation);
        panel.mesh.rotation.z = Math.sin(elapsed * 0.8 + index) * 0.035;
        panel.mesh.scale.setScalar(1 + focus * 0.28 + transitionPunch * 0.05);
        panel.mesh.material.opacity = 0.08 + focus * 0.28;
      });

      if (runtime) {
        runtime.mixer.update(delta * (reducedMotion ? 0.7 : 1));
        updateFace(runtime, chapterIndex, elapsed);
        updateBoneDirecting(runtime, chapterIndex, pointer, elapsed);
        updateCyberRobotRig(runtime, activeChapter, chapterIndex, transitionPunch, pointer, elapsed);
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    resize();
    updateScrollProgress();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    frameId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", updateScrollProgress);
      renderer.dispose();
      disposeObject(scene);
    };
  }, [canvasRef, pointerRef, rootRef, setActiveChapterIndex, setSceneReady]);
}
