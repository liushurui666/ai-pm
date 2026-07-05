import type { Metadata } from "next";
import { RobotStoryHome } from "@/components/robot-story-home";

export const metadata: Metadata = {
  title: "AI PM | Robot Story",
  description: "AI PM 机器人电影化滚动叙事首页",
};

export default function Home() {
  // 根路径现在承接机器人电影首页，不再按登录态自动跳转工作台。
  // 用户明确要求把当前机器人页面换成首页，工作台入口继续由页面内 CTA 保留。
  return <RobotStoryHome />;
}
