import {
  BranchesOutlined,
  BugOutlined,
  DashboardOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type RobotStoryChapter = {
  key: string;
  index: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
  signal: string;
  metric: string;
  accent: string;
  baseAction: "Idle" | "Walk" | "Run";
  cameraPosition: [number, number, number];
  cameraLookAt: [number, number, number];
  robotRotationY: number;
  robotPosition: [number, number, number];
  icon: ReactNode;
  beats: string[];
};

// 这里把产品首页拆成明确的电影分镜，而不是把文案散落在组件 JSX 里。
// Three 场景、滚动状态和 DOM 叙事共用同一份 chapter 数据，避免镜头已经进入下一幕但文案仍停在上一幕。
export const robotStoryChapters: RobotStoryChapter[] = [
  {
    key: "awakening",
    index: "01",
    eyebrow: "BOOT SEQUENCE",
    title: "AI PM 作战舱启动",
    subtitle: "机器人从黑场苏醒，扫描项目现场。",
    body: "需求、任务、Bug、风险和成员负载被拉进同一个实时空间，项目不再靠散落消息拼接真相。",
    signal: "live command core",
    metric: "86% health pulse",
    accent: "#7ee8ef",
    baseAction: "Idle",
    cameraPosition: [0.16, 1.36, 5.2],
    cameraLookAt: [0, 1.34, 0],
    robotRotationY: 0,
    robotPosition: [0, 0, 0],
    icon: <DashboardOutlined />,
    beats: ["统一项目视野", "实时健康脉冲", "AI 助手待命"],
  },
  {
    key: "scan",
    index: "02",
    eyebrow: "REQUIREMENT SCAN",
    title: "需求被拆成可执行地图",
    subtitle: "镜头贴近装甲细节，验收点像光束一样展开。",
    body: "PRD、会议纪要和口头描述进入系统后，AI 先拆角色、边界、验收点和风险，研发不用再从群聊里找上下文。",
    signal: "acceptance nodes mapped",
    metric: "12 nodes traced",
    accent: "#9b8cff",
    baseAction: "Walk",
    cameraPosition: [-2.38, 1.82, 3.62],
    cameraLookAt: [-0.1, 1.42, 0.08],
    robotRotationY: 0.38,
    robotPosition: [0.06, 0, -0.06],
    icon: <RadarChartOutlined />,
    beats: ["验收点抽取", "边界条件标记", "版本关联"],
  },
  {
    key: "orchestrate",
    index: "03",
    eyebrow: "DELIVERY ORBIT",
    title: "交付节奏进入轨道",
    subtitle: "镜头环绕机器人，任务流像航线一样推演。",
    body: "版本计划、任务看板、负责人负载和延期信号一起进入节奏盘，管理者看到的是正在移动的交付现场。",
    signal: "delivery route locked",
    metric: "24 moves today",
    accent: "#b8c98a",
    baseAction: "Run",
    cameraPosition: [2.95, 1.68, 3.05],
    cameraLookAt: [0.06, 1.24, -0.1],
    robotRotationY: -0.54,
    robotPosition: [-0.04, 0, 0.02],
    icon: <BranchesOutlined />,
    beats: ["阶段推进", "负责人对齐", "延期预警"],
  },
  {
    key: "risk",
    index: "04",
    eyebrow: "RISK INTERCEPT",
    title: "风险被拦截在上线前",
    subtitle: "灯光骤窄，机器人停在风险边界前。",
    body: "Bug、阻塞、缺失验收和测试风险会在关键节点被放大，AI PM 让项目在失控前先露出异常形态。",
    signal: "risk field isolated",
    metric: "5 blockers isolated",
    accent: "#e37fa7",
    baseAction: "Idle",
    cameraPosition: [-1.22, 1.18, 2.42],
    cameraLookAt: [0.02, 1.08, 0],
    robotRotationY: 0.12,
    robotPosition: [0, 0, 0.08],
    icon: <BugOutlined />,
    beats: ["缺陷聚焦", "阻塞定位", "回归链路"],
  },
  {
    key: "launch",
    index: "05",
    eyebrow: "LAUNCH LOCK",
    title: "最后一镜，版本准备发射",
    subtitle: "镜头拉远，机器人进入冲刺节奏，CTA 出场。",
    body: "周报、版本大屏、飞书通知和 AI 助手写操作连成闭环，让上线前最后一次确认变成清晰的系统动作。",
    signal: "ready to ship",
    metric: "launch window open",
    accent: "#e2bd75",
    baseAction: "Run",
    cameraPosition: [0, 2.2, 6.35],
    cameraLookAt: [0, 1.18, 0],
    robotRotationY: 0,
    robotPosition: [0, 0, 0],
    icon: <SafetyCertificateOutlined />,
    beats: ["上线校验", "周报生成", "通知闭环"],
  },
];

export const ROBOT_MODEL_PATH = "/robot-story/models/SoldierBodyNoHead.glb";
export const ROBOT_MODEL_HAS_SOURCE_HELMET = false;
export const HELMET_MODEL_PATH = "/robot-story/models/DamagedHelmet/glTF/DamagedHelmet.gltf";
export const HELMET_ENVIRONMENT_PATH = "/robot-story/textures/equirectangular/royal_esplanade_2k.hdr.jpg";
