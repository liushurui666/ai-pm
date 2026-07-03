"use client";

import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { UltraHDRLoader } from "three/examples/jsm/loaders/UltraHDRLoader.js";
import { HELMET_ENVIRONMENT_PATH, HELMET_MODEL_PATH, ROBOT_MODEL_PATH, robotStoryChapters } from "../story-data";
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
  cyberRig?: CyberRobotRig;
  bones: {
    head?: THREE.Bone;
    neck?: THREE.Bone;
    spine?: THREE.Bone;
    leftArm?: THREE.Bone;
    rightArm?: THREE.Bone;
  };
  face?: THREE.Mesh;
  helmet?: THREE.Group;
};

type CyberRobotRig = {
  group: THREE.Group;
  armorMaterials: THREE.MeshStandardMaterial[];
  coreLight: THREE.PointLight;
  eyeLights: THREE.PointLight[];
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

function createCyberRobotRig() {
  const group = new THREE.Group();
  const armorMaterials: THREE.MeshStandardMaterial[] = [];

  // Soldier 官方模型自带完整装甲贴图。Three 运行时只保留不可见补光，
  // 让暗场里能读到头盔、胸甲和肩甲轮廓，不再向模型外叠任何可见贴片。
  const coreLight = new THREE.PointLight(0xa9f5ff, 0.8, 2.4);
  coreLight.position.set(0, 1.03, 0.42);
  const eyeLights = [-0.22, 0.22].map((x) => {
    const light = new THREE.PointLight(0xbdf7ff, 0.28, 0.95);
    light.position.set(x, 1.6, 0.45);
    group.add(light);
    return light;
  });

  group.add(coreLight);

  return {
    armorMaterials,
    coreLight,
    eyeLights,
    group,
  } satisfies CyberRobotRig;
}

function createSignalPanels() {
  const panels: ScenePanel[] = [];
  const materialColors = [0x7ee8ef, 0x9b8cff, 0xb8c98a, 0xe37fa7, 0xe2bd75];

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

  // Three.js 官方 Soldier 模型和旧 RobotExpressive 尺寸完全不同。
  // 这里按包围盒统一归一化，保证滚动运镜不用依赖某个示例资产的隐式尺度。
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

type CleanTechArmorTextureOptions = {
  upperBodyAccents?: boolean;
};

function isUpperBodyTechAccentPixel(u: number, v: number, r: number, g: number, b: number) {
  const isDeliberateRedStripe = r > 118 && g < 92 && b < 82;
  const isChestSideInsert =
    ((u > 0.35 && u < 0.438) || (u > 0.545 && u < 0.632)) &&
    v > 0.155 &&
    v < 0.31;
  const isShoulderStripeZone = u > 0.42 && u < 0.76 && v > 0.02 && v < 0.18 && isDeliberateRedStripe;

  // 上衣区域需要更强的黑白科技分区，但不能把刮痕误判成设计线。
  // 早期尝试保留大块内衬会在腰胯和腿根误映射出黑斑；这里收窄到胸甲插片和肩部装饰条，避免下半身像战损。
  return isChestSideInsert || isShoulderStripeZone;
}

function isLowerWhiteArmorCleanupPixel(u: number, v: number) {
  const isLeftLegArmor = u > 0.015 && u < 0.31 && v > 0.49 && v < 0.86;
  const isCenterShinArmor = u > 0.52 && u < 0.69 && v > 0.69 && v < 0.93;
  const isRightKneeArmor = u > 0.63 && u < 0.75 && v > 0.45 && v < 0.65;
  const isArmArmor = (u > 0.72 && u < 0.99 && v > 0.03 && v < 0.36) || (u > 0.02 && u < 0.18 && v > 0.08 && v < 0.31);

  // 这些 UV 岛对应用户截图里被框出的白甲、臂甲和腿甲。
  // 原图在这些区域有成片旧损黑斑，运行时要优先洗成新白，避免被误读成战损工艺。
  return isLeftLegArmor || isCenterShinArmor || isRightKneeArmor || isArmArmor;
}

function createCleanTechArmorTexture(sourceTexture: THREE.Texture | null, options: CleanTechArmorTextureOptions = {}) {
  if (!sourceTexture) {
    return null;
  }

  const sourceImage = sourceTexture?.image as
    | (CanvasImageSource & {
        height?: number;
        naturalHeight?: number;
        naturalWidth?: number;
        videoHeight?: number;
        videoWidth?: number;
        width?: number;
      })
    | undefined;

  if (!sourceImage) {
    return null;
  }

  const width = sourceImage.width ?? sourceImage.naturalWidth ?? sourceImage.videoWidth ?? 0;
  const height = sourceImage.height ?? sourceImage.naturalHeight ?? sourceImage.videoHeight ?? 0;

  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;

  if (!context) {
    return null;
  }

  context.drawImage(sourceImage, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const luminanceMap = new Float32Array(width * height);

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];

    luminanceMap[index / 4] = r * 0.299 + g * 0.587 + b * 0.114;
  }

  // 用户这次明确不要战损/旧化，只要崭新的纯白黑科技风。
  // Soldier 和 DamagedHelmet 的原始 diffuse 都包含刮痕、锈色和旧化污渍；这里按局部亮度把外甲“翻新”为干净冷白。
  // 为了避免旧刮痕继续以黑线出现，黑色只保留在大面积结构件、头盔镜面和明确的上衣科技分区里。
  for (let index = 0; index < pixels.length; index += 4) {
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const u = width > 1 ? x / (width - 1) : 0;
    const v = height > 1 ? y / (height - 1) : 0;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const luminance = luminanceMap[pixelIndex];
    const isWarmDamage = r > g * 1.18 && r > b * 1.18;
    const neighborLuminance =
      (luminanceMap[Math.max(0, y - 1) * width + x] +
        luminanceMap[Math.min(height - 1, y + 1) * width + x] +
        luminanceMap[y * width + Math.max(0, x - 1)] +
        luminanceMap[y * width + Math.min(width - 1, x + 1)]) /
      4;
    const radius = Math.max(4, Math.round(Math.min(width, height) * 0.008));
    const wideNeighborLuminance =
      (luminanceMap[Math.max(0, y - radius) * width + x] +
        luminanceMap[Math.min(height - 1, y + radius) * width + x] +
        luminanceMap[y * width + Math.max(0, x - radius)] +
        luminanceMap[y * width + Math.min(width - 1, x + radius)] +
        luminanceMap[Math.max(0, y - radius) * width + Math.max(0, x - radius)] +
        luminanceMap[Math.max(0, y - radius) * width + Math.min(width - 1, x + radius)] +
        luminanceMap[Math.min(height - 1, y + radius) * width + Math.max(0, x - radius)] +
        luminanceMap[Math.min(height - 1, y + radius) * width + Math.min(width - 1, x + radius)]) /
      8;
    const rawUpperBodyAccent = options.upperBodyAccents === true && isUpperBodyTechAccentPixel(u, v, r, g, b);
    const isBodyArmorTexture = options.upperBodyAccents === true;
    const isCleanupArmorIsland = options.upperBodyAccents === true && isLowerWhiteArmorCleanupPixel(u, v);
    const isScratchOnLightPanel =
      luminance < 126 &&
      Math.max(neighborLuminance, wideNeighborLuminance) > (isCleanupArmorIsland ? 72 : 92) &&
      !rawUpperBodyAccent;
    const isHardBlackStructure = isBodyArmorTexture
      ? luminance < 12 && wideNeighborLuminance < 24
      : luminance < 16 && wideNeighborLuminance < 34;
    const isDeepStructuralBlack = isBodyArmorTexture
      ? false
      : !isScratchOnLightPanel &&
        (!isCleanupArmorIsland || isHardBlackStructure) &&
        (isHardBlackStructure || (luminance < 48 && wideNeighborLuminance < 64));
    const isUpperBodyAccent =
      rawUpperBodyAccent &&
      !isScratchOnLightPanel;

    if ((isDeepStructuralBlack && !isWarmDamage) || isUpperBodyAccent) {
      const gloss = THREE.MathUtils.clamp(luminance / 84, 0, 1);
      const accentBoost = isUpperBodyAccent ? 10 : 0;

      pixels[index] = 4 + accentBoost + gloss * 10;
      pixels[index + 1] = 7 + accentBoost + gloss * 14;
      pixels[index + 2] = 13 + accentBoost + gloss * 28;
    } else {
      const panel = THREE.MathUtils.clamp((Math.max(luminance, neighborLuminance, wideNeighborLuminance) - 48) / 207, 0, 1);
      const cleanWhite = 214 + panel * 38;

      pixels[index] = cleanWhite;
      pixels[index + 1] = Math.min(255, cleanWhite + 2);
      pixels[index + 2] = Math.min(255, cleanWhite + 6);
    }
  }

  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = sourceTexture.flipY;
  texture.wrapS = sourceTexture.wrapS;
  texture.wrapT = sourceTexture.wrapT;
  texture.repeat.copy(sourceTexture.repeat);
  texture.offset.copy(sourceTexture.offset);
  texture.needsUpdate = true;

  return texture;
}

function getJointInfluence(
  skinIndex: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  jointIndex: number
) {
  let influence = 0;

  for (let componentIndex = 0; componentIndex < 4; componentIndex += 1) {
    if (skinIndex.getComponent(vertexIndex, componentIndex) === jointIndex) {
      influence += skinWeight.getComponent(vertexIndex, componentIndex);
    }
  }

  return influence;
}

function removeOriginalSoldierHelmet(runtime: RobotRuntime) {
  const headBone = runtime.bones.head;

  if (!headBone) {
    return;
  }

  runtime.model.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh && object.name === "vanguard_Mesh") {
      const headJointIndex = object.skeleton.bones.indexOf(headBone);
      const sourceGeometry = object.geometry;
      const sourceIndex = sourceGeometry.index;
      const skinIndex = sourceGeometry.getAttribute("skinIndex");
      const skinWeight = sourceGeometry.getAttribute("skinWeight");

      if (headJointIndex < 0 || !sourceIndex || !skinIndex || !skinWeight) {
        return;
      }

      const filteredIndices: number[] = [];

      // Soldier 的原头盔和身体共用一个 SkinnedMesh，不能整节点隐藏。
      // 这里按 Head 骨骼权重移除头部三角面：保留身体、肩甲和手臂动画，只把会和新头盔重叠的原头部几何挖掉。
      for (let indexOffset = 0; indexOffset < sourceIndex.count; indexOffset += 3) {
        const vertexA = sourceIndex.getX(indexOffset);
        const vertexB = sourceIndex.getX(indexOffset + 1);
        const vertexC = sourceIndex.getX(indexOffset + 2);
        const influenceA = getJointInfluence(skinIndex, skinWeight, vertexA, headJointIndex);
        const influenceB = getJointInfluence(skinIndex, skinWeight, vertexB, headJointIndex);
        const influenceC = getJointInfluence(skinIndex, skinWeight, vertexC, headJointIndex);
        const influencedVertexCount = [influenceA, influenceB, influenceC].filter((influence) => influence > 0.18).length;
        const averageInfluence = (influenceA + influenceB + influenceC) / 3;

        if (influencedVertexCount >= 2 && averageInfluence > 0.16) {
          continue;
        }

        filteredIndices.push(vertexA, vertexB, vertexC);
      }

      object.geometry = sourceGeometry.clone();
      object.geometry.setIndex(filteredIndices);
      sourceGeometry.dispose();
      object.geometry.computeBoundingSphere();
    }

    if (object instanceof THREE.Mesh && object.name.toLowerCase().includes("visor")) {
      // 黑色 visor 是 Soldier 里少数独立头部件，可以直接隐藏；主体头盔则由上面的 Head 权重过滤处理。
      object.visible = false;
    }
  });
}

