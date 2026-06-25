import fs from "node:fs";
import { config as loadEnv } from "dotenv";
import { chromium, type BrowserContext, type ConsoleMessage, type Page } from "@playwright/test";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const BASE_URL = (process.env.AI_PM_QA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3004").replace(/\/$/, "");
const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";
const DEFAULT_STORAGE_STATE = ".ai-pm/qa-auth-storage-state.json";
// 已登录浏览器回归优先读取显式 env；如果没有 env，则复用登录采集脚本写入的默认文件。
// 默认文件位于已忽略的 .ai-pm 目录，既能让本地日常回归自动覆盖工作台，又不会把认证 Cookie 提交进仓库。
const STORAGE_STATE = process.env.AI_PM_QA_STORAGE_STATE || (fs.existsSync(DEFAULT_STORAGE_STATE) ? DEFAULT_STORAGE_STATE : "");
const HEADLESS = process.env.AI_PM_QA_HEADED !== "1";

type BrowserCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

type WorkbenchViewCase = {
  expectedText: string;
  name: string;
  view: string;
};

const workbenchViews: WorkbenchViewCase[] = [
  { expectedText: "工作台", name: "overview", view: "overview" },
  { expectedText: "项目视图", name: "projects", view: "projects" },
  { expectedText: "版本大屏", name: "version dashboard", view: "versionDashboard" },
  { expectedText: "任务看板", name: "tasks", view: "tasks" },
  { expectedText: "Bug 管理", name: "bugs", view: "bugs" },
  { expectedText: "需求管理", name: "requirements", view: "requirements" },
  { expectedText: "成员管理", name: "members", view: "members" },
  { expectedText: "Chat", name: "assistant", view: "assistant" }
];

function createUrl(path: string) {
  return new URL(path, BASE_URL).toString();
}

function assertSmoke(condition: unknown, message: string): asserts condition {
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

async function getPageText(page: Page) {
  return await page.locator("body").innerText({ timeout: 10_000 });
}

async function getHorizontalOverflow(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;

    return {
      clientWidth: root.clientWidth,
      overflow: root.scrollWidth - root.clientWidth,
      scrollWidth: root.scrollWidth
    };
  });
}

async function gotoAuthenticatedWorkbenchView(page: Page, viewCase: WorkbenchViewCase) {
  const targetUrl = createUrl(`/workbench?view=${viewCase.view}&workspaceId=${WORKSPACE_ID}`);

  try {
    await page.goto(targetUrl, {
      // 已登录工作台会懒加载飞书通讯录、助手模型、索引状态等后台请求；
      // 对这类产品型页面，networkidle 可能因为非首屏请求长期不空闲而误判失败。
      // 冒烟关注一级视图是否在登录态下完成渲染，所以先等 DOM 就绪，再用业务文案作为页面可用信号。
      timeout: 60_000,
      waitUntil: "domcontentloaded"
    });
  } catch {
    // Next dev server 偶发会在首个已登录工作台导航上超过 domcontentloaded 等待，但页面响应已经提交。
    // 这里降级到 commit 后继续等待业务文案，避免把“后台请求/水合慢”误判为登录态失效；后续断言仍会检查是否跳回登录页。
    await page.goto(targetUrl, {
      timeout: 60_000,
      waitUntil: "commit"
    });
  }

  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    ({ expectedText }) => document.body.innerText.includes(expectedText) || window.location.pathname.includes("/login"),
    { expectedText: viewCase.expectedText },
    { timeout: 30_000 }
  );
}

async function runCheck(name: string, check: () => Promise<Record<string, unknown>>): Promise<BrowserCheck> {
  try {
    return {
      detail: await check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "浏览器冒烟检查失败"
      },
      name,
      ok: false
    };
  }
}

async function verifyLoginPage(context: BrowserContext) {
  const page = await context.newPage();
  const consoleMessages = attachConsoleCollector(page);
  const response = await page.goto(createUrl("/login?client_id=ai-pm&redirect_uri=http%3A%2F%2Flocalhost%3A3004%2Fworkbench"), {
    waitUntil: "networkidle"
  });
  const text = await getPageText(page);
  const detail = {
    consoleMessages,
    hasFeishu: text.includes("飞书"),
    hasGithub: text.includes("GitHub"),
    hasGoogle: text.includes("Google"),
    status: response?.status() ?? 0,
    url: page.url()
  };

  // 登录页是整套系统的第一入口。这里用真实 Chromium 渲染而不是只看 HTML，
  // 可以顺手发现 hydration、脚本执行或样式断裂导致按钮不可见的问题。
  assertSmoke(response?.ok(), "登录页浏览器请求未返回 2xx");
  assertSmoke(detail.hasFeishu && detail.hasGoogle && detail.hasGithub, "登录页缺少飞书/Google/GitHub 任一入口");
  assertSmoke(!consoleMessages.some((message) => message.type === "error"), "登录页存在 console error");
  await page.close();

  return detail;
}

