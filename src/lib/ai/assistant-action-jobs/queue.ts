import { randomUUID } from "node:crypto";
import type { AssistantActionJob, Prisma } from "@prisma/client";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { createIndexQueue } from "@/lib/ai/knowledge/index-queue";
import { createDashboardSideEffectQueue, createNotificationPayload } from "@/lib/dashboard-side-effects";
import { getEmailNotificationSettings } from "@/lib/notifications/email";
import { readDashboardMembersDatabase } from "@/data/database-dashboard";
import { canPerformAction, getDashboardPermissions } from "@/lib/access/permissions";
import { authorizeProjectMutationsForActorMember } from "@/lib/project-management/access";
import { resolveProjectMutationScope } from "@/lib/project-management/record-scope";
import { normalizeTaskPriority } from "@/lib/tasks/priority";
import type { Task } from "@/types/dashboard";

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
  priority: Task["priority"];
  project: string;
  projectId?: string;
  requirementId?: string;
  requirementTitle?: string;
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
  requestedByMemberId: string;
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
        // 队列可能恢复改造前已入库的“中”任务；worker 读 payload 时先归一化，确保重试也不会把旧值写回任务表。
        priority: normalizeTaskPriority(item.priority),
        project: typeof item.project === "string" ? item.project : "未关联项目",
        stage: typeof item.stage === "string" ? item.stage : "待处理",
        startDate: typeof item.startDate === "string" ? item.startDate : "",
        title: typeof item.title === "string" ? item.title : ""
      };

      for (const key of [
        "ownerAvatarUrl",
        "ownerEmail",
        "ownerMemberId",
        "ownerOpenId",
        "ownerUnionId",
        "ownerUserId",
        "projectId",
        "requirementId",
        "requirementTitle",
        "versionId",
        "versionName"
      ] as const) {
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
  return ["我", "你", "您", "本人", "自己", "当前登录人", "当前用户", "登录人", "我这里", "你这里", "这里"].includes(normalizedValue);
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
  requestedByMemberId
}: {
  draft: AssistantCreateTaskDraft;
  members: DashboardNotificationMember[];
  requestedByMemberId?: string | null;
}) {
  const ownerText = asText(draft.owner);
  const lookupValues = isCurrentUserOwnerAlias(ownerText)
    ? [requestedByMemberId]
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
  requestedByMemberId
}: {
  drafts: AssistantCreateTaskDraft[];
  members: DashboardNotificationMember[];
  requestedByMemberId?: string | null;
}) {
  // AI 助手动作 job 可能来自旧模型输出或重试队列；这里按成员表再归一化一次 owner 字段。
  // 只要能匹配到平台成员，就补齐 ownerMemberId/邮箱/飞书 open_id，后续通知队列和“我的任务”才能使用稳定身份字段。
  return drafts.map((draft) => {
    const member = resolveDraftOwnerMember({ draft, members, requestedByMemberId });
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

const assistantTaskAuthorizationSelect = {
  id: true,
  workspaceId: true,
  title: true,
  stage: true,
  owner: true,
  ownerMemberId: true,
  project: true,
  projectId: true,
  versionId: true,
  versionName: true,
  requirementId: true,
  requirementTitle: true
} satisfies Prisma.ProjectTaskSelect;

type AssistantTaskAuthorizationRecord = Prisma.ProjectTaskGetPayload<{
  select: typeof assistantTaskAuthorizationSelect;
}>;

type AuthorizedAssistantTaskTarget = {
  id: string;
  projectId: string;
  projectName: string;
  values: Record<string, unknown>;
  record?: AssistantTaskAuthorizationRecord;
};

type PreparedAssistantTaskMutation = {
  drafts: AssistantCreateTaskDraft[];
  targets: AuthorizedAssistantTaskTarget[];
};

type PreparedAssistantBugMutation = {
  actor: AssistantTaskActor;
  records: Array<{
    id: string;
    status: string;
    title: string;
  }>;
};

function normalizeCreateTaskDraftFromScope(
  draft: AssistantCreateTaskDraft,
  values: Record<string, unknown>
): AssistantCreateTaskDraft {
  return {
    ...draft,
    project: asText(values.project, draft.project),
    projectId: asText(values.projectId) || undefined,
    requirementId: asText(values.requirementId) || undefined,
    requirementTitle: asText(values.requirementTitle) || undefined,
    versionId: asText(values.versionId) || undefined,
    versionName: asText(values.versionName) || undefined
  };
}

function createTaskUpdateValues(
  actionType: AssistantBulkActionType,
  owner?: AssistantTaskOwnerDraft
) {
  if (actionType === "complete_tasks") {
    return { stage: "已完成" };
  }

  if (actionType === "assign_tasks" && owner) {
    return {
      owner: owner.owner,
      ownerAvatarUrl: owner.ownerAvatarUrl,
      ownerEmail: owner.ownerEmail,
      ownerMemberId: owner.ownerMemberId,
      ownerOpenId: owner.ownerOpenId,
      ownerUnionId: owner.ownerUnionId,
      ownerUserId: owner.ownerUserId
    };
  }

  return {};
}

/**
 * 任务批量动作在入队前和 worker 执行前共用同一道鉴权闸门。
 *
 * 对更新动作同时校验数据库当前的源项目/需求作用域，以及关联归一化后的目标作用域；
 * 对创建动作则先用真实版本、需求和项目关联归一化草稿。任意一条不通过都拒绝整个 job，
 * 避免在多项目批量操作中出现“有权部分被当成全部有权”的旁路。
 */
async function prepareAuthorizedAssistantTaskMutation(input: {
  actionType: AssistantBulkActionType;
  actorMemberId?: string | null;
  drafts?: AssistantCreateTaskDraft[];
  owner?: AssistantTaskOwnerDraft;
  recordIds: string[];
  workspaceId: string;
}): Promise<PreparedAssistantTaskMutation> {
  const actorMemberId = asText(input.actorMemberId);

  if (!actorMemberId) {
    throw new Error("批量任务动作缺少稳定的操作成员身份，请重新提交。");
  }

  if (input.actionType === "create_tasks") {
    const prisma = getPrismaClient();
    const members = await prisma.dashboardMember.findMany({
      where: { workspaceId: input.workspaceId }
    });
    const drafts = resolveCreateTaskDraftOwners({
      drafts: (input.drafts ?? []).slice(0, input.recordIds.length),
      members,
      requestedByMemberId: actorMemberId
    });

    if (!drafts.length || drafts.length !== input.recordIds.length) {
      throw new Error("批量创建任务的草稿与记录 ID 不一致，已拒绝入队。");
    }

    const scopes = await Promise.all(drafts.map((draft) => resolveProjectMutationScope({
      workspaceId: input.workspaceId,
      entityType: "task",
      action: "create",
      values: { ...draft }
    })));
    const normalizedDrafts = drafts.map((draft, index) => normalizeCreateTaskDraftFromScope(
      draft,
      scopes[index].values
    ));
    const authorizations = await authorizeProjectMutationsForActorMember({
      workspaceId: input.workspaceId,
      actorMemberId,
      mutations: scopes.map((scope) => ({
        projectId: scope.projectId,
        projectName: scope.projectName,
        entityType: "task",
        action: "create",
        values: scope.values
      }))
    });
    const deniedIndex = authorizations.findIndex((authorization) => !authorization.allowed || !authorization.projectId);

    if (deniedIndex >= 0) {
      const authorization = authorizations[deniedIndex];

      throw new Error(`无权创建任务「${normalizedDrafts[deniedIndex].title}」：${authorization.reason || "无法定位目标项目权限。"}`);
    }

    return {
      drafts: normalizedDrafts,
      targets: normalizedDrafts.map((draft, index) => ({
        id: input.recordIds[index],
        projectId: authorizations[index].projectId as string,
        projectName: scopes[index].projectName ?? draft.project,
        values: scopes[index].values
      }))
    };
  }

  const prisma = getPrismaClient();
  const records = await prisma.projectTask.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: { in: input.recordIds }
    },
    select: assistantTaskAuthorizationSelect
  });
  const recordById = new Map(records.map((record) => [record.id, record]));
  const orderedRecords = input.recordIds.map((id) => recordById.get(id));
  const missingId = input.recordIds.find((_, index) => !orderedRecords[index]);

  if (missingId) {
    throw new Error(`任务 ${missingId} 不存在或不属于当前工作区，已拒绝批量动作。`);
  }

  const concreteRecords = orderedRecords as AssistantTaskAuthorizationRecord[];
  const updateValues = createTaskUpdateValues(input.actionType, input.owner);
  const scopes = await Promise.all(concreteRecords.map((record) => resolveProjectMutationScope({
    workspaceId: input.workspaceId,
    entityType: "task",
    action: "update",
    record: record as unknown as Record<string, unknown>,
    values: updateValues
  })));
  const mutations = concreteRecords.flatMap((record, index) => {
    const scope = scopes[index];
    const targetRecord = {
      ...record,
      ...scope.values,
      // 任务转交时仍用旧 ownerMemberId 判断源权限，防止把目标负责人冒充为操作人本人。
      ownerMemberId: record.ownerMemberId
    };

    return [
      {
        entityType: "task" as const,
        action: "update" as const,
        record: record as unknown as Record<string, unknown>,
        values: updateValues
      },
      {
        projectId: scope.projectId,
        projectName: scope.projectName,
        entityType: "task" as const,
        action: "update" as const,
        record: targetRecord,
        values: scope.values
      }
    ];
  });
  const authorizations = await authorizeProjectMutationsForActorMember({
    workspaceId: input.workspaceId,
    actorMemberId,
    mutations
  });
  const deniedIndex = authorizations.findIndex((authorization) => !authorization.allowed || !authorization.projectId);

  if (deniedIndex >= 0) {
    const recordIndex = Math.floor(deniedIndex / 2);
    const boundary = deniedIndex % 2 === 0 ? "源" : "目标";
    const authorization = authorizations[deniedIndex];

    throw new Error(`无权更新任务「${concreteRecords[recordIndex].title}」的${boundary}项目/需求作用域：${authorization.reason || "权限校验未通过。"}`);
  }

  return {
    drafts: [],
    targets: concreteRecords.map((record, index) => ({
      id: record.id,
      projectId: authorizations[index * 2 + 1].projectId as string,
      projectName: scopes[index].projectName ?? record.project,
      values: scopes[index].values,
      record
    }))
  };
}

