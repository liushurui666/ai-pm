import { getAiApiKey, getAiAvailableModels, getAiBaseUrl, getAiModel } from "@/lib/ai/settings";

const DEFAULT_MODEL_CHECK_TIMEOUT_MS = 5_000;
const DEFAULT_MODEL_CACHE_TTL_MS = 5 * 60 * 1_000;

type ModelCheckResult = {
  error?: string;
  model: string;
  ok: boolean;
  status?: number | string;
};

export type ValidatedAiModels = {
  checked: boolean;
  defaultModel: string;
  models: string[];
  unavailableModels: string[];
};

let modelCache: {
  expiresAt: number;
  key: string;
  value: ValidatedAiModels;
} | null = null;

function parseBoundedPositiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.filter(Boolean)));
}

function isModelHealthCheckEnabled() {
  return process.env.AI_MODEL_HEALTHCHECK?.trim() !== "false";
}

function createCacheKey(models: string[]) {
  return [
    getAiBaseUrl(),
    getAiModel(),
    models.join("|"),
    isModelHealthCheckEnabled() ? "check" : "skip"
  ].join("\n");
}

async function checkModelAvailability(model: string, timeoutMs: number): Promise<ModelCheckResult> {
  const apiKey = getAiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 模型下拉是生产入口，不能只根据硬编码候选展示；这里用最小 Chat Completions
    // 请求做轻量探活，并通过短超时 + 模块缓存控制成本和页面等待时间。
    const response = await fetch(`${getAiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        max_tokens: 8,
        messages: [
          {
            content: "只回复 OK",
            role: "user"
          }
        ],
        model,
        temperature: 0
      }),
      cache: "no-store",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;

    return {
      error: payload?.error?.message,
      model,
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "模型探活请求失败",
      model,
      ok: false,
      status: error instanceof Error ? error.name : "network"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildUncheckedModelResult(models: string[]): ValidatedAiModels {
  const defaultModel = getAiModel();
  const normalizedModels = uniqueModels([defaultModel, ...models]);

  return {
    checked: false,
    defaultModel,
    models: normalizedModels,
    unavailableModels: []
  };
}

// ChatBox 和服务端流式入口共享同一份可用模型结果：前端不展示不可用模型，
// 后端也会把过期 localStorage 或手写请求里的不可用模型兜回健康默认值。
export async function getValidatedAiAvailableModels(): Promise<ValidatedAiModels> {
  const configuredModels = getAiAvailableModels();
  const cacheKey = createCacheKey(configuredModels);
  const now = Date.now();

  if (!getAiApiKey() || !isModelHealthCheckEnabled()) {
    return buildUncheckedModelResult(configuredModels);
  }

  if (modelCache && modelCache.key === cacheKey && modelCache.expiresAt > now) {
    return modelCache.value;
  }

  const timeoutMs = parseBoundedPositiveInteger(
    process.env.AI_MODEL_HEALTHCHECK_TIMEOUT_MS,
    DEFAULT_MODEL_CHECK_TIMEOUT_MS,
    1_000,
    15_000
  );
  const ttlMs = parseBoundedPositiveInteger(
    process.env.AI_MODEL_HEALTHCHECK_CACHE_MS,
    DEFAULT_MODEL_CACHE_TTL_MS,
    30_000,
    30 * 60 * 1_000
  );
  const results = await Promise.all(configuredModels.map((model) => checkModelAvailability(model, timeoutMs)));
  const healthyModels = uniqueModels(results.filter((result) => result.ok).map((result) => result.model));
  const fallbackResult = buildUncheckedModelResult(configuredModels);
  const defaultModel = healthyModels.includes(getAiModel()) ? getAiModel() : healthyModels[0];
  const value: ValidatedAiModels = healthyModels.length > 0 && defaultModel
    ? {
        checked: true,
        defaultModel,
        models: uniqueModels([defaultModel, ...healthyModels]),
        unavailableModels: results.filter((result) => !result.ok).map((result) => result.model)
      }
    : fallbackResult;

  modelCache = {
    expiresAt: now + ttlMs,
    key: cacheKey,
    value
  };

  return value;
}

export async function resolveValidatedAiModel(requestedModel?: string) {
  const model = requestedModel?.trim();
  const availability = await getValidatedAiAvailableModels();

  if (model && availability.models.includes(model)) {
    return model;
  }

  return availability.defaultModel;
}
