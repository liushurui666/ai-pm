import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  aeroCameraKeyframes,
  aeroFlightPath,
  aeroRouteDefinitions,
  aeroSceneCards,
} from "../story-data";
import {
  createCardBeaconField,
  createRouteNetwork,
  createRoutePulseFleet,
  createShipExhaustTrail,
  createSoftNebulaPlanes,
} from "./effects";
import { disposeLoadedDerivedModels, loadDerivedAeroModels } from "./load-derived-models";
import {
  clamp,
  createCloudBank,
  createCurveFromPoints,
  createRunwayGrid,
  createStarField,
  disposeObject,
  sampleTupleKeyframes,
} from "./scene-utils";

type AeroPointerState = {
  active: number;
  x: number;
  y: number;
};

type UseAeroFlightSceneOptions = {
  activeCardRef: RefObject<number>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pointerRef: RefObject<AeroPointerState>;
  rootRef: RefObject<HTMLElement | null>;
  setActiveCardIndex: Dispatch<SetStateAction<number>>;
  setLoadedCount: Dispatch<SetStateAction<number>>;
};

// 这个 hook 是 `/aero-system` 的唯一 Three.js 运行时入口：它只装配 Blender 派生模型、
// 运行滚动镜头、航线光效和飞船运动，模型形体本身不在前端硬修。
export function useAeroFlightScene({
  activeCardRef,
  canvasRef,
  pointerRef,
  rootRef,
  setActiveCardIndex,
  setLoadedCount,
}: UseAeroFlightSceneOptions) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;

    if (!canvas || !root) {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let viewportWidth = 1;
    let viewportHeight = 1;
    let airshipRoot: THREE.Object3D | null = null;
    let loadedRoots: THREE.Object3D[] = [];
    const startedAt = Date.now();
    const scrollState = { chapter: 0, progress: 0 };
    const emissiveMaterials: THREE.MeshStandardMaterial[] = [];
    const previousScrollRestoration = window.history.scrollRestoration;

    // 视觉页刷新时不恢复到中段，否则用户会看到飞船突然跳过好几段航线。
    window.history.scrollRestoration = "manual";
    window.scrollTo({ behavior: "auto", top: 0 });

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.32));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#03070d", 0.07);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    const environmentMap = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
    scene.environment = environmentMap;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
    camera.position.set(0.16, 1.62, 6.65);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.72, 0.66);
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    const rig = new THREE.Group();
    rig.position.set(1.16, 0.04, 0);
    rig.rotation.x = -0.032;
    scene.add(rig);

    scene.add(new THREE.HemisphereLight(0xccefff, 0x070910, 1.05));
    const keyLight = new THREE.DirectionalLight(0xeaf8ff, 2.1);
    keyLight.position.set(-3.8, 4.6, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const magentaLight = new THREE.PointLight(0xff66d8, 3.6, 8);
    magentaLight.position.set(0.8, 1.5, -0.3);
    scene.add(magentaLight);

    const cyanLight = new THREE.PointLight(0x66efff, 3.6, 8);
    cyanLight.position.set(-1.0, 0.68, 0.2);
    scene.add(cyanLight);

    const amberLight = new THREE.PointLight(0xffc05e, 3.0, 8.5);
    amberLight.position.set(2.16, 0.56, 0.82);
    scene.add(amberLight);

    const starField = createStarField();
    const cloudBank = createCloudBank();
    const runwayGrid = createRunwayGrid();
    const nebulaPlanes = createSoftNebulaPlanes();
    scene.add(starField);
    scene.add(cloudBank);
    scene.add(runwayGrid);
    scene.add(nebulaPlanes);

    const routeNetwork = createRouteNetwork(aeroRouteDefinitions);
    const routePulses = createRoutePulseFleet(routeNetwork.routes);
    const cardBeacons = createCardBeaconField(aeroSceneCards);
    const shipExhaustTrail = createShipExhaustTrail();
    const flightCurve = createCurveFromPoints(aeroFlightPath);
    rig.add(routeNetwork.group);
    rig.add(routePulses);
    rig.add(cardBeacons);
    rig.add(shipExhaustTrail);

    const cameraPositionFrames = aeroCameraKeyframes.map((frame) => ({
      progress: frame.progress,
      value: frame.position,
    }));
    const cameraTargetFrames = aeroCameraKeyframes.map((frame) => ({
      progress: frame.progress,
      value: frame.target,
    }));

    const syncScroll = () => {
      const rect = root.getBoundingClientRect();
      const scrollableHeight = Math.max(1, root.offsetHeight - window.innerHeight);
      const nextProgress = clamp(-rect.top / scrollableHeight, 0, 1);
      const nextChapter = clamp(Math.floor(nextProgress * aeroSceneCards.length), 0, aeroSceneCards.length - 1);

      scrollState.progress = nextProgress;
      if (scrollState.chapter !== nextChapter) {
        scrollState.chapter = nextChapter;
        setActiveCardIndex(nextChapter);
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      viewportWidth = Math.max(1, rect.width);
      viewportHeight = Math.max(1, rect.height);
      renderer.setSize(viewportWidth, viewportHeight, false);
      composer.setSize(viewportWidth, viewportHeight);
      bloomPass.setSize(viewportWidth, viewportHeight);
      camera.aspect = viewportWidth / viewportHeight;
      camera.fov = viewportWidth < 720 ? 46 : 38;
      camera.updateProjectionMatrix();
      syncScroll();
    };

    const loader = new GLTFLoader();
    setLoadedCount(0);
    loadDerivedAeroModels({
      emissiveMaterials,
      loader,
      rig,
      setLoadedCount,
    }).then((result) => {
      if (disposed) {
        disposeLoadedDerivedModels(result.roots);
        return;
      }

      airshipRoot = result.airshipRoot;
      loadedRoots = result.roots;
    });

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const elapsed = (Date.now() - startedAt) / 1000;
      const pointer = pointerRef.current;
      const progress = scrollState.progress;
      const activeCardIndex = clamp(activeCardRef.current, 0, aeroSceneCards.length - 1);
      const activeCard = aeroSceneCards[activeCardIndex];
      const activeColor = new THREE.Color(activeCard.accent);
      const isNarrow = viewportWidth < 720;

      rig.rotation.y += ((pointer.active ? pointer.x * 0.008 : 0) - rig.rotation.y) * 0.045;
      rig.rotation.x += ((pointer.active ? -pointer.y * 0.005 : -0.032) - rig.rotation.x) * 0.04;
      starField.rotation.y = elapsed * 0.01;
      cloudBank.rotation.y = -elapsed * 0.008;
      cloudBank.position.y = -0.14 + Math.sin(elapsed * 0.28) * 0.025;
      runwayGrid.position.y = -1.62 + Math.sin(elapsed * 0.4) * 0.01;
      nebulaPlanes.children.forEach((sprite, index) => {
        sprite.position.y += Math.sin(elapsed * 0.2 + index) * 0.0008;
      });

      emissiveMaterials.forEach((material, index) => {
        const target = material.name.toLowerCase().includes("neon") ? 1.18 : 0.1;
        material.emissiveIntensity += (target + Math.sin(elapsed * 0.9 + index) * 0.035 - material.emissiveIntensity) * 0.025;
      });

      routePulses.children.forEach((pulse) => {
        const mesh = pulse as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
        const routeIndex = (mesh.userData.routeIndex as number | undefined) ?? 0;
        const route = routeNetwork.routes[routeIndex];
        const offset = (mesh.userData.routeOffset as number | undefined) ?? 0;
        const speed = (mesh.userData.routeSpeed as number | undefined) ?? 0.04;
        const point = route.curve.getPointAt((offset + elapsed * speed) % 1);

        mesh.position.copy(point);
        mesh.position.y += 0.045 + Math.sin(elapsed * 2.8 + offset * 10) * 0.018;
        mesh.material.opacity = 0.36 + Math.sin(elapsed * 2.2 + offset * 8) * 0.18;
      });

      cardBeacons.children.forEach((beacon, index) => {
        const selected = index === activeCardIndex;
        beacon.scale.setScalar(selected ? 1.18 + Math.sin(elapsed * 2.5) * 0.08 : 0.9);
        beacon.children.forEach((child) => {
          if (child instanceof THREE.PointLight) {
            child.intensity += ((selected ? 2.5 : 1.0) - child.intensity) * 0.08;
          }
        });
      });

      if (airshipRoot) {
        // 目标图首屏里飞艇已经进入右侧金色航线，因此初始值不从需求塔台起飞；
        // 滚动时再继续向上线闸口推进，形成“已经在调度航线中巡航”的叙事。
        const flightProgress = clamp(0.7 + progress * 0.2 + Math.sin(elapsed * 0.7) * 0.004, 0.04, 0.98);
        const point = flightCurve.getPointAt(flightProgress);
        const tangent = flightCurve.getTangentAt(flightProgress);

        airshipRoot.position.lerp(point.clone().add(new THREE.Vector3(0.05, 0.08 + Math.sin(elapsed * 0.9) * 0.022, 0.02)), 0.14);
        airshipRoot.rotation.x = 0.04 + Math.sin(elapsed * 0.7) * 0.018;
        airshipRoot.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI * 0.5;
        airshipRoot.rotation.z = Math.sin(elapsed * 0.82) * 0.028;

        const positions = shipExhaustTrail.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let index = 0; index < positions.count; index += 1) {
          const distance = 0.16 + index * 0.018;
          const spread = (index / positions.count) * 0.24;
          const side = Math.sin(elapsed * 4.8 + index * 1.4) * spread;
          positions.setXYZ(
            index,
            airshipRoot.position.x - tangent.x * distance + tangent.z * side,
            airshipRoot.position.y - 0.02 + Math.cos(elapsed * 3.5 + index) * spread * 0.35,
            airshipRoot.position.z - tangent.z * distance - tangent.x * side
          );
        }
        positions.needsUpdate = true;
      }

      const cameraTargetPosition = sampleTupleKeyframes(cameraPositionFrames, progress);
      const cameraTargetLookAt = sampleTupleKeyframes(cameraTargetFrames, progress);
      if (isNarrow) {
        cameraTargetPosition.z += 0.58;
        cameraTargetPosition.y += 0.16;
      }

      camera.position.x += (cameraTargetPosition.x + pointer.x * 0.05 - camera.position.x) * 0.06;
      camera.position.y += (cameraTargetPosition.y - pointer.y * 0.04 - camera.position.y) * 0.06;
      camera.position.z += (cameraTargetPosition.z - camera.position.z) * 0.06;
      camera.lookAt(cameraTargetLookAt);

      magentaLight.color.lerp(activeColor, 0.025);
      composer.render();
    };

    resize();
    syncScroll();
    animate();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", syncScroll, { passive: true });

    return () => {
      disposed = true;
      window.history.scrollRestoration = previousScrollRestoration;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", syncScroll);
      disposeLoadedDerivedModels(loadedRoots);
      disposeObject(routeNetwork.group);
      disposeObject(routePulses);
      disposeObject(cardBeacons);
      disposeObject(shipExhaustTrail);
      disposeObject(starField);
      disposeObject(cloudBank);
      disposeObject(runwayGrid);
      disposeObject(nebulaPlanes);
      environmentMap.dispose();
      pmremGenerator.dispose();
      (roomEnvironment as unknown as { dispose?: () => void }).dispose?.();
      composer.dispose();
      renderer.dispose();
    };
  }, [activeCardRef, canvasRef, pointerRef, rootRef, setActiveCardIndex, setLoadedCount]);
}
