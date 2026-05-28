import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  aiPmPrisma?: PrismaClient;
};

const LOCAL_DATABASE_URL = "postgresql://ai_pm:ai_pm_local@localhost:5432/ai_pm?schema=public";

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return databaseUrl;
  }

  // 本地开发默认连接本机 PostgreSQL，生产环境仍必须显式配置托管数据库。
  if (process.env.NODE_ENV !== "production") {
    return LOCAL_DATABASE_URL;
  }

  throw new Error("缺少 DATABASE_URL，请先配置 PostgreSQL 数据库连接，运行态不再写入本地 JSON。");
}

// Prisma 7 需要显式传入 PostgreSQL driver adapter；这里集中初始化，避免 API 和 Worker 各自创建连接。
export function getPrismaClient() {
  if (globalForPrisma.aiPmPrisma) {
    return globalForPrisma.aiPmPrisma;
  }

  const adapter = new PrismaPg({
    connectionString: getDatabaseUrl()
  });
  const prisma = new PrismaClient({
    adapter
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.aiPmPrisma = prisma;
  }

  return prisma;
}
