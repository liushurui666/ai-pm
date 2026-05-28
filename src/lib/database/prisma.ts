import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  aiPmPrisma?: PrismaClient;
};

const LOCAL_DATABASE_URL = "mysql://ai_pm:ai_pm_local@localhost:3306/ai_pm";

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

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.aiPmPrisma = prisma;
  }

  return prisma;
}
