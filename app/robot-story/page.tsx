import type { Metadata } from "next";
import { RobotStoryHome } from "@/components/robot-story-home";

export const metadata: Metadata = {
  title: "Robot Story Home | AI PM",
  description: "AI PM 机器人电影化滚动叙事首页实验页",
};

export default function RobotStoryPage() {
  // 机器人故事页是独立视觉实验路由，不读取登录态、不触碰工作台数据。
  // 这样可以先验证 Three.js 运镜、动作混合和首页叙事，再决定是否替换正式根首页。
  return <RobotStoryHome />;
}
