import { randomUUID } from "node:crypto";
import type { AssistantActionJob, Prisma } from "@prisma/client";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { createIndexQueue } from "@/lib/ai/knowledge/index-queue";
import { createDashboardSideEffectQueue, createNotificationPayload } from "@/lib/dashboard-side-effects";
import { getEmailNotificationSettings } from "@/lib/notifications/email";

const maxJobRecordIds = 500;
const defaultActionJobLockMs = 5 * 60 * 1000;
const defaultWorkerBatchLimit = 5;
const defaultInlineWaitMs = 5_000;

type AssistantBulkActionType = "complete_tasks" | "close_bugs" | "create_tasks" | "assign_tasks";
type AssistantBulkTargetType = "task" | "bug";

export type AssistantCreateTaskDraft = {
  aiHint: string;
  dueDate: string;
  owner: string;
  ownerAvatarUrl?: string;
  ownerEmail?: string;
  ownerMemberId?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  priority: string;
  project: string;
  stage: string;
  startDate: string;
  title: string;
  versionId?: string;
  versionName?: string;
};

export type AssistantTaskOwnerDraft = {
  owner: string;
  ownerAvatarUrl?: string;
  ownerEmail?: string;
  ownerMemberId?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
};

type EnqueueAssistantBulkActionJobInput = {
  actionType: AssistantBulkActionType;
  drafts?: AssistantCreateTaskDraft[];
  owner?: AssistantTaskOwnerDraft;
  recordIds: string[];
  requestedBy?: string;
  scope: string;
  targetType: AssistantBulkTargetType;
  titles?: Record<string, string>;
  workspaceId: string;
};

type ProcessAssistantActionJobsOptions = {
  limit?: number;
  workerId?: string;
};

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

type DashboardNotificationMember = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  identities: Prisma.JsonValue;
  notification: Prisma.JsonValue;
};

const globalForAssistantActionJobs = globalThis as typeof globalThis & {
  aiPmAssistantActionRunner?: Promise<void>;
};

function readPositiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeRecordIds(recordIds: string[]) {
  return [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))].slice(0, maxJobRecordIds);
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function asObjectRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function asCreateTaskDrafts(value: Prisma.JsonValue) {
  const result = asObjectRecord(value);
  const drafts = Array.isArray(result.drafts) ? result.drafts : [];

  return drafts
    .filter((item): item is Record<string, Prisma.JsonValue> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => {
      const draft: AssistantCreateTaskDraft = {
        aiHint: typeof item.aiHint === "string" ? item.aiHint : "AI 暂未发现额外风险。",
        dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
        owner: typeof item.owner === "string" ? item.owner : "未分配",
        priority: typeof item.priority === "string" ? item.priority : "中",
        project: typeof item.project === "string" ? item.project : "未关联项目",
        stage: typeof item.stage === "string" ? item.stage : "待处理",
        startDate: typeof item.startDate === "string" ? item.startDate : "",
        title: typeof item.title === "string" ? item.title : ""
      };

      for (const key of ["ownerAvatarUrl", "ownerEmail", "ownerMemberId", "ownerOpenId", "ownerUnionId", "ownerUserId", "versionId", "versionName"] as const) {
        if (typeof item[key] === "string") {
          draft[key] = item[key];
        }
      }

      return draft;
    })
    .filter((item) => Boolean(item.title.trim() && item.startDate && item.dueDate));
}

function asTaskOwnerDraft(value: Prisma.JsonValue) {
  const result = asObjectRecord(value);
  const ownerValue = asObjectRecord(result.owner);
  const owner = typeof ownerValue.owner === "string" ? ownerValue.owner.trim() : "";

  if (!owner) {
    return undefined;
  }

  const draft: AssistantTaskOwnerDraft = {
    owner
  };

  for (const key of ["ownerAvatarUrl", "ownerEmail", "ownerMemberId", "ownerOpenId", "ownerUnionId", "ownerUserId"] as const) {
    if (typeof ownerValue[key] === "string") {
      draft[key] = ownerValue[key];
    }
  }

  return draft;
}

function asNotificationSettings(value: Prisma.JsonValue): NotificationSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? value as NotificationSettings : {};
}

