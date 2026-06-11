const allowedMethods = new Set(["GET", "POST", "PATCH", "DELETE"]);
const blockedApiPrefixes = ["/api/assistant", "/api/auth"];
const maxPayloadDepth = 4;
const maxArrayItems = 8;

export type AssistantInternalActionRuntime = {
  cookieHeader?: string;
  origin: string;
  workspaceId?: string;
};

export type AssistantInternalActionInput = {
  body?: Record<string, unknown>;
  method: string;
  path: string;
};

function sanitizeActionText(value: unknown) {
  if (value === null || value === undefined) {
    return value;
  }

  const text = typeof value === "string" ? value : String(value);

  // 动作 tool 的返回值会进入模型上下文，必须和读取 tools 一样净化技术路径；
  // 否则模型可能把内部 API 路径、query 或 URL 写进用户可见回复。
  return text
    .replace(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_./:{}?=&%-]+/g, "相关业务动作")
    .replace(/https?:\/\/[^\s，。；、)）]+/g, "相关业务链接")
    .replace(/\/[A-Za-z0-9_./:{}?=&%-]+/g, "相关业务能力")
    .replace(/\b[A-Za-z][A-Za-z0-9_-]*\?[A-Za-z0-9_=&%-]+/g, "相关业务查询")
    .replace(/相关业务能力\s*接口/g, "相关业务能力");
}

function sanitizeActionPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeActionText(value);
  }

  if (depth >= maxPayloadDepth) {
    return "结果内容较多，已省略明细";
  }

  if (Array.isArray(value)) {
    return value.slice(0, maxArrayItems).map((item) => sanitizeActionPayload(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 24)
        .map(([key, item]) => [key, sanitizeActionPayload(item, depth + 1)])
    );
  }

  return sanitizeActionText(value);
}

function normalizeInternalApiUrl(path: string, origin: string) {
  const trimmedPath = path.trim();

  // 这个 tool 只能调用 AI PM 自己的相对 API，禁止模型把它当外部 fetch/SSRF 通道使用。
  // 绝对 URL、协议相对 URL、非 /api 前缀和助手/认证递归入口都会被拦截。
  if (!trimmedPath.startsWith("/api/") || trimmedPath.startsWith("//")) {
    throw new Error("只允许调用 AI PM 内部业务接口。");
  }

  if (blockedApiPrefixes.some((prefix) => trimmedPath === prefix || trimmedPath.startsWith(`${prefix}/`))) {
    throw new Error("该内部接口不允许由助手递归调用。");
  }

  const url = new URL(trimmedPath, origin);

  if (url.origin !== origin || !url.pathname.startsWith("/api/")) {
    throw new Error("只允许调用当前站点的内部业务接口。");
  }

  return url;
}

function createActionBody(body: Record<string, unknown> | undefined, workspaceId?: string) {
  if (!body) {
    return undefined;
  }

  // 工作区是所有业务动作的安全边界；模型漏传 workspaceId 时由服务端补当前会话工作区，
  // 避免误操作默认工作区或跨工作区记录。
  return workspaceId && !Object.prototype.hasOwnProperty.call(body, "workspaceId")
    ? {
        ...body,
        workspaceId
      }
    : body;
}

async function parseActionResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function executeAssistantInternalAction(
  input: AssistantInternalActionInput,
  runtime: AssistantInternalActionRuntime
) {
  const method = input.method.trim().toUpperCase();

  if (!allowedMethods.has(method)) {
    return {
      已执行: false,
      结果: "当前只支持读取、创建、更新和删除类内部业务动作。"
    };
  }

  try {
    const url = normalizeInternalApiUrl(input.path, runtime.origin);

    if (method === "GET" && runtime.workspaceId && !url.searchParams.has("workspaceId")) {
      url.searchParams.set("workspaceId", runtime.workspaceId);
    }

    const body = method === "GET" ? undefined : createActionBody(input.body, runtime.workspaceId);
    const response = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(runtime.cookieHeader ? { cookie: runtime.cookieHeader } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = sanitizeActionPayload(await parseActionResponse(response));

    return {
      已执行: response.ok,
      状态: response.ok ? "成功" : "失败",
      状态码: response.status,
      业务结果: payload
    };
  } catch (error) {
    return {
      已执行: false,
      状态: "失败",
      业务结果: error instanceof Error ? sanitizeActionText(error.message) : "内部业务动作执行失败"
    };
  }
}
