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
    // 邮箱通过 Resend 幂等键天然抗重试，先发邮箱再发飞书，可以降低“飞书已发但邮箱配置失败”造成的重复飞书风险。
    if (left.provider === right.provider) {
      return 0;
    }

    return left.provider === "email" ? -1 : 1;
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

  const channels = getEnabledNotificationChannels(member, scene);

  if (!channels.length) {
    throw new Error(`成员 ${member.name} 未启用该通知场景的飞书或邮箱渠道`);
  }

  // 同一通知事件允许飞书和邮箱同时启用；worker 串行发送可以复用现有重试语义，
  // 任何渠道失败都会让 job 进入重试，Resend 幂等键负责避免邮件重复投递。
  for (const channel of channels) {
    await sendNotificationChannel({ channel, job, member, payload });
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

export async function runDashboardSideEffectWorker(workerId: string) {
  if (isBullMqDashboardSideEffectQueueEnabled()) {
    await runBullMqDashboardSideEffectWorker({
      workerId,
      onJob: runDashboardSideEffectJob
    });

    return;
  }

  const settings = getDashboardSideEffectSettings();

  console.log(`[dashboard-side-effect-worker] MySQL fallback worker ready: ${workerId}`);

  while (true) {
    const handled = await processMySqlDashboardSideEffectJobs(workerId);

    if (!handled) {
      await sleep(settings.workerPollMs);
    }
  }
}

export function createNotificationPayload(input: {
  targetIdentities: string[];
  notificationScene: string;
  ownerName: string;
  cardTitle: string;
  cardText: string;
  view?: string;
}): DashboardSideEffectPayload {
  return input;
}
