export type RequirementVersionReferenceCounts = {
  requirements: number;
  tasks: number;
  bugs: number;
};

/**
 * 版本删除只有在仍被需求、任务或 Bug 引用时才需要寻找迁移目标。
 * 子版本只需解除 parentVersionId，不构成业务记录迁移，因此不计入这里。
 */
export function countRequirementVersionReferences(counts: RequirementVersionReferenceCounts) {
  return counts.requirements + counts.tasks + counts.bugs;
}

/**
 * 把删除策略保持成纯函数，避免“最后一个空版本”被旧的无条件 fallback 检查错误阻断。
 */
export function requiresRequirementVersionFallback(counts: RequirementVersionReferenceCounts) {
  return countRequirementVersionReferences(counts) > 0;
}

/**
 * 系统兜底版本具有确定语义，可以优先使用；没有系统兜底时只有唯一兄弟候选才允许自动迁移。
 * 返回 ambiguous 而不是在纯函数中抛错，便于 API 层给出贴合当前操作的中文提示。
 */
export function selectAutomaticRequirementVersionFallback<T>(
  systemFallback: T | undefined,
  siblingCandidates: readonly T[]
) {
  if (systemFallback) {
    return { ambiguous: false, fallback: systemFallback };
  }

  return {
    ambiguous: siblingCandidates.length > 1,
    fallback: siblingCandidates.length === 1 ? siblingCandidates[0] : undefined
  };
}
