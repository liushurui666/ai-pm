import dayjs from "dayjs";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import { taskStages } from "@/components/project-management-platform/constants";
import { getRequirementVersionDepth } from "@/components/project-management-platform/requirements/version-utils";

export const allVersionDashboardFilterValue = "全部";

export type VersionDashboardSnapshot = {
  blockerBugCount: number;
  bugCount: number;
  daysToRelease: number;
  deliveryScore: number;
  depth: number;
  doneMilestoneCount: number;
  doneTaskCount: number;
  id: string;
  milestoneCompletion: number;
  milestoneCount: number;
  name: string;
  openBugCount: number;
  overdueTaskCount: number;
  parentVersionName?: string;
  productOwner?: string;
  project: string;
  readiness: number;
  releaseDate: string;
  requirementCount: number;
  scopeVersionIds: string[];
  startDate: string;
  status: RequirementVersion["status"];
  taskCompletion: number;
  taskCount: number;
  taskStageCounts: Record<Task["stage"], number>;
  uiOwner?: string;
  devOwner?: string;
  version: RequirementVersion;
};

export type VersionOwnerLoad = {
  avatarUrl?: string;
  bugCount: number;
  name: string;
  openTaskCount: number;
  roleCount: number;
  versionCount: number;
};

export type VersionMilestoneSignal = {
  date: string;
  owner: string;
  status: string;
  title: string;
  versionId: string;
  versionName: string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getPercent(part: number, total: number, emptyValue = 0) {
  return total ? clampPercent((part / total) * 100) : emptyValue;
}

// 父版本在大屏里需要自然承接子版本数据，避免版本树汇总和版本详情的单点口径混淆。
function collectVersionScopeIds(version: RequirementVersion, versions: RequirementVersion[]) {
  const scopeIds = new Set<string>([version.id]);
  const queue = [version.id];

  while (queue.length) {
    const currentId = queue.shift();
    const children = versions.filter((item) => item.parentVersionId === currentId);

    for (const child of children) {
      if (!scopeIds.has(child.id)) {
        scopeIds.add(child.id);
        queue.push(child.id);
      }
    }
  }

  return Array.from(scopeIds);
}

// 交付分以需求就绪、任务完成、里程碑完成和缺陷健康混合计算，给大屏一个可排序的统一信号。
function getDeliveryScore({
  milestoneCompletion,
  openBugCount,
  overdueTaskCount,
  readiness,
  taskCompletion
}: {
  milestoneCompletion: number;
  openBugCount: number;
  overdueTaskCount: number;
  readiness: number;
  taskCompletion: number;
}) {
  const bugHealth = Math.max(0, 100 - openBugCount * 12 - overdueTaskCount * 10);

  return clampPercent(readiness * 0.34 + taskCompletion * 0.34 + milestoneCompletion * 0.2 + bugHealth * 0.12);
}

// 版本大屏的主聚合：所有展示组件都依赖这个快照，避免每块面板各算一遍口径。
export function createVersionDashboardSnapshots({
  bugs,
  requirements,
  tasks,
  versions
}: {
  bugs: BugReport[];
  requirements: Requirement[];
  tasks: Task[];
  versions: RequirementVersion[];
}) {
  const today = dayjs().startOf("day");

  return versions
    .map<VersionDashboardSnapshot>((version) => {
      const scopeVersionIds = collectVersionScopeIds(version, versions);
      const scopedRequirements = requirements.filter((requirement) => requirement.versionId && scopeVersionIds.includes(requirement.versionId));
      const scopedTasks = tasks.filter((task) => task.versionId && scopeVersionIds.includes(task.versionId));
      const scopedBugs = bugs.filter((bug) => bug.versionId && scopeVersionIds.includes(bug.versionId));
      const readyRequirementCount = scopedRequirements.filter(
        (requirement) => requirement.status === "待上线" || requirement.status === "已上线"
      ).length;
      const taskStageCounts = taskStages.reduce<Record<Task["stage"], number>>((counts, stage) => {
        counts[stage] = scopedTasks.filter((task) => task.stage === stage).length;

        return counts;
      }, {
        待处理: 0,
        进行中: 0,
        评审中: 0,
        已完成: 0
      });
      const milestoneCount = scopeVersionIds
        .map((id) => versions.find((item) => item.id === id))
        .filter(Boolean)
        .flatMap((item) => item?.milestones ?? []).length;
      const doneMilestoneCount = scopeVersionIds
        .map((id) => versions.find((item) => item.id === id))
        .filter(Boolean)
        .flatMap((item) => item?.milestones ?? [])
        .filter((milestone) => milestone.status === "已完成").length;
      const overdueTaskCount = scopedTasks.filter(
        (task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(today)
      ).length;
      const openBugCount = scopedBugs.filter((bug) => bug.status !== "已关闭").length;
      const blockerBugCount = scopedBugs.filter((bug) => bug.status !== "已关闭" && bug.severity === "阻塞").length;
      const taskCompletion = getPercent(taskStageCounts.已完成, scopedTasks.length);
      const readiness = getPercent(readyRequirementCount, scopedRequirements.length, version.status === "已发布" ? 100 : 0);
      const milestoneCompletion = getPercent(doneMilestoneCount, milestoneCount, version.status === "已发布" ? 100 : 0);

      return {
        blockerBugCount,
        bugCount: scopedBugs.length,
        daysToRelease: dayjs(version.releaseDate).diff(today, "day"),
        deliveryScore: getDeliveryScore({
          milestoneCompletion,
          openBugCount,
          overdueTaskCount,
          readiness,
          taskCompletion
        }),
        depth: getRequirementVersionDepth(version, versions),
        doneMilestoneCount,
        doneTaskCount: taskStageCounts.已完成,
        id: version.id,
        milestoneCompletion,
        milestoneCount,
        name: version.name,
        openBugCount,
        overdueTaskCount,
        parentVersionName: version.parentVersionName,
        productOwner: version.productOwner,
        project: version.project,
        readiness,
        releaseDate: version.releaseDate,
        requirementCount: scopedRequirements.length,
        scopeVersionIds,
        startDate: version.startDate,
        status: version.status,
        taskCompletion,
        taskCount: scopedTasks.length,
        taskStageCounts,
        uiOwner: version.uiOwner,
        devOwner: version.devOwner,
        version
      };
    })
    .sort((left, right) => {
      const statusPriority = Number(left.status === "进行中") - Number(right.status === "进行中");

      return statusPriority * -1 || right.deliveryScore - left.deliveryScore || dayjs(left.releaseDate).valueOf() - dayjs(right.releaseDate).valueOf();
    });
}

// 负责人负载混合版本角色、未完成任务和未关闭 Bug，用于发现某个角色横跨太多版本。
export function createVersionOwnerLoads(snapshots: VersionDashboardSnapshot[], tasks: Task[], bugs: BugReport[]) {
  const loads = new Map<string, VersionOwnerLoad>();
  const countedBugIds = new Set<string>();
  const countedTaskIds = new Set<string>();

  function ensureOwner(name?: string, avatarUrl?: string) {
    const ownerName = name?.trim();

    if (!ownerName) {
      return null;
    }

    const current = loads.get(ownerName) ?? {
      avatarUrl,
      bugCount: 0,
      name: ownerName,
      openTaskCount: 0,
      roleCount: 0,
      versionCount: 0
    };

    if (!current.avatarUrl && avatarUrl) {
      current.avatarUrl = avatarUrl;
    }

    loads.set(ownerName, current);

    return current;
  }

  for (const snapshot of snapshots) {
    const roleOwners = [snapshot.productOwner, snapshot.uiOwner, snapshot.devOwner].filter(Boolean) as string[];
    const versionOwners = new Set<string>();

    for (const ownerName of roleOwners) {
      const owner = ensureOwner(ownerName);

      if (owner) {
        owner.roleCount += 1;
        versionOwners.add(owner.name);
      }
    }

    for (const ownerName of versionOwners) {
      const owner = loads.get(ownerName);

      if (owner) {
        owner.versionCount += 1;
      }
    }

    for (const task of tasks.filter((task) => task.versionId && snapshot.scopeVersionIds.includes(task.versionId))) {
      if (countedTaskIds.has(task.id)) {
        continue;
      }

      countedTaskIds.add(task.id);
      const owner = ensureOwner(task.owner, task.ownerAvatarUrl);

      if (owner && task.stage !== "已完成") {
        owner.openTaskCount += 1;
      }
    }

    for (const bug of bugs.filter((bug) => bug.versionId && snapshot.scopeVersionIds.includes(bug.versionId))) {
      if (countedBugIds.has(bug.id)) {
        continue;
      }

      countedBugIds.add(bug.id);
      const owner = ensureOwner(bug.owner, bug.ownerAvatarUrl);

      if (owner && bug.status !== "已关闭") {
        owner.bugCount += 1;
      }
    }
  }

  return Array.from(loads.values()).sort(
    (left, right) =>
      right.openTaskCount - left.openTaskCount ||
      right.versionCount - left.versionCount ||
      left.name.localeCompare(right.name, "zh-CN")
  );
}

// 近期里程碑直接从版本定义读取，按照日期排序后给大屏底部提供交付节奏。
export function createVersionMilestoneSignals(snapshots: VersionDashboardSnapshot[]) {
  return snapshots
    .flatMap<VersionMilestoneSignal>((snapshot) =>
      snapshot.version.milestones.map((milestone) => ({
        date: milestone.dueDate,
        owner: milestone.owner,
        status: milestone.status,
        title: milestone.title,
        versionId: snapshot.id,
        versionName: snapshot.name
      }))
    )
    .sort((left, right) => dayjs(left.date).valueOf() - dayjs(right.date).valueOf());
}
