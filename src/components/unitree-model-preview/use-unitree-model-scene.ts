"use client";

import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { UnitreeModelKey } from "@/lib/unitree-models/catalog";

type UseUnitreeModelSceneOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  modelKey: UnitreeModelKey;
  onStatusChange: (status: string) => void;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

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
}

// 这个 hook 只负责 Three.js 场景生命周期：初始化、加载当前 GLB、ResizeObserver 同步和资源释放。
// UI 组件不直接操作 renderer，后续要替换模型来源或相机策略时不会影响页面布局代码。
export function useUnitreeModelScene({
  canvasRef,
  modelKey,
  onStatusChange,
}: UseUnitreeModelSceneOptions) {
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let currentModel: THREE.Object3D | null = null;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0d1320, 5.2, 12.5);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 80);
    camera.position.set(2.8, 1.8, 3.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 9;
    controls.minDistance = 0.8;
    controls.target.set(0, 0.8, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    const environmentMap = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
    scene.environment = environmentMap;

    // 中性但有层次的展厅光照能看清模型轮廓，同时不把模型染成单一色块。
    scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x172033, 1.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3.4, 5.2, 4.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x7ee7ff, 3.6, 9);
    fillLight.position.set(-2.8, 1.6, -1.6);
    scene.add(fillLight);

    const warmLight = new THREE.PointLight(0xffd39b, 2.7, 8);
    warmLight.position.set(2.1, 0.9, -2.8);
    scene.add(warmLight);

    const grid = new THREE.GridHelper(5.2, 26, 0x6fb7ff, 0x263447);
    grid.position.y = 0;
    const gridMaterial = grid.material as THREE.Material | THREE.Material[];

    if (Array.isArray(gridMaterial)) {
      gridMaterial.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.32;
      });
    } else {
      gridMaterial.transparent = true;
      gridMaterial.opacity = 0.32;
    }

    scene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.85, 96),
      new THREE.MeshStandardMaterial({
        color: 0x101827,
        metalness: 0.35,
        roughness: 0.66,
        transparent: true,
        opacity: 0.68,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const loader = new GLTFLoader();
    onStatusChange("模型加载中");
    loader.load(
      `/api/unitree-models?model=${modelKey}`,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z, 0.001);

        // GLB 已经是米级单位，这里只做居中和轻微缩放，让四足、人形模型在同一展台中都能完整入镜。
        model.position.sub(center);
        model.scale.setScalar(1.72 / maxDimension);
        model.position.x += 0.58;
        model.position.y += (size.y * model.scale.y) / 2;
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;

          if (!mesh.isMesh) {
            return;
          }

          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });

        currentModel = model;
        scene.add(model);
        controls.target.set(0.58, 0.82, 0);
        camera.position.set(3.05, 1.65, 3.15);
        controls.update();
        onStatusChange("已加载");
      },
      (event) => {
        if (!event.total) {
          return;
        }

        const progress = Math.round((event.loaded / event.total) * 100);
        onStatusChange(`模型加载中 ${progress}%`);
      },
      () => {
        if (!disposed) {
          onStatusChange("加载失败");
        }
      }
    );

    const resizeRenderer = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(canvas);
    resizeRenderer();

    const render = () => {
      animationFrame = window.requestAnimationFrame(render);
      const time = performance.now() * 0.001;

      if (currentModel) {
        currentModel.rotation.y += 0.0025;
        currentModel.position.y += Math.sin(time * 1.6) * 0.0008;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();

      if (currentModel) {
        scene.remove(currentModel);
        disposeObject(currentModel);
      }

      grid.geometry.dispose();
      floor.geometry.dispose();
      disposeObject(floor);
      environmentMap.dispose();
      pmremGenerator.dispose();
      roomEnvironment.dispose();
      renderer.dispose();
    };
  }, [canvasRef, modelKey, onStatusChange]);
}
