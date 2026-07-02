import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AERO_DERIVED_MODEL_COUNT, aeroDerivedModels } from "../story-data";
import { tuneDerivedAeroMaterial } from "./materials";
import { disposeObject } from "./scene-utils";

export type LoadedDerivedAeroModels = {
  airshipRoot: THREE.Object3D | null;
  roots: THREE.Object3D[];
};

type LoadDerivedModelsOptions = {
  emissiveMaterials: THREE.MeshStandardMaterial[];
  loader: GLTFLoader;
  rig: THREE.Group;
  setLoadedCount: (value: number) => void;
};

export async function loadDerivedAeroModels({
  emissiveMaterials,
  loader,
  rig,
  setLoadedCount,
}: LoadDerivedModelsOptions): Promise<LoadedDerivedAeroModels> {
  const loadedRoots: THREE.Object3D[] = [];
  let airshipRoot: THREE.Object3D | null = null;
  let loadedCount = 0;

  await Promise.all(
    aeroDerivedModels.map(
      (model) =>
        new Promise<void>((resolve) => {
          loader.load(
            model.glb,
            (gltf) => {
              const root = gltf.scene;
              root.name = `AI_PM_derived_${model.id}`;
              root.position.set(...model.placement.position);
              root.rotation.set(...model.placement.rotation);
              root.scale.set(...model.placement.scale);
              root.userData.derivedModelId = model.id;
              root.userData.derivedRole = model.role;

              root.traverse((node) => {
                const mesh = node as THREE.Mesh;

                if (!mesh.isMesh) {
                  return;
                }

                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach((material) => tuneDerivedAeroMaterial(material, emissiveMaterials));
              });

              if (model.id === "airship-cruiser") {
                airshipRoot = root;
              }

              rig.add(root);
              loadedRoots.push(root);
              loadedCount += 1;
              setLoadedCount(loadedCount);
              resolve();
            },
            undefined,
            (error) => {
              // 派生模型失败时继续解析其他模型，但必须在控制台暴露具体 model id，方便回 Blender 或导出脚本定位。
              console.error(`Failed to load derived Aero model: ${model.id}`, error);
              loadedCount += 1;
              setLoadedCount(loadedCount);
              resolve();
            }
          );
        })
    )
  );

  if (loadedCount !== AERO_DERIVED_MODEL_COUNT) {
    console.warn(`Aero derived model count mismatch: loaded ${loadedCount}, expected ${AERO_DERIVED_MODEL_COUNT}.`);
  }

  return { airshipRoot, roots: loadedRoots };
}

export function disposeLoadedDerivedModels(roots: THREE.Object3D[]) {
  roots.forEach((root) => disposeObject(root));
}
