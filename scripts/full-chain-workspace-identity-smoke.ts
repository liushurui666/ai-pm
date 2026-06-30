import { config as loadEnv } from "dotenv";
import { createDashboardMember, createDashboardWorkspace, getDashboardData } from "@/data/local-dashboard";
import { getPrismaClient } from "@/lib/database/prisma";
import type { DashboardMember, FeishuUser, MemberIdentityProvider, MemberRole } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createRunLabel() {
  return `workspace-identity-e2e-${Date.now()}`;
}

function createUser({
  authProvider = "github",
  authUserId,
  email,
  name,
  openId,
  unionId,
  userId
}: {
  authProvider?: MemberIdentityProvider;
  authUserId: string;
  email?: string;
  name: string;
  openId?: string;
  unionId?: string;
  userId?: string;
}): FeishuUser {
  return {
    authProvider,
    authUserId,
    email,
    name,
    openId: openId ?? authUserId,
    unionId,
    userId
  };
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function getRequiredCurrentMember(data: Awaited<ReturnType<typeof getDashboardData>>, message: string) {
  // DashboardData 的 meta 在通用类型里是可选字段；工作台服务端读取成功时必须返回当前成员。
  // 冒烟脚本显式断言这个前置条件，既让 TypeScript 收窄类型，也能在登录归并失败时给出准确错误。
  assertSmoke(data.meta?.currentMember, message);

  return data.meta.currentMember;
}

function hasProviderUserId(identity: unknown, providerUserId: string | undefined) {
  // Prisma JSON 字段在脚本构建里只能先当 unknown 处理；
  // 这个守卫只读取 providerUserId，避免每个断言都重复展开 object/in 判断并触发隐式 any。
  if (!providerUserId) {
    return false;
  }

  return (
    typeof identity === "object" &&
    identity !== null &&
    "providerUserId" in identity &&
    identity.providerUserId === providerUserId
  );
}

function createMemberPayload({
  authProvider = "github",
  authUserId,
  email,
  feishuOpenId,
  feishuUnionId,
  feishuUserId,
  id,
  name,
  role = "productMember",
  workspaceId
}: {
  authProvider?: MemberIdentityProvider;
  authUserId?: string;
  email?: string;
  feishuOpenId?: string;
  feishuUnionId?: string;
  feishuUserId?: string;
  id: string;
  name: string;
  role?: MemberRole;
  workspaceId: string;
}): DashboardMember {
  const now = new Date().toISOString();
  const identities: DashboardMember["identities"] = [];

  if (authUserId) {
    identities.push({
      provider: authProvider,
      providerUserId: authUserId,
      providerUnionId: authProvider === "feishu" ? feishuUnionId : undefined,
      providerTenantUserId: authProvider === "feishu" ? feishuUserId : undefined,
      email
    });
  }

  if (feishuOpenId && !authUserId) {
    identities.push({
      provider: "feishu",
      providerUserId: feishuOpenId,
      providerUnionId: feishuUnionId,
      providerTenantUserId: feishuUserId,
      email
    });
  }

  return {
    id,
    workspaceId,
    name,
    email,
    registrationChannel: authProvider,
    role,
    status: "active",
    identities,
    notification: {
      channels: feishuOpenId
        ? [
            {
              id: `${id}-feishu-channel`,
              provider: "feishu",
              enabled: true,
              name: "飞书",
              target: feishuOpenId,
              feishuOpenId,
              feishuUnionId,
              feishuUserId,
              scenes: ["taskAssigned", "requirementChanged", "bugFlowChanged"]
            }
          ]
        : [],
      feishuEnabled: Boolean(feishuOpenId),
      feishuOpenId,
      feishuUnionId,
      feishuUserId,
      taskAssigned: true,
      requirementChanged: true
    },
    createdAt: now,
    updatedAt: now
  };
}

async function createRawMember(member: DashboardMember) {
  const prisma = getPrismaClient();

  // 这里故意走 Prisma 原始 member 写入，用来构造“历史旧身份/重复 auth 身份”这类
  // 用户界面不会主动创建、但线上迁移数据里可能存在的边界样本。
  await prisma.dashboardMember.create({
    data: {
      avatarUrl: member.avatarUrl,
      createdAt: member.createdAt,
      email: member.email,
      id: member.id,
      identities: member.identities,
      lastActiveAt: member.lastActiveAt,
      name: member.name,
      notification: member.notification,
      registrationChannel: member.registrationChannel,
      role: member.role,
      status: member.status,
      updatedAt: member.updatedAt,
      workspaceId: member.workspaceId
    }
  });
}

async function cleanupByRunLabel(runLabel: string) {
  const prisma = getPrismaClient();

  // 全链路脚本创建多个临时工作区；删除 workspace 依赖外键级联清理成员，额外的 member delete
  // 只作为上次异常中断后的兜底，限定 runLabel 避免触碰真实成员。
  await prisma.dashboardMember.deleteMany({
    where: {
      OR: [
        { id: { contains: runLabel } },
        { email: { contains: runLabel } },
        { name: { contains: runLabel } }
      ]
    }
  });
  await prisma.workspace.deleteMany({
    where: {
      name: {
        contains: runLabel
      }
    }
  });
}

async function verifyNewWorkspaceOwner(runLabel: string) {
  const prisma = getPrismaClient();
  const user = createUser({
    authProvider: "github",
    authUserId: `auth_${runLabel}_owner`,
    email: `${runLabel}.owner@example.test`,
    name: `新工作区所有者 ${runLabel}`
  });
  const workspaceResult = await createDashboardWorkspace({
    description: "工作区身份冒烟临时空间，会在脚本结束清理。",
    name: `身份冒烟空工作区 ${runLabel}`
  });
  const workspaceId = workspaceResult.workspace.id;
  const firstRead = await getDashboardData(user, workspaceId);
  const currentMember = getRequiredCurrentMember(firstRead, "空工作区首次登录应创建当前成员");

  assertSmoke(currentMember.role === "owner", "空工作区首次登录成员应成为 owner");
  assertSmoke(currentMember.workspaceId === workspaceId, "首次登录成员应写入当前工作区");
  assertSmoke(currentMember.identities.some((identity) => identity.providerUserId === user.authUserId), "首次登录成员应绑定 SDK authUserId");
  assertSmoke(Boolean(currentMember.lastActiveAt), "首次登录成员应写入最近活跃时间");

  const persistedOwner = await prisma.dashboardMember.findUnique({
    where: {
      id: currentMember.id
    }
  });

  assertSmoke(persistedOwner?.workspaceId === workspaceId, "首次登录成员应持久化到 workspace_members");

  const firstActiveAt = persistedOwner.lastActiveAt;
  await getDashboardData(user, workspaceId);
  const secondReadOwner = await prisma.dashboardMember.findUnique({
    where: {
      id: currentMember.id
    }
  });

  assertSmoke(secondReadOwner?.lastActiveAt === firstActiveAt, "5 分钟内重复访问不应刷新 lastActiveAt");

  await prisma.dashboardMember.update({
    where: {
      id: currentMember.id
    },
    data: {
      lastActiveAt: minutesAgoIso(6)
    }
  });
  await getDashboardData(user, workspaceId);
  const refreshedOwner = await prisma.dashboardMember.findUnique({
    where: {
      id: currentMember.id
    }
  });

  assertSmoke(refreshedOwner?.lastActiveAt && refreshedOwner.lastActiveAt !== firstActiveAt, "超过 5 分钟后访问应刷新 lastActiveAt");

  return {
    memberId: currentMember.id,
    refreshedLastActiveAt: refreshedOwner?.lastActiveAt,
    workspaceId
  };
}

async function verifyUniqueEmailMerge(runLabel: string) {
  const prisma = getPrismaClient();
  const workspaceResult = await createDashboardWorkspace({
    description: "同邮箱身份归并冒烟临时空间，会在脚本结束清理。",
    name: `身份冒烟邮箱归并 ${runLabel}`
  });
  const workspaceId = workspaceResult.workspace.id;
  const email = `${runLabel}.merge@example.test`;
  const memberResult = await createDashboardMember({
    channels: [],
    email,
    name: `邮箱待归并成员 ${runLabel}`,
    role: "productMember",
    status: "active"
  }, workspaceId);
  const user = createUser({
    authProvider: "github",
    authUserId: `auth_${runLabel}_email_merge`,
    email,
    name: `邮箱归并登录人 ${runLabel}`
  });
  const beforeCount = await prisma.dashboardMember.count({
    where: {
      workspaceId
    }
  });
  const data = await getDashboardData(user, workspaceId);
  const currentMember = getRequiredCurrentMember(data, "唯一邮箱成员应被当前登录身份归并");
  const afterCount = await prisma.dashboardMember.count({
    where: {
      workspaceId
    }
  });
  const mergedMember = await prisma.dashboardMember.findUnique({
    where: {
      id: memberResult.member.id
    }
  });
  const identities: unknown[] = Array.isArray(mergedMember?.identities) ? mergedMember.identities : [];

  assertSmoke(currentMember?.id === memberResult.member.id, "唯一邮箱成员应被当前登录身份归并");
  assertSmoke(beforeCount === afterCount, "邮箱归并不应创建重复成员");
  assertSmoke(
    identities.some((identity) => hasProviderUserId(identity, user.authUserId)),
    "邮箱归并后应补齐 SDK authUserId"
  );
  assertSmoke(mergedMember?.registrationChannel === "github", "邮箱归并后注册渠道应更新为本次确认的 OAuth 来源");

  return {
    memberId: memberResult.member.id,
    workspaceId
  };
}

async function verifyLegacyFeishuBridgeAndDuplicateDetach(runLabel: string) {
  const prisma = getPrismaClient();
  const workspaceResult = await createDashboardWorkspace({
    description: "飞书历史身份桥接冒烟临时空间，会在脚本结束清理。",
    name: `身份冒烟飞书桥接 ${runLabel}`
  });
  const workspaceId = workspaceResult.workspace.id;
  const legacyOpenId = `ou_${runLabel}_legacy`;
  const legacyUnionId = `on_${runLabel}_legacy`;
  const legacyUserId = `feishu_user_${runLabel}`;
  const authUserId = `auth_${runLabel}_feishu_bridge`;
  const targetMember = createMemberPayload({
    feishuOpenId: legacyOpenId,
    feishuUnionId: legacyUnionId,
    feishuUserId: legacyUserId,
    id: `member-${runLabel}-legacy-target`,
    name: `飞书历史成员 ${runLabel}`,
    role: "admin",
    workspaceId
  });
  const staleDuplicateMember = createMemberPayload({
    authProvider: "feishu",
    authUserId,
    id: `member-${runLabel}-stale-duplicate`,
    name: `重复身份成员 ${runLabel}`,
    role: "viewer",
    workspaceId
  });

  await createRawMember(targetMember);
  await createRawMember(staleDuplicateMember);

  const user = createUser({
    authProvider: "feishu",
    authUserId,
    email: `${legacyOpenId}@feishu.local`,
    name: `飞书桥接登录人 ${runLabel}`,
    openId: legacyOpenId,
    unionId: legacyUnionId,
    userId: legacyUserId
  });
  const data = await getDashboardData(user, workspaceId);
  const currentMember = getRequiredCurrentMember(data, "飞书历史 openId 应优先桥接到唯一历史成员");
  const persistedTarget = await prisma.dashboardMember.findUnique({
    where: {
      id: targetMember.id
    }
  });
  const persistedDuplicate = await prisma.dashboardMember.findUnique({
    where: {
      id: staleDuplicateMember.id
    }
  });
  const targetIdentities: unknown[] = Array.isArray(persistedTarget?.identities) ? persistedTarget.identities : [];
  const duplicateIdentities: unknown[] = Array.isArray(persistedDuplicate?.identities) ? persistedDuplicate.identities : [];

  assertSmoke(currentMember?.id === targetMember.id, "飞书历史 openId 应优先桥接到唯一历史成员");
  assertSmoke(currentMember.role === "admin", "桥接后应保留历史成员角色而不是命中重复只读行");
  assertSmoke(persistedTarget?.email === undefined || !persistedTarget.email?.endsWith("@feishu.local"), "飞书占位邮箱不应展示到成员邮箱");
  assertSmoke(
    targetIdentities.some((identity) => hasProviderUserId(identity, authUserId)),
    "桥接目标成员应补齐 SDK authUserId"
  );
  assertSmoke(
    !duplicateIdentities.some((identity) => hasProviderUserId(identity, authUserId)),
    "重复成员上的同一个 SDK authUserId 应被移除"
  );

  return {
    duplicateMemberId: staleDuplicateMember.id,
    memberId: targetMember.id,
    workspaceId
  };
}

async function main() {
  const prisma = getPrismaClient();
  const runLabel = createRunLabel();
  const startedAt = Date.now();

  await cleanupByRunLabel(runLabel);

  try {
    const newWorkspaceOwner = await verifyNewWorkspaceOwner(runLabel);
    const uniqueEmailMerge = await verifyUniqueEmailMerge(runLabel);
    const legacyFeishuBridge = await verifyLegacyFeishuBridgeAndDuplicateDetach(runLabel);

    console.log(JSON.stringify({
      ok: true,
      durationMs: Date.now() - startedAt,
      legacyFeishuBridge,
      newWorkspaceOwner,
      runLabel,
      uniqueEmailMerge
    }, null, 2));
  } finally {
    await cleanupByRunLabel(runLabel);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("[full-chain-workspace-identity-smoke] failed", error);
  await getPrismaClient().$disconnect();
  process.exitCode = 1;
});
