import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const BASE_URL = (process.env.AI_PM_QA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3004").replace(/\/$/, "");
const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";

type SmokeResult = {
  name: string;
  ok: boolean;
  detail: Record<string, unknown>;
};

type ApiCase = {
  body?: BodyInit;
  headers?: HeadersInit;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  name: string;
  path: string;
};

function createUrl(path: string) {
  return new URL(path, BASE_URL).toString();
}

function assertSmoke(condition: unknown, message: string, detail: Record<string, unknown> = {}): SmokeResult {
  return {
    detail: condition ? detail : { ...detail, error: message },
    name: String(detail.name ?? message),
    ok: Boolean(condition)
  };
}

async function readJson(response: Response) {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

async function checkProtectedRoute(name: string, path: string) {
  const response = await fetch(createUrl(path), {
    redirect: "manual"
  });
  const location = response.headers.get("location") ?? "";
  const detail = {
    location,
    name,
    status: response.status
  };

  // 页面路由的未登录保护必须使用重定向而不是渲染半截工作台；回跳地址是 OAuth 之后恢复现场的关键证据。
  return assertSmoke(
    [302, 303, 307, 308].includes(response.status) &&
      location.includes("/login") &&
      location.includes("client_id=ai-pm") &&
      location.includes("redirect_uri="),
    `${name} 未按预期重定向到登录页`,
    detail
  );
}

async function checkLoginPage() {
  const response = await fetch(createUrl("/login?client_id=ai-pm&redirect_uri=http%3A%2F%2Flocalhost%3A3004%2Fworkbench"));
  const html = await response.text();
  const detail = {
    hasFeishu: html.includes("飞书"),
    hasGithub: html.includes("GitHub"),
    hasGoogle: html.includes("Google"),
    name: "login page",
    status: response.status
  };

  // 登录页是整个系统的入口，必须同时保留飞书主入口和 Google/GitHub 备用入口。
  return assertSmoke(
    response.status === 200 && detail.hasFeishu && detail.hasGoogle && detail.hasGithub,
    "登录页入口不完整",
    detail
  );
}

async function checkApiUnauthorized(testCase: ApiCase) {
  const response = await fetch(createUrl(testCase.path), {
    body: testCase.body,
    headers: testCase.headers,
    method: testCase.method,
    redirect: "manual"
  });
  const payload = await readJson(response);
  const detail = {
    error: payload.error ?? "",
    method: testCase.method,
    name: testCase.name,
    path: testCase.path,
    status: response.status
  };

  // 无 Cookie 场景下，业务 API 必须统一给 401/未登录；如果提前解析 body 或返回 400/500，
  // 前端会失去统一登录回跳能力，也可能泄露接口内部校验细节。
  return assertSmoke(
    response.status === 401 && payload.error === "未登录",
    `${testCase.name} 未按预期返回 401 未登录`,
    detail
  );
}

function jsonBody(value: unknown) {
  return {
    body: JSON.stringify(value),
    headers: {
      "Content-Type": "application/json"
    }
  };
}

async function main() {
  const routeResults = await Promise.all([
    checkProtectedRoute("workbench route", `/workbench?view=members&workspaceId=${WORKSPACE_ID}`),
    checkProtectedRoute("bug detail route", `/bugs/bug-missing?workspaceId=${WORKSPACE_ID}`),
    checkLoginPage()
  ]);
  const apiCases: ApiCase[] = [
    { method: "GET", name: "dashboard", path: `/api/dashboard?workspaceId=${WORKSPACE_ID}` },
    { method: "GET", name: "members", path: `/api/members?workspaceId=${WORKSPACE_ID}` },
    { method: "POST", name: "members create", path: "/api/members", ...jsonBody({ workspaceId: WORKSPACE_ID, values: {} }) },
    { method: "GET", name: "feishu users", path: "/api/feishu/users" },
    { method: "GET", name: "project repositories", path: `/api/project-repositories?workspaceId=${WORKSPACE_ID}` },
    { method: "POST", name: "project repositories create", path: "/api/project-repositories", ...jsonBody({ workspaceId: WORKSPACE_ID }) },
    { method: "POST", name: "records create", path: "/api/records", ...jsonBody({ type: "task", workspaceId: WORKSPACE_ID, values: {} }) },
    { method: "PATCH", name: "records update", path: "/api/records", ...jsonBody({ id: "missing", type: "task", workspaceId: WORKSPACE_ID, values: {} }) },
    { method: "DELETE", name: "records delete", path: "/api/records", ...jsonBody({ id: "missing", type: "task", workspaceId: WORKSPACE_ID }) },
    { method: "POST", name: "workspaces create", path: "/api/workspaces", ...jsonBody({ values: { name: "未登录工作区" } }) },
    { method: "POST", name: "documents analyze", path: "/api/documents/analyze", body: new FormData() },
    { method: "POST", name: "requirements analyze link", path: "/api/requirements/analyze-link", ...jsonBody({ documentLink: "" }) },
    { method: "POST", name: "bug attachments", path: "/api/bug-attachments", body: new FormData() },
    { method: "GET", name: "bug fix jobs", path: `/api/bug-fix-jobs?workspaceId=${WORKSPACE_ID}` },
    { method: "POST", name: "bug fix job create", path: "/api/bug-fix-jobs", ...jsonBody({ bugId: "missing", workspaceId: WORKSPACE_ID }) },
    { method: "GET", name: "bug fix job detail", path: `/api/bug-fix-jobs/missing?workspaceId=${WORKSPACE_ID}` },
    { method: "POST", name: "bug fix job cancel", path: "/api/bug-fix-jobs/missing/cancel" },
    { method: "GET", name: "ai index status", path: `/api/ai-index/status?workspaceId=${WORKSPACE_ID}` },
    { method: "POST", name: "ai index rebuild", path: "/api/ai-index/rebuild", ...jsonBody({ workspaceId: WORKSPACE_ID }) },
    { method: "GET", name: "assistant models", path: "/api/assistant/models" },
    { method: "POST", name: "assistant chat", path: "/api/assistant", ...jsonBody({ messages: [], workspaceId: WORKSPACE_ID }) },
    { method: "POST", name: "assistant weekly report", path: "/api/assistant/weekly-report", ...jsonBody({ workspaceId: WORKSPACE_ID }) }
  ];
  const apiResults = await Promise.all(apiCases.map(checkApiUnauthorized));
  const results = [...routeResults, ...apiResults];
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    checked: results.length,
    failed: failed.length,
    results
  }, null, 2));

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
