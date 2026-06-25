import { config as loadEnv } from "dotenv";
import { createDashboardMember, updateDashboardMember } from "@/data/local-dashboard";
import { getPrismaClient } from "@/lib/database/prisma";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";

type MemberNotificationSnapshot = {
  channels?: Array<{
    id?: string;
    provider?: string;
    enabled?: boolean;
    target?: string;
    feishuOpenId?: string;
    email?: string;
    scenes?: string[];
  }>;
  feishuEnabled?: boolean;
  feishuOpenId?: string;
  taskAssigned?: boolean;
  requirementChanged?: boolean;
};

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asNotification(value: unknown): MemberNotificationSnapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MemberNotificationSnapshot : {};
}

function createSmokeEmail(runLabel: string, suffix: string) {
  return `${suffix}.${runLabel}@example.test`;
}

async function countBusinessRows(workspaceId: string) {
  const prisma = getPrismaClient();
  const [projects, tasks, bugs, requirements, versions, sideEffects] = await Promise.all([
    prisma.project.count({ where: { workspaceId } }),
    prisma.projectTask.count({ where: { workspaceId } }),
    prisma.bugReport.count({ where: { workspaceId } }),
    prisma.requirement.count({ where: { workspaceId } }),
    prisma.requirementVersion.count({ where: { workspaceId } }),
    prisma.dashboardSideEffectJob.count({ where: { workspaceId } })
  ]);

  return {
    projects,
    tasks,
    bugs,
    requirements,
    versions,
    sideEffects
  };
}

async function expectDuplicateError(action: () => Promise<unknown>, expectedText: string) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    assertSmoke(message.includes(expectedText), `重复成员错误文案不正确：${message}`);

    return message;
  }

  throw new Error("重复成员操作应被拒绝，但实际成功了。");
}

