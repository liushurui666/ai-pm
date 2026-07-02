"use client";

import "./index.less";
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CloudOutlined,
  CompassOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type AeroAsset = {
  accent: string;
  category: string;
  file: string;
  name: string;
  position: [number, number, number];
  role: string;
  rotation: [number, number, number];
  scale: number;
};

type LoadedAeroModel = {
  asset: AeroAsset;
  wrapper: THREE.Group;
};

const aeroAssets: AeroAsset[] = [
  {
    accent: "#73e0ff",
    category: "Vehicle",
    file: "Aero_Airship_01.glb",
    name: "Aero Airship",
    position: [0.8, 2.15, 1.65],
    role: "空中交通艇",
    rotation: [0.05, -0.48, 0.02],
    scale: 1.25,
  },
  {
    accent: "#f7d36c",
    category: "Station",
    file: "Aero_Station_01_Art.glb",
    name: "Main Station",
    position: [-1.35, 0.18, -0.2],
    role: "主站台",
    rotation: [0.02, 0.32, 0],
    scale: 1.65,
  },
  {
    accent: "#f38adf",
    category: "Station",
    file: "Aero_Station_PinkRing_Art.glb",
    name: "Pink Ring",
    position: [1.2, 0.52, -0.78],
    role: "粉色换乘环",
    rotation: [0, -0.64, 0.04],
    scale: 1.12,
  },
  {
    accent: "#9cecff",
    category: "Station",
    file: "Aero_Station_Ring_Art.glb",
    name: "Transit Ring",
    position: [0.12, 0.68, -1.46],
    role: "中轴交通环",
    rotation: [0.02, 0.08, 0],
    scale: 1.22,
  },
  {
    accent: "#ffc861",
    category: "Station",
    file: "Aero_Station_YellowRing_Art.glb",
    name: "Yellow Ring",
    position: [-1.62, 0.46, 0.94],
    role: "黄色接驳环",
    rotation: [0, 0.58, -0.03],
    scale: 1.04,
  },
  {
    accent: "#b79cff",
    category: "Station",
    file: "Aero_Station_Mini_Platform_Art.glb",
    name: "Mini Platform",
    position: [1.72, -0.05, 0.52],
    role: "小型停靠台",
    rotation: [0, -0.2, 0],
    scale: 0.78,
  },
  {
    accent: "#91f2c7",
    category: "Environment",
    file: "Floating_Island_01_Art.glb",
    name: "Floating Island",
    position: [0, -0.62, 0.18],
    role: "浮空基座",
    rotation: [0, -0.12, 0],
    scale: 4.8,
  },
  {
    accent: "#7dd8ff",
    category: "Infrastructure",
    file: "Path_01_Art.glb",
    name: "Sky Path",
    position: [0.12, -0.28, 0.36],
    role: "空中步道",
    rotation: [0, 0.1, 0],
    scale: 3.7,
  },
  {
    accent: "#5ed7ad",
    category: "Environment",
    file: "Terrain_Art.glb",
    name: "Terrain",
    position: [0, -1.05, 0],
    role: "远景地貌",
    rotation: [0, 0, 0],
    scale: 5.9,
  },
  {
    accent: "#a4eb70",
    category: "Nature",
    file: "Tree_01_Art.glb",
    name: "Signal Tree",
    position: [-2.0, -0.3, -0.58],
    role: "生态信标",
    rotation: [0, 0.46, 0],
    scale: 1.08,
  },
  {
    accent: "#97f5ff",
    category: "Infrastructure",
    file: "Aero_Ground_Hexagon_Art.glb",
    name: "Hex Pad",
    position: [2.04, -0.36, -0.42],
    role: "单体停机坪",
    rotation: [0, -0.14, 0],
    scale: 0.92,
  },
  {
    accent: "#75d5ff",
    category: "Infrastructure",
    file: "Aero_Ground_Hexagons_01_Art.glb",
    name: "Hex Field A",
    position: [1.46, -0.5, 1.12],
    role: "六边形场站 A",
    rotation: [0, -0.56, 0],
    scale: 1.02,
  },
  {
    accent: "#bfe17b",
    category: "Infrastructure",
    file: "Aero_Ground_Hexagons_02_Art.glb",
    name: "Hex Field B",
    position: [-1.82, -0.48, 1.48],
    role: "六边形场站 B",
    rotation: [0, 0.4, 0],
    scale: 1.08,
  },
  {
    accent: "#e8f5ff",
    category: "Architecture",
    file: "Aero_Door_01.glb",
    name: "Dock Door",
    position: [-0.65, -0.12, 1.78],
    role: "登舰闸门",
    rotation: [0, 0.18, 0],
    scale: 0.72,
  },
  {
    accent: "#fff0a8",
    category: "Infrastructure",
    file: "Aero_Lampost_01.glb",
    name: "Lamp Beacon",
    position: [2.1, -0.18, 0.66],
    role: "航道灯塔",
    rotation: [0, -0.22, 0],
    scale: 0.74,
  },
];

