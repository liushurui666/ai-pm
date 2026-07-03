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

  // 机器人主体材质已在 Blender 中完成。Three 运行时只保留不可见补光，
  // 用来让嵌入式发光材质在暗场中有体积感，不再添加任何可见几何贴片。
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

    const ambientLight = new THREE.HemisphereLight(0xb8f7ff, 0x080412, 0.9);
    const keyLight = new THREE.SpotLight(0x7ee8ef, 24, 18, Math.PI * 0.18, 0.42, 1.4);
    const rimLight = new THREE.PointLight(0xe37fa7, 6.5, 10);
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

        // 如果模型加载慢于首帧滚动状态计算，这里补播当前章节动作，
        // 避免机器人停在骨骼绑定姿态，破坏首屏电影感。
        const loadedChapter = robotStoryChapters[clamp(activeChapterIndex, 0, robotStoryChapters.length - 1)] ?? robotStoryChapters[0];
        fadeToBaseAction(runtime, loadedChapter.baseAction, reducedMotion ? 0.18 : 0.22);
        if (loadedChapter.gestureAction) {
          playGesture(runtime, loadedChapter.gestureAction, loadedChapter.key);
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
        if (chapter.gestureAction) {
          playGesture(runtime, chapter.gestureAction, chapter.key);
        }
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
      disposeObject(scene);
    };
  }, [canvasRef, pointerRef, rootRef, setActiveChapterIndex, setSceneReady]);
}
