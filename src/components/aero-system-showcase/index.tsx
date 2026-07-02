"use client";

import "./index.less";
import {
  ArrowLeftOutlined,
  CloudOutlined,
  RocketOutlined,
  SendOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  aeroAssets,
  aeroStoryChapters,
  type AeroAsset,
} from "./story-data";

type LoadedAeroModel = {
  asset: AeroAsset;
  baseRotation: THREE.Euler;
  baseScale: number;
  homePosition: THREE.Vector3;
  wrapper: THREE.Group;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function lerpTuple(
  from: [number, number, number],
  to: [number, number, number],
  progress: number
): [number, number, number] {
  return [
    lerp(from[0], to[0], progress),
    lerp(from[1], to[1], progress),
    lerp(from[2], to[2], progress),
  ];
}

function getActiveChapterIndex(progress: number) {
  const maxIndex = aeroStoryChapters.length - 1;
  return clamp(Math.round(progress * maxIndex), 0, maxIndex);
}

function getStoryState(progress: number) {
  const maxIndex = aeroStoryChapters.length - 1;
  const exactIndex = clamp(progress, 0, 1) * maxIndex;
  const fromIndex = clamp(Math.floor(exactIndex), 0, maxIndex);
  const toIndex = clamp(fromIndex + 1, 0, maxIndex);
  const localProgress = clamp(exactIndex - fromIndex, 0, 1);
  const from = aeroStoryChapters[fromIndex];
  const to = aeroStoryChapters[toIndex];

  return {
    accent: localProgress < 0.5 ? from.accent : to.accent,
    focus: lerpTuple(from.focus, to.focus, localProgress),
    yaw: lerp(from.cameraYaw, to.cameraYaw, localProgress),
  };
}

function createStoryCurve() {
  return new THREE.CatmullRomCurve3(
    aeroStoryChapters.map((chapter) => new THREE.Vector3(...chapter.focus)),
    false,
    "catmullrom",
    0.34
  );
}

function createStarField() {
  const count = 760;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colorA = new THREE.Color("#6ce7ff");
  const colorB = new THREE.Color("#f5c36c");
  const colorC = new THREE.Color("#d58cff");

  for (let index = 0; index < count; index += 1) {
    const radius = 4 + Math.random() * 9;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 6.6;
    const color = (index % 3 === 0 ? colorA : index % 3 === 1 ? colorB : colorC)
      .clone()
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.28);

    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 2.2;
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
      opacity: 0.48,
      size: 0.026,
      transparent: true,
      vertexColors: true,
    })
  );
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

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.16,
      transparent: true,
      vertexColors: true,
    })
  );
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
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeChapterRef = useRef(0);
  const currentYawRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; startX: number; yaw: number } | null>(
    null
  );
  const scrollFrameRef = useRef(0);
  const storyProgressRef = useRef(0);
  const yawOffsetRef = useRef(0);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const activeChapter = aeroStoryChapters[activeChapterIndex];

  const syncScrollProgress = useCallback(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const maxScroll = Math.max(1, root.offsetHeight - window.innerHeight);
    const progress = clamp((window.scrollY - root.offsetTop) / maxScroll, 0, 1);
    const nextChapterIndex = getActiveChapterIndex(progress);

    storyProgressRef.current = progress;
    setScrollProgress((current) => (Math.abs(current - progress) > 0.006 ? progress : current));
    setActiveChapterIndex((current) =>
      current === nextChapterIndex ? current : nextChapterIndex
    );
  }, []);

  useEffect(() => {
    activeChapterRef.current = activeChapterIndex;
  }, [activeChapterIndex]);

  useEffect(() => {
    const handleScroll = () => {
      if (scrollFrameRef.current) {
        return;
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = 0;
        syncScrollProgress();
      });
    };

    syncScrollProgress();
    window.addEventListener("resize", syncScrollProgress);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.cancelAnimationFrame(scrollFrameRef.current);
      window.removeEventListener("resize", syncScrollProgress);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [syncScrollProgress]);

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
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#050910", 0.065);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(0, 2.3, 8.6);

    const rig = new THREE.Group();
    scene.add(rig);

    scene.add(new THREE.HemisphereLight(0xd7f3ff, 0x17120d, 2.15));
    const sun = new THREE.DirectionalLight(0xffffff, 4.7);
    sun.position.set(-4.6, 5.4, 4.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const magenta = new THREE.PointLight(0xff6bd8, 9, 12);
    magenta.position.set(2.8, 1.8, 2.4);
    scene.add(magenta);

    const amber = new THREE.PointLight(0xffc96d, 7, 14);
    amber.position.set(-2.6, 1.2, 1.2);
    scene.add(amber);

    const starField = createStarField();
    const runwayGrid = createRunwayGrid();
    scene.add(starField);
    scene.add(runwayGrid);

    const routeMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(aeroStoryChapters[0].accent),
      depthWrite: false,
      opacity: 0.34,
      transparent: true,
    });
    const routeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(storyCurve, 160, 0.015, 8, false),
      routeMaterial
    );
    rig.add(routeMesh);

    const pulseMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(aeroStoryChapters[0].accent),
      depthWrite: false,
      opacity: 0.9,
      transparent: true,
    });
    const routePulse = new THREE.Mesh(new THREE.SphereGeometry(0.072, 24, 24), pulseMaterial);
    rig.add(routePulse);

    const focusMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(aeroStoryChapters[0].accent),
      depthWrite: false,
      opacity: 0.7,
      transparent: true,
    });
    const focusMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.009, 8, 96),
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
        opacity: 0.46,
        transparent: true,
      });
      const waypoint = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), material);
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
                (item as THREE.MeshStandardMaterial).envMapIntensity = 0.76;
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
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
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

      currentYawRef.current += (desiredYaw - currentYawRef.current) * 0.045;
      rig.rotation.y = currentYawRef.current + Math.sin(elapsed * 0.18) * 0.018;
      rig.rotation.x = Math.sin(elapsed * 0.13) * 0.014;

      starField.rotation.y = elapsed * 0.016;
      runwayGrid.position.y = -1.42 + Math.sin(elapsed * 0.6) * 0.01;
      routeMaterial.color.lerp(accentColor, 0.06);
      pulseMaterial.color.lerp(accentColor, 0.08);
      focusMaterial.color.lerp(accentColor, 0.08);

      const routePoint = storyCurve.getPointAt(clamp(progress, 0, 1));
      const routeTangent = storyCurve.getTangentAt(clamp(progress, 0.001, 0.999));
      routePulse.position.copy(routePoint);
      routePulse.position.y += 0.1 + Math.sin(elapsed * 3.2) * 0.025;
      routePulse.scale.setScalar(1 + Math.sin(elapsed * 3.4) * 0.18);

      focusMarker.position.lerp(focus.clone().add(new THREE.Vector3(0, 0.04, 0)), 0.12);
      focusMarker.scale.setScalar(1 + Math.sin(elapsed * 2.8) * 0.08);

      waypointGroup.children.forEach((waypoint, waypointIndex) => {
        const mesh = waypoint as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
        const selected = waypointIndex === activeChapterRef.current;
        mesh.scale.setScalar(selected ? 1.8 + Math.sin(elapsed * 2.8) * 0.16 : 1);
        mesh.material.opacity = selected ? 0.78 : 0.34;
      });

      loadedModels.forEach((item, modelIndex) => {
        const selected = item.asset.name === active.assetName;

        if (item.asset.name === "Aero Airship") {
          item.wrapper.position.lerp(routePoint.clone().add(new THREE.Vector3(0, 0.38, 0)), 0.13);
          item.wrapper.rotation.x = 0.03 + Math.sin(elapsed * 0.72) * 0.025;
          item.wrapper.rotation.y = Math.atan2(routeTangent.x, routeTangent.z) + Math.PI * 0.5;
          item.wrapper.rotation.z = Math.sin(elapsed * 0.9) * 0.035;
          item.wrapper.scale.setScalar(item.baseScale * (1.02 + Math.sin(elapsed * 1.4) * 0.025));
          return;
        }

        item.wrapper.position.x = item.homePosition.x;
        item.wrapper.position.z = item.homePosition.z;
        item.wrapper.position.y =
          item.homePosition.y + Math.sin(elapsed * 0.52 + modelIndex * 0.67) * (selected ? 0.055 : 0.02);
        item.wrapper.rotation.x = item.baseRotation.x;
        item.wrapper.rotation.y =
          item.baseRotation.y + Math.sin(elapsed * 0.22 + modelIndex) * (selected ? 0.045 : 0.016);
        item.wrapper.rotation.z = item.baseRotation.z;
        item.wrapper.scale.setScalar(item.baseScale * (selected ? 1.08 + Math.sin(elapsed * 1.8) * 0.018 : 1));
      });

      camera.position.x += (focus.x * 0.12 - camera.position.x) * 0.035;
      camera.position.y += (2.26 + progress * 0.24 - camera.position.y) * 0.035;
      camera.position.z += (8.65 - progress * 0.48 - camera.position.z) * 0.035;
      camera.lookAt(focus.x * 0.22, 0.1 + progress * 0.16, focus.z * 0.16);
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
      disposeObject(routePulse);
      disposeObject(focusMarker);
      disposeObject(waypointGroup);
      disposeObject(starField);
      disposeObject(runwayGrid);
      renderer.dispose();
    };
  }, []);

  const goToChapter = (chapterIndex: number) => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const maxScroll = Math.max(1, root.offsetHeight - window.innerHeight);
    const targetProgress = chapterIndex / Math.max(1, aeroStoryChapters.length - 1);
    window.scrollTo({
      behavior: "smooth",
      top: root.offsetTop + maxScroll * targetProgress,
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      yaw: yawOffsetRef.current,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    yawOffsetRef.current = clamp(drag.yaw + (event.clientX - drag.startX) * 0.004, -0.42, 0.42);
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <main
      className="aero-system-showcase"
      ref={rootRef}
      style={
        {
          "--aero-story-count": aeroStoryChapters.length + 0.85,
          "--chapter-accent": activeChapter.accent,
        } as CSSProperties
      }
    >
      <section className="aero-system-showcase__stage">
        <div className="aero-system-showcase__backdrop" aria-hidden="true" />
        <canvas
          aria-label="Aero System 3D 叙事场景"
          className="aero-system-showcase__canvas"
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerUp}
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

        <section className="aero-system-showcase__copy" aria-label="Aero System 故事">
          <p className="aero-system-showcase__eyebrow">
            <CloudOutlined />
            AI PM / CINEMATIC FLOW
          </p>
          <h1>{activeChapter.title}</h1>
          <p className="aero-system-showcase__summary">{activeChapter.summary}</p>
          <div className="aero-system-showcase__metrics" aria-label="Aero System 当前镜头">
            <span>
              <strong>{activeChapter.index}</strong>
              {activeChapter.kicker}
            </span>
            <span>
              <strong>{loadedCount}/15</strong>
              模型加载
            </span>
          </div>
          <div className="aero-system-showcase__copy-actions">
            <Link href="/login?client_id=ai-pm&redirect_uri=/workbench">
              <SendOutlined />
              登录并进入工作台
            </Link>
            <Link href="/bigscreen">
              <RocketOutlined />
              打开版本大屏
            </Link>
          </div>
        </section>

        <aside className="aero-system-showcase__chapter-card" aria-live="polite">
          <span>{activeChapter.kicker}</span>
          <strong>{activeChapter.metric}</strong>
          <p>{activeChapter.assetName}</p>
        </aside>

        <nav className="aero-system-showcase__story-rail" aria-label="Aero System 故事章节">
          {aeroStoryChapters.map((chapter, chapterIndex) => {
            const isActive = chapterIndex === activeChapterIndex;

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className="aero-system-showcase__story-node"
                data-active={isActive}
                key={chapter.key}
                onClick={() => goToChapter(chapterIndex)}
                style={{ "--chapter-node-accent": chapter.accent } as CSSProperties}
                type="button"
              >
                <span>{chapter.index}</span>
                {chapter.title}
              </button>
            );
          })}
        </nav>

        <div className="aero-system-showcase__scroll-meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${scrollProgress})` }} />
        </div>
      </section>
    </main>
  );
}
