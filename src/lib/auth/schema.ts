import { boolean, index, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const AUTH_SCHEMA_PREFIX = "auth_";
const DEFAULT_AUTH_REALM = "default";

export function normalizeAuthRealm(realm: string | undefined) {
  const normalized = (realm ?? DEFAULT_AUTH_REALM)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || DEFAULT_AUTH_REALM;
}

/**
 * 认证 schema 名称必须与原 SDK 的 realm 规则完全一致，否则直接接 Better Auth 后会误读新 schema，
 * 表现为所有已有用户突然退出登录。
 */
export function getAuthSchemaName(realm: string | undefined) {
  const normalized = normalizeAuthRealm(realm);

  return normalized.startsWith(AUTH_SCHEMA_PREFIX) ? normalized : `${AUTH_SCHEMA_PREFIX}${normalized}`;
}

/**
 * 直接为 Better Auth Drizzle adapter 声明原认证表。列名、索引和外键均保持原格式，
 * 以确保 `auth_ai_pm` 内的现有 user/session/account/verification 数据无需转换。
 */
export function createAuthSchema(realm?: string) {
  const namespace = pgSchema(getAuthSchemaName(realm));
  const user = namespace.table("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    role: text("role"),
    banned: boolean("banned").default(false),
    banReason: text("banReason"),
    banExpires: timestamp("banExpires", { mode: "date", withTimezone: true }),
    feishuTenantKey: text("feishuTenantKey"),
    feishuTenantName: text("feishuTenantName"),
  }, (table) => ({
    emailUnique: uniqueIndex("user_email_unique").on(table.email),
  }));
  const session = namespace.table("session", {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonatedBy"),
  }, (table) => ({
    tokenUnique: uniqueIndex("session_token_unique").on(table.token),
    userIdIdx: index("session_user_id_idx").on(table.userId),
  }));
  const account = namespace.table("account", {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date", withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date", withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  }, (table) => ({
    providerAccountUnique: uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId),
    userIdIdx: index("account_user_id_idx").on(table.userId),
  }));
  const verification = namespace.table("verification", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  }, (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  }));

  return { account, session, user, verification };
}
