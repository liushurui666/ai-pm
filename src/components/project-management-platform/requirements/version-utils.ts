import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";

export const requirementVersionColor: Record<RequirementVersion["status"], string> = {
  规划中: "blue",
  需求梳理: "gold",
  开发中: "cyan",
  验收中: "purple",
  进行中: "cyan",
  已发布: "green",
  已归档: "default"
};

export const requirementReadinessTip = "按该版本下「待上线 / 已上线」需求占总需求数计算，用于快速判断版本就绪度。";

// 版本统计集中在工具函数里，列表卡片和详情页可以共用同一套口径。
export function getVersionStats({
  bugs,
  requirements,
  tasks,
  version
}: {
  bugs: BugReport[];
  requirements: Requirement[];
  tasks: Task[];
  version: RequirementVersion;
}) {
  const scopedRequirements = requirements.filter((requirement) => requirement.versionId === version.id);
  const scopedTasks = tasks.filter((task) => task.versionId === version.id);
  const scopedBugs = bugs.filter((bug) => bug.versionId === version.id);
  const readyCount = scopedRequirements.filter(
    (requirement) => requirement.status === "待上线" || requirement.status === "已上线"
  ).length;
  const reviewCount = scopedRequirements.filter((requirement) => requirement.status === "评审中").length;
  const highPriorityCount = scopedRequirements.filter((requirement) => requirement.priority !== "P2").length;
  const milestones = version.milestones ?? [];
  const finishedMilestoneCount = milestones.filter((milestone) => milestone.status === "已完成").length;
  const progress = version.status === "已发布"
    ? 100
    : scopedRequirements.length
      ? Math.round((readyCount / scopedRequirements.length) * 100)
      : 0;

  return {
    scopedBugs,
    scopedRequirements,
    scopedTasks,
    milestones,
    finishedMilestoneCount,
    reviewCount,
    highPriorityCount,
    progress
  };
}

// 缺失或已删除父版本时降级为一级版本，避免旧数据把版本卡片藏起来。
export function getRootRequirementVersions(versions: RequirementVersion[]) {
  const versionIds = new Set(versions.map((version) => version.id));

  return versions.filter((version) => !version.parentVersionId || !versionIds.has(version.parentVersionId));
}

export function getChildRequirementVersions(versions: RequirementVersion[], parentVersionId: string) {
  return versions.filter((version) => version.parentVersionId === parentVersionId);
}

export function getRequirementVersionDepth(version: RequirementVersion, versions: RequirementVersion[]) {
  let depth = 0;
  let parentId = version.parentVersionId;
  const visited = new Set<string>([version.id]);

  while (parentId) {
    if (visited.has(parentId)) {
      break;
    }

    const parent = versions.find((item) => item.id === parentId);

    if (!parent) {
      break;
    }

    visited.add(parent.id);
    depth += 1;
    parentId = parent.parentVersionId;
  }

  return depth;
}

// Select 使用纯字符串标签，缩进只辅助辨认父子层级，不改变真实版本名称。
export function formatRequirementVersionOptionLabel(version: RequirementVersion, versions: RequirementVersion[]) {
  const depth = getRequirementVersionDepth(version, versions);
  const prefix = depth ? `${"  ".repeat(depth)}子版本：` : "";

  return `${prefix}${version.name} · ${version.project}`;
}

export function getVersionOwnerNames(version: RequirementVersion) {
  return [
    { label: "产品负责人", value: version.productOwner },
    { label: "UI 负责人", value: version.uiOwner },
    { label: "开发负责人", value: version.devOwner }
  ].filter((owner) => owner.value);
}
