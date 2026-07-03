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

  const isNaturalSurface =
    materialName.includes("rock") ||
    materialName.includes("terrain") ||
    materialName.includes("tree") ||
    materialName.includes("leaf") ||
    materialName.includes("island");
  const isSourceGlow =
    materialName.includes("glow") ||
    materialName.includes("glass") ||
    materialName.includes("ring") ||
    materialName.includes("light");

  if ("envMapIntensity" in flexibleMaterial) {
    flexibleMaterial.envMapIntensity = isNaturalSurface ? 0.62 : 0.92;
  }

  if ("metalness" in flexibleMaterial) {
    flexibleMaterial.metalness = isNaturalSurface ? 0.16 : 0.66;
  }

  if ("roughness" in flexibleMaterial) {
    flexibleMaterial.roughness = isNaturalSurface ? 0.82 : 0.34;
  }

  if ("color" in flexibleMaterial && flexibleMaterial.color) {
    if (isNaturalSurface) {
      // Blender 派生模型已经负责形体，前端只压出夜景反差；否则地表会被灯光冲成灰绿平面。
      flexibleMaterial.color.lerp(new THREE.Color("#08211b"), 0.18);
    } else if (materialName.includes("airship")) {
      flexibleMaterial.color.lerp(new THREE.Color("#c6d2d8"), 0.18);
    } else if (materialName.includes("glass")) {
      flexibleMaterial.color.lerp(new THREE.Color("#2d6c74"), 0.68);
    } else if (materialName.includes("orange")) {
      flexibleMaterial.color.set("#ffc15e");
    } else if (materialName.includes("blue") || materialName.includes("cyan")) {
      flexibleMaterial.color.set("#5fe8ff");
    } else if (materialName.includes("magenta")) {
      flexibleMaterial.color.set("#ff6fdb");
    } else {
      flexibleMaterial.color.lerp(new THREE.Color("#0b1822"), 0.42);
    }
  }

  if ("emissive" in flexibleMaterial && flexibleMaterial.emissive) {
    if (materialName.includes("orange")) {
      flexibleMaterial.emissive.set("#ff9f2d");
      flexibleMaterial.emissiveIntensity = 0.82;
    } else if (materialName.includes("blue") || materialName.includes("cyan")) {
      flexibleMaterial.emissive.set("#42dfff");
      flexibleMaterial.emissiveIntensity = 0.74;
    } else if (materialName.includes("magenta")) {
      flexibleMaterial.emissive.set("#ff54d6");
      flexibleMaterial.emissiveIntensity = 0.82;
    } else if (isSourceGlow) {
      flexibleMaterial.emissive.set("#58e5ff");
      flexibleMaterial.emissiveIntensity = materialName.includes("glass") ? 0.08 : 0.2;
    } else {
      flexibleMaterial.emissive.set("#123744");
      flexibleMaterial.emissiveIntensity = isNaturalSurface ? 0.02 : 0.06;
    }
  }

  if (item instanceof THREE.MeshStandardMaterial) {
    emissiveMaterials.push(item);
    item.needsUpdate = true;
  }

  if (materialName.includes("glass")) {
    item.transparent = true;
    item.depthWrite = false;
    flexibleMaterial.opacity = 0.18;
    item.needsUpdate = true;
  }
}