/**
 * Bug 仍沿用工作区角色矩阵；与任务一样，队列入队和 worker 执行都必须重新读取当前成员状态。
 * 不能只依赖 assistant tool 的 UI/runtime 门禁，否则成员排队期间被停用或降为 viewer 后旧 job 仍会关闭 Bug。
 */
async function prepareAuthorizedAssistantBugMutation(input: {
  actorMemberId?: string | null;
  recordIds: string[];
  workspaceId: string;
}): Promise<PreparedAssistantBugMutation> {
  const actorMemberId = asText(input.actorMemberId);

  if (!actorMemberId) {
    throw new Error("批量 Bug 动作缺少稳定的操作成员身份，请重新提交。");
  }

  const members = await readDashboardMembersDatabase(input.workspaceId);
  const actor = members.find(
    (member) => member.id === actorMemberId && member.workspaceId === input.workspaceId && member.status === "active"
  );

  if (!actor || !canPerformAction(getDashboardPermissions(actor), "bug:update")) {
    throw new Error(actor?.status === "disabled"
      ? "操作成员已被停用，已拒绝执行批量 Bug 动作。"
      : "当前成员没有编辑 Bug 的权限，已拒绝批量动作。");
  }

  const records = await getPrismaClient().bugReport.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: { in: input.recordIds }
    },
    select: {
      id: true,
      status: true,
      title: true
    }
  });
  const recordById = new Map(records.map((record) => [record.id, record]));
  const orderedRecords = input.recordIds.map((id) => recordById.get(id));
  const missingId = input.recordIds.find((_, index) => !orderedRecords[index]);

  if (missingId) {
    throw new Error(`Bug ${missingId} 不存在或不属于当前工作区，已拒绝批量动作。`);
  }

  return {
    actor: { id: actor.id, name: actor.name },
    records: orderedRecords as PreparedAssistantBugMutation["records"]
  };
}

