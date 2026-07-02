import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  AERO_SOURCE_MODEL_COUNT,
  aeroProcessedModels,
  aeroRouteDefinitions,
  aeroSceneCards,
} from "./story-data";
import {
  createCardBeaconField,
  createRouteNetwork,
  createRoutePulseFleet,
  createShipExhaustTrail,
  createSoftNebulaPlanes,
} from "./scene-effects";
import { clamp, createCloudBank, createRunwayGrid, createStarField, disposeObject } from "./scene-helpers";
import { tuneProcessedAeroMaterial } from "./scene-materials";

type AeroPointerState = {
  active: number;
  x: number;
  y: number;
};

type UseAeroCinematicSceneOptions = {
  activeCardRef: RefObject<number>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pointerRef: RefObject<AeroPointerState>;
  setLoadedCount: Dispatch<SetStateAction<number>>;
};

// 这个 hook 只负责 GLB processed 场景、运行时航线和镜头；页面文案/按钮/卡片留在 React 层，
// 避免再出现“模型、滚动、DOM 卡片各自漂移”的问题。
export function useAeroCinematicScene({
  activeCardRef,
  canvasRef,
  pointerRef,
  setLoadedCount,
}: UseAeroCinematicSceneOptions) {
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let viewportWidth = 1;
    let viewportHeight = 1;
    const startedAt = Date.now();
    const emissiveMaterials: THREE.MeshStandardMaterial[] = [];
    const loadedRoots: THREE.Object3D[] = [];
    let airshipRoot: THREE.Group | null = null;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#03070d", 0.075);

    // RoomEnvironment 是轻量 HDR 兜底，让 processed GLB 的金属/玻璃材质有统一反射。
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    const environmentMap = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
    scene.environment = environmentMap;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
    camera.position.set(0.42, 1.62, 6.2);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.52, 0.62);
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    const rig = new THREE.Group();
    rig.position.set(0.78, -0.08, 0);
    rig.rotation.x = -0.03;
    scene.add(rig);

    scene.add(new THREE.HemisphereLight(0xccefff, 0x070910, 1.72));
    const keyLight = new THREE.DirectionalLight(0xeaf8ff, 3.2);
    keyLight.position.set(-3.8, 4.6, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const magentaLight = new THREE.PointLight(0xff66d8, 5.6, 9);
    magentaLight.position.set(0.8, 1.5, -0.3);
    scene.add(magentaLight);

    const cyanLight = new THREE.PointLight(0x66efff, 5.2, 9);
    cyanLight.position.set(-1.5, 0.7, 0.2);
    scene.add(cyanLight);

    const amberLight = new THREE.PointLight(0xffc05e, 5.4, 10);
    amberLight.position.set(2.0, 0.62, 0.88);
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
    rig.add(routeNetwork.group);
    rig.add(routePulses);
    rig.add(cardBeacons);
    rig.add(shipExhaustTrail);

    const loader = new GLTFLoader();
    setLoadedCount(0);

    const loadProcessedScene = () => {
      loader.load(
        aeroProcessedModels.scene,
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }

          gltf.scene.name = "AI_PM_processed_harbor_scene";
          gltf.scene.traverse((node) => {
            const mesh = node as THREE.Mesh;

            if (!mesh.isMesh) {
              return;
            }

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => tuneProcessedAeroMaterial(material, emissiveMaterials));
          });
          rig.add(gltf.scene);
          loadedRoots.push(gltf.scene);
          setLoadedCount(AERO_SOURCE_MODEL_COUNT);
        },
        undefined,
        (error) => {
          // processed GLB 是当前方案的关键产物；失败时明确打到控制台，便于直接定位是否忘记跑 `pnpm aero:models`。
          console.error("Failed to load processed Aero scene GLB", error);
        }
      );
    };

    const loadAirship = () => {
      loader.load(
        aeroProcessedModels.airship,
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }

          airshipRoot = gltf.scene;
          airshipRoot.name = "AI_PM_processed_airship";
          airshipRoot.traverse((node) => {
            const mesh = node as THREE.Mesh;

            if (!mesh.isMesh) {
              return;
            }

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => tuneProcessedAeroMaterial(material, emissiveMaterials));
          });
          airshipRoot.scale.setScalar(0.36);
          rig.add(airshipRoot);
          loadedRoots.push(airshipRoot);
        },
        undefined,
        (error) => {
          console.error("Failed to load processed Aero airship GLB", error);
        }
      );
    };

    loadProcessedScene();
    loadAirship();

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
    };

    const findRoute = (routeId: string) =>
      routeNetwork.routes.find((route) => route.id === routeId) ?? routeNetwork.routes[0];

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const elapsed = (Date.now() - startedAt) / 1000;
      const pointer = pointerRef.current;
      const activeCardIndex = clamp(activeCardRef.current, 0, aeroSceneCards.length - 1);
      const activeCard = aeroSceneCards[activeCardIndex];
      const activeColor = new THREE.Color(activeCard.accent);
      const isNarrow = viewportWidth < 720;

      rig.rotation.y += ((pointer.active ? pointer.x * 0.035 : 0) - rig.rotation.y) * 0.055;
      rig.rotation.x += ((pointer.active ? -pointer.y * 0.018 : -0.03) - rig.rotation.x) * 0.04;
      starField.rotation.y = elapsed * 0.012;
      cloudBank.rotation.y = -elapsed * 0.009;
      cloudBank.position.y = -0.02 + Math.sin(elapsed * 0.28) * 0.025;
      runwayGrid.position.y = -1.36 + Math.sin(elapsed * 0.4) * 0.01;
      nebulaPlanes.children.forEach((sprite, index) => {
        sprite.position.y += Math.sin(elapsed * 0.2 + index) * 0.0008;
      });

      emissiveMaterials.forEach((material, index) => {
        const target = material.name.toLowerCase().includes("neon") ? 1.12 : 0.1;
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
        mesh.material.opacity = 0.34 + Math.sin(elapsed * 2.2 + offset * 8) * 0.18;
      });

      cardBeacons.children.forEach((beacon, index) => {
        const selected = index === activeCardIndex;
        beacon.scale.setScalar(selected ? 1.18 + Math.sin(elapsed * 2.5) * 0.08 : 0.9);
        beacon.children.forEach((child) => {
          if (child instanceof THREE.PointLight) {
            child.intensity += ((selected ? 2.4 : 1.0) - child.intensity) * 0.08;
          }
        });
      });

      const orangeRoute = findRoute("orange");
      if (airshipRoot && orangeRoute) {
        const airshipProgress = 0.54 + Math.sin(elapsed * 0.2) * 0.045;
        const point = orangeRoute.curve.getPointAt(clamp(airshipProgress, 0.02, 0.98));
        const tangent = orangeRoute.curve.getTangentAt(clamp(airshipProgress, 0.02, 0.98));

        airshipRoot.position.lerp(point.clone().add(new THREE.Vector3(0.02, 0.34 + Math.sin(elapsed * 0.9) * 0.028, 0)), 0.12);
        airshipRoot.rotation.x = 0.04 + Math.sin(elapsed * 0.7) * 0.018;
        airshipRoot.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI * 0.5;
        airshipRoot.rotation.z = Math.sin(elapsed * 0.82) * 0.028;

        const positions = shipExhaustTrail.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let index = 0; index < positions.count; index += 1) {
          const distance = 0.16 + index * 0.018;
          const spread = (index / positions.count) * 0.22;
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

      const cameraTargetX = isNarrow ? 0.84 : 0.52;
      const cameraTargetY = isNarrow ? 1.56 : 1.72;
      const cameraTargetZ = isNarrow ? 6.9 : 6.18;
      camera.position.x += (cameraTargetX + pointer.x * 0.12 - camera.position.x) * 0.045;
      camera.position.y += (cameraTargetY - pointer.y * 0.08 - camera.position.y) * 0.045;
      camera.position.z += (cameraTargetZ - camera.position.z) * 0.045;
      camera.lookAt(isNarrow ? 0.92 : 0.98, 0.16, 0.34);

      magentaLight.color.lerp(activeColor, 0.025);
      composer.render();
    };

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      loadedRoots.forEach((root) => disposeObject(root));
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
  }, [activeCardRef, canvasRef, pointerRef, setLoadedCount]);
}
