export type UnitreeModelKey =
  | "b2"
  | "go2"
  | "go2w"
  | "g1_23dof"
  | "g1_29dof"
  | "h1"
  | "h1_2"
  | "h1_2_handless"
  | "h2"
  | "h2_plus_with_sharpa";

export type UnitreeModelCatalogItem = {
  key: UnitreeModelKey;
  label: string;
  fileName: string;
  kind: "四足机器人" | "人形机器人";
  geometryCount: number;
  sizeMb: number;
  extents: [number, number, number];
};

// Unitree GLB 预览页只消费桌面导出的本地文件，不把大体积二进制资产提交进仓库。
// 这里保存经过导出校验的轻量元数据，前端可直接用于选择器和尺寸提示。
export const unitreeModelCatalog: UnitreeModelCatalogItem[] = [
  {
    key: "go2",
    label: "Go2",
    fileName: "go2.glb",
    kind: "四足机器人",
    geometryCount: 17,
    sizeMb: 18.0,
    extents: [0.5738, 0.5377, 0.324],
  },
  {
    key: "go2w",
    label: "Go2W",
    fileName: "go2w.glb",
    kind: "四足机器人",
    geometryCount: 17,
    sizeMb: 26.37,
    extents: [0.6113, 0.6142, 0.432],
  },
  {
    key: "b2",
    label: "B2",
    fileName: "b2.glb",
    kind: "四足机器人",
    geometryCount: 13,
    sizeMb: 7.46,
    extents: [0.8544, 0.9776, 0.4582],
  },
  {
    key: "g1_23dof",
    label: "G1 23DoF",
    fileName: "g1_23dof.glb",
    kind: "人形机器人",
    geometryCount: 27,
    sizeMb: 28.53,
    extents: [0.4417, 1.3228, 0.3632],
  },
  {
    key: "g1_29dof",
    label: "G1 29DoF",
    fileName: "g1_29dof.glb",
    kind: "人形机器人",
    geometryCount: 35,
    sizeMb: 22.24,
    extents: [0.4457, 1.3228, 0.3632],
  },
  {
    key: "h1",
    label: "H1",
    fileName: "h1.glb",
    kind: "人形机器人",
    geometryCount: 21,
    sizeMb: 21.94,
    extents: [0.391, 1.806, 0.5241],
  },
  {
    key: "h1_2",
    label: "H1-2",
    fileName: "h1_2.glb",
    kind: "人形机器人",
    geometryCount: 55,
    sizeMb: 43.5,
    extents: [0.5918, 1.788, 0.511],
  },
  {
    key: "h1_2_handless",
    label: "H1-2 Handless",
    fileName: "h1_2_handless.glb",
    kind: "人形机器人",
    geometryCount: 29,
    sizeMb: 30.95,
    extents: [0.383, 1.788, 0.511],
  },
  {
    key: "h2",
    label: "H2",
    fileName: "h2.glb",
    kind: "人形机器人",
    geometryCount: 34,
    sizeMb: 15.02,
    extents: [0.5607, 1.8343, 0.4466],
  },
  {
    key: "h2_plus_with_sharpa",
    label: "H2 Plus with Sharpa",
    fileName: "h2_plus_with_sharpa.glb",
    kind: "人形机器人",
    geometryCount: 88,
    sizeMb: 35.53,
    extents: [0.6141, 1.8353, 0.4466],
  },
];

export const defaultUnitreeModelKey: UnitreeModelKey = "go2";

export function findUnitreeModel(key: string | null | undefined) {
  return unitreeModelCatalog.find((model) => model.key === key);
}
