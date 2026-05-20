"use client";

import { Button, Tooltip, theme } from "antd";
import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  createThemeSnapshot,
  defaultThemeSnapshot,
  isThemeMode,
  parseThemeSnapshot,
  themeBackground,
  themeChangeEventName,
  themeSnapshotCookieName,
  themeStorageKey,
  type EffectiveTheme,
  type ThemeMode
} from "@/lib/theme-preference";

export type { EffectiveTheme, ThemeMode } from "@/lib/theme-preference";

const ThemePreferenceContext = createContext(defaultThemeSnapshot);
const themeModes: ThemeMode[] = ["system", "light", "dark"];
const themeModeLabel: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色"
};

// Provider 把服务端 cookie 解析出的主题快照交给所有客户端页面，保证 SSR 和水合首帧一致。
export function ThemePreferenceProvider({
  children,
  initialSnapshot
}: {
  children: ReactNode;
  initialSnapshot: string;
}) {
  return <ThemePreferenceContext.Provider value={initialSnapshot}>{children}</ThemePreferenceContext.Provider>;
}

function readCookieValue(name: string) {
  if (typeof document === "undefined") {
    return "";
  }

  return document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? "";
}

function readSnapshotCookie() {
  const rawSnapshot = readCookieValue(themeSnapshotCookieName);

  if (!rawSnapshot) {
    return null;
  }

  try {
    return parseThemeSnapshot(decodeURIComponent(rawSnapshot));
  } catch {
    // cookie 被手动写坏时忽略它，避免刷新首帧被异常值带偏。
    return null;
  }
}

function writeSnapshotCookie(mode: ThemeMode, effectiveTheme: EffectiveTheme) {
  document.cookie = `${themeSnapshotCookieName}=${encodeURIComponent(
    createThemeSnapshot(mode, effectiveTheme)
  )}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const snapshot = readSnapshotCookie();

  if (snapshot) {
    return snapshot.mode;
  }

  try {
    const stored = window.localStorage.getItem(themeStorageKey);

    return isThemeMode(stored) ? stored : "system";
  } catch {
    // 本地存储被浏览器策略禁用时退回系统模式，避免刷新时主题逻辑阻断渲染。
    return "system";
  }
}

function getSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// 主题快照把用户选择和系统主题压成稳定字符串，方便 useSyncExternalStore 比较。
function getThemeSnapshot() {
  const mode = getStoredThemeMode();
  const effectiveTheme = mode === "system" ? getSystemTheme() : mode;

  return createThemeSnapshot(mode, effectiveTheme);
}

// 监听系统主题、本地存储和手动切换事件，让多个标签页和当前页状态保持一致。
function subscribeThemeSnapshot(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  mediaQuery.addEventListener("change", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(themeChangeEventName, onStoreChange);

  return () => {
    mediaQuery.removeEventListener("change", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(themeChangeEventName, onStoreChange);
  };
}

// React 水合后继续复用首屏脚本的主题属性，保证刷新、切换主题和系统主题变化不会闪白。
function applyThemeAttributes(mode: ThemeMode, effectiveTheme: EffectiveTheme) {
  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.dataset.themeMode = mode;
  delete document.documentElement.dataset.themeBootstrapping;
  document.documentElement.style.colorScheme = effectiveTheme;
  document.documentElement.style.backgroundColor = themeBackground[effectiveTheme];
  document.body.dataset.theme = effectiveTheme;
  document.body.dataset.themeMode = mode;
  document.body.style.backgroundColor = themeBackground[effectiveTheme];
  writeSnapshotCookie(mode, effectiveTheme);
}

// 主题 hook 统一管理首屏脚本后的 React 状态，避免页面刷新和手动切换出现视觉跳变。
export function useThemePreference() {
  const initialSnapshot = useContext(ThemePreferenceContext);
  const snapshot = useSyncExternalStore(subscribeThemeSnapshot, getThemeSnapshot, () => initialSnapshot);
  const { mode, effectiveTheme } = parseThemeSnapshot(snapshot);

  useEffect(() => {
    applyThemeAttributes(mode, effectiveTheme);
  }, [effectiveTheme, mode]);

  const cycleMode = () => {
    const nextMode = themeModes[(themeModes.indexOf(mode) + 1) % themeModes.length];
    const nextEffectiveTheme: EffectiveTheme = nextMode === "system" ? getSystemTheme() : nextMode;

    try {
      window.localStorage.setItem(themeStorageKey, nextMode);
    } catch {
      // 本地存储不可用时仍保持当前页面主题，避免隐私模式下切换报错。
    }

    writeSnapshotCookie(nextMode, nextEffectiveTheme);
    window.dispatchEvent(new Event(themeChangeEventName));
  };

  return {
    mode,
    effectiveTheme,
    cycleMode,
    label: themeModeLabel[mode]
  };
}

export function getAntdThemeConfig(effectiveTheme: EffectiveTheme) {
  const isDark = effectiveTheme === "dark";

  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? "#5b8cff" : "#2563eb",
      colorInfo: isDark ? "#2dd4bf" : "#0f766e",
      colorBgLayout: isDark ? "#0b1020" : "#eef3f8",
      colorBgContainer: isDark ? "#121a2b" : "#ffffff",
      colorBgElevated: isDark ? "#151f33" : "#ffffff",
      colorText: isDark ? "#e7edf7" : "#172033",
      colorTextSecondary: isDark ? "#9aa8bd" : "#667085",
      colorBorder: isDark ? "#25314a" : "#dfe7f2",
      colorBorderSecondary: isDark ? "#1f2a3f" : "#e6eaf2",
      borderRadius: 8,
      boxShadowTertiary: isDark ? "0 18px 46px rgba(0, 0, 0, 0.34)" : "0 18px 46px rgba(15, 23, 42, 0.08)",
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    components: {
      Button: {
        borderRadius: 8,
        controlHeight: 38
      },
      Card: {
        borderRadiusLG: 8
      },
      Drawer: {
        colorBgElevated: isDark ? "#151f33" : "#ffffff"
      },
      Layout: {
        siderBg: isDark ? "#070d19" : "#0b1424",
        headerBg: isDark ? "rgba(13, 20, 34, 0.86)" : "rgba(255, 255, 255, 0.86)"
      },
      Menu: {
        darkItemBg: isDark ? "#070d19" : "#0b1424",
        darkSubMenuItemBg: isDark ? "#070d19" : "#0b1424",
        darkItemSelectedBg: isDark ? "#2f6fed" : "#2563eb"
      },
      Table: {
        headerBg: isDark ? "#151f33" : "#f6f8fb",
        headerColor: isDark ? "#b7c3d6" : "#475467"
      }
    }
  };
}

export function ThemeToggleButton({
  effectiveTheme,
  mode,
  onClick,
  showLabel = false
}: {
  effectiveTheme: EffectiveTheme;
  mode: ThemeMode;
  onClick: () => void;
  showLabel?: boolean;
}) {
  const icon = useMemo(() => {
    if (mode === "system") {
      return <DesktopOutlined />;
    }

    return effectiveTheme === "dark" ? <MoonOutlined /> : <SunOutlined />;
  }, [effectiveTheme, mode]);

  return (
    <Tooltip title={`当前：${themeModeLabel[mode]}，点击切换`}>
      <Button className="theme-toggle-button" icon={icon} onClick={onClick}>
        {showLabel ? themeModeLabel[mode] : null}
      </Button>
    </Tooltip>
  );
}
