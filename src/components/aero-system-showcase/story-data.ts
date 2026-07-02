import aeroSceneManifest from "../../../public/aero-system/models/aero-flight-scene.manifest.json";

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

export type AeroDerivedModel = {
  anchors: Record<string, [number, number, number]>;
  blenderFile: string;
  glb: string;
  id: string;
  placement: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  preview: string;
  role: string;
  sourceFiles: string[];
  title: string;
};

export type AeroCameraKeyframe = {
  position: [number, number, number];
  progress: number;
  target: [number, number, number];
};

export type AeroFlightSceneManifest = {
  cameraKeyframes: AeroCameraKeyframe[];
  cards: AeroSceneCard[];
  derivedDirectory: string;
  flightPath: [number, number, number][];
  generatedBy: string;
  models: AeroDerivedModel[];
  routes: Record<"blue" | "orange", { color: string; points: [number, number, number][] }>;
  sourceDirectory: string;
};

export const AERO_SOURCE_MODEL_COUNT = 15;
export const AERO_DERIVED_MODEL_COUNT = 8;

// 业务文案、模型路径、锚点和航线统一从 Blender 派生 manifest 读取。
// 这样一旦视觉偏差需要回归 Blender，前端只需重新加载同一份 manifest，不会散落旧坐标。
export const aeroFlightSceneManifest = aeroSceneManifest as unknown as AeroFlightSceneManifest;

export const aeroSceneCards = aeroFlightSceneManifest.cards;

export const aeroRouteDefinitions = Object.entries(aeroFlightSceneManifest.routes).map(([id, route]) => ({
  color: route.color,
  id: id as AeroRouteDefinition["id"],
  points: route.points,
}));

export const aeroDerivedModels = aeroFlightSceneManifest.models;

export const aeroFlightPath = aeroFlightSceneManifest.flightPath;

export const aeroCameraKeyframes = aeroFlightSceneManifest.cameraKeyframes;

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
