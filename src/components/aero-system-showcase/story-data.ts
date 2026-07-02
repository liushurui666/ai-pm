export type AeroAsset = {
  accent: string;
  category: string;
  file: string;
  name: string;
  position: [number, number, number];
  role: string;
  rotation: [number, number, number];
  scale: number;
};

export type AeroStoryChapter = {
  accent: string;
  assetName: string;
  cameraYaw: number;
  focus: [number, number, number];
  index: string;
  key: string;
  kicker: string;
  metric: string;
  summary: string;
  title: string;
};

// 资产坐标是电影叙事版的“场面调度”，不是原 GLB 的物理真实单位。
// 每个模型在加载时会先按自身包围盒归一化，再按这里的坐标组装成浮空交付航线。
export const aeroAssets: AeroAsset[] = [
  {
    accent: "#73e0ff",
    category: "Vehicle",
    file: "Aero_Airship_01.glb",
    name: "Aero Airship",
    position: [-1.95, 1.22, 1.18],
    role: "空中交通艇",
    rotation: [0.05, -0.48, 0.02],
    scale: 0.82,
  },
  {
    accent: "#f7d36c",
    category: "Station",
    file: "Aero_Station_01_Art.glb",
    name: "Main Station",
    position: [-1.58, 0.14, -0.42],
    role: "需求塔台",
    rotation: [0.02, 0.32, 0],
    scale: 1.18,
  },
  {
    accent: "#f38adf",
    category: "Station",
    file: "Aero_Station_PinkRing_Art.glb",
    name: "Pink Ring",
    position: [0.32, 0.46, -0.84],
    role: "版本航站",
    rotation: [0, -0.64, 0.04],
    scale: 0.94,
  },
  {
    accent: "#9cecff",
    category: "Station",
    file: "Aero_Station_Ring_Art.glb",
    name: "Transit Ring",
    position: [1.56, 0.48, -0.1],
    role: "交付中枢",
    rotation: [0.02, 0.08, 0],
    scale: 1,
  },
  {
    accent: "#ffc861",
    category: "Station",
    file: "Aero_Station_YellowRing_Art.glb",
    name: "Yellow Ring",
    position: [1.18, 0.38, 1.28],
    role: "上线闸口",
    rotation: [0, 0.58, -0.03],
    scale: 0.92,
  },
  {
    accent: "#b79cff",
    category: "Station",
    file: "Aero_Station_Mini_Platform_Art.glb",
    name: "Mini Platform",
    position: [-0.28, -0.04, 1.42],
    role: "验收平台",
    rotation: [0, -0.2, 0],
    scale: 0.58,
  },
  {
    accent: "#91f2c7",
    category: "Environment",
    file: "Floating_Island_01_Art.glb",
    name: "Floating Island",
    position: [0, -0.74, 0.16],
    role: "浮空基座",
    rotation: [0, -0.12, 0],
    scale: 3.6,
  },
  {
    accent: "#7dd8ff",
    category: "Infrastructure",
    file: "Path_01_Art.glb",
    name: "Sky Path",
    position: [0.08, -0.35, 0.28],
    role: "空中步道",
    rotation: [0, 0.1, 0],
    scale: 2.55,
  },
  {
    accent: "#5ed7ad",
    category: "Environment",
    file: "Terrain_Art.glb",
    name: "Terrain",
    position: [0, -1.08, 0],
    role: "远景地貌",
    rotation: [0, 0, 0],
    scale: 4.4,
  },
  {
    accent: "#a4eb70",
    category: "Nature",
    file: "Tree_01_Art.glb",
    name: "Signal Tree",
    position: [-2.0, -0.22, -0.82],
    role: "生态信标",
    rotation: [0, 0.46, 0],
    scale: 0.82,
  },
  {
    accent: "#97f5ff",
    category: "Infrastructure",
    file: "Aero_Ground_Hexagon_Art.glb",
    name: "Hex Pad",
    position: [2.08, -0.34, -0.56],
    role: "单体停机坪",
    rotation: [0, -0.14, 0],
    scale: 0.72,
  },
  {
    accent: "#75d5ff",
    category: "Infrastructure",
    file: "Aero_Ground_Hexagons_01_Art.glb",
    name: "Hex Field A",
    position: [1.54, -0.5, 1.06],
    role: "六边形场站 A",
    rotation: [0, -0.56, 0],
    scale: 0.8,
  },
  {
    accent: "#bfe17b",
    category: "Infrastructure",
    file: "Aero_Ground_Hexagons_02_Art.glb",
    name: "Hex Field B",
    position: [-1.78, -0.48, 1.36],
    role: "六边形场站 B",
    rotation: [0, 0.4, 0],
    scale: 0.82,
  },
  {
    accent: "#e8f5ff",
    category: "Architecture",
    file: "Aero_Door_01.glb",
    name: "Dock Door",
    position: [0.36, -0.06, 1.66],
    role: "Bug 维修坞",
    rotation: [0, 0.18, 0],
    scale: 0.62,
  },
  {
    accent: "#fff0a8",
    category: "Infrastructure",
    file: "Aero_Lampost_01.glb",
    name: "Lamp Beacon",
    position: [2.0, -0.15, 0.62],
    role: "航道灯塔",
    rotation: [0, -0.22, 0],
    scale: 0.62,
  },
];

