import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { chromium, type ConsoleMessage, type Page } from "@playwright/test";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const BASE_URL = (process.env.AI_PM_QA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3004").replace(/\/$/, "");
const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";
const STORAGE_STATE_PATH = process.env.AI_PM_QA_STORAGE_STATE || ".ai-pm/qa-auth-storage-state.json";
const LOGIN_TIMEOUT_MS = Number(process.env.AI_PM_QA_LOGIN_TIMEOUT_MS || 5 * 60 * 1000);
const HEADLESS = process.env.AI_PM_QA_LOGIN_HEADLESS === "1";

type DashboardProbe = {
  currentMemberName?: string;
  currentWorkspaceName?: string;
  error?: string;
  memberCount?: number;
  status: number;
};

function createUrl(pathOrUrl: string) {
  return new URL(pathOrUrl, BASE_URL).toString();
}

function assertSetup(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isIgnorableConsoleMessage(message: ConsoleMessage) {
  const text = message.text();

  return (
    text.includes("Download the React DevTools") ||
    text.includes("[Fast Refresh]") ||
    text.includes("webpack-hmr") ||
    text.includes("React DevTools")
  );
}

function attachConsoleCollector(page: Page) {
  const messages: Array<{ text: string; type: string }> = [];

  page.on("console", (message) => {
    const type = message.type();

    if ((type === "error" || type === "warning") && !isIgnorableConsoleMessage(message)) {
      messages.push({
        text: message.text(),
        type
      });
    }
  });

  return messages;
}

async function probeDashboard(page: Page): Promise<DashboardProbe> {
  return await page.evaluate(async (workspaceId) => {
    const response = await fetch(`/api/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`, {
      credentials: "include"
    });
    const payload = await response.json().catch(() => ({}));

    return {
      currentMemberName: payload.meta?.currentMember?.name,
      currentWorkspaceName: payload.meta?.currentWorkspace?.name,
      error: payload.error,
      memberCount: Array.isArray(payload.members) ? payload.members.length : undefined,
      status: response.status
    };
  }, WORKSPACE_ID);
}

async function waitForWorkbench(page: Page) {
  await page.waitForURL((url) => url.pathname === "/workbench", {
    timeout: LOGIN_TIMEOUT_MS,
    waitUntil: "networkidle"
  });
  await page.waitForFunction(() => document.body.innerText.includes("工作台"), undefined, {
    timeout: 30_000
  });
}

async function verifySavedStorageState(storageStatePath: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();
  const consoleMessages = attachConsoleCollector(page);

  try {
    await page.goto(createUrl(`/workbench?view=members&workspaceId=${WORKSPACE_ID}`), {
      waitUntil: "networkidle"
    });

    const text = await page.locator("body").innerText({ timeout: 10_000 });
    const dashboard = await probeDashboard(page);

    // 存储态采集成功不等于可用于回归。这里立即用全新浏览器上下文重放一次，
    // 确认 Cookie/domain/path 能被 Playwright 正常复用，避免后续 full-chain:browser 又跳回登录页。
    assertSetup(!page.url().includes("/login"), "保存后的 storageState 复用后仍被跳回登录页。");
    assertSetup(text.includes("成员管理"), "保存后的 storageState 复用后未渲染成员管理页。");
    assertSetup(dashboard.status === 200, `保存后的 storageState 复用后 /api/dashboard 状态异常：${dashboard.status}`);
    assertSetup(Boolean(dashboard.currentMemberName), "保存后的 storageState 复用后没有识别当前成员。");
    assertSetup(!consoleMessages.some((message) => message.type === "error"), "保存后的 storageState 复用页面存在 console error。");

    return {
      currentMemberName: dashboard.currentMemberName,
      currentWorkspaceName: dashboard.currentWorkspaceName,
      memberCount: dashboard.memberCount,
      replayUrl: page.url()
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleMessages = attachConsoleCollector(page);
  const redirectUri = createUrl(`/workbench?view=overview&workspaceId=${WORKSPACE_ID}`);
  const loginUrl = createUrl(`/login?client_id=ai-pm&redirect_uri=${encodeURIComponent(redirectUri)}`);

  try {
    console.log(JSON.stringify({
      message: "请在打开的浏览器窗口中完成 Feishu/Google/GitHub 登录；脚本会在进入工作台后自动保存 storageState。",
      loginUrl,
      storageStatePath: STORAGE_STATE_PATH,
      timeoutMs: LOGIN_TIMEOUT_MS
    }, null, 2));

    await page.goto(loginUrl, {
      waitUntil: "networkidle"
    });
    await waitForWorkbench(page);

    const dashboard = await probeDashboard(page);

    // 真实 OAuth 登录完成后必须同时满足页面回到工作台、业务 API 识别当前成员。
    // 单看 URL 不足以证明登录态可用，因为 Cookie host 错配时页面可能回跳成功但 API 仍 401。
    assertSetup(dashboard.status === 200, `/api/dashboard 未返回 200：${dashboard.status} ${dashboard.error ?? ""}`);
    assertSetup(Boolean(dashboard.currentMemberName), "登录后 /api/dashboard 未返回当前成员。");
    assertSetup(!consoleMessages.some((message) => message.type === "error"), "登录采集流程存在 console error。");

    await context.storageState({ path: STORAGE_STATE_PATH });
    const replay = await verifySavedStorageState(STORAGE_STATE_PATH);

    console.log(JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      dashboard,
      replay,
      storageStatePath: STORAGE_STATE_PATH,
      nextCommand: `AI_PM_QA_STORAGE_STATE=${STORAGE_STATE_PATH} pnpm full-chain:browser`
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[capture-auth-storage-state] failed", error);
  process.exitCode = 1;
});
