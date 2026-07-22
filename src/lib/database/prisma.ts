import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  aiPmPrisma?: PrismaClient;
};

const LOCAL_DATABASE_URL = "mysql://ai_pm:ai_pm_local@localhost:3306/ai_pm";

// MariaDB Node 驱动默认会为每个 pool 保留 10 条空闲连接；Next 与多个 worker 同时运行时会很快吃满数据库上限。
// 这些值是单进程的保守缺省，运维仍可通过 DATABASE_URL 查询参数显式覆盖。
export const MYSQL_POOL_DEFAULTS = {
  connectionLimit: 5,
  idleTimeout: 60,
  minimumIdle: 1
} as const;

export function resolveMariaDbMinimumIdle(value: string | null) {
  const parsed = value === null ? Number.NaN : Number(value);

  // mariadb@3.4.5 的 pool 在 0 时无法建立首条连接；即使运维误配 0/负数/非数字也要收敛到 1。
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : MYSQL_POOL_DEFAULTS.minimumIdle;
}

function withMySqlConnectionDefaults(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);

    if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
      return databaseUrl;
    }

    // 腾讯云 MySQL 公网地址偶尔会超过 mariadb 驱动默认 1 秒建连超时；这里只补缺省值，不覆盖用户在 DATABASE_URL 中显式声明的参数。
    if (!url.searchParams.has("connectTimeout")) {
      url.searchParams.set("connectTimeout", "10000");
    }

    // 连接池等待时间也同步拉长，避免首个请求或冷启动时因为池子还没建好就直接失败。
    if (!url.searchParams.has("acquireTimeout")) {
      url.searchParams.set("acquireTimeout", "30000");
    }

    // Prisma MariaDB adapter 会把连接串查询参数原样交给 mariadb pool。
    // 显式限制池大小并把默认 minimumIdle=connectionLimit 降到 1，避免空闲连接长时间占满 MySQL。
    // mariadb@3.4.5 在 minimumIdle=0 时不会按需建立首条连接，因此这里不能使用 0。
    if (!url.searchParams.has("connectionLimit")) {
      url.searchParams.set("connectionLimit", String(MYSQL_POOL_DEFAULTS.connectionLimit));
    }

    url.searchParams.set("minimumIdle", String(resolveMariaDbMinimumIdle(url.searchParams.get("minimumIdle"))));

    if (!url.searchParams.has("idleTimeout")) {
      url.searchParams.set("idleTimeout", String(MYSQL_POOL_DEFAULTS.idleTimeout));
    }

    return url.toString();
  } catch {
    // DATABASE_URL 如果不是标准 URL，就原样交给驱动报错；这里不吞掉真实配置问题，方便部署时定位。
    return databaseUrl;
  }
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return withMySqlConnectionDefaults(databaseUrl);
  }

  // 本地开发默认连接本机 MySQL，生产环境仍必须显式配置托管数据库；这样腾讯云 MySQL 和本地环境使用同一套协议。
  if (process.env.NODE_ENV !== "production") {
    return withMySqlConnectionDefaults(LOCAL_DATABASE_URL);
  }

  throw new Error("缺少 DATABASE_URL，请先配置 MySQL 数据库连接，运行态不再写入本地 JSON。");
}

// Prisma 7 需要显式传入 MySQL 协议 driver adapter；集中初始化可以避免 API 和 Worker 各自散落连接配置。
export function getPrismaClient() {
  if (globalForPrisma.aiPmPrisma) {
    return globalForPrisma.aiPmPrisma;
  }

  const adapter = new PrismaMariaDb(getDatabaseUrl());
  const prisma = new PrismaClient({
    adapter
  });

  // getPrismaClient 被 dashboard 读取、项目可见性和各类 worker 重复调用。
  // 生产 `next start` 同样必须在进程内复用唯一实例；否则每次调用都会新建一个 MariaDB pool，最终让 SSR 卡在等待连接。
  // globalThis 同时覆盖开发态热更新重复加载模块的情况，不依赖 NODE_ENV 分支。
  globalForPrisma.aiPmPrisma = prisma;

  return prisma;
}
