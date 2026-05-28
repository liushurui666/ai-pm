export type ThemeMode = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export const themeStorageKey = "ai-pm-theme-mode";
export const themeSnapshotCookieName = "ai-pm-theme-snapshot";
export const themeChangeEventName = "ai-pm-theme-change";
export const defaultThemeSnapshot = "system:light";
export const themeBackground: Record<EffectiveTheme, string> = {
  light: "#eef3f8",
  dark: "#0b1020"
};

// 主题模式校验在服务端、首屏脚本和客户端 hook 中复用，避免三处规则不一致。
export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

// 有效主题只允许落到浅色或深色，供 cookie 快照和 DOM 属性共用。
export function isEffectiveTheme(value: string | null | undefined): value is EffectiveTheme {
  return value === "light" || value === "dark";
}

// 系统模式需要保存当时解析出的真实主题，服务端才能在下一次刷新时直接渲染正确色系。
export function createThemeSnapshot(mode: ThemeMode, effectiveTheme: EffectiveTheme) {
  return `${mode}:${effectiveTheme}`;
}

// 解析 cookie 快照时始终返回安全兜底，避免异常值破坏首屏渲染。
export function parseThemeSnapshot(snapshot?: string | null): { mode: ThemeMode; effectiveTheme: EffectiveTheme } {
  const [modeValue, themeValue] = (snapshot || defaultThemeSnapshot).split(":");

  return {
    mode: isThemeMode(modeValue) ? modeValue : "system",
    effectiveTheme: isEffectiveTheme(themeValue) ? themeValue : "light"
  };
}

// 服务端不能读取 localStorage，因此只信任 cookie 快照来保证 F5 首帧与用户选择一致。
export function getInitialThemeSnapshot(snapshotCookie?: string | null) {
  const { mode, effectiveTheme } = parseThemeSnapshot(snapshotCookie);

  return createThemeSnapshot(mode, effectiveTheme);
}
