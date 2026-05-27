import "dotenv/config";
import { defineConfig } from "prisma/config";

const command = process.argv.join(" ");
const canUsePlaceholderUrl = /\b(generate|format|migrate diff)\b/.test(command);
const databaseUrl =
  process.env.DATABASE_URL ??
  (canUsePlaceholderUrl
    ? "postgresql://ai_pm:ai_pm@localhost:5432/ai_pm"
    : (() => {
        throw new Error("缺少 DATABASE_URL，数据库迁移和线上运行必须连接正式 PostgreSQL。");
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
