export type AeroSceneCard = {
  accent: string;
  id: "requirements" | "versions" | "bugs" | "launch";
  index: string;
  metric: string;
  position: [number, number, number];
  status: string;
  summary: string;
  title: string;
};

export type AeroRouteDefinition = {
  color: string;
  id: "blue" | "orange";
  points: [number, number, number][];
};

export const AERO_SOURCE_MODEL_COUNT = 15;

// 页面只加载 Blender 派生后的 processed 模型；原始第三方 GLB 保留在 `models/source/`，
// 这样后续可以继续替换源模型并重新生成，不会让运行时代码依赖一堆零散基础资产。
export const aeroProcessedModels = {
  airship: "/aero-system/models/processed/aero-airship-hero.glb",
  scene: "/aero-system/models/processed/aero-harbor-scene.glb",
};

// 坐标和 Blender 脚本保持一致，前端只负责把卡片和航线投射到这套 3D 场景上。
export const aeroSceneCards: AeroSceneCard[] = [
  {
    accent: "#55f0c7",
    id: "requirements",
    index: "01",
    metric: "进行中 12/20",
    position: [-1.72, 0.7, -0.18],
    status: "进行中",
    summary: "收集需求，拆解任务",
    title: "需求塔台",
  },
  {
    accent: "#48a8ff",
    id: "versions",
    index: "02",
    metric: "进行中 v1.2.3",
    position: [-0.42, 0.02, 1.08],
    status: "进行中",
    summary: "规划版本，分配资源",
    title: "版本航站",
  },
  {
    accent: "#ffbb55",
    id: "bugs",
    index: "03",
    metric: "进行中 5 个待处理",
    position: [1.38, -0.02, 1.28],
    status: "进行中",
    summary: "发现问题，修复验证",
    title: "Bug 维修坞",
  },
  {
    accent: "#57e2a2",
    id: "launch",
    index: "04",
    metric: "准备就绪 v1.2.3",
    position: [2.42, 0.72, 0.18],
    status: "准备就绪",
    summary: "验收合规，发布上线",
    title: "上线闸口",
  },
];

export const aeroRouteDefinitions: AeroRouteDefinition[] = [
  {
    color: "#4bd8ff",
    id: "blue",
    points: [
      [-1.55, -0.08, -0.08],
      [-1.0, -0.12, 0.46],
      [-0.42, -0.2, 1.08],
      [0.44, -0.08, 0.62],
    ],
  },
  {
    color: "#ffc35c",
    id: "orange",
    points: [
      [0.44, -0.08, 0.62],
      [1.12, -0.18, 1.22],
      [1.78, 0.02, 0.92],
      [2.42, 0.1, 0.18],
    ],
  },
];

export const aeroHeroStats = [
  {
    detail: "自动规划最优路径",
    label: "AI 智能调度",
  },
  {
    detail: "进度、风险一图掌控",
    label: "全链路可视",
  },
];
