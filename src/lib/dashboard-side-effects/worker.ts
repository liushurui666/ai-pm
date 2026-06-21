import { setTimeout as sleep } from "node:timers/promises";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/database/prisma";
import { sendFeishuBotTaskCard } from "@/lib/feishu/message";
import { sendDashboardNotificationEmail } from "@/lib/notifications/email";
import {
  isBullMqDashboardSideEffectQueueEnabled,
  runBullMqDashboardSideEffectWorker
} from "@/lib/dashboard-side-effects/bullmq-queue";
import { createMySqlDashboardSideEffectQueue } from "@/lib/dashboard-side-effects/mysql-queue";
import { getDashboardSideEffectSettings } from "@/lib/dashboard-side-effects/settings";
import type { ClaimedDashboardSideEffectJob, DashboardSideEffectPayload } from "@/lib/dashboard-side-effects/ports";

type NotificationChannel = {
  id?: string;
  provider?: string;
  enabled?: boolean;
  target?: string;
  feishuOpenId?: string;
  email?: string;
  scenes?: string[];
};

type NotificationSettings = {
  channels?: NotificationChannel[];
  feishuOpenId?: string;
};

type MemberIdentity = {
  providerUserId?: string;
  providerUnionId?: string;
  providerTenantUserId?: string;
  email?: string;
};

type DashboardMemberRecord = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  identities: Prisma.JsonValue;
  notification: Prisma.JsonValue;
};

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => asText(item).trim().toLowerCase()).filter(Boolean)
    : [];
}

function asNotificationSettings(value: Prisma.JsonValue): NotificationSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? value as NotificationSettings : {};
}

function asMemberIdentities(value: Prisma.JsonValue): MemberIdentity[] {
  return Array.isArray(value) ? value.filter((item): item is MemberIdentity => Boolean(item && typeof item === "object")) : [];
}

function getMemberNotificationIdentities(member: DashboardMemberRecord) {
  const notification = asNotificationSettings(member.notification);

  return [
    member.id,
    member.name,
    member.email,
    notification.feishuOpenId,
    ...(notification.channels ?? []).flatMap((channel) => [
      channel.target,
      channel.feishuOpenId,
      channel.email
    ]),
    ...asMemberIdentities(member.identities).flatMap((identity) => [
      identity.providerUserId,
      identity.providerUnionId,
      identity.providerTenantUserId,
      identity.email
    ])
  ]
    .map((value) => asText(value).trim().toLowerCase())
    .filter(Boolean);
}

async function findNotificationMember(workspaceId: string, targetIdentities: string[]) {
  if (!targetIdentities.length) {
    return undefined;
  }

  const members = await getPrismaClient().dashboardMember.findMany({
    where: { workspaceId }
  });

  return members.find((member) => {
    const memberIdentities = getMemberNotificationIdentities(member);

    return targetIdentities.some((identity) => memberIdentities.includes(identity));
  });
}

function getEnabledNotificationChannels(member: DashboardMemberRecord, scene: string) {
  const notification = asNotificationSettings(member.notification);

  return (notification.channels ?? []).filter(
    (channel) => (channel.provider === "feishu" || channel.provider === "email") && channel.enabled && (channel.scenes ?? []).includes(scene)
  ).sort((left, right) => {
    // 旧版事件级 job 可能同时包含飞书和邮箱；优先发飞书，避免邮箱服务未配置时把更关键的即时消息挡住。
    if (left.provider === right.provider) {
      return 0;
    }

    return left.provider === "feishu" ? -1 : 1;
  });
}

function getTargetNotificationChannels(
  channels: NotificationChannel[],
  payload: DashboardSideEffectPayload
) {
  const provider = asText(payload.channelProvider);
  const channelId = asText(payload.channelId);

  if (!provider && !channelId) {
    return channels;
  }

  return channels.filter((channel) => {
    if (provider && channel.provider !== provider) {
      return false;
    }

    return !channelId || channel.id === channelId;
  });
}

function getFeishuOpenId(member: DashboardMemberRecord, channel?: NotificationChannel) {
  const notification = asNotificationSettings(member.notification);

  return channel?.feishuOpenId ?? channel?.target ?? notification.feishuOpenId;
}

function getEmailAddress(member: DashboardMemberRecord, channel: NotificationChannel) {
  return asText(channel.email) || asText(channel.target) || asText(member.email);
}

async function sendNotificationChannel({
  channel,
  job,
  member,
  payload
}: {
  channel: NotificationChannel;
  job: ClaimedDashboardSideEffectJob;
  member: DashboardMemberRecord;
  payload: DashboardSideEffectPayload;
}) {
  const title = asText(payload.cardTitle, "AI PM 通知");
  const text = asText(payload.cardText, "请进入 AI PM 查看详情。");
  const view = asText(payload.view) || undefined;

  if (channel.provider === "feishu") {
    const openId = getFeishuOpenId(member, channel);

    if (!openId) {
      throw new Error(`成员 ${member.name} 未绑定飞书账号`);
    }

    await sendFeishuBotTaskCard({
      openId,
      title,
      text,
      view
    });

    return;
  }

  if (channel.provider === "email") {
    const email = getEmailAddress(member, channel);

    if (!email) {
      throw new Error(`成员 ${member.name} 未配置邮箱地址`);
    }

    await sendDashboardNotificationEmail({
      to: email,
      title,
      text,
      view,
      idempotencyKey: `dashboard:${job.id}:${channel.id ?? email}`
    });
  }
}