function attachDamagedHelmet(runtime: RobotRuntime, helmetScene: THREE.Group) {
  const headBone = runtime.bones.head;

  if (!headBone) {
    disposeObject(helmetScene);
    return;
  }

  // Soldier 的身体和动画来自官方 skinning_blending 示例；DamagedHelmet 是另一个官方示例资产。
  // 这里把头盔挂到 mixamorig:Head 骨骼上，让 Idle/Walk/Run 时头部仍跟随骨骼，而不是固定在世界坐标里。
  helmetScene.name = "threejs-damaged-helmet-head";
  helmetScene.position.set(0, 7.1, 2.15);
  // DamagedHelmet 默认正面就是官方示例里的圆形“眼睛”和下方口部；之前绕 Y 轴翻转会把这些细节转到背面。
  helmetScene.rotation.set(0, 0, 0);
  helmetScene.scale.setScalar(18.2);

  helmetScene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;

      if (object.material instanceof THREE.MeshStandardMaterial) {
        object.material = object.material.clone();
        // 用户要的是全新的纯白黑科技风，而不是 DamagedHelmet 原始的战损旧化。
        // 因此头盔也走同一套“翻新”贴图：白色外壳、蓝黑镜面结构，弱化锈色和刮痕。
        object.material.map = createCleanTechArmorTexture(object.material.map) ?? object.material.map;
        object.material.color.set(0xffffff);
        object.material.envMapIntensity = 0.38;
        object.material.roughness = Math.min(object.material.roughness, 0.34);
        object.material.metalness = Math.max(object.material.metalness, 0.52);
        object.material.needsUpdate = true;
      }
    }
  });

  removeOriginalSoldierHelmet(runtime);
  headBone.add(helmetScene);
  runtime.helmet = helmetScene;
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
        object.material.envMapIntensity = 1.85;

        // 用户现在要全新的纯白黑科技工艺，不要战损和旧化。
        // 因此这里把 Soldier 原 diffuse 翻新成冷白外甲和蓝黑镜面结构，同时抹掉暖色锈蚀和大部分细碎刮痕。
        const materialName = object.material.name.toLowerCase();

        if (materialName.includes("visor")) {
          object.material.color.set(0x07111c);
          object.material.roughness = 0.22;
          object.material.metalness = 0.82;
          cyberRig.armorMaterials.push(object.material);
        } else {
          object.material.map = createCleanTechArmorTexture(object.material.map, { upperBodyAccents: true }) ?? object.material.map;
          object.material.color.set(0xffffff);
          // 残留的“战损裂纹”主要来自 Soldier 原始 normal/粗糙度通道，即使 diffuse 被洗白也会在近景里压出黑色凹痕。
          // 身体装甲这次要呈现全新的黑白科技工艺，所以禁用旧化法线与旧贴图通道，只保留几何自身的硬表面轮廓。
          object.material.normalMap = null;
          object.material.aoMap = null;
          object.material.roughnessMap = null;
          object.material.metalnessMap = null;
          object.material.envMapIntensity = 0.82;
          object.material.roughness = 0.24;
          object.material.metalness = 0.64;
        }

        object.material.needsUpdate = true;
      }

      if (object.morphTargetDictionary && object.morphTargetInfluences) {
        face = object;
      }
    }
  });

  normalizeRobotModel(model);
  // Soldier.glb 的默认朝向和旧 RobotExpressive 相反；页面首屏需要看到装甲正面，
  // 所以只在模型根节点做一次基准旋转，后续滚动分镜仍由 robotPivot 控制。
  model.rotation.y = Math.PI;
  model.updateMatrixWorld(true);

  animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    actions.set(clip.name, action);

    action.clampWhenFinished = false;
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

