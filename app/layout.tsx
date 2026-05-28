import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { cookies } from "next/headers";
import { themeInitScript } from "@/components/theme-init-script";
import { ThemePreferenceProvider } from "@/components/theme-mode";
import { getInitialThemeSnapshot, parseThemeSnapshot, themeBackground, themeSnapshotCookieName } from "@/lib/theme/preference";
import "./globals.css";
import "@/components/project-management-platform/index.less";

export const metadata: Metadata = {
  title: "AI PM 项目管理平台",
  description: "深度融合 AI 的项目管理协作平台",
  icons: {
    icon: "/icon.svg"
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialThemeSnapshot = getInitialThemeSnapshot(cookieStore.get(themeSnapshotCookieName)?.value);
  const { mode: initialThemeMode, effectiveTheme } = parseThemeSnapshot(initialThemeSnapshot);
  const themeStyle = {
    colorScheme: effectiveTheme,
    backgroundColor: themeBackground[effectiveTheme]
  };

  return (
    <html
      lang="zh-CN"
      data-theme={effectiveTheme}
      data-theme-mode={initialThemeMode}
      style={themeStyle}
      suppressHydrationWarning
    >
      <head>
        {/* 首屏主题脚本必须先于页面内容执行，避免刷新时短暂露出默认白底。 */}
        <script id="ai-pm-theme-init" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        data-theme={effectiveTheme}
        data-theme-mode={initialThemeMode}
        style={{ backgroundColor: themeBackground[effectiveTheme] }}
        suppressHydrationWarning
      >
        <AntdRegistry>
          <ThemePreferenceProvider initialSnapshot={initialThemeSnapshot}>{children}</ThemePreferenceProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