async function main() {
  const prisma = getPrismaClient();
  const workspace = await prisma.workspace.findUnique({
    where: { id: WORKSPACE_ID },
    select: { id: true, name: true }
  });

  assertSmoke(workspace, `未找到测试工作区 ${WORKSPACE_ID}，请先确认 DATABASE_URL 指向 AI PM 业务库。`);

  const runLabel = `member-management-e2e-${Date.now()}`;
  const manualEmail = createSmokeEmail(runLabel, "manual");
  const feishuEmail = createSmokeEmail(runLabel, "feishu");
  const manualMemberIds: string[] = [];
  const before = await countBusinessRows(WORKSPACE_ID);

  try {
    const manualCreated = await createDashboardMember({
      channels: [],
      email: manualEmail,
      name: `手动成员 ${runLabel}`,
      role: "productMember",
      status: "active"
    }, WORKSPACE_ID);
    const manualMemberId = manualCreated.member.id;

    manualMemberIds.push(manualMemberId);
    assertSmoke(manualCreated.member.registrationChannel === "email", "手动添加成员 registrationChannel 应为 email。");
    assertSmoke(manualCreated.member.notification.channels.length === 0, "手动添加成员默认不应携带通知渠道。");

    const fakeFeishuOpenId = `ou_codex_member_${runLabel}`;
    const feishuCreated = await createDashboardMember({
      email: feishuEmail,
      feishuEnabled: true,
      feishuOpenId: fakeFeishuOpenId,
      name: `飞书成员 ${runLabel}`,
      role: "viewer",
      status: "active",
      taskAssigned: true,
      requirementChanged: true
    }, WORKSPACE_ID);
    const feishuMemberId = feishuCreated.member.id;

    manualMemberIds.push(feishuMemberId);
    assertSmoke(feishuCreated.member.notification.feishuOpenId === fakeFeishuOpenId, "飞书成员 open_id 未写入通知配置。");
    assertSmoke(feishuCreated.member.notification.channels.some((channel) => channel.provider === "feishu" && channel.feishuOpenId === fakeFeishuOpenId), "飞书成员应自动生成飞书通知渠道。");
    assertSmoke(feishuCreated.member.identities.some((identity) => identity.provider === "feishu" && identity.providerUserId === fakeFeishuOpenId), "飞书成员 identities 应绑定 open_id。");

    const emailChannelId = `${runLabel}-email-channel`;
    const updatedManual = await updateDashboardMember(manualMemberId, {
      ...manualCreated.member,
      channels: [
        {
          id: emailChannelId,
          provider: "email",
          enabled: true,
          name: "成员管理邮箱冒烟",
          target: manualEmail,
          email: manualEmail,
          scenes: ["taskAssigned", "bugFlowChanged"]
        },
        {
          id: `${runLabel}-webhook-disabled`,
          provider: "webhook",
          enabled: false,
          name: "占位 Webhook",
          target: "https://example.invalid/member-management",
          scenes: ["taskAssigned"]
        }
      ],
      role: "qa",
      status: "disabled"
    });

    assertSmoke(updatedManual.member.role === "qa", "成员角色更新失败。");
    assertSmoke(updatedManual.member.status === "disabled", "成员状态更新失败。");
    assertSmoke(updatedManual.member.notification.channels.some((channel) => channel.provider === "email" && channel.email === manualEmail), "邮箱通知渠道未保存。");
    assertSmoke(updatedManual.member.notification.channels.some((channel) => channel.provider === "webhook" && channel.enabled === false), "禁用 Webhook 占位渠道未保存。");

    const updatedFeishu = await updateDashboardMember(feishuMemberId, {
      ...feishuCreated.member,
      channels: [
        {
          id: `${runLabel}-feishu-channel`,
          provider: "feishu",
          enabled: true,
          name: "成员管理飞书冒烟",
          target: fakeFeishuOpenId,
          feishuOpenId: fakeFeishuOpenId,
          scenes: ["taskAssigned", "requirementChanged", "bugFlowChanged"]
        }
      ],
      role: "frontend",
      status: "active"
    });

    assertSmoke(updatedFeishu.member.role === "frontend", "飞书成员角色更新失败。");
    assertSmoke(updatedFeishu.member.notification.taskAssigned, "飞书成员 taskAssigned 场景未保存。");
    assertSmoke(updatedFeishu.member.notification.requirementChanged, "飞书成员 requirementChanged 场景未保存。");

    const duplicateCreateMessage = await expectDuplicateError(() => createDashboardMember({
      channels: [],
      email: manualEmail,
      name: `重复成员 ${runLabel}`,
      role: "viewer",
      status: "active"
    }, WORKSPACE_ID), "成员已存在");
    const duplicateUpdateMessage = await expectDuplicateError(() => updateDashboardMember(feishuMemberId, {
      ...updatedFeishu.member,
      email: manualEmail
    }), "成员身份已被其他成员绑定");

    const persistedMembers = await prisma.dashboardMember.findMany({
      where: {
        id: {
          in: manualMemberIds
        }
      },
      select: {
        id: true,
        email: true,
        notification: true,
        registrationChannel: true,
        role: true,
        status: true
      }
    });
    const persistedManual = persistedMembers.find((member) => member.id === manualMemberId);
    const persistedFeishu = persistedMembers.find((member) => member.id === feishuMemberId);
    const manualNotification = asNotification(persistedManual?.notification);
    const feishuNotification = asNotification(persistedFeishu?.notification);
    const after = await countBusinessRows(WORKSPACE_ID);

    // 成员管理是后台轻量配置，脚本同时对比核心业务表计数，防止实现回退到全量 dashboard 同步，
    // 那会让公网 MySQL 因无关任务/Bug/需求重写而变慢，甚至把测试成员操作误扩散到业务数据。
    assertSmoke(JSON.stringify(before) === JSON.stringify(after), `成员管理写入不应改变业务表或通知队列计数：before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`);
    assertSmoke(persistedManual?.status === "disabled", "数据库未保存手动成员禁用状态。");
    assertSmoke(persistedManual?.role === "qa", "数据库未保存手动成员角色。");
    assertSmoke(manualNotification.channels?.some((channel) => channel.provider === "email" && channel.email === manualEmail), "数据库未保存邮箱渠道。");
    assertSmoke(persistedFeishu?.registrationChannel === "email", "手动创建的飞书通知成员不应伪造成真实 Feishu 登录注册渠道。");
    assertSmoke(feishuNotification.feishuOpenId === fakeFeishuOpenId, "数据库未保存飞书 open_id。");
    assertSmoke(feishuNotification.channels?.some((channel) => channel.provider === "feishu" && channel.feishuOpenId === fakeFeishuOpenId), "数据库未保存飞书通知渠道。");

    console.log(JSON.stringify({
      ok: true,
      runLabel,
      workspaceId: WORKSPACE_ID,
      workspaceName: workspace.name,
      members: {
        manualMemberId,
        feishuMemberId,
        persistedCount: persistedMembers.length
      },
      duplicateGuards: {
        create: duplicateCreateMessage,
        update: duplicateUpdateMessage
      },
      businessRowCounts: {
        before,
        after
      }
    }, null, 2));
  } finally {
    // 所有临时成员都带本轮 id；清理限定 workspace 和 id，避免触碰真实成员。
    await prisma.dashboardMember.deleteMany({
      where: {
        workspaceId: WORKSPACE_ID,
        id: {
          in: manualMemberIds
        }
      }
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("[full-chain-member-management-smoke] failed", error);
  await getPrismaClient().$disconnect();
  process.exitCode = 1;
});
