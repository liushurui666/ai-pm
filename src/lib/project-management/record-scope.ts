import { getPrismaClient } from "@/lib/database/prisma";
import {
  ProjectMutationScopeError,
  resolveSingleProjectRelationTarget,
  type ProjectRelationCandidate,
  type ProjectRelationTarget
} from "@/lib/project-management/record-scope-core";
import { asNonEmptyString } from "@/lib/project-management/normalizers";
import {
  defaultProjectDeliveryLabels,
  findDuplicateDeliveryMilestoneLabelId,
  normalizeProjectDeliveryLabelCatalog,
  remapVersionDeliveryMilestones,
  scopeDeliveryLabelCatalogToVersion
} from "@/data/project-delivery-labels";
import type { ProjectDeliveryLabel } from "@/types/dashboard";
import type { ProjectMutationAction, ProjectMutationEntityType } from "@/lib/project-management/types";

type ResolveProjectMutationScopeInput = {
  workspaceId: string;
  entityType: ProjectMutationEntityType;
  action: ProjectMutationAction;
  record?: Record<string, unknown> | null;
  values: Record<string, unknown>;
};

type VersionReference = {
  id: string;
  name: string;
  project?: ProjectRelationTarget;
};

type RequirementReference = {
  id: string;
  title: string;
  versionId?: string;
  versionName?: string;
  project: ProjectRelationTarget;
};

export type ResolvedProjectMutationScope = {
  workspaceId: string;
  projectId?: string;
  projectName?: string;
  values: Record<string, unknown>;
};

const neutralProjectNames = new Set(["跨项目", "未关联项目"]);

function hasOwn(values: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function selectedReferenceId(
  record: Record<string, unknown>,
  values: Record<string, unknown>,
  key: string
) {
  return hasOwn(values, key) ? asNonEmptyString(values[key]) : asNonEmptyString(record[key]);
}

async function findProjectById(workspaceId: string, projectId: string, relation: string) {
  const project = await getPrismaClient().project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, name: true }
  });

  if (!project) {
    throw new ProjectMutationScopeError(`${relation}引用的项目不存在或不属于当前工作区。`);
  }

  return project;
}

async function findProjectByName(workspaceId: string, projectName: string, relation: string) {
  if (neutralProjectNames.has(projectName)) {
    return undefined;
  }

  const projects = await getPrismaClient().project.findMany({
    where: { name: projectName, workspaceId },
    select: { id: true, name: true },
    take: 2
  });

  if (!projects.length) {
    throw new ProjectMutationScopeError(`${relation}引用的项目不存在或不属于当前工作区。`);
  }

  if (projects.length > 1) {
    throw new ProjectMutationScopeError(`${relation}仅提供了重复项目名，请改用稳定的 projectId。`);
  }

  return projects[0];
}

async function resolveStoredProjectReference(input: {
  workspaceId: string;
  projectId?: string;
  projectName?: string;
  relation: string;
}) {
  if (input.projectId) {
    return findProjectById(input.workspaceId, input.projectId, input.relation);
  }

  return input.projectName
    ? findProjectByName(input.workspaceId, input.projectName, input.relation)
    : undefined;
}

async function resolveSubmittedProjectReference(input: {
  workspaceId: string;
  values: Record<string, unknown>;
}) {
  const projectId = asNonEmptyString(input.values.projectId);
  const projectName = asNonEmptyString(input.values.project);

  if (projectId) {
    const project = await findProjectById(input.workspaceId, projectId, "projectId");

    // ID 是唯一归属，名称只是可能因项目改名而过期的冗余字段；后续统一回填数据库中的真实名称。
    return project;
  }

  if (projectName && !neutralProjectNames.has(projectName)) {
    return findProjectByName(input.workspaceId, projectName, "project");
  }

  return undefined;
}

async function resolveVersionReference(workspaceId: string, versionId: string, relation: string) {
  const version = await getPrismaClient().requirementVersion.findFirst({
    where: { id: versionId, workspaceId },
    select: { id: true, name: true, project: true, projectId: true }
  });

  if (!version) {
    throw new ProjectMutationScopeError(`${relation}引用的项目/版本不存在或不属于当前工作区。`);
  }

  const project = await resolveStoredProjectReference({
    workspaceId,
    projectId: version.projectId ?? undefined,
    projectName: version.project,
    relation
  });

  return {
    id: version.id,
    name: version.name,
    project
  } satisfies VersionReference;
}

