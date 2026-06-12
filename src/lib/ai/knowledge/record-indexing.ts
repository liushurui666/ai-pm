import type { DashboardEntityType, CreateRecordResult } from "@/types/records";
import { createMySqlIndexQueue } from "@/lib/ai/knowledge/mysql-index-queue";
import type { KnowledgeEntityType } from "@/lib/ai/knowledge/ports";

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

  const queue = createMySqlIndexQueue();

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
