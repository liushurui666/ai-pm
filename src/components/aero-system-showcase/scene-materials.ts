import * as THREE from "three";
import type { AeroAsset } from "./story-data";

// GLB 形体必须保留，但开源素材的贴图/材质会把画面带成粉色低模或白色过曝。
// 这个函数只调材质参数，不替换模型网格，确保后续还能继续基于原 GLB 做细节修正。
export function tuneAeroGlbMaterial(
  asset: AeroAsset,
  item: THREE.Material,
  emissiveMaterials: THREE.MeshStandardMaterial[]
) {
  const flexibleMaterial = item as THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
    metalness?: number;
    roughness?: number;
  };
  const isGroundAsset =
    asset.category === "Environment" ||
    asset.name === "Terrain" ||
    asset.name === "Floating Island" ||
    asset.name === "Sky Path" ||
    asset.name.includes("Hex");

  if ("color" in flexibleMaterial) {
    if (isGroundAsset) {
      // 有些 GLB 地面材质不是 StandardMaterial，必须在通用材质层先去掉粉色贴图影响。
      if ("map" in flexibleMaterial) {
        flexibleMaterial.map = null;
      }
      flexibleMaterial.color?.set("#0b1616");
      item.needsUpdate = true;
    } else if (asset.name === "Aero Airship") {
      if ("map" in flexibleMaterial) {
        flexibleMaterial.map = null;
      }
      flexibleMaterial.color?.set("#6f7f87");
      item.needsUpdate = true;
    }
  }

  if (!("envMapIntensity" in item)) {
    return;
  }

  const standardMaterial = item as THREE.MeshStandardMaterial;
  standardMaterial.envMapIntensity = asset.category === "Station" ? 1.45 : 1.08;

  if ("color" in standardMaterial) {
    if (isGroundAsset) {
      // 浮岛和地面原始贴图偏粉，参考图是暗色岩体和冷色霓虹，因此保留 GLB 形体但把材质压到夜景地貌。
      standardMaterial.map = null;
      standardMaterial.color.set("#0b1616");
      standardMaterial.roughness = Math.max(standardMaterial.roughness ?? 0.55, 0.72);
      standardMaterial.metalness = Math.min(standardMaterial.metalness ?? 0.2, 0.28);
      standardMaterial.envMapIntensity = 0.72;
    } else if (asset.category === "Station" || asset.category === "Infrastructure") {
      // 空间站需要金属反射和边缘光，避免像普通低模玩具；这里只调材质参数，不替换 GLB 网格。
      standardMaterial.color.lerp(new THREE.Color("#1a2630"), 0.32);
      standardMaterial.roughness = Math.min(standardMaterial.roughness ?? 0.38, 0.46);
      standardMaterial.metalness = Math.max(standardMaterial.metalness ?? 0.46, 0.62);
    } else if (asset.name === "Aero Airship") {
      // 飞艇原贴图在 Bloom 下会糊成白团；仍保留 GLB 船体网格，但用银灰材质让轮廓和尾焰分离。
      standardMaterial.map = null;
      standardMaterial.color.set("#7f8d93");
      standardMaterial.roughness = 0.48;
      standardMaterial.metalness = 0.42;
      standardMaterial.envMapIntensity = 0.58;
    }
    standardMaterial.needsUpdate = true;
  }

  if ("emissive" in standardMaterial) {
    standardMaterial.emissive = new THREE.Color(asset.accent);
    standardMaterial.emissiveIntensity =
      asset.name === "Aero Airship" ? 0.006 : asset.category === "Station" ? 0.075 : 0.035;
    emissiveMaterials.push(standardMaterial);
  }
}