async function runNotifyJob(job: ClaimedDashboardSideEffectJob) {
  const payload = job.payload;
  const targetIdentities = asStringArray(payload.targetIdentities);
  const scene = asText(payload.notificationScene, "taskAssigned");
  const ownerName = asText(payload.ownerName, "负责人");
  const member = await findNotificationMember(job.workspaceId, targetIdentities);

  if (!member) {
    throw new Error(`负责人 ${ownerName} 未在成员管理中匹配到成员`);
  }

  if (member.status !== "active") {
    throw new Error(`成员 ${member.name} 已被禁用`);
  }

  const channels = getTargetNotificationChannels(getEnabledNotificationChannels(member, scene), payload);

  if (!channels.length) {
    throw new Error(`成员 ${member.name} 未启用该通知场景的飞书或邮箱渠道`);
  }

  const failures: string[] = [];
  let successCount = 0;

  // 新版保存路径已经把飞书/邮箱拆成独立 job；这里仍保留旧事件级 job 的兼容处理。
  // 对事件级 job，单个渠道失败不能抹掉另一个渠道的成功发送；对渠道级 job，唯一渠道失败会正常进入重试。
  for (const channel of channels) {
    try {
      await sendNotificationChannel({ channel, job, member, payload });
      successCount += 1;
      console.log(`[dashboard-side-effect-worker] sent ${channel.provider} notification for job ${job.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      failures.push(`${channel.provider ?? "unknown"}: ${message}`);
      console.error(`[dashboard-side-effect-worker] ${channel.provider ?? "unknown"} notification failed for job ${job.id}: ${message}`);
    }
  }

  if (successCount === 0 && failures.length) {
    throw new Error(failures.join("；"));
  }

  if (failures.length) {
    console.warn(`[dashboard-side-effect-worker] job ${job.id} partially sent: ${failures.join("；")}`);
  }
}

async function runDashboardSideEffectJob(job: ClaimedDashboardSideEffectJob) {
  // 目前先把最影响交互耗时的飞书通知切到队列；级联和统计 job 类型已在 schema/队列层预留，后续直接补 handler。
  if (job.jobType === "notify_owner" || job.jobType === "notify_bug_tester") {
    await runNotifyJob(job);

    return;
  }

  throw new Error(`暂未实现 Dashboard 副作用任务：${job.jobType}`);
}

async function processMySqlDashboardSideEffectJobs(workerId: string) {
  const queue = createMySqlDashboardSideEffectQueue();
  const job = await queue.claimNext(workerId);

  if (!job) {
    return false;
  }

  try {
    await runDashboardSideEffectJob(job);
    await queue.complete(job.id);
    console.log(`[dashboard-side-effect-worker] job ${job.id} completed (${job.jobType})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await queue.fail(job.id, message);
    console.error(`[dashboard-side-effect-worker] job ${job.id} failed: ${message}`);
  }

  return true;
}

async function runMySqlDashboardSideEffectDrainLoop(workerId: string) {
  const settings = getDashboardSideEffectSettings();

  console.log(`[dashboard-side-effect-worker] MySQL fallback drain ready: ${workerId}`);

  while (true) {
    const handled = await processMySqlDashboardSideEffectJobs(workerId);

    if (!handled) {
      await sleep(settings.workerPollMs);
    }
  }
}

export async function runDashboardSideEffectWorker(workerId: string) {
  if (isBullMqDashboardSideEffectQueueEnabled()) {
    // 生产启用 Redis/BullMQ 后，新通知会进入 Redis；但历史版本或缺 REDIS_URL 的 Web 进程可能已经把通知写进 MySQL fallback 表。
    // 如果 Redis worker 完全不扫 MySQL，旧通知会永久停在 queued，用户看到“已入队”却一直收不到飞书/邮件。
    void runMySqlDashboardSideEffectDrainLoop(`${workerId}-mysql-fallback`).catch((error) => {
      console.error("[dashboard-side-effect-worker] MySQL fallback drain failed", error);
    });

    await runBullMqDashboardSideEffectWorker({
      workerId,
      onJob: runDashboardSideEffectJob
    });

    return;
  }

  await runMySqlDashboardSideEffectDrainLoop(workerId);
}

export function createNotificationPayload(input: {
  targetIdentities: string[];
  notificationScene: string;
  ownerName: string;
  cardTitle: string;
  cardText: string;
  view?: string;
  channelProvider?: string;
  channelId?: string;
}): DashboardSideEffectPayload {
  return input;
}