async function resolveRequirementReference(workspaceId: string, requirementId: string) {
  const requirement = await getPrismaClient().requirement.findFirst({
    where: { id: requirementId, workspaceId },
    select: {
      id: true,
      title: true,
      project: true,
      projectId: true,
      versionId: true,
      versionName: true
    }
  });

  if (!requirement) {
    throw new ProjectMutationScopeError("requirementId 引用的需求不存在或不属于当前工作区。");
  }

  const requirementProject = await resolveStoredProjectReference({
    workspaceId,
    projectId: requirement.projectId ?? undefined,
    projectName: requirement.project,
    relation: "requirementId"
  });
  const requirementVersion = requirement.versionId
    ? await resolveVersionReference(workspaceId, requirement.versionId, "需求所属 versionId")
    : undefined;
  const project = resolveSingleProjectRelationTarget([
    { relation: "requirementId", project: requirementProject },
    { relation: "需求所属 versionId", project: requirementVersion?.project }
  ]);

  return {
    id: requirement.id,
    title: requirement.title,
    versionId: requirementVersion?.id ?? requirement.versionId ?? undefined,
    versionName: requirementVersion?.name ?? requirement.versionName ?? undefined,
    project
  } satisfies RequirementReference;
}

async function ensureVersionParentDoesNotCreateCycle(
  workspaceId: string,
  versionId: string | undefined,
  parentVersionId: string
) {
  if (!versionId) {
    return;
  }

  const versions = await getPrismaClient().requirementVersion.findMany({
    where: { workspaceId },
    select: { id: true, parentVersionId: true }
  });
  const parentById = new Map(versions.map((version) => [version.id, version.parentVersionId]));
  const visited = new Set<string>();
  let cursor: string | null | undefined = parentVersionId;

  // UI 的禁选只能改善体验；服务端沿父链检查，防止 API 把版本挂到任意层级的后代形成环。
  while (cursor && !visited.has(cursor)) {
    if (cursor === versionId) {
      throw new ProjectMutationScopeError("项目/版本不能把自身或后代设置为父级。");
    }

    visited.add(cursor);
    cursor = parentById.get(cursor);
  }
}

function ensureRecordWorkspace(input: ResolveProjectMutationScopeInput) {
  const recordWorkspaceId = asNonEmptyString(input.record?.workspaceId);

  if (input.action !== "create" && recordWorkspaceId !== input.workspaceId) {
    throw new ProjectMutationScopeError("目标记录不属于当前工作区，已拒绝写操作。", 403);
  }
}

function prospectiveRecord(input: ResolveProjectMutationScopeInput) {
  return {
    ...(input.record ?? {}),
    ...input.values
  };
}

function normalizeSubmittedVersionDeliveryLabelCatalog(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProjectMutationScopeError("版本交付节点标签目录必须是数组。");
  }

  if (value.length > 30) {
    throw new ProjectMutationScopeError("单个版本最多维护 30 个交付节点标签。");
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProjectMutationScopeError(`第 ${index + 1} 个交付节点标签格式不正确。`);
    }

    const label = item as Record<string, unknown>;
    const id = asNonEmptyString(label.id);
    const name = asNonEmptyString(label.name);

    if (!id || id.length > 120) {
      throw new ProjectMutationScopeError(`第 ${index + 1} 个交付节点标签缺少有效 ID。`);
    }

    if (!name || name.length > 40) {
      throw new ProjectMutationScopeError(`第 ${index + 1} 个交付节点标签名称不能为空且最多 40 个字符。`);
    }

    const normalizedName = name.toLocaleLowerCase("zh-CN");

    if (seenIds.has(id)) {
      throw new ProjectMutationScopeError(`交付节点标签 ID「${id}」重复。`);
    }

    if (seenNames.has(normalizedName)) {
      throw new ProjectMutationScopeError(`交付节点标签名称「${name}」重复。`);
    }

    seenIds.add(id);
    seenNames.add(normalizedName);
  });

  return normalizeProjectDeliveryLabelCatalog(value, { fallbackToDefaults: false });
}