function asMemberIdentityObjects(value: Prisma.JsonValue) {
  return Array.isArray(value)
    ? value.filter((item): item is Prisma.JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function normalizeIdentity(value: unknown) {
  return asText(value).trim().toLowerCase();
}

function isCurrentUserOwnerAlias(value: unknown) {
  const normalizedValue = asText(value).replace(/\s+/g, "").toLowerCase();

  // 批量创建任务的 owner 来自模型结构化参数；模型可能把“归属给我”理解成“当前登录人”文本。
  // worker 是最后一道数据一致性防线，不能让这种展示词直接写入任务表，否则负责人看板、我的待办和通知队列都无法按成员身份匹配。
  return ["我", "本人", "自己", "当前登录人", "当前用户", "登录人", "我这里", "这里"].includes(normalizedValue);
}

function getMemberNotificationIdentities(member: DashboardNotificationMember) {
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
    ...asMemberIdentityObjects(member.identities).flatMap((identity) => [
      identity.providerUserId,
      identity.providerUnionId,
      identity.providerTenantUserId,
      identity.email
    ])
  ]
    .map(normalizeIdentity)
    .filter(Boolean);
}

function getTaskNotificationIdentities(draft: AssistantCreateTaskDraft) {
  return [
    draft.ownerMemberId,
    draft.ownerOpenId,
    draft.ownerUnionId,
    draft.ownerUserId,
    draft.ownerEmail,
    draft.owner
  ]
    .map(normalizeIdentity)
    .filter(Boolean);
}

function findTaskNotificationMember(members: DashboardNotificationMember[], draft: AssistantCreateTaskDraft) {
  const targetIdentities = getTaskNotificationIdentities(draft);

  if (!targetIdentities.length) {
    return undefined;
  }

  return members.find((member) => {
    const memberIdentities = getMemberNotificationIdentities(member);

    return targetIdentities.some((identity) => memberIdentities.includes(identity));
  });
}

function resolveDraftOwnerMember({
  draft,
  members,
  requestedBy
}: {
  draft: AssistantCreateTaskDraft;
  members: DashboardNotificationMember[];
  requestedBy?: string | null;
}) {
  const ownerText = asText(draft.owner);
  const lookupValues = isCurrentUserOwnerAlias(ownerText)
    ? [requestedBy]
    : [
        draft.ownerMemberId,
        draft.ownerEmail,
        draft.ownerOpenId,
        draft.ownerUnionId,
        draft.ownerUserId,
        ownerText
      ];
  const normalizedLookupValues = lookupValues.map(normalizeIdentity).filter(Boolean);

  if (!normalizedLookupValues.length) {
    return undefined;
  }

  return members.find((member) => {
    const memberIdentities = getMemberNotificationIdentities(member);

    return normalizedLookupValues.some((identity) => memberIdentities.includes(identity));
  });
}

function resolveCreateTaskDraftOwners({
  drafts,
  members,
  requestedBy
}: {
  drafts: AssistantCreateTaskDraft[];
  members: DashboardNotificationMember[];
  requestedBy?: string | null;
}) {
  // AI 助手动作 job 可能来自旧模型输出或重试队列；这里按成员表再归一化一次 owner 字段。
  // 只要能匹配到平台成员，就补齐 ownerMemberId/邮箱/飞书 open_id，后续通知队列和“我的任务”才能使用稳定身份字段。
  return drafts.map((draft) => {
    const member = resolveDraftOwnerMember({ draft, members, requestedBy });
    const notification = member ? asNotificationSettings(member.notification) : undefined;

    return member
      ? {
          ...draft,
          owner: member.name,
          ownerEmail: member.email ?? undefined,
          ownerMemberId: member.id,
          ownerOpenId: notification?.feishuOpenId ?? draft.ownerOpenId
        }
      : draft;
  });
}

function getTaskNotificationChannels(member: DashboardNotificationMember) {
  const notification = asNotificationSettings(member.notification);

  return (notification.channels ?? []).filter(
    (channel) => (channel.provider === "feishu" || channel.provider === "email") && channel.enabled && (channel.scenes ?? []).includes("taskAssigned")
  );
}

function getDispatchableTaskNotificationChannels(channels: NotificationChannel[]) {
  const emailSettings = getEmailNotificationSettings();
  const emailConfigured = Boolean(emailSettings.apiKey && emailSettings.from);

  return {
    channels: channels.filter((channel) => channel.provider !== "email" || emailConfigured),
    emailDisabledReason: channels.some((channel) => channel.provider === "email") && !emailConfigured
      ? "邮箱通知未配置 RESEND_API_KEY 或 EMAIL_FROM，邮箱不会发送。"
      : ""
  };
}

function getTaskOwnerNotificationSignature(draft: AssistantCreateTaskDraft) {
  return [
    draft.ownerMemberId,
    draft.ownerOpenId,
    draft.ownerUnionId,
    draft.ownerUserId,
    draft.ownerEmail,
    draft.owner
  ]
    .map(normalizeIdentity)
    .filter(Boolean)
    .join("|")
    .slice(0, 80);
}

function getNotificationChannelDedupePart(channel: NotificationChannel) {
  return [
    channel.provider,
    channel.id,
    channel.target,
    channel.feishuOpenId,
    channel.email
  ]
    .map((value) => asText(value).trim())
    .filter(Boolean)
    .join(":")
    .slice(0, 80);
}

async function enqueueCreatedTaskOwnerNotifications({
  drafts,
  job,
  recordIds
}: {
  drafts: AssistantCreateTaskDraft[];
  job: AssistantActionJob;
  recordIds: string[];
}) {
  const prisma = getPrismaClient();
  const members = await prisma.dashboardMember.findMany({
    where: {
      workspaceId: job.workspaceId
    }
  });
  const queue = createDashboardSideEffectQueue();
  const skippedReasons: string[] = [];
  let enqueuedCount = 0;

  // AI 批量创建绕过了 /api/records 的单条保存路径，因此负责人通知也必须在 worker 侧显式补齐。
  // 这里只投递 side-effect 队列，不直接发送飞书/邮箱，避免通知服务慢或失败反过来阻塞任务落库。
  for (const [index, draft] of drafts.entries()) {
    const taskId = recordIds[index];
    const member = findTaskNotificationMember(members, draft);

    if (!taskId) {
      skippedReasons.push(`${draft.title}：缺少任务 ID，无法投递通知。`);
      continue;
    }

    if (!getTaskNotificationIdentities(draft).length) {
      skippedReasons.push(`${draft.title}：缺少负责人身份，未投递通知。`);
      continue;
    }

    if (!member) {
      skippedReasons.push(`${draft.title}：负责人 ${draft.owner} 未在成员管理中匹配到成员。`);
      continue;
    }

    if (member.status !== "active") {
      skippedReasons.push(`${draft.title}：负责人 ${member.name} 已被禁用。`);
      continue;
    }

    const deliveryChannels = getTaskNotificationChannels(member);

    if (!deliveryChannels.length) {
      skippedReasons.push(`${draft.title}：负责人 ${member.name} 未启用任务分配通知。`);
      continue;
    }

    const dispatchableDelivery = getDispatchableTaskNotificationChannels(deliveryChannels);

    if (!dispatchableDelivery.channels.length) {
      skippedReasons.push(`${draft.title}：${dispatchableDelivery.emailDisabledReason}`);
      continue;
    }

    await Promise.all(dispatchableDelivery.channels.map(async (channel) => {
      await queue.enqueue({
        workspaceId: job.workspaceId,
        entityType: "task",
        entityId: taskId,
        jobType: "notify_owner",
        dedupeKey: `${job.workspaceId}:task:${taskId}:notify_owner:${getTaskOwnerNotificationSignature(draft)}:${getNotificationChannelDedupePart(channel)}`.slice(0, 191),
        payload: createNotificationPayload({
          targetIdentities: getTaskNotificationIdentities(draft),
          notificationScene: "taskAssigned",
          ownerName: draft.owner,
          cardTitle: "你被设置为任务负责人",
          cardText: `**${draft.title}**\n\n请在 AI PM 平台查看详情并确认下一步动作。`,
          view: "tasks",
          channelProvider: channel.provider,
          channelId: channel.id
        })
      });
      enqueuedCount += 1;
    }));

    if (dispatchableDelivery.emailDisabledReason) {
      skippedReasons.push(`${draft.title}：${dispatchableDelivery.emailDisabledReason}`);
    }
  }

  return {
    通知入队数: enqueuedCount,
    通知状态: enqueuedCount > 0 ? "已提交后台通知队列，实际送达由通知 worker 异步完成。" : "未提交通知。",
    通知未发送原因: skippedReasons.slice(0, 8)
  };
}

function createWorkerId(prefix = "assistant-action") {
  return `${prefix}-${process.pid}-${randomUUID().slice(0, 8)}`;
}

function scheduleUpdatedRecordIndexJobs(input: {
  ids: string[];
  targetType: AssistantBulkTargetType;
  workspaceId: string;
}) {
  // 这里必须用下一轮事件循环再启动索引补偿：BullMQ/Redis 初始化在某些网络环境下会同步占用数秒，
  // 如果直接在动作 worker 当前 call stack 中启动，即使不 await，也会让用户看到批量动作仍然很慢。
  setTimeout(() => {
    void enqueueUpdatedRecordIndexJobs(input);
  }, 0);
}

function getActionJobLockMs() {
  return readPositiveNumberEnv("ASSISTANT_ACTION_JOB_LOCK_MS", defaultActionJobLockMs);
}

function getInlineWaitMs() {
  return readPositiveNumberEnv("ASSISTANT_ACTION_INLINE_WAIT_MS", defaultInlineWaitMs);
}

async function enqueueUpdatedRecordIndexJobs({
  ids,
  targetType,
  workspaceId
}: {
  ids: string[];
  targetType: AssistantBulkTargetType;
  workspaceId: string;
}) {
  if (!ids.length) {
    return;
  }

  try {
    const queue = createIndexQueue();
    const entityType = targetType === "task" ? "task" : "bug";

    // 批量动作本身只负责业务状态更新；RAG 索引仍走既有异步索引队列，避免把 embedding/Qdrant 写入绑回动作 worker。
    // 索引入队失败只影响后续知识检索新鲜度，不能反过来把已经成功的业务批量动作标记失败。
    await Promise.all(ids.map((id) =>
      queue.enqueue({
        workspaceId,
        entityType,
        entityId: id,
        jobType: "index_entity",
        dedupeKey: `${workspaceId}:${entityType}:${id}:index_entity`,
        payload: {
          reason: "assistant_bulk_action",
          dashboardType: targetType
        }
      })
    ));
  } catch (error) {
    console.error("[assistant-action] index enqueue failed", {
      error,
      targetType,
      updatedCount: ids.length,
      workspaceId
    });
  }
}

async function claimNextAssistantActionJob(workerId: string) {
  const prisma = getPrismaClient();
  const now = new Date();
  const staleLockedAt = new Date(now.getTime() - getActionJobLockMs());

  // Web 进程或 worker 异常退出时 running job 会留下锁；抢占前释放过期锁，避免批量动作永久卡住。
  await prisma.assistantActionJob.updateMany({
    where: {
      status: "running",
      lockedAt: {
        lt: staleLockedAt
      }
    },
    data: {
      status: "queued",
      lockedAt: null,
      lockedBy: null,
      error: null
    }
  });

  const candidate = await prisma.assistantActionJob.findFirst({
    where: {
      status: "queued"
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (!candidate) {
    return undefined;
  }

  const claimed = await prisma.assistantActionJob.updateMany({
    where: {
      id: candidate.id,
      status: "queued"
    },
    data: {
      status: "running",
      startedAt: candidate.startedAt ?? now,
      lockedAt: now,
      lockedBy: workerId,
      error: null
    }
  });

  if (claimed.count === 0) {
    return undefined;
  }

  return prisma.assistantActionJob.findUnique({
    where: {
      id: candidate.id
    }
  });
}

async function runCompleteTasksJob(job: AssistantActionJob, recordIds: string[]) {
  const prisma = getPrismaClient();
  const records = await prisma.projectTask.findMany({
    where: {
      workspaceId: job.workspaceId,
      id: {
        in: recordIds
      }
    },
    select: {
      id: true,
      stage: true,
      title: true
    }
  });
  const existingIds = new Set(records.map((record) => record.id));
  const targetIds = records.filter((record) => record.stage !== "已完成").map((record) => record.id);
  const alreadyDoneIds = records.filter((record) => record.stage === "已完成").map((record) => record.id);
  const missingIds = recordIds.filter((id) => !existingIds.has(id));

  if (targetIds.length) {
    // 关闭任务的核心性能点在这里：一次 updateMany 代替几十次 /api/records PATCH。
    await prisma.projectTask.updateMany({
      where: {
        workspaceId: job.workspaceId,
        id: {
          in: targetIds
        },
        stage: {
          not: "已完成"
        }
      },
      data: {
        stage: "已完成"
      }
    });
  }

  // 业务动作完成后立即返回成功；知识索引刷新是后台补偿，不能拖住动作 job 的完成态。
  scheduleUpdatedRecordIndexJobs({
    ids: targetIds,
    targetType: "task",
    workspaceId: job.workspaceId
  });

  return {
    successIds: targetIds,
    failedIds: missingIds,
    result: {
      已完成记录: targetIds.map((id) => records.find((record) => record.id === id)?.title || id).slice(0, 12),
      已是完成状态: alreadyDoneIds.slice(0, 12),
      未找到记录: missingIds.slice(0, 12)
    }
  };
}

async function runCloseBugsJob(job: AssistantActionJob, recordIds: string[]) {
  const prisma = getPrismaClient();
  const records = await prisma.bugReport.findMany({
    where: {
      workspaceId: job.workspaceId,
      id: {
        in: recordIds
      }
    },
    select: {
      id: true,
      status: true,
      title: true
    }
  });
  const existingIds = new Set(records.map((record) => record.id));
  const targetRecords = records.filter((record) => record.status !== "已关闭");
  const targetIds = targetRecords.map((record) => record.id);
  const alreadyClosedIds = records.filter((record) => record.status === "已关闭").map((record) => record.id);
  const missingIds = recordIds.filter((id) => !existingIds.has(id));
  const now = new Date();
  const operator = job.requestedBy || "AI 项目助手";

  if (targetIds.length) {
    await prisma.$transaction(async (tx) => {
      // Bug 批量关闭同样用单次 updateMany；额外补充流转记录，保持 Bug 详情页可追踪状态变化。
      await tx.bugReport.updateMany({
        where: {
          workspaceId: job.workspaceId,
          id: {
            in: targetIds
          },
          status: {
            not: "已关闭"
          }
        },
        data: {
          status: "已关闭"
        }
      });
      await tx.bugFlowRecord.createMany({
        data: targetRecords.map((record) => ({
          id: `bugFlow-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
          bugId: record.id,
          action: "statusChanged",
          at: now.toISOString(),
          operator,
          from: record.status,
          to: "已关闭",
          note: "AI 助手批量关闭"
        }))
      });
    });
  }

  // 业务动作完成后立即返回成功；知识索引刷新是后台补偿，不能拖住动作 job 的完成态。
  scheduleUpdatedRecordIndexJobs({
    ids: targetIds,
    targetType: "bug",
    workspaceId: job.workspaceId
  });

  return {
    successIds: targetIds,
    failedIds: missingIds,
    result: {
      已关闭记录: targetIds.map((id) => records.find((record) => record.id === id)?.title || id).slice(0, 12),
      已是关闭状态: alreadyClosedIds.slice(0, 12),
      未找到记录: missingIds.slice(0, 12)
    }
  };
}

async function runCreateTasksJob(job: AssistantActionJob, recordIds: string[]) {
  const prisma = getPrismaClient();
  const rawDrafts = asCreateTaskDrafts(job.result).slice(0, recordIds.length);
  const members = await prisma.dashboardMember.findMany({
    where: {
      workspaceId: job.workspaceId
    }
  });
  const drafts = resolveCreateTaskDraftOwners({
    drafts: rawDrafts,
    members,
    requestedBy: job.requestedBy
  });
  const now = new Date();

  if (!drafts.length) {
    throw new Error("批量创建任务缺少可写入的任务草稿。");
  }

  // 批量创建任务不再回调 /api/records；worker 一次 createMany 写入 project_tasks，避免 Chat 流式请求被多次业务 API 保存拖住。
  // 因为绕开了单条保存路径，负责人通知需要在这里显式投递 side-effect 队列，否则模型会误报“通知已触发”但飞书/邮箱没有任何任务。
  await prisma.projectTask.createMany({
    data: drafts.map((draft, index) => ({
      id: recordIds[index] ?? `task-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      workspaceId: job.workspaceId,
      title: draft.title,
      stage: draft.stage,
      owner: draft.owner,
      ownerMemberId: draft.ownerMemberId ?? null,
      ownerOpenId: draft.ownerOpenId ?? null,
      ownerUnionId: draft.ownerUnionId ?? null,
      ownerUserId: draft.ownerUserId ?? null,
      ownerEmail: draft.ownerEmail ?? null,
      ownerAvatarUrl: draft.ownerAvatarUrl ?? null,
      project: draft.project,
      versionId: draft.versionId ?? null,
      versionName: draft.versionName ?? null,
      priority: draft.priority,
      startDate: draft.startDate,
      dueDate: draft.dueDate,
      aiHint: draft.aiHint
    }))
  });

  let notificationResult: Record<string, unknown>;

  try {
    notificationResult = await enqueueCreatedTaskOwnerNotifications({
      drafts,
      job,
      recordIds: recordIds.slice(0, drafts.length)
    });
  } catch (error) {
    notificationResult = {
      通知入队数: 0,
      通知状态: "通知入队失败。",
      通知未发送原因: [error instanceof Error ? error.message : "未知错误"]
    };
  }

  scheduleUpdatedRecordIndexJobs({
    ids: recordIds.slice(0, drafts.length),
    targetType: "task",
    workspaceId: job.workspaceId
  });

  return {
    successIds: recordIds.slice(0, drafts.length),
    failedIds: recordIds.slice(drafts.length),
    result: {
      已创建记录: drafts.map((draft) => draft.title).slice(0, 12),
      创建时间: now.toISOString(),
      ...notificationResult
    }
  };
}

async function runAssignTasksJob(job: AssistantActionJob, recordIds: string[]) {
  const prisma = getPrismaClient();
  const owner = asTaskOwnerDraft(job.result);

  if (!owner) {
    throw new Error("批量归属任务缺少目标负责人。");
  }

  const records = await prisma.projectTask.findMany({
    where: {
      workspaceId: job.workspaceId,
      id: {
        in: recordIds
      }
    },
    select: {
      id: true,
      owner: true,
      ownerMemberId: true,
      title: true
    }
  });
  const existingIds = new Set(records.map((record) => record.id));
  const targetIds = records
    .filter((record) => record.owner !== owner.owner || record.ownerMemberId !== (owner.ownerMemberId ?? null))
    .map((record) => record.id);
  const alreadyAssignedIds = records
    .filter((record) => record.owner === owner.owner && record.ownerMemberId === (owner.ownerMemberId ?? null))
    .map((record) => record.id);
  const missingIds = recordIds.filter((id) => !existingIds.has(id));

  if (targetIds.length) {
    // 负责人归属必须一次性同步姓名、成员 id、邮箱和飞书身份字段；负责人看板和“我的待办”优先按 ownerMemberId 匹配。
    // 只改 owner 文本会造成回复说已归属，但 UI 仍按旧成员筛选，这正是本次问题的根因。
    await prisma.projectTask.updateMany({
      where: {
        workspaceId: job.workspaceId,
        id: {
          in: targetIds
        }
      },
      data: {
        owner: owner.owner,
        ownerMemberId: owner.ownerMemberId ?? null,
        ownerOpenId: owner.ownerOpenId ?? null,
        ownerUnionId: owner.ownerUnionId ?? null,
        ownerUserId: owner.ownerUserId ?? null,
        ownerEmail: owner.ownerEmail ?? null,
        ownerAvatarUrl: owner.ownerAvatarUrl ?? null
      }
    });
  }

  scheduleUpdatedRecordIndexJobs({
    ids: targetIds,
    targetType: "task",
    workspaceId: job.workspaceId
  });

  return {
    successIds: targetIds,
    failedIds: missingIds,
    result: {
      目标负责人: owner.owner,
      已转交记录: targetIds.map((id) => records.find((record) => record.id === id)?.title || id).slice(0, 12),
      已是目标负责人: alreadyAssignedIds.slice(0, 12),
      未找到记录: missingIds.slice(0, 12)
    }
  };
}

async function runAssistantActionJob(job: AssistantActionJob) {
  const prisma = getPrismaClient();
  const recordIds = asStringArray(job.recordIds);

  if (!recordIds.length) {
    throw new Error("批量动作没有可处理的记录。");
  }

  const result = job.actionType === "complete_tasks"
    ? await runCompleteTasksJob(job, recordIds)
    : job.actionType === "create_tasks"
      ? await runCreateTasksJob(job, recordIds)
      : job.actionType === "assign_tasks"
        ? await runAssignTasksJob(job, recordIds)
        : await runCloseBugsJob(job, recordIds);
  const successCount = result.successIds.length;
  const failedCount = result.failedIds.length;
  const status = failedCount > 0
    ? successCount > 0 ? "partially_failed" : "failed"
    : "succeeded";

  await prisma.assistantActionJob.update({
    where: {
      id: job.id
    },
    data: {
      status,
      successCount,
      failedCount,
      result: toJsonValue({
        ...result.result,
        successIds: result.successIds,
        failedIds: result.failedIds
      }),
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      error: failedCount > 0 ? "部分记录未能处理，请查看结果明细。" : null
    }
  });
}

export async function enqueueAssistantBulkActionJob(input: EnqueueAssistantBulkActionJobInput) {
  const prisma = getPrismaClient();
  const recordIds = normalizeRecordIds(input.recordIds);

  if (!recordIds.length) {
    return {
      已执行: false,
      状态: "无需处理",
      总数: 0,
      成功数: 0,
      失败数: 0,
      业务结果: "没有匹配到需要批量处理的记录。"
    };
  }

  const job = await prisma.assistantActionJob.create({
    data: {
      workspaceId: input.workspaceId,
      actionType: input.actionType,
      targetType: input.targetType,
      scope: input.scope,
      recordIds: toJsonValue(recordIds),
      requestedCount: recordIds.length,
      requestedBy: input.requestedBy,
      result: toJsonValue({
        drafts: input.drafts ?? [],
        owner: input.owner ?? null,
        titles: input.titles ?? {}
      })
    }
  });

  scheduleAssistantActionJobProcessing();

  return {
    已执行: true,
    状态: "已入队",
    队列任务ID: job.id,
    总数: recordIds.length,
    成功数: 0,
    失败数: 0,
    业务结果: "批量动作已提交后台队列，系统会异步执行并刷新业务数据。"
  };
}

export async function waitForAssistantActionJob(jobId: string, timeoutMs = getInlineWaitMs()) {
  const prisma = getPrismaClient();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const job = await prisma.assistantActionJob.findUnique({
      where: {
        id: jobId
      }
    });

    if (job && job.status !== "queued" && job.status !== "running") {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return prisma.assistantActionJob.findUnique({
    where: {
      id: jobId
    }
  });
}

export async function processAssistantActionJobs(options: ProcessAssistantActionJobsOptions = {}) {
  const workerId = options.workerId ?? createWorkerId();
  const limit = Math.max(1, Math.trunc(options.limit ?? defaultWorkerBatchLimit));
  let handled = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextAssistantActionJob(workerId);

    if (!job) {
      break;
    }

    try {
      await runAssistantActionJob(job);
      handled += 1;
    } catch (error) {
      await getPrismaClient().assistantActionJob.update({
        where: {
          id: job.id
        },
        data: {
          status: "failed",
          failedCount: job.requestedCount,
          error: error instanceof Error ? error.message : "批量动作执行失败",
          finishedAt: new Date(),
          lockedAt: null,
          lockedBy: null
        }
      });
      handled += 1;
    }
  }

  return handled;
}

export function scheduleAssistantActionJobProcessing() {
  if (process.env.ASSISTANT_ACTION_DISABLE_INLINE_WORKER === "true") {
    return;
  }

  if (globalForAssistantActionJobs.aiPmAssistantActionRunner) {
    return;
  }

  // 本地开发或单进程部署时，入队后顺手触发一次轻量后台消费；正式环境仍建议使用独立 worker 常驻消费。
  globalForAssistantActionJobs.aiPmAssistantActionRunner = Promise.resolve()
    .then(() => processAssistantActionJobs({
      workerId: createWorkerId("assistant-action-inline")
    }))
    .catch((error) => {
      console.error("[assistant-action] inline worker failed", error);
    })
    .then(() => {
      globalForAssistantActionJobs.aiPmAssistantActionRunner = undefined;
    });
}
