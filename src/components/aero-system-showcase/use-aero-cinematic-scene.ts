import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { aeroAssets, aeroStoryChapters } from "./story-data";
import {
  clamp,
  createCinematicCloudBank,
  createRouteSparkles,
  createRunwayGrid,
  createStarField,
  createStoryCurve,
  disposeObject,
  getStoryState,
  type LoadedAeroModel,
} from "./scene-helpers";

type UseAeroCinematicSceneOptions = {
  activeChapterRef: RefObject<number>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  setLoadedCount: Dispatch<SetStateAction<number>>;
  storyProgressRef: RefObject<number>;
  yawOffsetRef: RefObject<number>;
};

// 这个 hook 只负责 WebGL 生命周期和滚动驱动渲染，避免页面组件同时承担 UI、滚动和 Three.js 场景三类职责。
export function useAeroCinematicScene({
  activeChapterRef,
  canvasRef,
  setLoadedCount,
  storyProgressRef,
  yawOffsetRef,
}: UseAeroCinematicSceneOptions) {
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let currentYaw = 0;
    const loadedModels: LoadedAeroModel[] = [];
    const animationStartedAt = Date.now();
    const storyCurve = createStoryCurve();

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#040915", 0.072);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    camera.position.set(0, 2.55, 8.35);

    const rig = new THREE.Group();
    rig.position.set(0.25, 0.02, 0);
    scene.add(rig);

    // 夜景霓虹需要压暗主光、加强补色光，避免模型呈现成普通白天资产预览。
    scene.add(new THREE.HemisphereLight(0xd7f3ff, 0x120c08, 1.85));
    const moonKey = new THREE.DirectionalLight(0xeaf8ff, 4.2);
    moonKey.position.set(-4.6, 5.4, 4.2);
    moonKey.castShadow = true;
    moonKey.shadow.mapSize.set(2048, 2048);
    scene.add(moonKey);

    const magenta = new THREE.PointLight(0xff6bd8, 12, 12);
    magenta.position.set(2.1, 1.8, 1.8);
    scene.add(magenta);

    const amber = new THREE.PointLight(0xffc96d, 9, 14);
    amber.position.set(-2.4, 1.3, 1.3);
    scene.add(amber);

    const cyan = new THREE.PointLight(0x6eeeff, 8, 13);
    cyan.position.set(-1.8, 1.0, -0.7);
    scene.add(cyan);

    const starField = createStarField();
    const cloudBank = createCinematicCloudBank();
    const runwayGrid = createRunwayGrid();
    scene.add(starField);
    scene.add(cloudBank);
    scene.add(runwayGrid);

    const routeMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(aeroStoryChapters[0].accent),
      depthWrite: false,
      opacity: 0.5,
      transparent: true,
    });
    const routeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(storyCurve, 180, 0.018, 8, false),
      routeMaterial
    );
    rig.add(routeMesh);

    const routeGlowMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(aeroStoryChapters[0].accent),
      depthWrite: false,
      opacity: 0.16,
      transparent: true,
    });
    const routeGlowMesh = new THREE.Mesh(
      new THREE.TubeGeometry(storyCurve, 180, 0.07, 12, false),
      routeGlowMaterial
    );
    rig.add(routeGlowMesh);

    const routeSparkles = createRouteSparkles(storyCurve);
    rig.add(routeSparkles);

    const pulseMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(aeroStoryChapters[0].accent),
      depthWrite: false,
      opacity: 0.95,
      transparent: true,
    });
    const routePulse = new THREE.Mesh(new THREE.SphereGeometry(0.078, 24, 24), pulseMaterial);
    const pulseLight = new THREE.PointLight(0x72e4ff, 3.2, 4.5);
    routePulse.add(pulseLight);
    rig.add(routePulse);

    const focusMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(aeroStoryChapters[0].accent),
      depthWrite: false,
      opacity: 0.78,
      transparent: true,
    });
    const focusMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.012, 8, 96),
      focusMaterial
    );
    focusMarker.rotation.x = Math.PI / 2;
    rig.add(focusMarker);

    const waypointGroup = new THREE.Group();
    aeroStoryChapters.forEach((chapter) => {
      const material = new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: new THREE.Color(chapter.accent),
        depthWrite: false,
        opacity: 0.48,
        transparent: true,
      });
      const waypoint = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 16), material);
      waypoint.position.set(...chapter.focus);
      waypointGroup.add(waypoint);
    });
    rig.add(waypointGroup);

    const loader = new GLTFLoader();
    setLoadedCount(0);

    aeroAssets.forEach((asset) => {
      loader.load(
        `/aero-system/models/${asset.file}`,
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }

          const modelRoot = gltf.scene;
          const wrapper = new THREE.Group();
          const box = new THREE.Box3().setFromObject(modelRoot);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
          const baseScale = asset.scale / maxDimension;

          // 第三方 GLB 的原点和单位不统一，先按包围盒居中归一，再放进叙事航线坐标。
          modelRoot.position.sub(center);
          wrapper.add(modelRoot);
          wrapper.position.set(...asset.position);
          wrapper.rotation.set(...asset.rotation);
          wrapper.scale.setScalar(baseScale);
          wrapper.userData.assetName = asset.name;

          wrapper.traverse((node) => {
            const mesh = node as THREE.Mesh;

            if (!mesh.isMesh) {
              return;
            }

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const material = mesh.material;
            const materials = Array.isArray(material) ? material : [material];
            materials.forEach((item) => {
              if (item && "envMapIntensity" in item) {
                (item as THREE.MeshStandardMaterial).envMapIntensity = 0.82;
              }
            });
          });

          rig.add(wrapper);
          loadedModels.push({
            asset,
            baseRotation: new THREE.Euler(...asset.rotation),
            baseScale,
            homePosition: new THREE.Vector3(...asset.position),
            wrapper,
          });
          setLoadedCount((count) => Math.min(aeroAssets.length, count + 1));
        },
        undefined,
        () => {
          setLoadedCount((count) => Math.min(aeroAssets.length, count + 1));
        }
      );
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const elapsed = (Date.now() - animationStartedAt) / 1000;
      const progress = storyProgressRef.current;
      const active = aeroStoryChapters[activeChapterRef.current];
      const storyState = getStoryState(progress);
      const accentColor = new THREE.Color(storyState.accent);
      const focus = new THREE.Vector3(...storyState.focus);
      const desiredYaw = storyState.yaw + yawOffsetRef.current;

      currentYaw += (desiredYaw - currentYaw) * 0.045;
      rig.rotation.y = currentYaw + Math.sin(elapsed * 0.18) * 0.014;
      rig.rotation.x = Math.sin(elapsed * 0.13) * 0.012;

      starField.rotation.y = elapsed * 0.014;
      cloudBank.rotation.y = -elapsed * 0.01;
      cloudBank.position.y = Math.sin(elapsed * 0.28) * 0.025;
      runwayGrid.position.y = -1.42 + Math.sin(elapsed * 0.6) * 0.01;
      routeSparkles.rotation.y = Math.sin(elapsed * 0.18) * 0.018;
      routeMaterial.color.lerp(accentColor, 0.06);
      routeGlowMaterial.color.lerp(accentColor, 0.06);
      pulseMaterial.color.lerp(accentColor, 0.08);
      focusMaterial.color.lerp(accentColor, 0.08);
      pulseLight.color.lerp(accentColor, 0.08);

      const routePoint = storyCurve.getPointAt(clamp(progress, 0, 1));
      const routeTangent = storyCurve.getTangentAt(clamp(progress, 0.001, 0.999));
      routePulse.position.copy(routePoint);
      routePulse.position.y += 0.1 + Math.sin(elapsed * 3.2) * 0.025;
      routePulse.scale.setScalar(1 + Math.sin(elapsed * 3.4) * 0.18);
      routeGlowMesh.scale.setScalar(1 + Math.sin(elapsed * 1.1) * 0.025);

      focusMarker.position.lerp(focus.clone().add(new THREE.Vector3(0, 0.04, 0)), 0.12);
      focusMarker.scale.setScalar(1 + Math.sin(elapsed * 2.8) * 0.08);

      waypointGroup.children.forEach((waypoint, waypointIndex) => {
        const mesh = waypoint as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
        const selected = waypointIndex === activeChapterRef.current;
        mesh.scale.setScalar(selected ? 1.9 + Math.sin(elapsed * 2.8) * 0.16 : 1);
        mesh.material.opacity = selected ? 0.84 : 0.36;
      });

      loadedModels.forEach((item, modelIndex) => {
        const selected = item.asset.name === active.assetName;

        if (item.asset.name === "Aero Airship") {
          item.wrapper.position.lerp(routePoint.clone().add(new THREE.Vector3(0, 0.38, 0)), 0.13);
          item.wrapper.rotation.x = 0.03 + Math.sin(elapsed * 0.72) * 0.025;
          item.wrapper.rotation.y = Math.atan2(routeTangent.x, routeTangent.z) + Math.PI * 0.5;
          item.wrapper.rotation.z = Math.sin(elapsed * 0.9) * 0.035;
          item.wrapper.scale.setScalar(item.baseScale * (1.04 + Math.sin(elapsed * 1.4) * 0.025));
          return;
        }

        item.wrapper.position.x = item.homePosition.x;
        item.wrapper.position.z = item.homePosition.z;
        item.wrapper.position.y =
          item.homePosition.y + Math.sin(elapsed * 0.52 + modelIndex * 0.67) * (selected ? 0.06 : 0.02);
        item.wrapper.rotation.x = item.baseRotation.x;
        item.wrapper.rotation.y =
          item.baseRotation.y + Math.sin(elapsed * 0.22 + modelIndex) * (selected ? 0.05 : 0.016);
        item.wrapper.rotation.z = item.baseRotation.z;
        item.wrapper.scale.setScalar(item.baseScale * (selected ? 1.1 + Math.sin(elapsed * 1.8) * 0.018 : 1));
      });

      camera.position.x += (focus.x * 0.16 - camera.position.x) * 0.035;
      camera.position.y += (2.42 + progress * 0.32 - camera.position.y) * 0.035;
      camera.position.z += (8.35 - progress * 0.52 - camera.position.z) * 0.035;
      camera.lookAt(focus.x * 0.22, 0.12 + progress * 0.18, focus.z * 0.16);
      renderer.render(scene, camera);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      loadedModels.forEach((item) => disposeObject(item.wrapper));
      disposeObject(routeMesh);
      disposeObject(routeGlowMesh);
      disposeObject(routeSparkles);
      disposeObject(routePulse);
      disposeObject(focusMarker);
      disposeObject(waypointGroup);
      disposeObject(starField);
      disposeObject(cloudBank);
      disposeObject(runwayGrid);
      renderer.dispose();
    };
  }, [activeChapterRef, canvasRef, setLoadedCount, storyProgressRef, yawOffsetRef]);
}
