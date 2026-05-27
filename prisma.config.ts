import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma CLI 不会像 Next.js 一样默认读取 .env.local，本地开发优先加载它。
loadEnv({ path: ".env.local" });
loadEnv();

const LOCAL_DATABASE_URL = "postgresql://ai_pm:ai_pm_local@localhost:5432/ai_pm?schema=public";
const command = process.argv.join(" ");
const canUsePlaceholderUrl = /\b(generate|format|migrate diff)\b/.test(command);
const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV !== "production" ? LOCAL_DATABASE_URL : undefined) ??
  (canUsePlaceholderUrl
    ? LOCAL_DATABASE_URL
    : (() => {
        throw new Error("缺少 DATABASE_URL，请先配置本地或生产 PostgreSQL 数据库连接。");
      })());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: databaseUrl
  }
});
