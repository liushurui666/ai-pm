import { getWorkspaceAccessContext } from "@/data/local-dashboard";
import { getPrismaClient } from "@/lib/database/prisma";
import { asNonEmptyString, mapProjectActivityRecord } from "@/lib/project-management/normalizers";
import { selectUniqueProjectNameCandidate } from "@/lib/project-management/record-scope-core";
import type {
  RecordProjectActivityInput,
  RecordProjectActivityResult
} from "@/lib/project-management/types";

const entityLabels: Record<RecordProjectActivityInput["entityType"], string> = {
  project: "项目",
  requirementVersion: "版本/迭代",
  requirement: "需求",
  task: "任务",
  risk: "风险",
  bug: "Bug"
};

const activityActions: Record<RecordProjectActivityInput["action"], { key: string; label: string }> = {
  create: { key: "created", label: "创建了" },
  update: { key: "updated", label: "更新了" },
  delete: { key: "deleted", label: "删除了" }
};

function resolveActivityTarget(input: RecordProjectActivityInput) {
  const entityLabel = entityLabels[input.entityType];
  const name = asNonEmptyString(input.record.title) ?? asNonEmptyString(input.record.name);

  return name ? `${entityLabel}「${name}」` : `${entityLabel} ${asNonEmptyString(input.record.id) ?? ""}`.trim();
}

/**
 * 为真实业务变更追加项目时间线。
 *
 * 这个 helper 故意捕获所有异常并返回 recorded=false：审计日志是主业务的旁路能力，
 * 数据库暂时故障或旧数据无法定位项目时，不得反向回滚已成功的项目/需求/任务写入。
 */
export async function recordProjectActivityForMutation(
  input: RecordProjectActivityInput
): Promise<RecordProjectActivityResult> {
  const recordWorkspaceId = asNonEmptyString(input.record.workspaceId);
  const requestedWorkspaceId = input.workspaceId ?? recordWorkspaceId;
  const entityId = asNonEmptyString(input.record.id);

  if (!entityId) {
    return { recorded: false, error: "缺少变更记录 id，未写入项目活动。" };
  }

  try {
    const accessContext = await getWorkspaceAccessContext(input.user ?? undefined, requestedWorkspaceId);
    const workspaceId = accessContext.currentWorkspace.id;
    const recordProjectId = asNonEmptyString(input.record.projectId);
    const projectId = input.projectId ?? recordProjectId ?? (input.entityType === "project" ? entityId : undefined);
    const projectName = input.projectName
      ?? asNonEmptyString(input.record.project)
      ?? (input.entityType === "project" ? asNonEmptyString(input.record.name) : undefined);
    const prisma = getPrismaClient();
    let project = projectId
      ? await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true, name: true } })
      : undefined;

    // 新 projectId 可能因历史手工数据不正确而查不到；名称回退必须在同工作区严格唯一，
    // 否则跳过旁路审计，也不能把一次真实变更错误记到某个同名项目。
    if (!project && projectName) {
      const candidates = await prisma.project.findMany({
        where: { workspaceId, name: projectName },
        select: { id: true, name: true },
        take: 2
      });

      project = selectUniqueProjectNameCandidate(candidates);
    }

    if (!project) {
      const error = "无法定位变更记录所属项目，未写入项目活动。";
      console.warn("[project-management] activity skipped", {
        action: input.action,
        entityId,
        entityType: input.entityType,
        projectId,
        workspaceId
      });
      return { recorded: false, error };
    }

    const target = resolveActivityTarget(input);
    const action = activityActions[input.action];
    const actorMember = accessContext.currentMember;
    const activity = await prisma.projectActivity.create({
      data: {
        workspaceId,
        projectId: project.id,
        actorMemberId: actorMember?.id ?? null,
        actorName: actorMember?.name || input.user?.name || "系统",
        action: action.key,
        entityType: input.entityType,
        entityId,
        target,
        detail: input.detail?.trim() || `${action.label}${target}。`
      }
    });

    return { recorded: true, activity: mapProjectActivityRecord(activity) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.warn("[project-management] failed to record activity", {
      action: input.action,
      entityId,
      entityType: input.entityType,
      message
    });
    return { recorded: false, error: `项目活动记录失败：${message}` };
  }
}
