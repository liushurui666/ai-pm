import type { Metadata } from "next";
import { AeroSystemShowcase } from "@/components/aero-system-showcase";

export const metadata: Metadata = {
  title: "Aero System 3D Showcase | AI PM",
  description: "使用 CC0 航空系统 GLB 模型组装的 AI PM 3D 展示页",
};

export default function AeroSystemPage() {
  // 独立预览页不接登录态和工作台数据，避免为了视觉实验触发认证或 dashboard 读取。
  // 确认效果后，可以再把该 3D 场景迁移到未登录首页或登录页背景。
  return <AeroSystemShowcase />;
}
