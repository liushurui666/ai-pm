import { config as loadEnv } from "dotenv";
import { getPrismaClient } from "@/lib/database/prisma";
import { createMySqlDashboardSideEffectQueue } from "@/lib/dashboard-side-effects/mysql-queue";
import { createNotificationPayload } from "@/lib/dashboard-side-effects/worker";
import { getEmailNotificationSettings } from "@/lib/notifications/email/settings";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";

type NotificationProvider = "feishu" | "email";

type SmokeJobSnapshot = {
  id: string;
  entityId: string;
  status: string;
  nextRunAt: Date | null;
  payload: unknown;
};

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asPayload(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readPayloadTextArray(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getDispatchableProviders() {
  const emailSettings = getEmailNotificationSettings();
  const emailConfigured = Boolean(emailSettings.apiKey && emailSettings.from);

  // 邮箱通知生产逻辑要求 RESEND_API_KEY 和 EMAIL_FROM 同时存在；冒烟脚本复用同一配置入口，
  // 用“预期入队 provider”校验降级行为，避免缺邮箱环境时误判为失败。
  return {
    providers: emailConfigured ? ["feishu", "email"] as NotificationProvider[] : ["feishu"] as NotificationProvider[],
    emailConfigured,
    emailDisabledReason: emailConfigured ? "" : "邮箱通知未配置 RESEND_API_KEY 或 EMAIL_FROM，邮箱不会发送。"
  };
}

async function main() {
  const prisma = getPrismaClient();
  const queue = createMySqlDashboardSideEffectQueue();
  const workspace = await prisma.workspace.findUnique({
    where: { id: WORKSPACE_ID },
    select: { id: true, name: true }
  });

  assertSmoke(workspace, `未找到测试工作区 ${WORKSPACE_ID}，请先确认 DATABASE_URL 指向 AI PM 业务库。`);

  const runId = `notification-e2e-${Date.now()}`;
  const memberId = createLocalId("member");
  const taskId = createLocalId("task");
  const futureRunAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const fakeFeishuOpenId = `ou_codex_notification_${runId}`;
  const fakeEmail = `codex-notification-${runId}@example.com`;
  const channels = [
    {
      id: `${runId}-feishu`,
      provider: "feishu",
      enabled: true,
      name: "Codex 飞书冒烟渠道",
      target: fakeFeishuOpenId,
      feishuOpenId: fakeFeishuOpenId,
      scenes: ["taskAssigned", "bugFlowChanged"]
    },
    {
      id: `${runId}-email`,
      provider: "email",
      enabled: true,
      name: "Codex 邮箱冒烟渠道",
      target: fakeEmail,
      email: fakeEmail,
      scenes: ["taskAssigned", "bugFlowChanged"]
    },
    {
      id: `${runId}-webhook-disabled`,
      provider: "webhook",
      enabled: false,
      name: "占位渠道不应入队",
      target: "https://example.invalid/ai-pm",
      scenes: ["taskAssigned"]
    }
  ];
  const dispatchable = getDispatchableProviders();

  try {
    // 通知链路测试需要有真实成员配置可回查，但不能创建真实任务或调用外部发送；
    // 因此只写 workspace_members 和未来执行的 side-effect job，finally 会按 runId 全部清理。
    await prisma.dashboardMember.create({
      data: {
        id: memberId,
        workspaceId: WORKSPACE_ID,
        name: `Codex 通知冒烟 ${runId}`,
        email: fakeEmail,
        registrationChannel: "email",
        role: "viewer",
        status: "active",
        identities: [
          {
            provider: "email",
            providerUserId: memberId,
            email: fakeEmail
          }
        ],
        notification: {
          channels,
          feishuEnabled: true,
          feishuOpenId: fakeFeishuOpenId,
          taskAssigned: true,
          requirementChanged: false
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    await Promise.all(dispatchable.providers.map((provider) => {
      const channel = channels.find((item) => item.provider === provider);

      assertSmoke(channel, `测试成员缺少 ${provider} 通知渠道。`);

      // 生产保存路径按渠道拆分 job，并把 channelProvider/channelId 写入 payload；
      // 冒烟脚本直接验证这份队列协议，确保 worker 后续只处理目标渠道，不会邮箱失败拖住飞书。
      return queue.enqueue({
        workspaceId: WORKSPACE_ID,
        entityType: "task",
        entityId: taskId,
        jobType: "notify_owner",
        dedupeKey: `${WORKSPACE_ID}:task:${taskId}:notify_owner:${runId}:${provider}`,
        nextRunAt: futureRunAt,
        payload: createNotificationPayload({
          targetIdentities: [memberId, fakeEmail, fakeFeishuOpenId],
          notificationScene: "taskAssigned",
          ownerName: `Codex 通知冒烟 ${runId}`,
          cardTitle: "你被设置为任务负责人",
          cardText: `**Codex 通知冒烟任务 ${runId}**\n\n这是一条不会真实发送的队列协议测试。`,
          view: "tasks",
          channelProvider: provider,
          channelId: channel.id
        })
      });
    }));

    const jobs = await prisma.dashboardSideEffectJob.findMany({
      where: {
        workspaceId: WORKSPACE_ID,
        entityId: taskId
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true,
        entityId: true,
        status: true,
        nextRunAt: true,
        payload: true
      }
    }) as SmokeJobSnapshot[];
    const payloads = jobs.map((job) => ({
      ...job,
      payload: asPayload(job.payload)
    }));
    const queuedProviders = payloads.map((job) => String(job.payload.channelProvider)).sort();
    const expectedProviders = [...dispatchable.providers].sort();

    assertSmoke(jobs.length === expectedProviders.length, `通知 job 数量不正确：expected=${expectedProviders.length}, actual=${jobs.length}`);
    assertSmoke(JSON.stringify(queuedProviders) === JSON.stringify(expectedProviders), `通知渠道拆分不正确：expected=${expectedProviders.join(",")}, actual=${queuedProviders.join(",")}`);
    assertSmoke(jobs.every((job) => job.status === "queued"), "测试通知 job 必须保持 queued，不能被 inline worker 抢先发送。");
    assertSmoke(jobs.every((job) => job.nextRunAt && job.nextRunAt.getTime() > Date.now()), "测试通知 job 必须设置未来 nextRunAt，避免真实发送。");

    for (const job of payloads) {
      const provider = String(job.payload.channelProvider) as NotificationProvider;
      const channel = channels.find((item) => item.provider === provider);

      assertSmoke(channel, `未找到 ${provider} 对应的成员渠道。`);
      assertSmoke(job.payload.channelId === channel.id, `${provider} job 未绑定正确 channelId。`);
      assertSmoke(job.payload.notificationScene === "taskAssigned", `${provider} job 场景应为 taskAssigned。`);
      assertSmoke(readPayloadTextArray(job.payload, "targetIdentities").includes(memberId), `${provider} job 目标身份缺少 memberId。`);
    }

    const member = await prisma.dashboardMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        notification: true
      }
    });
    const memberNotification = asPayload(member?.notification);
    const configuredChannels = Array.isArray(memberNotification.channels) ? memberNotification.channels : [];

    assertSmoke(member?.id === memberId, "测试成员未能写入 workspace_members。");
    assertSmoke(configuredChannels.length === 3, "测试成员通知渠道配置未完整写入。");

    console.log(JSON.stringify({
      runId,
      workspaceId: WORKSPACE_ID,
      workspaceName: workspace.name,
      memberId,
      taskId,
      emailConfigured: dispatchable.emailConfigured,
      emailDisabledReason: dispatchable.emailDisabledReason,
      expectedProviders,
      queuedProviders,
      jobIds: jobs.map((job) => job.id),
      guard: "测试 job 使用未来 nextRunAt，仅验证队列协议，不触发真实飞书或 Resend 发送。"
    }, null, 2));
  } finally {
    // 清理必须覆盖成功和失败两种情况；如果断言中途失败，也不能把未来发送的假通知留给后台 worker。
    await prisma.dashboardSideEffectJob.deleteMany({
      where: {
        workspaceId: WORKSPACE_ID,
        OR: [
          { entityId: taskId },
          { dedupeKey: { contains: runId } }
        ]
      }
    });
    await prisma.dashboardMember.deleteMany({
      where: {
        id: memberId,
        workspaceId: WORKSPACE_ID
      }
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await getPrismaClient().$disconnect();
  process.exitCode = 1;
});
