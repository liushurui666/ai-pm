import fs from "node:fs";
import { config as loadEnv } from "dotenv";
import { chromium, type ConsoleMessage, type Page } from "@playwright/test";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const BASE_URL = (process.env.AI_PM_QA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3004").replace(/\/$/, "");
const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";
const DEFAULT_STORAGE_STATE = ".ai-pm/qa-auth-storage-state.json";
// 成员页 UI 冒烟必须复用真实登录态才能打开工作台和触发飞书通讯录接口；
// 默认读取本地忽略文件，避免把 Cookie 或 token 写入仓库，也允许 CI 没有登录态时安全跳过。
const STORAGE_STATE = process.env.AI_PM_QA_STORAGE_STATE || (fs.existsSync(DEFAULT_STORAGE_STATE) ? DEFAULT_STORAGE_STATE : "");
const HEADLESS = process.env.AI_PM_QA_HEADED !== "1";
const MIN_FEISHU_PEOPLE = Number(process.env.AI_PM_QA_FEISHU_MIN_PEOPLE || "10");
const FEISHU_SEARCH_KEYWORD = process.env.AI_PM_QA_FEISHU_SEARCH_KEYWORD || "11";

type MemberUiCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

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

function parseCount(text: string, pattern: RegExp, label: string) {
  const match = text.match(pattern);

  assertSmoke(match?.[1], `未能从 ${label} 中解析人数：${text}`);

  return Number(match[1]);
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

async function gotoMembersPage(page: Page) {
  const targetUrl = createUrl(`/workbench?view=members&workspaceId=${WORKSPACE_ID}`);

  try {
    await page.goto(targetUrl, {
      // 成员页会在打开添加成员前后触发飞书通讯录请求；等待 networkidle 容易被后台请求拖慢。
      // 这里用 DOM 就绪 + 业务标题作为登录态和页面可用信号，后续再验证弹窗里的真实联系人数据。
      timeout: 60_000,
      waitUntil: "domcontentloaded"
    });
  } catch {
    await page.goto(targetUrl, {
      timeout: 60_000,
      waitUntil: "commit"
    });
  }

  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("成员管理") || window.location.pathname.includes("/login"),
    undefined,
    { timeout: 30_000 }
  );
}

async function verifyAddMemberFeishuSelect(page: Page) {
  await gotoMembersPage(page);

  assertSmoke(!page.url().includes("/login"), "使用已登录 storageState 后仍被跳回登录页");
  // Next 工作台标题出现时，服务端 HTML 已经可见，但客户端事件可能还在水合；
  // 如果此时立刻点击“添加成员”，浏览器会完成点击动作，React onClick 却可能还没接住，导致只触发进入页面的懒加载而不打开抽屉。
  await page.waitForTimeout(3_000);
  await page.getByRole("button", { name: /添加成员/ }).first().click();

  const drawer = page.locator(".pm-record-drawer").filter({ hasText: "添加成员" }).last();
  await drawer.waitFor({ state: "visible", timeout: 180_000 });

  const status = drawer.locator(".member-feishu-status");
  await status.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => /已同步\s+\d+\s+位联系人/.test(document.body.innerText) || document.body.innerText.includes("通讯录同步失败"),
    undefined,
    { timeout: 180_000 }
  );

  const initialStatusText = await status.innerText();
  assertSmoke(!initialStatusText.includes("通讯录同步失败"), initialStatusText);

  const totalPeople = parseCount(initialStatusText, /已同步\s+(\d+)\s+位联系人/, "成员抽屉通讯录状态");
  assertSmoke(
    totalPeople >= MIN_FEISHU_PEOPLE,
    `添加成员抽屉只同步到 ${totalPeople} 位联系人，低于最小预期 ${MIN_FEISHU_PEOPLE} 位`
  );

  const select = drawer.locator(".member-feishu-person-select");
  await select.locator(".ant-select-content").click();

  const popup = page.locator(".member-feishu-select-popup").last();
  await popup.waitFor({ state: "visible", timeout: 30_000 });
  const initialPopupText = await popup.innerText();
  const popupTotalPeople = parseCount(initialPopupText, /已加载\s+(\d+)\s+位联系人/, "成员抽屉通讯录下拉");
  const initialVisibleOptions = await popup.locator(".ant-select-item-option-content").count();

  assertSmoke(popupTotalPeople === totalPeople, `下拉已加载人数 ${popupTotalPeople} 与状态人数 ${totalPeople} 不一致`);
  assertSmoke(initialVisibleOptions > 0, "飞书通讯录下拉没有渲染任何可选联系人");

  const searchInput = select.locator("input[role='combobox']");
  await searchInput.fill(FEISHU_SEARCH_KEYWORD);
  await page.waitForFunction(
    () => document.body.innerText.includes("当前搜索匹配") && document.body.innerText.includes("当前匹配"),
    undefined,
    { timeout: 30_000 }
  );

  const searchedStatusText = await status.innerText();
  const searchedPopupText = await popup.innerText();
  const matchedByStatus = parseCount(searchedStatusText, /当前搜索匹配\s+(\d+)\s+位/, "成员抽屉搜索状态");
  const matchedByPopup = parseCount(searchedPopupText, /当前匹配\s+(\d+)\s+位/, "成员抽屉搜索下拉");

  assertSmoke(matchedByStatus === matchedByPopup, `状态匹配数 ${matchedByStatus} 与下拉匹配数 ${matchedByPopup} 不一致`);
  assertSmoke(
    matchedByStatus > 0,
    `搜索关键词 ${FEISHU_SEARCH_KEYWORD} 没有命中任何联系人，可能是通讯录过滤或联系人同步退化`
  );

  await drawer.locator(".ant-drawer-close").click();
  await drawer.waitFor({ state: "hidden", timeout: 30_000 });

  return {
    initialPopupText,
    initialStatusText,
    initialVisibleOptions,
    matchedByPopup,
    matchedByStatus,
    searchKeyword: FEISHU_SEARCH_KEYWORD,
    searchedPopupText,
    searchedStatusText,
    totalPeople
  };
}

async function runCheck(name: string, check: () => Promise<Record<string, unknown>>): Promise<MemberUiCheck> {
  try {
    return {
      detail: await check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "成员 UI 浏览器冒烟失败"
      },
      name,
      ok: false
    };
  }
}

async function main() {
  if (!STORAGE_STATE) {
    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      checked: 1,
      failed: 0,
      headless: HEADLESS,
      results: [
        {
          detail: {
            reason: "未设置 AI_PM_QA_STORAGE_STATE，已跳过已登录成员 UI 冒烟。"
          },
          name: "add member feishu select",
          ok: true
        }
      ],
      storageState: "missing"
    }, null, 2));

    return;
  }

  assertSmoke(fs.existsSync(STORAGE_STATE), `AI_PM_QA_STORAGE_STATE 指向的文件不存在：${STORAGE_STATE}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  const consoleMessages = attachConsoleCollector(page);
  const results: MemberUiCheck[] = [];

  try {
    results.push(await runCheck("add member feishu select", () => verifyAddMemberFeishuSelect(page)));
  } finally {
    const overflow = await getHorizontalOverflow(page);

    results.push({
      detail: {
        consoleMessages,
        overflow
      },
      name: "member page browser health",
      ok: !consoleMessages.some((message) => message.type === "error") && overflow.overflow <= 2
    });

    await context.close();
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    checked: results.length,
    failed: failed.length,
    headless: HEADLESS,
    minFeishuPeople: MIN_FEISHU_PEOPLE,
    results,
    storageState: "configured"
  }, null, 2));

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
