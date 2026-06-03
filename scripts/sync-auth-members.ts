import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

type HostedAuthProviderId = "dev" | "feishu" | "github" | "google";
type MemberIdentityProvider = "feishu" | "email" | "google" | "github";

type HostedAuthUserRecord = {
  avatarUrl?: string | null;
  email?: string | null;
  id: string;
  metadata?: Record<string, unknown>;
  name?: string | null;
  registrationChannel?: string;
};

type HostedAuthAccountRecord = {
  email?: string | null;
  metadata?: Record<string, unknown>;
  provider: HostedAuthProviderId;
  providerAccountId: string;
  userId: string;
};

type HostedAuthStoreState = {
  accounts?: HostedAuthAccountRecord[];
  users?: HostedAuthUserRecord[];
};

type AuthCandidate = {
  account?: HostedAuthAccountRecord;
  provider: MemberIdentityProvider;
  user: HostedAuthUserRecord;
};

type MemberIdentity = {
  email?: string;
  provider: MemberIdentityProvider;
  providerTenantUserId?: string;
  providerUnionId?: string;
  providerUserId: string;
};

loadEnv({ path: ".env.local" });
loadEnv();

const LOCAL_DATABASE_URL = "mysql://ai_pm:ai_pm_local@localhost:3306/ai_pm";
const DEFAULT_AUTH_STORE_FILE = ".auth/unified-auth-store.json";
const DRY_RUN = process.argv.includes("--dry-run");

