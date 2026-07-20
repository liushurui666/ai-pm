import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { getAuthSchemaName } from "@/lib/auth/schema";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const realm = process.env.AUTH_REALM_ID?.trim() || "ai-pm";
const schemaName = getAuthSchemaName(realm);
const databaseURL = process.env.AUTH_DATABASE_URL?.trim();

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

const schema = quoteIdentifier(schemaName);

/**
 * 这些 SQL 只维护 Better Auth 需要的原四张认证表。
 * 列名、索引名和外键名保持与原 SDK 迁移结果一致，因此对已有 `auth_ai_pm` schema 是幂等的。
 */
const migrationStatements = [
  `CREATE SCHEMA IF NOT EXISTS ${schema}`,
  `CREATE TABLE IF NOT EXISTS ${schema}."user" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "role" text,
    "banned" boolean DEFAULT false,
    "banReason" text,
    "banExpires" timestamptz,
    "feishuTenantKey" text,
    "feishuTenantName" text
  )`,
  `CREATE TABLE IF NOT EXISTS ${schema}."session" (
    "id" text PRIMARY KEY,
    "expiresAt" timestamptz NOT NULL,
    "token" text NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL,
    "impersonatedBy" text,
    CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES ${schema}."user"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ${schema}."account" (
    "id" text PRIMARY KEY,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    "scope" text,
    "password" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES ${schema}."user"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ${schema}."verification" (
    "id" text PRIMARY KEY,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE ${schema}."user" ADD COLUMN IF NOT EXISTS "role" text`,
  `ALTER TABLE ${schema}."user" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false`,
  `ALTER TABLE ${schema}."user" ADD COLUMN IF NOT EXISTS "banReason" text`,
  `ALTER TABLE ${schema}."user" ADD COLUMN IF NOT EXISTS "banExpires" timestamptz`,
  `ALTER TABLE ${schema}."user" ADD COLUMN IF NOT EXISTS "feishuTenantKey" text`,
  `ALTER TABLE ${schema}."user" ADD COLUMN IF NOT EXISTS "feishuTenantName" text`,
  `ALTER TABLE ${schema}."session" ADD COLUMN IF NOT EXISTS "impersonatedBy" text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON ${schema}."user" ("email")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "session_token_unique" ON ${schema}."session" ("token")`,
  `CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON ${schema}."session" ("userId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_account_unique" ON ${schema}."account" ("providerId", "accountId")`,
  `CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON ${schema}."account" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON ${schema}."verification" ("identifier")`,
];

const expectedColumns: Record<string, string[]> = {
  account: [
    "id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken",
    "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "password", "createdAt", "updatedAt",
  ],
  session: ["id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId", "impersonatedBy"],
  user: [
    "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "role", "banned",
    "banReason", "banExpires", "feishuTenantKey", "feishuTenantName",
  ],
  verification: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
};

const expectedIndexes = [
  "user_email_unique",
  "session_token_unique",
  "session_user_id_idx",
  "account_provider_account_unique",
  "account_user_id_idx",
  "verification_identifier_idx",
];

function createClient() {
  if (!databaseURL) {
    throw new Error("缺少 AUTH_DATABASE_URL，无法连接 Better Auth PostgreSQL。");
  }

  return new Client({ connectionString: databaseURL });
}

async function migrate() {
  const client = createClient();

  await client.connect();
  try {
    await client.query("BEGIN");
    for (const statement of migrationStatements) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    console.log(`[auth-db] ${schemaName} 认证表迁移完成`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function doctor() {
  const client = createClient();

  await client.connect();
  try {
    const columns = await client.query<{ column_name: string; table_name: string }>(
      `select table_name, column_name from information_schema.columns where table_schema = $1`,
      [schemaName],
    );
    const indexes = await client.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = $1`,
      [schemaName],
    );
    const actualColumns = new Map<string, Set<string>>();

    for (const row of columns.rows) {
      const names = actualColumns.get(row.table_name) ?? new Set<string>();
      names.add(row.column_name);
      actualColumns.set(row.table_name, names);
    }

    const failures: string[] = [];
    for (const [table, requiredColumns] of Object.entries(expectedColumns)) {
      const actual = actualColumns.get(table);
      if (!actual) {
        failures.push(`缺少表 ${schemaName}.${table}`);
        continue;
      }
      for (const column of requiredColumns) {
        if (!actual.has(column)) failures.push(`缺少列 ${schemaName}.${table}.${column}`);
      }
    }

    const actualIndexes = new Set(indexes.rows.map((row) => row.indexname));
    for (const index of expectedIndexes) {
      if (!actualIndexes.has(index)) failures.push(`缺少索引 ${schemaName}.${index}`);
    }

    if (failures.length) {
      throw new Error(`Better Auth 认证库结构不完整：\n${failures.join("\n")}`);
    }

    console.log(`[auth-db] ${schemaName} 连接、表、列和索引检查通过`);
  } finally {
    await client.end();
  }
}

async function main() {
  const command = process.argv[2];

  if (command === "migrate") {
    await migrate();
    return;
  }
  if (command === "doctor") {
    await doctor();
    return;
  }

  throw new Error("用法：pnpm auth-db:migrate 或 pnpm auth-db:doctor");
}

main().catch((error) => {
  console.error("[auth-db] 执行失败", error);
  process.exitCode = 1;
});