async function ensureVersionDeliveryLabelIdsAreNotForeign(input: {
  workspaceId: string;
  currentVersionId?: string;
  currentCatalog: readonly ProjectDeliveryLabel[];
  submittedCatalog: readonly ProjectDeliveryLabel[];
}) {
  const currentIds = new Set(input.currentCatalog.map((label) => label.id));
  const systemDefaultIds = new Set(defaultProjectDeliveryLabels.map((label) => label.id));
  const candidateIds = new Set(
    input.submittedCatalog
      .map((label) => label.id)
      // 迁移前的系统默认 ID 可能同时存在多个历史版本；新增自定义 ID 则必须全版本唯一。
      .filter((id) => !currentIds.has(id) && !systemDefaultIds.has(id))
  );

  if (!candidateIds.size) {
    return;
  }

  const otherVersions = await getPrismaClient().requirementVersion.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.currentVersionId ? { id: { not: input.currentVersionId } } : {})
    },
    select: { id: true, deliveryLabelCatalog: true }
  });

  for (const version of otherVersions) {
    const foreignLabel = normalizeProjectDeliveryLabelCatalog(
      version.deliveryLabelCatalog,
      { fallbackToDefaults: false }
    ).find((label) => candidateIds.has(label.id));

    if (foreignLabel) {
      throw new ProjectMutationScopeError(
        `标签「${foreignLabel.name}」属于其他版本，不能复用其 labelId。`,
        409
      );
    }
  }
}

function ensureCatalogUsesSoftDeleteForExistingLabels(
  currentCatalog: readonly ProjectDeliveryLabel[],
  submittedCatalog: readonly ProjectDeliveryLabel[]
) {
  const submittedIds = new Set(submittedCatalog.map((label) => label.id));
  const removed = currentCatalog.find((label) => !submittedIds.has(label.id));

  if (removed) {
    throw new ProjectMutationScopeError(
      `历史标签「${removed.name}」不能硬删除，请保留 ID 并标记 deleted=true。`,
      409
    );
  }
}

function normalizeVersionMilestoneLabels(input: {
  action: ProjectMutationAction;
  catalogValue: unknown;
  previousMilestones: unknown;
  submittedMilestones: unknown;
}) {
  if (!Array.isArray(input.submittedMilestones)) {
    throw new ProjectMutationScopeError("版本交付节点必须是数组。");
  }

  const submittedDuplicateLabelId = findDuplicateDeliveryMilestoneLabelId(input.submittedMilestones);

  if (submittedDuplicateLabelId) {
    throw new ProjectMutationScopeError(`同一版本不能重复使用交付节点标签「${submittedDuplicateLabelId}」。`);
  }

  const catalog = normalizeProjectDeliveryLabelCatalog(input.catalogValue, { fallbackToDefaults: false });
  const activeLabelsById = new Map(catalog.filter((label) => label.active).map((label) => [label.id, label]));
  const labelsById = new Map(catalog.map((label) => [label.id, label]));
  const activeLabelsByName = new Map(
    catalog.filter((label) => label.active).map((label) => [label.name.trim().toLocaleLowerCase("zh-CN"), label])
  );
  const previousEntries: Array<[string, Record<string, unknown>]> = (Array.isArray(input.previousMilestones)
    ? input.previousMilestones
    : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .flatMap((item) => {
      const id = asNonEmptyString(item.id);

      return id ? [[id, item] as [string, Record<string, unknown>]] : [];
    });
  const previousById = new Map<string, Record<string, unknown>>(previousEntries);
  const usedLabelIds = new Set<string>();
  const claimLabelId = (labelId: string, index: number) => {
    if (usedLabelIds.has(labelId)) {
      throw new ProjectMutationScopeError(`第 ${index + 1} 个交付节点重复使用了标签「${labelId}」。`);
    }

    usedLabelIds.add(labelId);
  };

  return input.submittedMilestones.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProjectMutationScopeError(`第 ${index + 1} 个交付节点格式不正确。`);
    }

    const milestone = item as Record<string, unknown>;
    const milestoneId = asNonEmptyString(milestone.id);
    const labelId = asNonEmptyString(milestone.labelId);
    const typeSnapshot = asNonEmptyString(milestone.type);
    const previous = milestoneId ? previousById.get(milestoneId) : undefined;
    const previousLabelId = asNonEmptyString(previous?.labelId);
    const previousType = asNonEmptyString(previous?.type);

    if (!labelId) {
      const activeLabel = typeSnapshot
        ? activeLabelsByName.get(typeSnapshot.toLocaleLowerCase("zh-CN"))
        : undefined;

      if (activeLabel) {
        claimLabelId(activeLabel.id, index);
        return { ...milestone, labelId: activeLabel.id, type: activeLabel.name };
      }

      // 旧节点可能只有 type 快照而没有 labelId；只允许原样保存，不允许新请求借此写入自定义类型。
      if (input.action === "update" && previous && !previousLabelId && previousType === typeSnapshot) {
        return milestone;
      }

      throw new ProjectMutationScopeError(`第 ${index + 1} 个交付节点未选择当前版本的启用标签。`);
    }

    const activeLabel = activeLabelsById.get(labelId);

    if (activeLabel) {
      claimLabelId(labelId, index);

      return {
        ...milestone,
        // 启用标签改名后同步所有当前节点快照；停用/删除后才冻结历史 type。
        type: activeLabel.name
      };
    }

    const storedLabel = labelsById.get(labelId);
    const keepsStoppedHistoricalSelection = input.action === "update"
      && previousLabelId === labelId
      && Boolean(previousType);

    if (keepsStoppedHistoricalSelection) {
      claimLabelId(labelId, index);
      return { ...milestone, type: previousType };
    }

    throw new ProjectMutationScopeError(
      `第 ${index + 1} 个交付节点引用的标签${storedLabel ? "已停用" : "不存在"}，请改选已启用标签。`
    );
  });
}