export const aeroStoryChapters: AeroStoryChapter[] = [
  {
    accent: "#73e0ff",
    assetName: "Aero Airship",
    cameraYaw: -0.1,
    focus: [-1.95, 1.22, 1.18],
    index: "00",
    key: "overview",
    kicker: "OPENING SHOT",
    metric: "15 个 3D 模型组成交付航线",
    summary: "把需求、版本、Bug 和上线节点放进同一座浮空航站。用户滚动时，AI 调度艇沿航线推进，每一站对应 AI PM 的一个真实业务场景。",
    title: "用 AI 调度项目航线",
  },
  {
    accent: "#f7d36c",
    assetName: "Main Station",
    cameraYaw: 0.58,
    focus: [-1.58, 0.18, -0.42],
    index: "01",
    key: "requirements",
    kicker: "ACT I / 需求塔台",
    metric: "输入被拆成可交付任务",
    summary: "需求进入塔台后，AI 先做结构化拆解：目标、验收口径、负责人和阻塞点会被同步成团队能执行的任务航线。",
    title: "需求进入塔台",
  },
  {
    accent: "#f38adf",
    assetName: "Pink Ring",
    cameraYaw: -0.34,
    focus: [0.32, 0.48, -0.84],
    index: "02",
    key: "versions",
    kicker: "ACT II / 版本航站",
    metric: "版本、节奏、资源统一编排",
    summary: "版本航站负责把任务装载进发布窗口。每次滚动推进，航线会切到当前版本，展示里程碑、风险和延期信号。",
    title: "版本开始升空",
  },
  {
    accent: "#e8f5ff",
    assetName: "Dock Door",
    cameraYaw: -0.9,
    focus: [0.36, 0.02, 1.66],
    index: "03",
    key: "bugs",
    kicker: "ACT III / Bug 维修坞",
    metric: "缺陷闭环，不再散落聊天里",
    summary: "当 Bug 进入维修坞，AI PM 把复现材料、负责人、修复状态和周报输出锁在一条闭环里，避免上线前靠人肉追问。",
    title: "Bug 进入维修坞",
  },
  {
    accent: "#ffc861",
    assetName: "Yellow Ring",
    cameraYaw: -1.22,
    focus: [1.18, 0.42, 1.28],
    index: "04",
    key: "launch",
    kicker: "FINAL ACT / 上线闸口",
    metric: "上线前最后一次系统锁定",
    summary: "上线闸口只展示最关键的验收、风险和未完成项。团队确认后，航线从故事页落到真实工作台继续推进。",
    title: "上线前最后锁定",
  },
];
