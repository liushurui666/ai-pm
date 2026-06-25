import { config as loadEnv } from "dotenv";
import {
  getRequestOriginFromHeaders,
  resolveTrustedRequestOrigin
} from "@/lib/auth/request-origin";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const BASE_URL = (process.env.AI_PM_QA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3004").replace(/\/$/, "");
const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";

type OriginCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function toOrigin(value: string) {
  return new URL(value).origin;
}

function getLoopbackOrigins() {
  const base = new URL(BASE_URL);
  const port = base.port ? `:${base.port}` : "";
  const origins = new Set<string>([base.origin]);

  // 本地开发最常见的问题是用 localhost 发起登录、OAuth 回跳或 API 调用却落到 127.0.0.1，
  // Cookie host 不一致会让用户看起来“登录成功但工作台仍未登录”。只在本地地址上扩展双 host 检查，避免线上域名误测。
  if (base.protocol === "http:" && (base.hostname === "localhost" || base.hostname === "127.0.0.1")) {
    origins.add(`http://localhost${port}`);
    origins.add(`http://127.0.0.1${port}`);
  }

  return [...origins];
}

async function runCheck(name: string, check: () => Promise<Record<string, unknown>>): Promise<OriginCheck> {
  try {
    return {
      detail: await check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "认证 origin 冒烟失败"
      },
      name,
      ok: false
    };
  }
}

async function checkLoginPageOrigin(origin: string) {
  const redirectUri = `${origin}/workbench?view=members&workspaceId=${WORKSPACE_ID}`;
  const response = await fetch(`${origin}/login?client_id=ai-pm&redirect_uri=${encodeURIComponent(redirectUri)}`);
  const html = await response.text();
  const detail = {
    hasFeishu: html.includes("飞书"),
    hasGithub: html.includes("GitHub"),
    hasGoogle: html.includes("Google"),
    origin,
    status: response.status
  };

  // 登录页必须在当前访问 origin 下可渲染，否则 localhost/127.0.0.1 混用时会在第一跳就出现回调白名单或 Cookie host 问题。
  assertSmoke(response.status === 200, `${origin} 登录页未返回 200。`);
  assertSmoke(detail.hasFeishu && detail.hasGoogle && detail.hasGithub, `${origin} 登录页缺少 OAuth 入口。`);

  return detail;
}

async function checkProtectedRedirectOrigin(origin: string) {
  const response = await fetch(`${origin}/workbench?view=members&workspaceId=${WORKSPACE_ID}`, {
    redirect: "manual"
  });
  const location = response.headers.get("location") ?? "";
  const redirectUrl = new URL(location, origin);
  const redirectUri = redirectUrl.searchParams.get("redirect_uri") ?? "";
  const detail = {
    location,
    origin,
    redirectOrigin: redirectUrl.origin,
    redirectUri,
    redirectUriOrigin: redirectUri ? toOrigin(redirectUri) : "",
    status: response.status
  };

  // 未登录页面保护要把用户带到“同一个 host”的登录页，并把原始工作台地址放进 redirect_uri；
  // 如果这里退回固定 APP_URL，OAuth 成功后的 Cookie 会写到另一个 host，形成难排查的登录循环。
  assertSmoke([302, 303, 307, 308].includes(response.status), `${origin} 工作台未登录访问未重定向。`);
  assertSmoke(redirectUrl.pathname === "/login", `${origin} 工作台未重定向到 /login。`);
  assertSmoke(redirectUrl.origin === origin, `${origin} 登录重定向 origin 错误：${redirectUrl.origin}`);
  assertSmoke(redirectUri.includes("/workbench"), `${origin} 登录重定向缺少工作台 redirect_uri。`);
  assertSmoke(toOrigin(redirectUri) === origin, `${origin} redirect_uri origin 错误：${redirectUri}`);

  return detail;
}

async function checkRequestOriginHelpers() {
  const fallback = "https://ai-pm.example.com";
  const localOrigin = getRequestOriginFromHeaders(new Headers({
    host: "127.0.0.1:3004"
  }));
  const forwardedOrigin = getRequestOriginFromHeaders(new Headers({
    "x-forwarded-host": "localhost:3004",
    "x-forwarded-proto": "http"
  }));
  const trustedLocal = resolveTrustedRequestOrigin(localOrigin, fallback);
  const trustedForwarded = resolveTrustedRequestOrigin(forwardedOrigin, fallback);
  const untrusted = resolveTrustedRequestOrigin("https://evil.example.com", fallback);

  // request-origin helper 是登录/会话路由的共同入口；这里直接守住代理头、localhost/127 和非白名单域名的取舍。
  assertSmoke(localOrigin === "http://127.0.0.1:3004", `host 推断 origin 异常：${localOrigin}`);
  assertSmoke(forwardedOrigin === "http://localhost:3004", `x-forwarded-* 推断 origin 异常：${forwardedOrigin}`);
  assertSmoke(trustedLocal === localOrigin, "本地 127 origin 应被信任。");
  assertSmoke(trustedForwarded === forwardedOrigin, "本地 forwarded origin 应被信任。");
  assertSmoke(untrusted === fallback, "非白名单公网 origin 应回退到 app origin。");

  return {
    fallback,
    forwardedOrigin,
    localOrigin,
    trustedForwarded,
    trustedLocal,
    untrusted
  };
}

async function main() {
  const origins = getLoopbackOrigins();
  const originChecks = origins.flatMap((origin) => [
    runCheck(`login page origin ${origin}`, () => checkLoginPageOrigin(origin)),
    runCheck(`protected redirect origin ${origin}`, () => checkProtectedRedirectOrigin(origin))
  ]);
  const results = [
    await runCheck("request origin helpers", checkRequestOriginHelpers),
    ...await Promise.all(originChecks)
  ];
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    checked: results.length,
    failed: failed.length,
    origins,
    results
  }, null, 2));

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[full-chain-auth-origin-smoke] failed", error);
  process.exitCode = 1;
});
