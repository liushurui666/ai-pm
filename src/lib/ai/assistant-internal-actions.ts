const allowedMethods = new Set(["GET", "POST", "PATCH", "DELETE"]);
const blockedApiPrefixes = ["/api/assistant", "/api/auth"];
const internalActionTimeoutMs = 20_000;
const bulkActionTimeoutMs = 120_000;
const maxBulkActionItems = 100;
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

export type AssistantBulkInternalActionItem = {
  body: Record<string, unknown>;
  id: string;
  title?: string;
};

export type AssistantBulkInternalActionInput = {
  items: AssistantBulkInternalActionItem[];
  method: "PATCH" | "DELETE";
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

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("内部业务动作执行超时"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
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
    const timeout = createTimeoutSignal(internalActionTimeoutMs);

    try {
      // 动作 tool 由模型触发，如果内部业务接口或数据库卡住，整条 AI 流会表现为“输入后一直不动”。
      // 这里给站内动作加服务端超时，把长时间挂起转成可继续推理的失败结果，而不是让 ChatBox 永久生成态。
      const response = await fetch(url, {
        method,
        cache: "no-store",
        headers: {
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
          ...(runtime.cookieHeader ? { cookie: runtime.cookieHeader } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: timeout.signal
      });
      const payload = sanitizeActionPayload(await parseActionResponse(response));

      return {
        已执行: response.ok,
        状态: response.ok ? "成功" : "失败",
        状态码: response.status,
        业务结果: payload
      };
    } finally {
      timeout.clear();
    }
  } catch (error) {
    return {
      已执行: false,
      状态: "失败",
      业务结果: error instanceof Error ? sanitizeActionText(error.message) : "内部业务动作执行失败"
    };
  }
}

export async function executeAssistantBulkInternalAction(
  input: AssistantBulkInternalActionInput,
  runtime: AssistantInternalActionRuntime
) {
  const method = input.method.trim().toUpperCase();

  if (!["PATCH", "DELETE"].includes(method)) {
    return {
      已执行: false,
      状态: "失败",
      业务结果: "批量动作当前只支持更新或删除。"
    };
  }

  const items = input.items.slice(0, maxBulkActionItems);

  if (!items.length) {
    return {
      已执行: false,
      状态: "失败",
      业务结果: "没有可执行的目标记录。"
    };
  }

  try {
    const url = normalizeInternalApiUrl(input.path, runtime.origin);
    const timeout = createTimeoutSignal(bulkActionTimeoutMs);
    const results: Array<{
      id: string;
      title?: unknown;
      ok: boolean;
      status?: number;
      message?: unknown;
    }> = [];

    try {
      // 批量动作由后端统一循环执行，避免模型在一轮对话里连续生成几十个 tool call；
      // 每条记录独立提交、独立记录失败原因，单条失败不会打断后续记录处理。
      for (const item of items) {
        const body = method === "DELETE" ? item.body : createActionBody(item.body, runtime.workspaceId);
        const response = await fetch(url, {
          method,
          cache: "no-store",
          headers: {
            accept: "application/json",
            ...(body ? { "content-type": "application/json" } : {}),
            ...(runtime.cookieHeader ? { cookie: runtime.cookieHeader } : {})
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: timeout.signal
        });
        const payload = sanitizeActionPayload(await parseActionResponse(response));

        results.push({
          id: item.id,
          title: sanitizeActionText(item.title),
          ok: response.ok,
          status: response.status,
          message: payload
        });
      }

      const succeeded = results.filter((result) => result.ok);
      const failed = results.filter((result) => !result.ok);

      return {
        已执行: succeeded.length > 0,
        状态: failed.length ? "部分成功" : "成功",
        总数: results.length,
        成功数: succeeded.length,
        失败数: failed.length,
        已截断: input.items.length > maxBulkActionItems,
        成功样例: succeeded.slice(0, maxArrayItems),
        失败明细: failed.slice(0, maxArrayItems)
      };
    } finally {
      timeout.clear();
    }
  } catch (error) {
    return {
      已执行: false,
      状态: "失败",
      业务结果: error instanceof Error ? sanitizeActionText(error.message) : "批量内部业务动作执行失败"
    };
  }
}
