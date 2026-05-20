// 首屏脚本在 CSS 和 React 水合前写入主题底色，避免刷新时暴露浏览器默认白底。
import { themeSnapshotCookieName, themeStorageKey } from "@/lib/theme-preference";

export const themeInitScript = `
(() => {
  const storageKey = ${JSON.stringify(themeStorageKey)};
  const snapshotCookieName = ${JSON.stringify(themeSnapshotCookieName)};
  const themeBackground = {
    light: "#eef3f8",
    dark: "#0b1020"
  };

  function isThemeMode(value) {
    return value === "system" || value === "light" || value === "dark";
  }

  function isEffectiveTheme(value) {
    return value === "light" || value === "dark";
  }

  function createSnapshot(mode, theme) {
    return mode + ":" + theme;
  }

  function readCookie(name) {
    return document.cookie
      .split("; ")
      .find((item) => item.startsWith(name + "="))
      ?.split("=")
      .slice(1)
      .join("=");
  }

  function readSnapshotCookie() {
    const rawSnapshot = readCookie(snapshotCookieName);

    if (!rawSnapshot) {
      return null;
    }

    const parts = decodeURIComponent(rawSnapshot).split(":");
    const mode = isThemeMode(parts[0]) ? parts[0] : "system";
    const theme = isEffectiveTheme(parts[1]) ? parts[1] : "light";

    return { mode, theme };
  }

  function writeSnapshotCookie(mode, theme) {
    document.cookie = snapshotCookieName + "=" + encodeURIComponent(createSnapshot(mode, theme)) + "; Path=/; Max-Age=31536000; SameSite=Lax";
  }

  function resolveTheme(mode) {
    if (mode === "light" || mode === "dark") {
      return mode;
    }

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyBodyTheme(mode, theme) {
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", () => applyBodyTheme(mode, theme), { once: true });
      return;
    }

    document.body.dataset.theme = theme;
    document.body.dataset.themeMode = mode;
    document.body.style.backgroundColor = themeBackground[theme];
  }

  try {
    const snapshot = readSnapshotCookie();
    const storedMode = window.localStorage.getItem(storageKey);
    const mode = snapshot?.mode ?? (isThemeMode(storedMode) ? storedMode : "system");
    const theme = snapshot?.theme ?? resolveTheme(mode);
    const root = document.documentElement;

    if (!snapshot && theme !== "light") {
      root.dataset.themeBootstrapping = "true";
    }

    root.dataset.theme = theme;
    root.dataset.themeMode = mode;
    root.style.colorScheme = theme;
    root.style.backgroundColor = themeBackground[theme];
    window.localStorage.setItem(storageKey, mode);
    writeSnapshotCookie(mode, theme);
    applyBodyTheme(mode, theme);
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.themeMode = "system";
    document.documentElement.style.colorScheme = "light";
    document.documentElement.style.backgroundColor = themeBackground.light;
    applyBodyTheme("system", "light");
  }
})();
`;
