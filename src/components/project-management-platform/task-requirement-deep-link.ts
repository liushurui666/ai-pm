import type { Project, Requirement, RequirementVersion } from "@/types/dashboard";

export type TaskRequirementDeepLinkState = {
  requirementId?: string;
  projectId?: string;
  versionId?: string;
};

type ProjectIdentity = Pick<Project, "id" | "name">;
type RequirementIdentity = Pick<Requirement, "id" | "project" | "projectId" | "versionId">;
type RequirementVersionIdentity = Pick<RequirementVersion, "id" | "project" | "projectId">;

function normalizeProjectName(value?: string) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

// 新数据的 projectId 是权威关系；只有历史记录没有 ID 时，才允许在当前可见项目内按唯一名称回退。
// 同名项目不做猜测，否则分享链接可能将需求筛选回放到另一个项目。
function resolveVisibleProjectId(
  record: { project?: string; projectId?: string },
  projects: ProjectIdentity[]
) {
  if (record.projectId) {
    return projects.some((project) => project.id === record.projectId) ? record.projectId : undefined;
  }

  const normalizedName = normalizeProjectName(record.project);
  const candidates = projects.filter((project) => normalizeProjectName(project.name) === normalizedName);

  return normalizedName && candidates.length === 1 ? candidates[0]?.id : undefined;
}

// URL 只解析为候选状态，不把查询参数当成授权结果；真实可见性由 resolve 使用当前 dashboard 数据再校验。
export function readTaskRequirementDeepLink(search: string): TaskRequirementDeepLinkState {
  const params = new URLSearchParams(search);

  return {
    requirementId: params.get("requirementId")?.trim() || undefined,
    projectId: params.get("projectId")?.trim() || undefined,
    versionId: params.get("versionId")?.trim() || undefined
  };
}

// 需求 ID 是筛选主键，projectId/versionId 是防串数据的关系快照。
// 伴随 ID 缺失可以从当前可见需求补齐，但只要显式传入且与真实归属冲突，就将整个筛选视为无效。
export function resolveTaskRequirementDeepLink(input: {
  requested: TaskRequirementDeepLinkState;
  projects: ProjectIdentity[];
  requirements: RequirementIdentity[];
  versions: RequirementVersionIdentity[];
}): TaskRequirementDeepLinkState {
  if (!input.requested.requirementId) {
    return {};
  }

  const requirement = input.requirements.find((candidate) => candidate.id === input.requested.requirementId);

  if (!requirement) {
    return {};
  }

  const projectId = resolveVisibleProjectId(requirement, input.projects);

  if (!projectId || (input.requested.projectId && input.requested.projectId !== projectId)) {
    return {};
  }

  const version = requirement.versionId
    ? input.versions.find((candidate) => candidate.id === requirement.versionId)
    : undefined;
  const versionProjectId = version ? resolveVisibleProjectId(version, input.projects) : undefined;
  const isWorkspaceBacklogVersion = Boolean(
    version
    && !version.projectId
    && normalizeProjectName(version.project) === normalizeProjectName("跨项目")
  );

  // 需求指向了已删除、不可见或属于其他项目的版本时，不能退化成项目级筛选。
  // 系统“未规划需求池”是工作区级跨项目版本，它不与需求的稳定 projectId 冲突，需要作为明确特例保留。
  if (requirement.versionId && (!version || (!isWorkspaceBacklogVersion && versionProjectId !== projectId))) {
    return {};
  }

  const versionId = version?.id;

  if (input.requested.versionId && input.requested.versionId !== versionId) {
    return {};
  }

  return {
    requirementId: requirement.id,
    projectId,
    versionId
  };
}

// 任务和项目详情共用 projectId/versionId，因此写入任务筛选前必须整体清理旧上下文。
// 这也保证手动清除需求筛选时，不会在 URL 中遗留看似仍生效的项目或版本 ID。
export function applyTaskRequirementDeepLinkToUrl(
  url: URL,
  state?: TaskRequirementDeepLinkState
) {
  url.searchParams.delete("requirementId");
  url.searchParams.delete("projectId");
  url.searchParams.delete("versionId");
  url.searchParams.delete("detailTab");

  if (!state?.requirementId || !state.projectId) {
    return url;
  }

  url.searchParams.set("requirementId", state.requirementId);
  url.searchParams.set("projectId", state.projectId);

  if (state.versionId) {
    url.searchParams.set("versionId", state.versionId);
  }

  return url;
}