function normalizeIdentity(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function withMySqlConnectionDefaults(databaseUrl: string) {
  const url = new URL(databaseUrl);

  if (!url.searchParams.has("connectTimeout")) {
    url.searchParams.set("connectTimeout", "10000");
  }

  if (!url.searchParams.has("acquireTimeout")) {
    url.searchParams.set("acquireTimeout", "30000");
  }

  return url.toString();
}

function getDatabaseUrl() {
  return withMySqlConnectionDefaults(process.env.DATABASE_URL || LOCAL_DATABASE_URL);
}

function getAuthStoreFile() {
  return resolve(process.env.AUTH_STORE_FILE || DEFAULT_AUTH_STORE_FILE);
}

function toMemberProvider(provider?: string): MemberIdentityProvider {
  return provider === "feishu" || provider === "google" || provider === "github" ? provider : "email";
}

function getCandidateProvider(user: HostedAuthUserRecord, account?: HostedAuthAccountRecord) {
  return toMemberProvider(account?.provider ?? readText(user.metadata?.provider) ?? user.registrationChannel);
}

function addCandidate(index: Map<string, AuthCandidate>, key: string | undefined, candidate: AuthCandidate) {
  const normalizedKey = normalizeIdentity(key);

  if (!normalizedKey || index.has(normalizedKey)) {
    return;
  }

  index.set(normalizedKey, candidate);
}

function createLookupKey(namespace: string, value?: string | null) {
  const normalizedValue = normalizeIdentity(value);

  return normalizedValue ? `${namespace}:${normalizedValue}` : undefined;
}

function buildAuthIndex(state: HostedAuthStoreState) {
  const users = new Map((state.users ?? []).map((user) => [user.id, user]));
  const index = new Map<string, AuthCandidate>();

  for (const user of state.users ?? []) {
    const candidate: AuthCandidate = {
      provider: getCandidateProvider(user),
      user
    };

    addCandidate(index, createLookupKey("auth", user.id), candidate);
    addCandidate(index, createLookupKey("email", user.email), candidate);
    addCandidate(index, createLookupKey("provider", readText(user.metadata?.providerUserId)), candidate);
  }

  for (const account of state.accounts ?? []) {
    const user = users.get(account.userId);

    if (!user) {
      continue;
    }

    const metadata = account.metadata ?? {};
    const candidate: AuthCandidate = {
      account,
      provider: getCandidateProvider(user, account),
      user
    };

    addCandidate(index, createLookupKey("auth", user.id), candidate);
    addCandidate(index, createLookupKey("email", account.email ?? user.email), candidate);
    addCandidate(index, createLookupKey(account.provider, account.providerAccountId), candidate);
    addCandidate(index, createLookupKey("provider", readText(metadata.providerUserId) ?? account.providerAccountId), candidate);
    addCandidate(index, createLookupKey("feishu", readText(metadata.feishuOpenId)), candidate);
    addCandidate(index, createLookupKey("feishu", readText(metadata.feishuUnionId)), candidate);
    addCandidate(index, createLookupKey("feishu", readText(metadata.feishuUserId)), candidate);
  }

  return index;
}

function getMemberKeys(member: {
  email: string | null;
  identities: Prisma.JsonValue;
  notification: Prisma.JsonValue;
}) {
  const notification = readRecord(member.notification);
  const keys = [
    createLookupKey("email", member.email),
    createLookupKey("feishu", readText(notification.feishuOpenId)),
    createLookupKey("feishu", readText(notification.feishuUnionId)),
    createLookupKey("feishu", readText(notification.feishuUserId))
  ].filter((key): key is string => Boolean(key));

  for (const identity of readArray(member.identities)) {
    const record = readRecord(identity);
    const provider = readText(record.provider);
    const providerUserId = readText(record.providerUserId);

    const providerKey = provider ? createLookupKey(provider, providerUserId) : undefined;

    keys.push(...[
      createLookupKey("email", readText(record.email)),
      providerKey,
      createLookupKey("provider", providerUserId)
    ].filter((key): key is string => Boolean(key)));
  }

  return keys;
}

function findAuthCandidate(index: Map<string, AuthCandidate>, member: {
  email: string | null;
  identities: Prisma.JsonValue;
  notification: Prisma.JsonValue;
}) {
  for (const key of getMemberKeys(member)) {
    const candidate = index.get(normalizeIdentity(key));

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function createCanonicalIdentities(candidate: AuthCandidate, memberEmail: string | null): MemberIdentity[] {
  const metadata = {
    ...candidate.user.metadata,
    ...candidate.account?.metadata
  };
  const email = candidate.user.email ?? candidate.account?.email ?? memberEmail ?? undefined;
  const identity: MemberIdentity = {
    provider: candidate.provider,
    providerUserId: candidate.user.id,
    providerUnionId: candidate.provider === "feishu" ? readText(metadata.feishuUnionId) : undefined,
    providerTenantUserId: candidate.provider === "feishu" ? readText(metadata.feishuUserId) : undefined,
    email: email ?? undefined
  };

  // 邮箱身份只作为成员管理展示和人工排查辅助，不再参与运行时登录匹配。
  return email
    ? [
        identity,
        {
          provider: "email",
          providerUserId: email,
          email
        }
      ]
    : [identity];
}

async function main() {
  const authStoreFile = getAuthStoreFile();
  const rawStore = JSON.parse(await readFile(authStoreFile, "utf8")) as HostedAuthStoreState;
  const authIndex = buildAuthIndex(rawStore);
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(getDatabaseUrl())
  });
  const members = await prisma.dashboardMember.findMany({
    orderBy: {
      createdAt: "asc"
    }
  });
  let updated = 0;
  let skipped = 0;

  try {
    for (const member of members) {
      const candidate = findAuthCandidate(authIndex, member);

      if (!candidate) {
        skipped += 1;
        console.log(`[skip] ${member.id} ${member.name}：未在 ${authStoreFile} 找到可同步的认证用户`);
        continue;
      }

      const identities = createCanonicalIdentities(candidate, member.email);
      const nextData = {
        avatarUrl: candidate.user.avatarUrl ?? member.avatarUrl,
        email: candidate.user.email ?? member.email,
        identities: toJson(identities),
        name: candidate.user.name ?? member.name,
        registrationChannel: candidate.provider,
        updatedAt: new Date().toISOString()
      };

      updated += 1;
      console.log(`[sync] ${member.id} ${member.name} -> ${candidate.user.id} (${candidate.provider})`);

      if (!DRY_RUN) {
        await prisma.dashboardMember.update({
          data: nextData,
          where: {
            id: member.id
          }
        });
      }
    }

    console.log(DRY_RUN
      ? `[done] dry-run 完成：可同步 ${updated} 个成员，跳过 ${skipped} 个成员。`
      : `[done] 已同步 ${updated} 个成员，跳过 ${skipped} 个成员。`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
