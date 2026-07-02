import * as THREE from "three";

// Blender 派生模型负责主体形体，浏览器侧只做统一电影化校色和 Bloom 友好的发光强度。
// 这样前端不会把“模型不像”的问题藏在材质 hack 里，偏差大时仍回 Blender 处理。
export function tuneDerivedAeroMaterial(item: THREE.Material, emissiveMaterials: THREE.MeshStandardMaterial[]) {
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
    flexibleMaterial.envMapIntensity = 1.24;
  }

  if ("metalness" in flexibleMaterial) {
    flexibleMaterial.metalness = materialName.includes("rock") ? 0.12 : 0.72;
  }

  if ("roughness" in flexibleMaterial) {
    flexibleMaterial.roughness = materialName.includes("rock") ? 0.8 : 0.3;
  }

  if ("color" in flexibleMaterial && flexibleMaterial.color) {
    if (materialName.includes("rock")) {
      flexibleMaterial.color.set("#071014");
    } else if (materialName.includes("airship")) {
      flexibleMaterial.color.set("#96a2a8");
    } else if (materialName.includes("glass")) {
      flexibleMaterial.color.set("#87f8ff");
    } else if (materialName.includes("orange")) {
      flexibleMaterial.color.set("#ffc15e");
    } else if (materialName.includes("blue") || materialName.includes("cyan")) {
      flexibleMaterial.color.set("#5fe8ff");
    } else if (materialName.includes("magenta")) {
      flexibleMaterial.color.set("#ff6fdb");
    } else {
      flexibleMaterial.color.lerp(new THREE.Color("#12212a"), 0.42);
    }
  }

  if ("emissive" in flexibleMaterial && flexibleMaterial.emissive) {
    if (materialName.includes("orange")) {
      flexibleMaterial.emissive.set("#ff9f2d");
      flexibleMaterial.emissiveIntensity = 1.28;
    } else if (materialName.includes("blue") || materialName.includes("cyan")) {
      flexibleMaterial.emissive.set("#42dfff");
      flexibleMaterial.emissiveIntensity = 1.18;
    } else if (materialName.includes("magenta")) {
      flexibleMaterial.emissive.set("#ff54d6");
      flexibleMaterial.emissiveIntensity = 1.16;
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
    flexibleMaterial.opacity = 0.38;
    item.needsUpdate = true;
  }
}
