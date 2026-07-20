const DEFAULT_APP_URL = "http://localhost:3004";

function readBaseURLFromEnv() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

export function resolveAuthServiceBaseURL() {
  if (typeof window !== "undefined") {
    // 浏览器端统一使用当前站点 origin，让登录、退出和 Better Auth API 都走 AI PM 同源路由，
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
 * 判断是否启用 AI PM 认证服务。
 *
 * 这个判断只依赖运行环境，权限工具、脚本和 worker 可以安全间接使用，不会提前初始化 PostgreSQL 连接。
 */
export function isAuthServiceConfigured() {
  return Boolean(resolveAuthServiceBaseURL());
}
