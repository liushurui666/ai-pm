import * as THREE from "three";
import { aeroAssets, aeroStoryChapters } from "./story-data";

// 参考图里的空间站不是单一平台，而是有电子塔、信标和发光环组成的航站网络。
// 这里用真实 Three.js 几何搭出轻量电子塔，强化“飞船空间站”的识别度。
export function createElectronicTowerField() {
  const group = new THREE.Group();

  aeroStoryChapters.slice(1).forEach((chapter, chapterIndex) => {
    const accent = new THREE.Color(chapter.accent);
    const root = new THREE.Group();
    const [x, y, z] = chapter.focus;
    root.position.set(x, y - 0.12, z);
    root.rotation.y = chapterIndex * 0.72;

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: "#0b141c",
      emissive: accent,
      emissiveIntensity: 0.18,
      metalness: 0.72,
      roughness: 0.32,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: accent,
      depthWrite: false,
      opacity: 0.56,
      transparent: true,
    });
    const glassMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: accent,
      depthWrite: false,
      opacity: 0.18,
      transparent: true,
    });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.7, 18), baseMaterial);
    shaft.position.y = 0.38;
    root.add(shaft);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 28), baseMaterial.clone());
    cap.position.y = 0.76;
    root.add(cap);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.008, 8, 72), glowMaterial.clone());
    ring.position.y = 0.78;
    ring.rotation.x = Math.PI / 2;
    ring.userData.spinSpeed = 0.35 + chapterIndex * 0.08;
    root.add(ring);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 18), glowMaterial.clone());
    beacon.position.y = 0.9;
    root.add(beacon);

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.08, 1.2, 18, 1, true), glassMaterial);
    beam.position.y = 1.36;
    root.add(beam);

    const light = new THREE.PointLight(accent, 1.5, 2.4);
    light.position.y = 0.88;
    root.add(light);
    root.userData.phase = chapterIndex * Math.PI * 0.5;
    group.add(root);
  });

  return group;
}

// 基于现有 GLB 坐标补“电影化灯光外挂”，不替代模型本身：GLB 负责真实形体，增强层只负责参考图里的环形灯带、塔顶信标和停机坪光圈。
export function createGlbAssetEnhancementLayer() {
  const group = new THREE.Group();

  aeroAssets.forEach((asset, assetIndex) => {
    if (asset.name === "Aero Airship") {
      return;
    }

    const accent = new THREE.Color(asset.accent);
    const root = new THREE.Group();
    root.position.set(...asset.position);
    root.rotation.set(...asset.rotation);
    root.userData.phase = assetIndex * 0.5;

    const glowMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: accent,
      depthWrite: false,
      opacity: asset.category === "Environment" ? 0.12 : 0.42,
      transparent: true,
    });
    const softMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: accent,
      depthWrite: false,
      opacity: 0.08,
      transparent: true,
    });

    const isGround =
      asset.category === "Environment" ||
      asset.name.includes("Hex") ||
      asset.name === "Sky Path" ||
      asset.name === "Terrain";
    const isStation =
      asset.category === "Station" ||
      asset.category === "Architecture" ||
      asset.name === "Lamp Beacon";

    if (isGround) {
      const radius = asset.name === "Floating Island" ? 1.35 : asset.name === "Terrain" ? 1.9 : 0.54;
      const padRing = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 132), glowMaterial.clone());
      padRing.rotation.x = Math.PI / 2;
      padRing.position.y = 0.12;
      padRing.userData.glbSpinSpeed = 0.035 + assetIndex * 0.002;
      root.add(padRing);

      const wideAura = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.16, 0.04, 8, 132), softMaterial.clone());
      wideAura.rotation.x = Math.PI / 2;
      wideAura.position.y = 0.1;
      root.add(wideAura);

      for (let stripIndex = 0; stripIndex < 8; stripIndex += 1) {
        const angle = (stripIndex / 8) * Math.PI * 2;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.32, 0.01, 0.012), glowMaterial.clone());
        strip.position.set(Math.cos(angle) * radius * 0.48, 0.13, Math.sin(angle) * radius * 0.48);
        strip.rotation.y = -angle;
        root.add(strip);
      }
    }

    if (isStation) {
      const radius = asset.name === "Main Station" ? 0.62 : asset.name.includes("Ring") ? 0.48 : 0.34;
      const runway = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 144), glowMaterial.clone());
      runway.rotation.x = Math.PI / 2;
      runway.position.y = 0.22;
      runway.userData.glbSpinSpeed = 0.09 + assetIndex * 0.004;
      root.add(runway);

      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.048, asset.name === "Main Station" ? 0.72 : 0.42, 18, 1, true),
        softMaterial.clone()
      );
      tower.position.y = asset.name === "Main Station" ? 0.58 : 0.42;
      root.add(tower);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 18), glowMaterial.clone());
      beacon.position.y = asset.name === "Main Station" ? 0.98 : 0.66;
      beacon.userData.glbPulsePhase = assetIndex * 0.7;
      root.add(beacon);

      const halo = new THREE.PointLight(accent, asset.name === "Main Station" ? 1.8 : 1.1, 2.5);
      halo.position.y = asset.name === "Main Station" ? 0.82 : 0.56;
      root.add(halo);
    }

    if (root.children.length > 0) {
      group.add(root);
    }
  });

  return group;
}

