import { createRequire } from "node:module";
import { Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { QdrantClient } from "@qdrant/js-client-rest";
import { getAiApiKey, getAiBaseUrl } from "@/lib/ai/settings";
import { getKnowledgeSettings } from "@/lib/ai/knowledge/settings";

type CheckStatus = "pass" | "warn" | "fail";

type CheckResult = {
  name: string;
  status: CheckStatus;
  message: string;
};

const requireFromProject = createRequire(import.meta.url);
const strict = process.argv.includes("--strict");

// Next 本地开发通常把密钥放在 .env.local；脚本显式按同样顺序读取，
// 同时不把任何密钥打印出来，只报告是否已配置和下游服务是否可达。
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

function result(name: string, status: CheckStatus, message: string): CheckResult {
  return { name, status, message };
}

function resolvePackage(packageName: string) {
  try {
    return requireFromProject.resolve(`${packageName}/package.json`);
  } catch {
    try {
      // 有些现代 ESM 包通过 exports 隐藏 package.json，但主入口仍可解析。
      // doctor 关注的是运行时能不能 import 这个 SDK，因此 package.json 不开放时退回检测主入口。
      return requireFromProject.resolve(packageName);
    } catch {
      return undefined;
    }
  }
}

function parseRedisUrl(url: string) {
  const parsed = new URL(url);

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("REDIS_URL 必须使用 redis:// 或 rediss://。");
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port || "6379"),
    tls: parsed.protocol === "rediss:",
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined
  };
}

async function checkRedis(url: string): Promise<CheckResult> {
  if (!url) {
    return result("Redis / BullMQ", "fail", "缺少 REDIS_URL，生产不会启用 BullMQ 正式队列。");
  }

  try {
    const config = parseRedisUrl(url);
    const socket = new Socket();
    const timeout = sleep(3000).then(() => {
      socket.destroy();
      throw new Error("连接超时");
    });
    const pong = new Promise<string>((resolve, reject) => {
      socket.once("error", reject);
      socket.connect(config.port, config.host, () => {
        // 这里只做最小 PING，不创建队列也不写入业务 job；如果 Redis 设置了密码，
        // 先 AUTH 再 PING，避免 doctor 对受保护实例误报不可用。
        const commands = config.password
          ? `AUTH ${config.password}\r\nPING\r\n`
          : "PING\r\n";
        socket.write(commands);
      });
      socket.once("data", (buffer) => {
        resolve(buffer.toString("utf8"));
        socket.end();
      });
    });
    const reply = await Promise.race([pong, timeout]);

    if (!reply.includes("PONG")) {
      return result("Redis / BullMQ", "fail", `Redis 已连接但 PING 响应异常：${reply.trim()}`);
    }

    return result("Redis / BullMQ", "pass", `Redis 可访问：${config.host}:${config.port}`);
  } catch (error) {
    return result("Redis / BullMQ", "fail", error instanceof Error ? error.message : String(error));
  }
}

async function checkQdrant(settings: ReturnType<typeof getKnowledgeSettings>): Promise<CheckResult> {
  if (!settings.qdrantUrl) {
    return result("Qdrant", "fail", "缺少 QDRANT_URL，知识索引无法写入向量库。");
  }

  try {
    const client = new QdrantClient({
      url: settings.qdrantUrl,
      apiKey: settings.qdrantApiKey || undefined,
      timeout: 3000,
      checkCompatibility: false
    });
    const exists = await client.collectionExists(settings.qdrantCollection);

    return result(
      "Qdrant",
      "pass",
      exists.exists
        ? `Qdrant 可访问，collection 已存在：${settings.qdrantCollection}`
        : `Qdrant 可访问，collection 尚未创建：${settings.qdrantCollection}`
    );
  } catch (error) {
    return result("Qdrant", "fail", error instanceof Error ? error.message : String(error));
  }
}

async function checkAiModels(settings: ReturnType<typeof getKnowledgeSettings>): Promise<CheckResult[]> {
  const apiKey = getAiApiKey();
  const baseUrl = getAiBaseUrl();
  const checks: CheckResult[] = [];

  checks.push(
    apiKey
      ? result("百炼 API Key", "pass", "AI_API_KEY 已配置。")
      : result("百炼 API Key", "fail", "缺少 AI_API_KEY，Embedding/Reranker/Chat 都无法真实调用。")
  );
  checks.push(
    baseUrl.includes("dashscope.aliyuncs.com")
      ? result("百炼 Base URL", "pass", `当前 Base URL：${baseUrl}`)
      : result("百炼 Base URL", "warn", `当前 Base URL 不是默认百炼地址：${baseUrl}`)
  );
  checks.push(result("Embedding", "pass", `模型 ${settings.embeddingModel}，维度 ${settings.embeddingDimensions}`));
  checks.push(result("Reranker", "pass", `模型 ${settings.rerankModel}，接口 ${settings.rerankUrl}`));

  return checks;
}

function checkPackage(packageName: string, label: string, required: boolean): CheckResult {
  const resolved = resolvePackage(packageName);

  if (resolved) {
    return result(label, "pass", `${packageName} 可解析：${resolved}`);
  }

  return result(
    label,
    required ? "fail" : "warn",
    `${packageName} 当前不可解析。若这是生产 V1 必需能力，请先完成依赖安装并重新运行 doctor。`
  );
}

async function checkMastraWorkflow(): Promise<CheckResult> {
  try {
    const step = createStep({
      id: "doctor-step",
      inputSchema: z.object({ ping: z.string() }),
      outputSchema: z.object({ pong: z.string() }),
      async execute({ inputData }) {
        return { pong: inputData.ping };
      }
    });
    const workflow = createWorkflow({
      id: "ai-index-doctor-workflow",
      inputSchema: z.object({ ping: z.string() }),
      outputSchema: z.object({ pong: z.string() })
    }).then(step).commit();
    const run = await workflow.createRun();
    const output = await run.start({ inputData: { ping: "ok" } }) as {
      status?: string;
      result?: {
        pong?: string;
      };
    };

    if (output.status === "success" && output.result?.pong === "ok") {
      return result("Mastra workflow", "pass", "createWorkflow/createStep 可真实启动并返回结果。");
    }

    return result("Mastra workflow", "fail", `workflow 返回异常：${JSON.stringify(output)}`);
  } catch (error) {
    return result("Mastra workflow", "fail", error instanceof Error ? error.message : String(error));
  }
}

function printResults(results: CheckResult[]) {
  const iconByStatus: Record<CheckStatus, string> = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL"
  };

  for (const item of results) {
    console.log(`[${iconByStatus[item.status]}] ${item.name}: ${item.message}`);
  }
}

async function main() {
  const settings = getKnowledgeSettings();
  const results: CheckResult[] = [
    checkPackage("@qdrant/js-client-rest", "Qdrant 官方 JS client", true),
    // Mastra 是用户确认的 V1 强绑定项；doctor 默认报告，不直接阻塞本地开发。
    // 上线前可用 `pnpm ai-index:doctor --strict` 把缺失 Mastra SDK 变成硬失败。
    checkPackage("@mastra/core", "Mastra SDK", true),
    await checkMastraWorkflow(),
    ...await checkAiModels(settings),
    await checkRedis(settings.redisUrl),
    await checkQdrant(settings)
  ];

  printResults(results);

  if (strict && results.some((item) => item.status === "fail")) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[ai-index-doctor] failed", error);
  process.exit(1);
});
