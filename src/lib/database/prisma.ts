import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  aiPmPrisma?: PrismaClient;
};

const LOCAL_DATABASE_URL = "mysql://ai_pm:ai_pm_local@localhost:3306/ai_pm";

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return databaseUrl;
  }

  // 本地开发默认连接本机 MySQL，生产环境仍必须显式配置托管数据库；这样腾讯云 MySQL 和本地环境使用同一套协议。
  if (process.env.NODE_ENV !== "production") {
    return LOCAL_DATABASE_URL;
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