export function createRoutePulseFleet(curve: THREE.CatmullRomCurve3) {
  const group = new THREE.Group();

  for (let index = 0; index < 9; index += 1) {
    const chapter = aeroStoryChapters[index % aeroStoryChapters.length];
    const material = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(chapter.accent),
      depthWrite: false,
      opacity: 0.76,
      transparent: true,
    });
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.032 + (index % 3) * 0.006, 14, 14), material);
    pulse.userData.routeOffset = index / 9;
    pulse.userData.routeSpeed = 0.032 + (index % 4) * 0.006;
    pulse.position.copy(curve.getPointAt(index / 9));
    group.add(pulse);
  }

  return group;
}

export function createShipExhaustTrail() {
  const count = 80;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color("#7af1ff");
  const amber = new THREE.Color("#ffd37a");

  for (let index = 0; index < count; index += 1) {
    const color = (index % 3 === 0 ? amber : cyan).clone();
    positions[index * 3] = 0;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = 0;
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
      opacity: 0.62,
      size: 0.035,
      transparent: true,
      vertexColors: true,
    })
  );
}

// 参考图的航线不是单根故事进度线，而是蓝色“规划航道”和橙色“上线航道”同时存在。
// 这里用同一组 GLB 站点坐标补双航线灯带，仍然以现有 GLB 航站作为锚点。
export function createDeliveryRouteNetwork() {
  const group = new THREE.Group();
  const cyanDeliveryCurve = new THREE.CatmullRomCurve3(
    [aeroStoryChapters[1], aeroStoryChapters[2], aeroStoryChapters[0]].map(
      (chapter) => new THREE.Vector3(...chapter.focus)
    ),
    false,
    "catmullrom",
    0.36
  );
  const amberDeliveryCurve = new THREE.CatmullRomCurve3(
    [aeroStoryChapters[2], aeroStoryChapters[3], aeroStoryChapters[4]].map(
      (chapter) => new THREE.Vector3(...chapter.focus)
    ),
    false,
    "catmullrom",
    0.36
  );

  group.add(createDeliveryRouteMesh(cyanDeliveryCurve, "#69eaff"));
  group.add(createDeliveryRouteMesh(amberDeliveryCurve, "#ffc15e"));
  return group;
}

function createDeliveryRouteMesh(curve: THREE.CatmullRomCurve3, color: string) {
  const group = new THREE.Group();
  const routeColor = new THREE.Color(color);
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(curve, 120, 0.014, 8, false),
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: routeColor,
        depthWrite: false,
        opacity: 0.82,
        transparent: true,
      })
    )
  );
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(curve, 120, 0.048, 10, false),
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: routeColor,
        depthWrite: false,
        opacity: 0.12,
        transparent: true,
      })
    )
  );
  return group;
}

function createRadialFogTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = context.createRadialGradient(96, 96, 8, 96, 96, 96);
  gradient.addColorStop(0, "rgba(168, 242, 255, 0.42)");
  gradient.addColorStop(0.34, "rgba(98, 208, 226, 0.18)");
  gradient.addColorStop(0.72, "rgba(54, 118, 142, 0.06)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 体积雾用多层半透明 sprite 做低成本近似，能营造浮岛之间的空间深度，同时不需要引入昂贵后期体积渲染。
export function createVolumetricFog() {
  const texture = createRadialFogTexture();
  const group = new THREE.Group();

  for (let index = 0; index < 28; index += 1) {
    const material = new THREE.SpriteMaterial({
      blending: THREE.AdditiveBlending,
      color: index % 3 === 0 ? "#73e0ff" : index % 3 === 1 ? "#b6f7dc" : "#fff0a8",
      depthWrite: false,
      map: texture,
      opacity: 0.024 + Math.random() * 0.032,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    const radius = 1.4 + Math.random() * 5.4;
    const angle = Math.random() * Math.PI * 2;
    sprite.position.set(Math.cos(angle) * radius, -0.8 + Math.random() * 0.92, Math.sin(angle) * radius);
    sprite.scale.setScalar(1.35 + Math.random() * 2.6);
    sprite.userData.phase = Math.random() * Math.PI * 2;
    group.add(sprite);
  }

  group.userData.fogTexture = texture;
  return group;
}

// 鼠标 Hover 粒子独立于背景星场，跟随鼠标投影位置做短距离聚散，回应用户的“鼠标交互/hover 粒子”诉求。
export function createHoverParticleField() {
  const count = 180;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color("#79f1ff");
  const amber = new THREE.Color("#ffd071");
  const white = new THREE.Color("#ffffff");

  for (let index = 0; index < count; index += 1) {
    const radius = Math.random() * 0.68;
    const angle = Math.random() * Math.PI * 2;
    const color = (index % 4 === 0 ? amber : index % 5 === 0 ? white : cyan).clone();
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = (Math.random() - 0.5) * 0.62;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
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
      opacity: 0,
      size: 0.035,
      transparent: true,
      vertexColors: true,
    })
  );
}