function updateFace(runtime: RobotRuntime, chapterIndex: number, elapsed: number) {
  const face = runtime.face;

  if (!face?.morphTargetDictionary || !face.morphTargetInfluences) {
    return;
  }

  // 兼容带 morph target 的角色资产；Soldier 没有表情目标时会直接跳过。
  // 保留这层兜底，避免后续替换模型时再改渲染主循环。
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
  const energy = 0.36 + pulse * 0.1 + transitionPunch * 0.1;

  // 这里只做“摄影棚灯光”和 Blender 发光材质的轻微呼吸。
  // 不再旋转或渲染额外 HUD 几何，避免机器人像被贴了一层 AI 特效。
  cyberRig.group.rotation.y = THREE.MathUtils.lerp(cyberRig.group.rotation.y, pointer.x * 0.08 * pointer.active, 0.04);

  cyberRig.armorMaterials.forEach((material) => {
    material.emissive.lerp(accentColor, 0.006);
    material.emissiveIntensity = 0.08 + pulse * 0.035 + transitionPunch * 0.05;
  });

  cyberRig.coreLight.color.lerp(tmpLightColor.copy(accentColor).lerp(new THREE.Color(0xffffff), 0.68), 0.04);
  cyberRig.coreLight.intensity = 0.22 + energy * 0.55;
  cyberRig.eyeLights.forEach((light) => {
    light.color.lerp(tmpLightColor, 0.04);
    light.intensity = 0.12 + energy * 0.2;
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
    let helmetEnvironmentTexture: THREE.Texture | null = null;
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
    // 白银金属依赖高光层次才能读出科技硬件质感；用 ACES 和轻微曝光提升，
    // 让模型变亮但不把暗场电影氛围整体冲成白底页面。
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x02040a, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

    scene.fog = new THREE.FogExp2(0x02040a, 0.082);

    const ambientLight = new THREE.HemisphereLight(0xe9fdff, 0x0a0812, 1.18);
    const keyLight = new THREE.SpotLight(0xe9fdff, 36, 18, Math.PI * 0.18, 0.42, 1.4);
    const rimLight = new THREE.PointLight(0xbde6ff, 9, 10);
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
    new UltraHDRLoader().load(
      HELMET_ENVIRONMENT_PATH,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }

        // Three.js 3DLUT 官方示例依赖 Royal Esplanade HDRI 做 scene.environment。
        // 这里仅复用环境反射，不设置 scene.background，避免破坏当前首页暗场和滚动叙事背景。
        texture.mapping = THREE.EquirectangularReflectionMapping;
        helmetEnvironmentTexture = texture;
        scene.environment = texture;
      },
      undefined,
      () => {
        // HDRI 只影响官方头盔还原度；失败时继续用现有电影灯光，避免阻断主模型。
      }
    );

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

        // 如果模型加载慢于首帧滚动状态计算，这里补播当前章节动作，
        // 避免机器人停在骨骼绑定姿态，破坏首屏电影感。
        const loadedChapter = robotStoryChapters[clamp(activeChapterIndex, 0, robotStoryChapters.length - 1)] ?? robotStoryChapters[0];
        fadeToBaseAction(runtime, loadedChapter.baseAction, reducedMotion ? 0.18 : 0.22);
        setSceneReady(true);

        loader.load(
          HELMET_MODEL_PATH,
          (helmetGltf) => {
            if (disposed || !runtime) {
              disposeObject(helmetGltf.scene);
              return;
            }

            attachDamagedHelmet(runtime, helmetGltf.scene);
          },
          undefined,
          () => {
            // 头盔是二次强化资产；加载失败时保留 Soldier 主模型，不阻断首页叙事。
          }
        );
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
      tmpLightColor.copy(tmpColor).lerp(new THREE.Color(0xb8f7ff), 0.72);
      keyLight.color.lerp(tmpLightColor, 0.06);
      rimLight.color.lerp(tmpLightColor, 0.035);
      launchLight.intensity = THREE.MathUtils.lerp(launchLight.intensity, chapterIndex === 4 ? 12 : 2 + transitionPunch * 3.5, 0.05);

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
      scene.environment = null;
      helmetEnvironmentTexture?.dispose();
      disposeObject(scene);
    };
  }, [canvasRef, pointerRef, rootRef, setActiveChapterIndex, setSceneReady]);
}
