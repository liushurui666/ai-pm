import type { Metadata } from "next";
import { IronManCinematicHome } from "@/components/iron-man-cinematic-home";

export const metadata: Metadata = {
  title: "Iron Man Cinematic Home | AI PM",
  description: "AI PM 钢铁侠电影分镜滚动叙事首页实验页",
};

export default function IronManCinematicPage() {
  // 这是独立视觉实验路由：只验证电影化首页表达，不读取登录态、不触发工作台数据请求。
  // 等用户确认方向后，再决定是否替换正式根首页或迁移成活动页。
  return <IronManCinematicHome />;
}
