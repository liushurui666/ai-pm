"use client";

import { Button, Tooltip, theme } from "antd";
import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

const themeStorageKey = "ai-pm-theme-mode";
const themeModes: ThemeMode[] = ["system", "light", "dark"];
const themeModeLabel: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色"
};

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(themeStorageKey);

  return isThemeMode(stored) ? stored : "system";
}

export function useThemePreference() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>("light");
  const effectiveTheme: EffectiveTheme = mode === "system" ? systemTheme : mode;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");
    const frame = window.requestAnimationFrame(() => {
      setMode(getStoredThemeMode());
      updateSystemTheme();
    });

    mediaQuery.addEventListener("change", updateSystemTheme);

    return () => {
      window.cancelAnimationFrame(frame);
      mediaQuery.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = effectiveTheme;
    document.body.dataset.theme = effectiveTheme;
    document.body.dataset.themeMode = mode;
    window.localStorage.setItem(themeStorageKey, mode);
  }, [effectiveTheme, mode]);

  const cycleMode = () => {
    setMode((currentMode) => themeModes[(themeModes.indexOf(currentMode) + 1) % themeModes.length]);
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
