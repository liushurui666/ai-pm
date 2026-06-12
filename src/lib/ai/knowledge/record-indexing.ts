import type { DashboardEntityType, CreateRecordResult } from "@/types/records";
import { createIndexQueue } from "@/lib/ai/knowledge/index-queue";
import type { KnowledgeEntityType } from "@/lib/ai/knowledge/ports";
import type { Requirement } from "@/types/dashboard";

const indexableEntityTypes: Partial<Record<DashboardEntityType, KnowledgeEntityType>> = {
  task: "task",
  bug: "bug",
  requirementVersion: "version",
  requirement: "requirement"
};

function getRecordWorkspaceId(result: CreateRecordResult) {
  return "workspaceId" in result.record && typeof result.record.workspaceId === "string" ? result.record.workspaceId : undefined;
}

// 业务写接口只能做轻量入队，不能同步切 chunk、调 embedding 或写 Qdrant。
// 入队失败只写服务端日志，不影响用户保存业务记录，也不在前端暴露任何“同步状态”。
export async function enqueueRecordIndexJob(result: CreateRecordResult, reason: "created" | "updated") {
  const entityType = indexableEntityTypes[result.type];
  const workspaceId = getRecordWorkspaceId(result);

  if (!entityType || !workspaceId) {
    return;
  }

  const queue = createIndexQueue();

  await queue.enqueue({
    workspaceId,
    entityType,
    entityId: result.record.id,
    jobType: "index_entity",
    dedupeKey: `${workspaceId}:${entityType}:${result.record.id}:index_entity`,
    payload: {
      reason,
      dashboardType: result.type
    }
  });

  if (result.type === "requirement") {
    const requirement = result.record as Requirement;
    const documentLink = requirement.documentLink?.trim();

    if (documentLink) {
      await queue.enqueue({
        workspaceId,
        entityType: "feishu_doc",
        entityId: requirement.id,
        jobType: "sync_feishu",
        dedupeKey: `${workspaceId}:requirement:${requirement.id}:sync_feishu`,
        payload: {
          reason,
          requirementId: requirement.id,
          requirementTitle: requirement.title,
          versionId: requirement.versionId,
          versionName: requirement.versionName,
          project: requirement.project,
          documentLink
        }
      });
    }
  }
}

export async function safelyEnqueueRecordIndexJob(result: CreateRecordResult, reason: "created" | "updated") {
  try {
    await enqueueRecordIndexJob(result, reason);
  } catch (error) {
    console.error("[knowledge-index] enqueue failed", {
      error,
      reason,
      type: result.type,
      id: result.record.id
    });
  }
}

export async function enqueueRecordCleanupJob(input: {
  workspaceId?: string;
  type: DashboardEntityType;
  id: string;
}) {
  const entityType = indexableEntityTypes[input.type];

  if (!entityType || !input.workspaceId) {
    return;
  }

  const queue = createIndexQueue();

  await queue.enqueue({
    workspaceId: input.workspaceId,
    entityType,
    entityId: input.id,
    jobType: "cleanup_source",
    dedupeKey: `${input.workspaceId}:${entityType}:${input.id}:cleanup_source`,
    payload: {
      dashboardType: input.type
    }
  });
}

export async function safelyEnqueueRecordCleanupJob(input: {
  workspaceId?: string;
  type: DashboardEntityType;
  id: string;
}) {
  try {
    await enqueueRecordCleanupJob(input);
  } catch (error) {
    console.error("[knowledge-index] cleanup enqueue failed", {
      error,
      type: input.type,
      id: input.id
    });
  }
}
