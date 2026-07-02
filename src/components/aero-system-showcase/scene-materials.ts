import * as THREE from "three";

// Blender 已经把基础 GLB 派生成统一命名的 processed 材质；这里做运行时二次校色，
// 让模型在浏览器的 ACES + Bloom 管线里接近目标图的暗色电影感。
export function tuneProcessedAeroMaterial(item: THREE.Material, emissiveMaterials: THREE.MeshStandardMaterial[]) {
  const materialName = item.name.toLowerCase();
  const flexibleMaterial = item as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    envMapIntensity?: number;
    metalness?: number;
    opacity?: number;
    roughness?: number;
  };

  if ("envMapIntensity" in flexibleMaterial) {
    flexibleMaterial.envMapIntensity = 1.15;
  }

  if ("metalness" in flexibleMaterial) {
    flexibleMaterial.metalness = materialName.includes("rock") ? 0.12 : 0.68;
  }

  if ("roughness" in flexibleMaterial) {
    flexibleMaterial.roughness = materialName.includes("rock") ? 0.78 : 0.34;
  }

  if ("color" in flexibleMaterial && flexibleMaterial.color) {
    if (materialName.includes("rock")) {
      flexibleMaterial.color.set("#081115");
    } else if (materialName.includes("airship")) {
      flexibleMaterial.color.set("#8b969b");
    } else if (materialName.includes("glass")) {
      flexibleMaterial.color.set("#7df5ff");
    } else if (materialName.includes("orange")) {
      flexibleMaterial.color.set("#ffc15e");
    } else if (materialName.includes("blue") || materialName.includes("cyan")) {
      flexibleMaterial.color.set("#5fe8ff");
    } else if (materialName.includes("magenta")) {
      flexibleMaterial.color.set("#ff6fdb");
    } else {
      flexibleMaterial.color.lerp(new THREE.Color("#13212a"), 0.38);
    }
  }

  if ("emissive" in flexibleMaterial && flexibleMaterial.emissive) {
    if (materialName.includes("orange")) {
      flexibleMaterial.emissive.set("#ff9f2d");
      flexibleMaterial.emissiveIntensity = 1.15;
    } else if (materialName.includes("blue") || materialName.includes("cyan")) {
      flexibleMaterial.emissive.set("#42dfff");
      flexibleMaterial.emissiveIntensity = 1.05;
    } else if (materialName.includes("magenta")) {
      flexibleMaterial.emissive.set("#ff54d6");
      flexibleMaterial.emissiveIntensity = 1.0;
    } else {
      flexibleMaterial.emissive.set("#123744");
      flexibleMaterial.emissiveIntensity = 0.08;
    }
  }

  if (item instanceof THREE.MeshStandardMaterial) {
    emissiveMaterials.push(item);
    item.needsUpdate = true;
  }

  if (materialName.includes("glass")) {
    item.transparent = true;
    item.depthWrite = false;
    flexibleMaterial.opacity = 0.4;
    item.needsUpdate = true;
  }
}