function createWorkerId(prefix = "assistant-action") {
  return `${prefix}-${process.pid}-${randomUUID().slice(0, 8)}`;
}

type AssistantTaskActor = {
  id: string;
  name: string;
};

async function readActiveAssistantTaskActor(job: AssistantActionJob): Promise<AssistantTaskActor> {
  const actorMemberId = asText(job.requestedByMemberId);

  if (!actorMemberId) {
    throw new Error("批量任务动作缺少稳定的操作成员身份，请重新提交。");
  }

  const actor = await getPrismaClient().dashboardMember.findFirst({
    where: {
      id: actorMemberId,
      workspaceId: job.workspaceId,
      status: "active"
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!actor) {
    throw new Error("操作成员已被停用、移除或不属于当前工作区，已拒绝执行队列任务。");
  }

  return actor;
}

function createTaskActivityRow(input: {
  actor: AssistantTaskActor;
  detail: string;
  job: AssistantActionJob;
  target: AuthorizedAssistantTaskTarget;
  title: string;
  action: "created" | "updated";
}): Prisma.ProjectActivityCreateManyInput {
  return {
    workspaceId: input.job.workspaceId,
    projectId: input.target.projectId,
    actorMemberId: input.actor.id,
    actorName: input.actor.name,
    action: input.action,
    entityType: "task",
    entityId: input.target.id,
    target: `任务「${input.title}」`,
    detail: input.detail
  };
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
    const enqueueRunId = Date.now();

    // 批量动作本身只负责业务状态更新；RAG 索引仍走既有异步索引队列，避免把 embedding/Qdrant 写入绑回动作 worker。
    // 索引入队失败只影响后续知识检索新鲜度，不能反过来把已经成功的业务批量动作标记失败。
    await Promise.all(ids.map((id) =>
      queue.enqueue({
        workspaceId,
        entityType,
        entityId: id,
        jobType: "index_entity",
        // BullMQ 会短期保留已完成 job，固定 jobId 会吞掉下一次状态变更；批量动作每轮使用独立 key，
        // 后续 source contentHash 会负责跳过无变化内容，避免重复 embedding。
        dedupeKey: `${workspaceId}:${entityType}:${id}:index_entity:${enqueueRunId}`,
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

async function runCompleteTasksJob(
  job: AssistantActionJob,
  recordIds: string[],
  prepared: PreparedAssistantTaskMutation,
  actor: AssistantTaskActor
) {
  const prisma = getPrismaClient();
  const records = prepared.targets
    .map((target) => target.record)
    .filter((record): record is AssistantTaskAuthorizationRecord => Boolean(record));
  const existingIds = new Set(records.map((record) => record.id));
  const targetIds = records.filter((record) => record.stage !== "已完成").map((record) => record.id);
  const alreadyDoneIds = records.filter((record) => record.stage === "已完成").map((record) => record.id);
  const missingIds = recordIds.filter((id) => !existingIds.has(id));

  if (targetIds.length) {
    const targetIdSet = new Set(targetIds);
    const activityRows = prepared.targets
      .filter((target) => targetIdSet.has(target.id))
      .map((target) => createTaskActivityRow({
        actor,
        job,
        target,
        title: target.record?.title ?? target.id,
        action: "updated",
        detail: `通过 AI 助手将任务「${target.record?.title ?? target.id}」标记为已完成。`
      }));

    await prisma.$transaction(async (tx) => {
      // 任务状态与项目动态必须同一事务落库；如果鉴权后记录被并发删除，整批回滚而不留下假动态。
      const updated = await tx.projectTask.updateMany({
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
          stage: "已完成",
          completedAt: new Date().toISOString()
        },
      });

      if (updated.count !== targetIds.length) {
        throw new Error("任务在执行期间发生并发变更，已回滚本次批量完成。");
      }

      await tx.projectActivity.createMany({ data: activityRows });
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

async function runCloseBugsJob(
  job: AssistantActionJob,
  recordIds: string[],
  prepared: PreparedAssistantBugMutation
) {
  const prisma = getPrismaClient();
  const records = prepared.records;
  const existingIds = new Set(records.map((record) => record.id));
  const targetRecords = records.filter((record) => record.status !== "已关闭");
  const targetIds = targetRecords.map((record) => record.id);
  const alreadyClosedIds = records.filter((record) => record.status === "已关闭").map((record) => record.id);
  const missingIds = recordIds.filter((id) => !existingIds.has(id));
  const now = new Date();
  const operator = prepared.actor.name || "AI 项目助手";

  if (targetIds.length) {
    await prisma.$transaction(async (tx) => {
      // Bug 批量关闭同样用单次 updateMany；额外补充流转记录，保持 Bug 详情页可追踪状态变化。
      const updated = await tx.bugReport.updateMany({
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

      if (updated.count !== targetIds.length) {
        throw new Error("Bug 在执行期间发生并发变更，已回滚本次批量关闭。");
      }

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

async function runCreateTasksJob(
  job: AssistantActionJob,
  recordIds: string[],
  prepared: PreparedAssistantTaskMutation,
  actor: AssistantTaskActor
) {
  const prisma = getPrismaClient();
  const drafts = prepared.drafts.slice(0, recordIds.length);
  const now = new Date();

  if (!drafts.length) {
    throw new Error("批量创建任务缺少可写入的任务草稿。");
  }

  const activityRows = drafts.map((draft, index) => createTaskActivityRow({
    actor,
    job,
    target: prepared.targets[index],
    title: draft.title,
    action: "created",
    detail: `通过 AI 助手创建了任务「${draft.title}」。`
  }));

  // 批量创建绕开 /api/records，因此任务与项目动态在 worker 的同一事务写入；
  // 通知和索引仍是事务成功后的异步旁路，不反向拖住主数据落库。
  await prisma.$transaction(async (tx) => {
    const created = await tx.projectTask.createMany({
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
        projectId: draft.projectId ?? null,
        versionId: draft.versionId ?? null,
        versionName: draft.versionName ?? null,
        requirementId: draft.requirementId ?? null,
        requirementTitle: draft.requirementTitle ?? null,
        priority: normalizeTaskPriority(draft.priority),
        startDate: draft.startDate,
        dueDate: draft.dueDate,
        aiHint: draft.aiHint
      }))
    });

    if (created.count !== drafts.length) {
      throw new Error("批量创建任务写入数量不一致，已回滚项目动态。");
    }

    await tx.projectActivity.createMany({ data: activityRows });
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

async function runAssignTasksJob(
  job: AssistantActionJob,
  recordIds: string[],
  prepared: PreparedAssistantTaskMutation,
  actor: AssistantTaskActor
) {
  const prisma = getPrismaClient();
  const owner = asTaskOwnerDraft(job.result);

  if (!owner) {
    throw new Error("批量归属任务缺少目标负责人。");
  }

  const records = prepared.targets
    .map((target) => target.record)
    .filter((record): record is AssistantTaskAuthorizationRecord => Boolean(record));
  const existingIds = new Set(records.map((record) => record.id));
  const targetIds = records
    .filter((record) => record.owner !== owner.owner || record.ownerMemberId !== (owner.ownerMemberId ?? null))
    .map((record) => record.id);
  const alreadyAssignedIds = records
    .filter((record) => record.owner === owner.owner && record.ownerMemberId === (owner.ownerMemberId ?? null))
    .map((record) => record.id);
  const missingIds = recordIds.filter((id) => !existingIds.has(id));

  if (targetIds.length) {
    const targetIdSet = new Set(targetIds);
    const activityRows = prepared.targets
      .filter((target) => targetIdSet.has(target.id))
      .map((target) => createTaskActivityRow({
        actor,
        job,
        target,
        title: target.record?.title ?? target.id,
        action: "updated",
        detail: `通过 AI 助手将任务「${target.record?.title ?? target.id}」转交给 ${owner.owner}。`
      }));

    await prisma.$transaction(async (tx) => {
      // 负责人归属必须同步姓名、成员 id、邮箱和飞书身份，并与审计动态原子落库。
      const updated = await tx.projectTask.updateMany({
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

      if (updated.count !== targetIds.length) {
        throw new Error("任务在执行期间被删除，已回滚本次批量转交。");
      }

      await tx.projectActivity.createMany({ data: activityRows });
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

  const isTaskMutation = job.actionType === "complete_tasks"
    || job.actionType === "create_tasks"
    || job.actionType === "assign_tasks";
  // worker 不信任入队时的通过结果：这里重新读取 actor、项目权限和需求作用域，
  // 所以成员在队列等待期被停用/降为 viewer 后，旧 job 也会在任何业务写入前失败。
  const taskActor = isTaskMutation ? await readActiveAssistantTaskActor(job) : undefined;
  const preparedTaskMutation = isTaskMutation
    ? await prepareAuthorizedAssistantTaskMutation({
        actionType: job.actionType,
        actorMemberId: job.requestedByMemberId,
        drafts: job.actionType === "create_tasks" ? asCreateTaskDrafts(job.result) : undefined,
        owner: job.actionType === "assign_tasks" ? asTaskOwnerDraft(job.result) : undefined,
        recordIds,
        workspaceId: job.workspaceId
      })
    : undefined;
  const preparedBugMutation = job.actionType === "close_bugs"
    ? await prepareAuthorizedAssistantBugMutation({
        actorMemberId: job.requestedByMemberId,
        recordIds,
        workspaceId: job.workspaceId
      })
    : undefined;

  const result = job.actionType === "complete_tasks"
    ? await runCompleteTasksJob(job, recordIds, preparedTaskMutation!, taskActor!)
    : job.actionType === "create_tasks"
      ? await runCreateTasksJob(job, recordIds, preparedTaskMutation!, taskActor!)
      : job.actionType === "assign_tasks"
        ? await runAssignTasksJob(job, recordIds, preparedTaskMutation!, taskActor!)
        : await runCloseBugsJob(job, recordIds, preparedBugMutation!);
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
  const requestedByMemberId = asText(input.requestedByMemberId);

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

  if (!requestedByMemberId) {
    return {
      已执行: false,
      状态: "拒绝",
      总数: recordIds.length,
      成功数: 0,
      失败数: recordIds.length,
      业务结果: "缺少当前工作区成员身份，不能提交批量动作。"
    };
  }

  const isTaskMutation = input.actionType === "complete_tasks"
    || input.actionType === "create_tasks"
    || input.actionType === "assign_tasks";
  let normalizedDrafts = input.drafts;

  if (isTaskMutation) {
    if (input.targetType !== "task") {
      return {
        已执行: false,
        状态: "拒绝",
        总数: recordIds.length,
        成功数: 0,
        失败数: recordIds.length,
        业务结果: "任务动作与目标类型不一致，已拒绝入队。"
      };
    }

    try {
      // 入队前必须使用数据库真实任务/版本/需求归属逐条鉴权，不信任模型选出的 workspace 范围。
      const prepared = await prepareAuthorizedAssistantTaskMutation({
        actionType: input.actionType,
        actorMemberId: requestedByMemberId,
        drafts: input.drafts,
        owner: input.owner,
        recordIds,
        workspaceId: input.workspaceId
      });

      normalizedDrafts = input.actionType === "create_tasks" ? prepared.drafts : input.drafts;
    } catch (error) {
      return {
        已执行: false,
        状态: "拒绝",
        总数: recordIds.length,
        成功数: 0,
        失败数: recordIds.length,
        业务结果: error instanceof Error ? error.message : "批量任务鉴权失败。"
      };
    }
  } else if (input.actionType === "close_bugs") {
    if (input.targetType !== "bug") {
      return {
        已执行: false,
        状态: "拒绝",
        总数: recordIds.length,
        成功数: 0,
        失败数: recordIds.length,
        业务结果: "Bug 动作与目标类型不一致，已拒绝入队。"
      };
    }

    try {
      await prepareAuthorizedAssistantBugMutation({
        actorMemberId: requestedByMemberId,
        recordIds,
        workspaceId: input.workspaceId
      });
    } catch (error) {
      return {
        已执行: false,
        状态: "拒绝",
        总数: recordIds.length,
        成功数: 0,
        失败数: recordIds.length,
        业务结果: error instanceof Error ? error.message : "批量 Bug 鉴权失败。"
      };
    }
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
      requestedByMemberId,
      result: toJsonValue({
        drafts: normalizedDrafts ?? [],
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
