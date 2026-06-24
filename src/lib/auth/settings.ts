const DEFAULT_APP_URL = "http://localhost:3004";

function readBaseURLFromEnv() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

export function resolveAuthServiceBaseURL() {
  if (typeof window !== "undefined") {
    // 浏览器端统一使用当前站点 origin，让登录、退出和 Auth Service API 都走 AI PM 同源路由，
    // 避免构建期或脚本环境里的 APP_URL 把 localhost 写死到生产页面。
    return window.location.origin;
  }

  return readBaseURLFromEnv();
}

export function resolveAppBaseURL() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return readBaseURLFromEnv();
}

/**
 * 判断是否启用黑盒认证服务。
 *
 * 这个判断只依赖运行环境，不导入 Unified Auth SDK；权限工具、脚本和 worker 都可能间接使用它，
 * 如果放在 SDK 客户端模块里，`tsx` 脚本会因为解析 SDK 私有运行时导出而无法启动。
 */
export function isAuthServiceConfigured() {
  return Boolean(resolveAuthServiceBaseURL());
}