async function verifyUnauthenticatedRedirect(context: BrowserContext) {
  const page = await context.newPage();
  const consoleMessages = attachConsoleCollector(page);

  await page.goto(createUrl(`/workbench?view=members&workspaceId=${WORKSPACE_ID}`), {
    waitUntil: "networkidle"
  });

  const text = await getPageText(page);
  const detail = {
    consoleMessages,
    hasLoginEntry: text.includes("飞书") && text.includes("GitHub"),
    url: page.url()
  };

  // 页面级未登录保护必须把用户带到登录页并保留回跳地址；这比 API 401 更接近用户真实入口。
  assertSmoke(page.url().includes("/login"), "未登录访问工作台没有跳转到登录页");
  assertSmoke(page.url().includes("redirect_uri="), "未登录跳转缺少 redirect_uri");
  assertSmoke(detail.hasLoginEntry, "未登录跳转后的登录入口不可见");
  assertSmoke(!consoleMessages.some((message) => message.type === "error"), "未登录跳转存在 console error");
  await page.close();

  return detail;
}

async function verifyMobileLogin(context: BrowserContext) {
  const page = await context.newPage();
  const consoleMessages = attachConsoleCollector(page);

  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto(createUrl("/login?client_id=ai-pm&redirect_uri=http%3A%2F%2Flocalhost%3A3004%2Fworkbench"), {
    waitUntil: "networkidle"
  });

  const text = await getPageText(page);
  const overflow = await getHorizontalOverflow(page);
  const detail = {
    consoleMessages,
    hasFeishu: text.includes("飞书"),
    overflow
  };

  // 移动端登录页如果出现横向溢出，OAuth 入口常常会被挤出屏幕；这里做轻量布局守门。
  assertSmoke(detail.hasFeishu, "移动端登录页缺少飞书入口");
  assertSmoke(overflow.overflow <= 2, `移动端登录页存在横向溢出：${overflow.overflow}px`);
  assertSmoke(!consoleMessages.some((message) => message.type === "error"), "移动端登录页存在 console error");
  await page.close();

  return detail;
}

async function verifyAuthenticatedWorkbench(context: BrowserContext) {
  if (!STORAGE_STATE) {
    return {
      skipped: true,
      reason: "未设置 AI_PM_QA_STORAGE_STATE，已跳过已登录工作台浏览器冒烟。"
    };
  }

  assertSmoke(fs.existsSync(STORAGE_STATE), `AI_PM_QA_STORAGE_STATE 指向的文件不存在：${STORAGE_STATE}`);

  const page = await context.newPage();
  const consoleMessages = attachConsoleCollector(page);
  const checkedViews: Array<{ hasExpectedText: boolean; name: string; url: string; view: string }> = [];

  for (const viewCase of workbenchViews) {
    await gotoAuthenticatedWorkbenchView(page, viewCase);

    const text = await getPageText(page);
    const hasExpectedText = text.includes(viewCase.expectedText);

    checkedViews.push({
      hasExpectedText,
      name: viewCase.name,
      url: page.url(),
      view: viewCase.view
    });

    // 已登录冒烟关注一级入口能否渲染和 URL 能否保持在工作台；细粒度 CRUD 由 API/DB 脚本覆盖。
    assertSmoke(!page.url().includes("/login"), `${viewCase.name} 使用登录态后仍被跳回登录页`);
    assertSmoke(hasExpectedText, `${viewCase.name} 页面未出现预期文本：${viewCase.expectedText}`);
  }

  const overflow = await getHorizontalOverflow(page);

  assertSmoke(!consoleMessages.some((message) => message.type === "error"), "已登录工作台存在 console error");
  assertSmoke(overflow.overflow <= 2, `已登录工作台存在横向溢出：${overflow.overflow}px`);
  await page.close();

  return {
    checkedViews,
    consoleMessages,
    overflow,
    skipped: false
  };
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const anonymousContext = await browser.newContext();
  const authenticatedContext = await browser.newContext(
    STORAGE_STATE
      ? {
          storageState: STORAGE_STATE
        }
      : {}
  );
  const results: BrowserCheck[] = [];

  try {
    results.push(await runCheck("login page", () => verifyLoginPage(anonymousContext)));
    results.push(await runCheck("unauthenticated redirect", () => verifyUnauthenticatedRedirect(anonymousContext)));
    results.push(await runCheck("mobile login", () => verifyMobileLogin(anonymousContext)));
    results.push(await runCheck("authenticated workbench views", () => verifyAuthenticatedWorkbench(authenticatedContext)));
  } catch (error) {
    results.push({
      detail: {
        error: error instanceof Error ? error.message : "浏览器冒烟主流程失败"
      },
      name: "browser smoke runtime",
      ok: false
    });
  } finally {
    await anonymousContext.close();
    await authenticatedContext.close();
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    checked: results.length,
    failed: failed.length,
    headless: HEADLESS,
    results,
    storageState: STORAGE_STATE ? "configured" : "missing"
  }, null, 2));

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
