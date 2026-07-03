import {
  BranchesOutlined,
  BugOutlined,
  DashboardOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type CameraPose = {
  eyeOffset: [number, number, number];
  targetOffset: [number, number, number];
  duration: number;
};

export type ShotMotion = {
  label: string;
  status: string;
  camera: CameraPose;
  animationHints: string[];
};

export type CinematicShot = {
  key: string;
  index: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
  metric: string;
  command: string;
  accent: string;
  temperature: string;
  lens: string;
  motion: ShotMotion;
  icon: ReactNode;
  beats: string[];
};

// 分镜数据集中维护，页面层只负责展示；后续换成本地 GLB 后，
// 这些 motion hints 仍可直接映射到 AnimationMixer clip 或镜头轨道。
export const cinematicShots: CinematicShot[] = [
  {
    key: "reactor",
    index: "01",
    eyebrow: "ARC REACTOR WAKE",
    title: "动画钢铁侠进入 AI PM 作战舱",
    subtitle: "镜头从反应堆冷光推入，项目全局、版本节奏和风险警报在装甲表面同步点亮。",
    body: "这个首页不是普通卡片堆叠，而是把 AI PM 的交付现场拍成一条电影预告片：滚动就是运镜，模型就是主角，数据 HUD 就是分镜字幕。",
    metric: "98.7% suit sync",
    command: "command center",
    accent: "#45f4d1",
    temperature: "cold open",
    lens: "35mm macro",
    motion: {
      label: "反应堆近景推入",
      status: "camera push",
      camera: {
        eyeOffset: [0, 0, -0.16],
        targetOffset: [0, 0.03, 0],
        duration: 2.2,
      },
      animationHints: ["idle", "stand", "breath", "pose"],
    },
    icon: <DashboardOutlined />,
    beats: ["项目健康扫描", "版本热区锁定", "关键负责人上线"],
  },
  {
    key: "briefing",
    index: "02",
    eyebrow: "MISSION BRIEF",
    title: "需求像任务简报一样展开",
    subtitle: "PRD、会议纪要和口头输入被拆成验收点，像战术标记一样贴到下一段镜头里。",
    body: "AI PM 的首页风格继续保留项目管理的真实感：不是卖概念，而是让用户第一眼看到需求、任务、Bug、PR 如何进入同一条交付链路。",
    metric: "12 acceptance locks",
    command: "requirement map",
    accent: "#f5c15b",
    temperature: "gold tactical",
    lens: "anamorphic wide",
    motion: {
      label: "任务简报侧身环绕",
      status: "orbit brief",
      camera: {
        eyeOffset: [-0.24, 0.05, 0.02],
        targetOffset: [-0.04, 0.02, 0],
        duration: 2.4,
      },
      animationHints: ["walk", "turn", "brief", "idle"],
    },
    icon: <RadarChartOutlined />,
    beats: ["验收点拆解", "边界条件标注", "版本目标对齐"],
  },
  {
    key: "assembly",
    index: "03",
    eyebrow: "NANO ASSEMBLY",
    title: "任务推进有装甲拼合的节奏",
    subtitle: "阶段流转、负责人变化和延期信号被组织成一段高速装配蒙太奇。",
    body: "滚动中每一屏都像分镜脚本的一格：左侧是导演字幕，右侧是模型和 HUD，底部则用时间码和镜头条把故事连接起来。",
    metric: "24 stage moves",
    command: "delivery pulse",
    accent: "#ff5b42",
    temperature: "reactor heat",
    lens: "80mm chase",
    motion: {
      label: "装甲装配追拍",
      status: "assembly chase",
      camera: {
        eyeOffset: [0.22, 0.1, -0.08],
        targetOffset: [0.02, 0.04, -0.02],
        duration: 1.8,
      },
      animationHints: ["run", "walk", "action", "fly"],
    },
    icon: <BranchesOutlined />,
    beats: ["阶段拖拽", "负责人负载", "延期风险"],
  },
  {
    key: "targeting",
    index: "04",
    eyebrow: "TARGETING LOOP",
    title: "Bug 被锁定到代码闭环",
    subtitle: "复现材料、影响范围、仓库分支和 AI 修复状态在瞄准环里连续刷新。",
    body: "电影感不只靠黑底和光线，还靠叙事冲突。这里把 Bug 从出现、定位、生成修复到 PR 确认做成一组高压目标锁定镜头。",
    metric: "5 PR awaiting",
    command: "fix loop",
    accent: "#38a8ff",
    temperature: "blue alert",
    lens: "120mm scope",
    motion: {
      label: "目标锁定压近",
      status: "target lock",
      camera: {
        eyeOffset: [0.03, 0.02, -0.34],
        targetOffset: [0, 0.06, 0],
        duration: 1.35,
      },
      animationHints: ["attack", "aim", "shoot", "punch"],
    },
    icon: <BugOutlined />,
    beats: ["复现证据", "AI 修复分支", "PR 人工确认"],
  },
  {
    key: "launch",
    index: "05",
    eyebrow: "FINAL LAUNCH",
    title: "上线前最后一秒保持冷静",
    subtitle: "版本大屏、周报、风险回归和团队状态在最后一段长镜头里完成收束。",
    body: "结尾保留 AI PM 的产品目标：让管理者、产品、研发、测试在同一个高密度界面里看清交付是否真的可以发射。",
    metric: "ready to ship",
    command: "launch lock",
    accent: "#e6ff6f",
    temperature: "green clearance",
    lens: "50mm hero",
    motion: {
      label: "发射前英雄定格",
      status: "hero hold",
      camera: {
        eyeOffset: [0, 0, 0],
        targetOffset: [0, 0, 0],
        duration: 2,
      },
      animationHints: ["fly", "jump", "hero", "idle"],
    },
    icon: <ThunderboltOutlined />,
    beats: ["上线检查", "周报导出", "风险回归"],
  },
];
