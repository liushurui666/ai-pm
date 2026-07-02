import * as THREE from "three";
import type { AeroRouteDefinition, AeroSceneCard } from "./story-data";
import { createCurveFromPoints } from "./scene-helpers";

export type RuntimeRoute = {
  color: THREE.Color;
  curve: THREE.CatmullRomCurve3;
  id: string;
};

export function createRouteNetwork(routes: AeroRouteDefinition[]) {
  const group = new THREE.Group();
  const runtimeRoutes: RuntimeRoute[] = [];

  routes.forEach((route) => {
    const curve = createCurveFromPoints(route.points);
    const color = new THREE.Color(route.color);
    const coreMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      depthWrite: false,
      opacity: 0.86,
      transparent: true,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      depthWrite: false,
      opacity: 0.16,
      transparent: true,
    });

    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 150, 0.014, 8, false), coreMaterial));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 150, 0.065, 12, false), glowMaterial));
    runtimeRoutes.push({ color, curve, id: route.id });
  });

  return { group, routes: runtimeRoutes };
}

// 业务节点卡片是 HTML，但 WebGL 里仍要有对应的空间信标，否则卡片和模型会像两套系统。
export function createCardBeaconField(cards: AeroSceneCard[]) {
  const group = new THREE.Group();

  cards.forEach((card) => {
    const color = new THREE.Color(card.accent);
    const beaconMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      depthWrite: false,
      opacity: 0.72,
      transparent: true,
    });
    const ringMaterial = beaconMaterial.clone();
    ringMaterial.opacity = 0.34;

    const root = new THREE.Group();
    root.position.set(...card.position);
    root.userData.cardId = card.id;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 18), beaconMaterial);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.008, 8, 72), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    root.add(beacon);
    root.add(ring);

    const light = new THREE.PointLight(color, 1.6, 2.2);
    light.position.y = 0.08;
    root.add(light);
    group.add(root);
  });

  return group;
}

export function createRoutePulseFleet(runtimeRoutes: RuntimeRoute[]) {
  const group = new THREE.Group();

  runtimeRoutes.forEach((route, routeIndex) => {
    for (let index = 0; index < 7; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: route.color,
        depthWrite: false,
        opacity: 0.72,
        transparent: true,
      });
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.028 + (index % 2) * 0.008, 14, 14), material);
      pulse.userData.routeId = route.id;
      pulse.userData.routeIndex = routeIndex;
      pulse.userData.routeOffset = index / 7;
      pulse.userData.routeSpeed = 0.04 + routeIndex * 0.014 + index * 0.001;
      group.add(pulse);
    }
  });

  return group;
}

export function createShipExhaustTrail() {
  const count = 90;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color("#65eaff");
  const amber = new THREE.Color("#ffc260");

  for (let index = 0; index < count; index += 1) {
    const color = (index % 3 === 0 ? amber : cyan).clone();
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
      opacity: 0.64,
      size: 0.033,
      transparent: true,
      vertexColors: true,
    })
  );
}

export function createSoftNebulaPlanes() {
  const group = new THREE.Group();
  const texture = createNebulaTexture();

  for (let index = 0; index < 9; index += 1) {
    const material = new THREE.SpriteMaterial({
      blending: THREE.AdditiveBlending,
      color: index % 2 === 0 ? "#65eaff" : "#ffba65",
      depthWrite: false,
      map: texture,
      opacity: 0.028 + index * 0.004,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    const angle = (index / 9) * Math.PI * 2;
    sprite.position.set(Math.cos(angle) * (1.6 + index * 0.18) + 0.55, -0.8 + index * 0.035, Math.sin(angle) * 1.8);
    sprite.scale.set(2.6 + index * 0.22, 1.2 + index * 0.08, 1);
    sprite.userData.phase = index * 0.7;
    group.add(sprite);
  }

  group.userData.texture = texture;
  return group;
}

function createNebulaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = context.createRadialGradient(96, 96, 10, 96, 96, 96);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.44)");
  gradient.addColorStop(0.34, "rgba(110, 238, 255, 0.18)");
  gradient.addColorStop(0.72, "rgba(255, 184, 100, 0.08)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
