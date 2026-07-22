export type ProjectRelationTarget = {
  id: string;
  name: string;
};

export type ProjectRelationCandidate = {
  relation: string;
  project?: ProjectRelationTarget;
};

export class ProjectMutationScopeError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "ProjectMutationScopeError";
  }
}

/**
 * 旧记录只有项目名称时，候选必须严格唯一才能作为稳定 projectId 的替代依据。
 * 这里保持为纯函数，供鉴权、角色派生、活动审计和 smoke 共同复用；0 条代表不存在，2 条及以上代表名称歧义。
 */
export function selectUniqueProjectNameCandidate<T>(candidates: readonly T[]) {
  return candidates.length === 1 ? candidates[0] : undefined;
}

// 所有显式关联都必须收敛到同一个稳定 projectId；项目名称只用于错误提示和旧数据回填。
export function resolveSingleProjectRelationTarget(
  candidates: ProjectRelationCandidate[],
  options: { requireTarget?: boolean } = {}
) {
  const concreteCandidates = candidates.filter(
    (candidate): candidate is ProjectRelationCandidate & { project: ProjectRelationTarget } => Boolean(candidate.project)
  );
  const target = concreteCandidates[0]?.project;
  const conflictingCandidate = target
    ? concreteCandidates.find((candidate) => candidate.project.id !== target.id)
    : undefined;

  if (target && conflictingCandidate) {
    const relationSummary = concreteCandidates
      .map((candidate) => `${candidate.relation}「${candidate.project.name}」`)
      .join("、");

    throw new ProjectMutationScopeError(`项目关联不一致：${relationSummary}，请统一后再保存。`);
  }

  if (!target && options.requireTarget !== false) {
    throw new ProjectMutationScopeError("无法定位记录所属项目，请选择有效的项目或项目版本。");
  }

  return target;
}
