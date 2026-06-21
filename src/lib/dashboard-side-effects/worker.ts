import { setTimeout as sleep } from "node:timers/promises";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/database/prisma";
import { sendFeishuBotTaskCard } from "@/lib/feishu/message";
import {
  isBullMqDashboardSideEffectQueueEnabled,
  runBullMqDashboardSideEffectWorker
} from "@/lib/dashboard-side-effects/bullmq-queue";
import { createMySqlDashboardSideEffectQueue } from "@/lib/dashboard-side-effects/mysql-queue";
import { getDashboardSideEffectSettings } from "@/lib/dashboard-side-effects/settings";
import type { ClaimedDashboardSideEffectJob, DashboardSideEffectPayload } from "@/lib/dashboard-side-effects/ports";

type NotificationChannel = {
  provider?: string;
  enabled?: boolean;
  target?: string;
  feishuOpenId?: string;
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
      channel.feishuOpenId
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

function getFeishuChannel(member: DashboardMemberRecord, scene: string) {
  const notification = asNotificationSettings(member.notification);

  return (notification.channels ?? []).find(
    (channel) => channel.provider === "feishu" && channel.enabled && (channel.scenes ?? []).includes(scene)
  );
}

function getFeishuOpenId(member: DashboardMemberRecord, channel?: NotificationChannel) {
  const notification = asNotificationSettings(member.notification);

  return channel?.feishuOpenId ?? channel?.target ?? notification.feishuOpenId;
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

  const channel = getFeishuChannel(member, scene);
  const openId = getFeishuOpenId(member, channel);

  if (!openId) {
    throw new Error(`成员 ${member.name} 未绑定飞书账号`);
  }

  if (!channel) {
    throw new Error(`成员 ${member.name} 已关闭该通知场景`);
  }

  await sendFeishuBotTaskCard({
    openId,
    title: asText(payload.cardTitle, "AI PM 通知"),
    text: asText(payload.cardText, "请进入 AI PM 查看详情。"),
    view: asText(payload.view) || undefined
  });
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
