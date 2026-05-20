// 首屏脚本在 CSS 和 React 水合前写入主题底色，避免刷新时暴露浏览器默认白底。
export const themeInitScript = `
(() => {
  const storageKey = "ai-pm-theme-mode";
  const themeBackground = {
    light: "#eef3f8",
    dark: "#0b1020"
  };

  function isThemeMode(value) {
    return value === "system" || value === "light" || value === "dark";
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
    const storedMode = window.localStorage.getItem(storageKey);
    const mode = isThemeMode(storedMode) ? storedMode : "system";
    const theme = resolveTheme(mode);
    const root = document.documentElement;

    root.dataset.theme = theme;
    root.dataset.themeMode = mode;
    root.style.colorScheme = theme;
    root.style.backgroundColor = themeBackground[theme];
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
