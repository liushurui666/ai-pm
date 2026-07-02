import type { Metadata } from "next";
import { UnitreeModelPreview } from "@/components/unitree-model-preview";

export const metadata: Metadata = {
  title: "Unitree GLB 模型预览 | AI PM",
  description: "本地导出的 Unitree GLB 机器人模型预览页",
};

export default function UnitreeModelPreviewPage() {
  // 独立模型预览路由不依赖登录态和项目数据，避免为了查看 GLB 触发工作台鉴权或数据库读取。
  return <UnitreeModelPreview />;
}