export async function resolveProjectMutationScope(
  input: ResolveProjectMutationScopeInput
): Promise<ResolvedProjectMutationScope> {
  ensureRecordWorkspace(input);

  const record = input.record ?? {};
  const values = { ...input.values };

  if (input.entityType === "project") {
    if (input.action === "create") {
      return { workspaceId: input.workspaceId, values };
    }

    const projectId = asNonEmptyString(record.id);

    if (!projectId) {
      throw new ProjectMutationScopeError("无法定位待更新项目。", 404);
    }

    const project = await findProjectById(input.workspaceId, projectId, "项目记录");

    return {
      workspaceId: input.workspaceId,
      projectId: project.id,
      projectName: project.name,
      values
    };
  }

  const merged = prospectiveRecord(input);
  const candidates: ProjectRelationCandidate[] = [];
  const hasSubmittedProject = hasOwn(values, "projectId") || hasOwn(values, "project");
  const submittedProject = hasSubmittedProject
    ? await resolveSubmittedProjectReference({ workspaceId: input.workspaceId, values })
    : undefined;
  let versionId = selectedReferenceId(record, values, "versionId");
  const requirementId = selectedReferenceId(record, values, "requirementId");
  const parentVersionId = selectedReferenceId(record, values, "parentVersionId");
  let version: VersionReference | undefined;
  let requirement: RequirementReference | undefined;
  let parentVersion: VersionReference | undefined;

  if (input.entityType === "requirement" || input.entityType === "task") {
    if (input.entityType === "task" && requirementId) {
      requirement = await resolveRequirementReference(input.workspaceId, requirementId);
      const versionWasSubmitted = hasOwn(values, "versionId");
      const requirementWasSubmitted = hasOwn(values, "requirementId");

      // 需求是任务归属的权威来源：只换需求或修复历史脏数据时同步版本；调用方同时提交冲突版本时明确拒绝。
      if (requirement.versionId && (!versionWasSubmitted || !versionId)) {
        versionId = requirement.versionId;
      } else if (requirement.versionId && versionId !== requirement.versionId) {
        const repairingLegacyRelation = !versionWasSubmitted && !requirementWasSubmitted;

        if (repairingLegacyRelation) {
          versionId = requirement.versionId;
        } else {
          throw new ProjectMutationScopeError("任务的 requirementId 与 versionId 不属于同一需求版本。");
        }
      }
    }

    if (versionId) {
      version = await resolveVersionReference(input.workspaceId, versionId, "versionId");
      candidates.push({ relation: "versionId", project: version.project });
    }

    if (requirement) {
      candidates.push({ relation: "requirementId", project: requirement.project });
    }
  } else if (input.entityType === "requirementVersion" && parentVersionId) {
    if (parentVersionId === asNonEmptyString(record.id)) {
      throw new ProjectMutationScopeError("项目/版本不能把自身设置为父级。");
    }

    await ensureVersionParentDoesNotCreateCycle(
      input.workspaceId,
      asNonEmptyString(record.id),
      parentVersionId
    );

    parentVersion = await resolveVersionReference(input.workspaceId, parentVersionId, "parentVersionId");

    if (!parentVersion.project) {
      throw new ProjectMutationScopeError("父级版本必须归属当前工作区内的明确项目。");
    }

    if (input.action === "update") {
      const currentProject = await resolveStoredProjectReference({
        workspaceId: input.workspaceId,
        projectId: asNonEmptyString(record.projectId),
        projectName: asNonEmptyString(record.project),
        relation: "当前版本项目归属"
      });

      if (!currentProject || currentProject.id !== parentVersion.project.id) {
        // 普通 PATCH 可调整同项目版本树，但不能借 parentVersionId 绕过 projectId 改绑闸门。
        throw new ProjectMutationScopeError("父级版本必须与当前版本属于同一项目。", 409);
      }
    }

    candidates.push({ relation: "parentVersionId", project: parentVersion.project });
  }

  if (submittedProject) {
    candidates.push({ relation: "projectId/project", project: submittedProject });
  }

  // 没有新的权威关联时才使用原记录项目兜底；一旦版本、需求或父版本给出项目，就以关联对象为准并回填稳定 ID。
  if (!candidates.some((candidate) => candidate.project)) {
    const fallbackProject = await resolveStoredProjectReference({
      workspaceId: input.workspaceId,
      projectId: asNonEmptyString(merged.projectId),
      projectName: asNonEmptyString(merged.project),
      relation: "项目归属"
    });

    candidates.push({ relation: "项目归属", project: fallbackProject });
  }

  const target = resolveSingleProjectRelationTarget(candidates);
  values.projectId = target.id;
  values.project = target.name;

  if (version) {
    values.versionId = version.id;
    values.versionName = version.name;
  } else if (hasOwn(values, "versionId") && !versionId) {
    values.versionId = undefined;
    values.versionName = undefined;
  }

  if (input.entityType === "task") {
    if (requirement) {
      values.requirementId = requirement.id;
      values.requirementTitle = requirement.title;
    } else if (hasOwn(values, "requirementId") && !requirementId) {
      values.requirementId = undefined;
      values.requirementTitle = undefined;
    }
  }

  if (input.entityType === "requirementVersion") {
    if (parentVersion) {
      values.parentVersionId = parentVersion.id;
      values.parentVersionName = parentVersion.name;
    } else if (hasOwn(values, "parentVersionId") && !parentVersionId) {
      values.parentVersionId = undefined;
      values.parentVersionName = undefined;
    }

    const currentCatalog = normalizeProjectDeliveryLabelCatalog(
      record.deliveryLabelCatalog,
      { fallbackToDefaults: false }
    );
    const hasSubmittedCatalog = hasOwn(values, "deliveryLabelCatalog");
    const currentVersionId = asNonEmptyString(record.id);
    let catalog = input.action === "create"
      ? normalizeProjectDeliveryLabelCatalog(undefined)
      : currentCatalog;
    let milestoneInput = values.milestones;

    if (hasSubmittedCatalog) {
      const submittedCatalog = normalizeSubmittedVersionDeliveryLabelCatalog(values.deliveryLabelCatalog);

      await ensureVersionDeliveryLabelIdsAreNotForeign({
        workspaceId: input.workspaceId,
        currentVersionId,
        currentCatalog,
        submittedCatalog
      });

      if (input.action === "update") {
        ensureCatalogUsesSoftDeleteForExistingLabels(currentCatalog, submittedCatalog);
      }

      if (currentVersionId) {
        const scopedCatalog = scopeDeliveryLabelCatalogToVersion(
          currentVersionId,
          submittedCatalog,
          { preserveIds: new Set(currentCatalog.map((label) => label.id)) }
        );

        catalog = scopedCatalog.catalog;
        values.deliveryLabelCatalog = catalog;
        milestoneInput = remapVersionDeliveryMilestones(
          hasOwn(values, "milestones") ? values.milestones : record.milestones,
          catalog,
          scopedCatalog.idMap
        );
      } else {
        // create 的最终版本 ID 在本地写入层生成；当前先依提交 ID 校验，入库前再一次性重键节点。
        catalog = submittedCatalog;
        values.deliveryLabelCatalog = catalog;
      }
    }

    if (hasOwn(values, "milestones") || hasSubmittedCatalog) {
      values.milestones = normalizeVersionMilestoneLabels({
        action: input.action,
        catalogValue: catalog,
        previousMilestones: record.milestones,
        submittedMilestones: milestoneInput ?? record.milestones ?? []
      });
    }
  }

  return {
    workspaceId: input.workspaceId,
    projectId: target.id,
    projectName: target.name,
    values
  };
}

export { ProjectMutationScopeError } from "@/lib/project-management/record-scope-core";
