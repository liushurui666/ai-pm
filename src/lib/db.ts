import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  aiPmPrisma?: PrismaClient;
};

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("缺少 DATABASE_URL，AI PM 已切换为正式数据库模式，不能继续写入本地 JSON。");
  }

  return databaseUrl;
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
