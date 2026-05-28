import type { NextRequest } from "next/server";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * 获取代理链路头里的第一个值。
 *
 * 生产环境常见链路是：浏览器访问公网域名，Nginx 再转发到容器内的 3003 端口。
 * `X-Forwarded-*` 头可能被多层代理追加成逗号列表，OAuth 回跳和 Cookie 判断只应该使用最靠近用户侧的第一个值。
 */
function getFirstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

/**
 * 把用户配置的站点地址规整成 origin。
 *
 * 这里允许运维填 `https://ai-pm.chainthink.cn` 或带路径的 URL，但下游统一只拿 origin。
 * 如果配置不合法则忽略，避免一个写错的环境变量直接把登录链路拼成坏地址。
 */
function normalizeOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * 判断 URL 是否指向本机地址。
 *
 * 本地开发允许使用 localhost 回调；但生产域名后面如果仍出现 localhost，浏览器会跳到用户自己的电脑，
 * 这就是线上登录完成后被带到 `localhost:3003` 的根因之一。
 */
export function isLocalUrl(value: string | URL) {
  try {
    const url = value instanceof URL ? value : new URL(value);

    return LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * 读取显式配置的公网站点地址。
 *
 * `APP_URL` 是服务端运行时推荐配置；`NEXT_PUBLIC_APP_URL` 保留兼容，方便已有部署没有立刻改变量名。
 */
export function getConfiguredPublicAppOrigin() {
  return normalizeOrigin(process.env.APP_URL) || normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
}

/**
 * 从反向代理头中推断公网 origin。
 *
 * 如果运维没有配置 APP_URL，只要 Nginx 正确透传 `Host` 和 `X-Forwarded-Proto`，
 * 这里也可以恢复出用户实际访问的 `https://ai-pm.chainthink.cn`。
 */
function getForwardedOrigin(request: NextRequest) {
  const forwardedHost = getFirstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || getFirstForwardedValue(request.headers.get("host"));

  if (!host) {
    return null;
  }

  const forwardedProto = getFirstForwardedValue(request.headers.get("x-forwarded-proto"));
  const requestUrl = new URL(request.url);
  const proto = forwardedProto || requestUrl.protocol.replace(":", "");

  return normalizeOrigin(`${proto}://${host}`);
}

/**
 * 生成服务端跳转与 OAuth 回调使用的公网 origin。
 *
 * 优先级为：显式 APP_URL -> 反代头 -> request.url。最后一档只作为兜底，
 * 因为容器内 request.url 很可能是 `http://localhost:3003`。
 */
export function getPublicAppOrigin(request: NextRequest) {
  return getConfiguredPublicAppOrigin() || getForwardedOrigin(request) || new URL(request.url).origin;
}

/**
 * 基于公网 origin 拼接站内 URL。
 *
 * 所有登录开始、登录回调、退出登录这种会影响浏览器地址栏的服务端跳转都应走这里，
 * 避免把容器内地址或本地开发地址泄露给线上用户。
 */
export function createPublicAppUrl(path: string, request: NextRequest) {
  return new URL(path, `${getPublicAppOrigin(request)}/`);
}