function createStarField() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colorA = new THREE.Color("#6ce7ff");
  const colorB = new THREE.Color("#f5c36c");
  const colorC = new THREE.Color("#d58cff");

  for (let index = 0; index < count; index += 1) {
    const radius = 4 + Math.random() * 9;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 6.8;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 2.4;

    const color = (index % 3 === 0 ? colorA : index % 3 === 1 ? colorB : colorC).clone().lerp(new THREE.Color("#ffffff"), Math.random() * 0.32);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.5,
    size: 0.026,
    transparent: true,
    vertexColors: true,
  });

  return new THREE.Points(geometry, material);
}

function createRunwayGrid() {
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
  const material = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.18,
    transparent: true,
    vertexColors: true,
  });

  return new THREE.LineSegments(geometry, material);
}

function disposeObject(object: THREE.Object3D) {
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
}

export function AeroSystemShowcase() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeIndexRef = useRef(0);
  const targetYawRef = useRef(0);
  const currentYawRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; startX: number; yaw: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const activeAsset = aeroAssets[activeIndex];

  const groupedAssets = useMemo(
    () => [
      { label: "Transit", assets: aeroAssets.filter((asset) => ["Vehicle", "Station"].includes(asset.category)) },
      { label: "Ground", assets: aeroAssets.filter((asset) => ["Infrastructure", "Architecture"].includes(asset.category)) },
      { label: "World", assets: aeroAssets.filter((asset) => ["Environment", "Nature"].includes(asset.category)) },
    ],
    []
  );

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    const position = new THREE.Vector3(...aeroAssets[activeIndex].position);

    // 资产聚焦不移动模型本身，只旋转整个场景朝向目标，避免“模型组装关系”被 UI 状态打散。
    targetYawRef.current = -Math.atan2(position.x, position.z || 0.001) * 0.62;
  }, [activeIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let width = 1;
    let height = 1;
    const loadedModels: LoadedAeroModel[] = [];
    const clock = new THREE.Clock();

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#050910", 0.068);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(0, 2.35, 8.8);

    const rig = new THREE.Group();
    rig.position.set(0, 0, 0);
    scene.add(rig);

    // 这个页面的目标是“把现成 3D 模型组装成一个完整航空系统”，所以灯光和网格只服务于空间关系，
    // 不再像旧首页那样用大量平面贴片伪造主体质感。
    scene.add(new THREE.HemisphereLight(0xd7f3ff, 0x17120d, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 4.8);
    sun.position.set(-4.8, 5.2, 4.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const magenta = new THREE.PointLight(0xff6bd8, 12, 12);
    magenta.position.set(2.8, 1.8, 2.4);
    scene.add(magenta);

    const amber = new THREE.PointLight(0xffc96d, 7, 14);
    amber.position.set(-2.6, 1.2, 1.2);
    scene.add(amber);

    const starField = createStarField();
    const runwayGrid = createRunwayGrid();
    scene.add(starField);
    scene.add(runwayGrid);

    const focusMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.009, 8, 96),
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: new THREE.Color(aeroAssets[0].accent),
        depthWrite: false,
        opacity: 0.68,
        transparent: true,
      })
    );
    focusMarker.rotation.x = Math.PI / 2;
    rig.add(focusMarker);

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

          // 不假设第三方模型的原点和单位统一；每个 GLB 先归一到自身中心，再按场景预设摆位。
          // 这样 15 个资产能稳定组装成一个系统，而不是某个模型因为原点偏移飞出画面。
          modelRoot.position.sub(center);
          wrapper.add(modelRoot);
          wrapper.position.set(...asset.position);
          wrapper.rotation.set(...asset.rotation);
          wrapper.scale.setScalar(asset.scale / maxDimension);
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
                (item as THREE.MeshStandardMaterial).envMapIntensity = 0.75;
              }
            });
          });

          rig.add(wrapper);
          loadedModels.push({ asset, wrapper });
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
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const active = aeroAssets[activeIndexRef.current];
      const activePosition = new THREE.Vector3(...active.position);

      currentYawRef.current += (targetYawRef.current - currentYawRef.current) * 0.045;
      rig.rotation.y = currentYawRef.current + Math.sin(elapsed * 0.18) * 0.025;
      rig.rotation.x = Math.sin(elapsed * 0.13) * 0.018;

      starField.rotation.y = elapsed * 0.018;
      runwayGrid.position.y = -1.42 + Math.sin(elapsed * 0.6) * 0.012;
      focusMarker.position.lerp(activePosition.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.12);
      focusMarker.scale.setScalar(1 + Math.sin(elapsed * 2.8) * 0.08);
      focusMarker.material.color.lerp(new THREE.Color(active.accent), 0.08);

      loadedModels.forEach((item, modelIndex) => {
        const selected = item.asset.name === active.name;
        item.wrapper.position.y =
          item.asset.position[1] + Math.sin(elapsed * 0.52 + modelIndex * 0.67) * (selected ? 0.055 : 0.025);
        item.wrapper.rotation.y =
          item.asset.rotation[1] + Math.sin(elapsed * 0.22 + modelIndex) * (selected ? 0.04 : 0.018);
      });

      camera.position.x = Math.sin(currentYawRef.current * 0.38) * 0.45;
      camera.position.y = 2.35 + Math.sin(elapsed * 0.16) * 0.08;
      camera.lookAt(0, 0.12, 0);
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
      disposeObject(focusMarker);
      disposeObject(starField);
      disposeObject(runwayGrid);
      renderer.dispose();
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      yaw: targetYawRef.current,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    targetYawRef.current = drag.yaw + (event.clientX - drag.startX) * 0.006;
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <main className="aero-system-showcase">
      <div className="aero-system-showcase__backdrop" aria-hidden="true" />
      <canvas
        aria-label="Aero System 3D 场景"
        className="aero-system-showcase__canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
      />

      <header className="aero-system-showcase__nav">
        <Link className="aero-system-showcase__brand" href="/">
          <span className="aero-system-showcase__brand-mark">
            <CloudOutlined />
          </span>
          <span>
            <strong>AI PM</strong>
            <small>Aero System Lab</small>
          </span>
        </Link>
        <div className="aero-system-showcase__nav-actions">
          <Link href="/" className="aero-system-showcase__ghost-action">
            <ArrowLeftOutlined />
            首页
          </Link>
          <Link href="/workbench" className="aero-system-showcase__primary-action">
            <RocketOutlined />
            工作台
          </Link>
        </div>
      </header>

      <section className="aero-system-showcase__copy" aria-label="Aero System 概览">
        <p className="aero-system-showcase__eyebrow">
          <CompassOutlined />
          CC0 / Polygonal Mind
        </p>
        <h1>浮空航空系统</h1>
        <p className="aero-system-showcase__summary">
          15 个开源 GLB 资产被组装成一个完整交通场景：浮岛、站台、航道、接驳环、飞艇和地面设施在同一套 3D 空间里协同展示。
        </p>
        <div className="aero-system-showcase__metrics" aria-label="Aero System 数据">
          <span>
            <strong>{loadedCount}/15</strong>
            模型加载
          </span>
          <span>
            <strong>CC0</strong>
            商用友好
          </span>
          <span>
            <strong>GLB</strong>
            Web 直载
          </span>
        </div>
      </section>

      <aside className="aero-system-showcase__inspector" aria-label="当前资产">
        <span className="aero-system-showcase__inspector-kicker">
          <AppstoreOutlined />
          Active Module
        </span>
        <h2>{activeAsset.name}</h2>
        <p>{activeAsset.role}</p>
        <span style={{ "--asset-accent": activeAsset.accent } as CSSProperties}>{activeAsset.category}</span>
      </aside>

      <nav className="aero-system-showcase__asset-dock" aria-label="Aero System 资产列表">
        {groupedAssets.map((group) => (
          <section key={group.label}>
            <h3>{group.label}</h3>
            <div>
              {group.assets.map((asset) => {
                const assetIndex = aeroAssets.findIndex((item) => item.name === asset.name);
                const isActive = assetIndex === activeIndex;

                return (
                  <button
                    aria-pressed={isActive}
                    className="aero-system-showcase__asset-button"
                    data-active={isActive}
                    key={asset.name}
                    onClick={() => setActiveIndex(assetIndex)}
                    style={{ "--asset-accent": asset.accent } as CSSProperties}
                    type="button"
                  >
                    <span />
                    {asset.name}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </main>
  );
}
