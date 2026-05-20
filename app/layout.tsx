import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { themeInitScript } from "@/components/theme-init-script";
import "./globals.css";
import "@/components/project-management-platform.css";

export const metadata: Metadata = {
  title: "AI PM 项目管理平台",
  description: "深度融合 AI 的项目管理协作平台",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏主题脚本必须先于页面内容执行，避免刷新时短暂露出默认白底。 */}
        <script id="ai-pm-theme-init" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
