import { readDashboardMembersDatabase } from "@/data/database-dashboard";
import { getWorkspaceAccessContext } from "@/data/local-dashboard";
import {
  defaultProjectDeliveryLabels,
  normalizeProjectDeliveryLabelCatalog
} from "@/data/project-delivery-labels";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import { getPrismaClient } from "@/lib/database/prisma";
import { deriveAssignedRoles } from "@/lib/project-management/derived-roles";
import {
  capabilitiesFromPermissionFacts,
  fullProjectCapabilities,
  getLegacyProductMutationDecision,
  hasProjectFunctionalRole,
  hasScopedFunctionalRole,
  readOnlyProjectCapabilities,
  resolveLegacyProjectProductRole
} from "@/lib/project-management/effective-permissions";
import {
  asNonEmptyString,
  normalizeStoredFunctionalRoles
} from "@/lib/project-management/normalizers";
import {
  canUpdateRequirementFields,
  getChangedRequirementFields,
  isProjectArchiveStatusTransition
} from "@/lib/project-management/mutation-policy-core";
import { selectUniqueProjectNameCandidate } from "@/lib/project-management/record-scope-core";
import type {
  AuthorizeProjectMutationInput,
  LegacyProjectProductRole,
  ProjectCapabilities,
  ProjectMutationAuthorization
} from "@/lib/project-management/types";
import type {
  DashboardMember,
  FeishuUser,
  ProjectAccessLevel,
  ProjectFunctionalRoleAssignment
} from "@/types/dashboard";

type ProjectAccessRecord = {
  id: string;
  workspaceId: string;
  name: string;
  ownerMemberId: string | null;
};

type ProjectPermissionAccessRecord = {
  id: string;
  accessLevel: string;
  functionalRoles: unknown;
};

export type ResolvedProjectAccessState = {
  workspaceId: string;
  project?: ProjectAccessRecord;
  currentMember?: DashboardMember;
  permission?: ProjectPermissionAccessRecord;
  accessLevel?: ProjectAccessLevel;
  functionalRoles: ProjectFunctionalRoleAssignment[];
  legacyProductRole?: LegacyProjectProductRole;
  isLocalDemo: boolean;
  isWorkspaceManager: boolean;
  isProjectOwner: boolean;
  capabilities: ProjectCapabilities;
};

type ProjectAccessActorContext = {
  workspaceId: string;
  currentMember?: DashboardMember;
  isLocalDemo: boolean;
};

const neutralProjectNames = new Set(["跨项目", "未关联项目"]);

function normalizedAccessLevel(value?: string): ProjectAccessLevel | undefined {
  return value === "admin" || value === "member" || value === "commenter" || value === "viewer"
    ? value
    : undefined;
}

async function resolveProjectAccessStateForActor(
  input: ProjectAccessActorContext & { projectId: string }
) {
  const prisma = getPrismaClient();
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      workspaceId: input.workspaceId
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      ownerMemberId: true
    }
  });

  const currentMember = input.currentMember?.status === "active" ? input.currentMember : undefined;
  const permission = project && currentMember
    ? await prisma.projectMemberPermission.findUnique({
        where: {
          projectId_memberId: {
            projectId: project.id,
            memberId: currentMember.id
          }
        },
        select: {
          id: true,
          accessLevel: true,
          functionalRoles: true
        }
      })
    : undefined;
  const derivedRoles = project && currentMember
    ? (await deriveAssignedRoles({
        workspaceId: project.workspaceId,
        projectId: project.id,
        projectName: project.name,
        memberIds: [currentMember.id]
      })).get(currentMember.id) ?? []
    : [];
  const isLocalDemo = input.isLocalDemo;
  const isWorkspaceManager = Boolean(currentMember && ["owner", "admin"].includes(currentMember.role));
  const isProjectOwner = Boolean(project && currentMember && project.ownerMemberId === currentMember.id);
  const legacyProductRole = resolveLegacyProjectProductRole(currentMember?.role, Boolean(permission));
  // 无显式权限行但被需求指派或需要兼容旧产品角色的成员按 member 生效；
  // 一旦存在显式 viewer/commenter 行，legacyProductRole 必然为空，以更严格的项目决策为准。
  const accessLevel = normalizedAccessLevel(permission?.accessLevel)
    ?? (derivedRoles.length || legacyProductRole ? "member" : undefined);
  const functionalRoles = normalizeStoredFunctionalRoles([
    ...normalizeStoredFunctionalRoles(permission?.functionalRoles),
    ...derivedRoles
  ]);
  const capabilities = capabilitiesFromPermissionFacts({
    isLocalDemo,
    isWorkspaceManager,
    isProjectOwner,
    accessLevel,
    functionalRoles,
    legacyProductRole
  });

  return {
    workspaceId: input.workspaceId,
    project: project ?? undefined,
    currentMember,
    permission: permission ?? undefined,
    accessLevel,
    functionalRoles,
    legacyProductRole,
    isLocalDemo,
    isWorkspaceManager,
    isProjectOwner,
    capabilities
  } satisfies ResolvedProjectAccessState;
}

export async function resolveProjectAccessState(input: {
  user?: FeishuUser | null;
  workspaceId?: string;
  projectId: string;
}) {
  const accessContext = await getWorkspaceAccessContext(input.user ?? undefined, input.workspaceId);

  return resolveProjectAccessStateForActor({
    workspaceId: accessContext.currentWorkspace.id,
    currentMember: accessContext.currentMember,
    isLocalDemo: !isAuthServiceConfigured(),
    projectId: input.projectId
  });
}

export async function authorizeProjectMemberAccess(input: {
  user?: FeishuUser | null;
  workspaceId?: string;
  record: Record<string, unknown>;
}): Promise<ProjectMutationAuthorization & { projectScoped: boolean }> {
  const accessContext = await getWorkspaceAccessContext(input.user ?? undefined, input.workspaceId);
  const workspaceId = accessContext.currentWorkspace.id;
  const actor = accessContext.currentMember?.status === "active" ? accessContext.currentMember : undefined;
  const projectId = asNonEmptyString(input.record.projectId);
  const projectName = asNonEmptyString(input.record.project);
  const versionId = asNonEmptyString(input.record.versionId);
  const prisma = getPrismaClient();
  let project: ProjectAccessRecord | undefined;

  if (projectId) {
    project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, workspaceId: true, name: true, ownerMemberId: true }
    }) ?? undefined;

    if (!project) {
      return {
        allowed: false,
        reason: "Bug 引用的项目不存在或不属于当前工作区。",
        workspaceId,
        actorMemberId: actor?.id,
        capabilities: { ...readOnlyProjectCapabilities },
        projectScoped: true
      };
    }
  } else if (projectName && !neutralProjectNames.has(projectName)) {
    const candidates = await prisma.project.findMany({
      where: { name: projectName, workspaceId },
      select: { id: true, workspaceId: true, name: true, ownerMemberId: true },
      take: 2
    });

    project = selectUniqueProjectNameCandidate(candidates);

    if (!project) {
      return {
        allowed: false,
        reason: "Bug 只提供了无法唯一定位的项目名，已拒绝访问。",
        workspaceId,
        actorMemberId: actor?.id,
        capabilities: { ...readOnlyProjectCapabilities },
        projectScoped: true
      };
    }
  }

  if (versionId) {
    const version = await prisma.requirementVersion.findFirst({
      where: { id: versionId, workspaceId },
      select: { project: true, projectId: true }
    });

    if (!version) {
      return {
        allowed: false,
        reason: "Bug 引用的版本不存在或不属于当前工作区。",
        workspaceId,
        actorMemberId: actor?.id,
        capabilities: { ...readOnlyProjectCapabilities },
        projectScoped: true
      };
    }

    let versionProject: ProjectAccessRecord | undefined;

    if (version.projectId) {
      versionProject = await prisma.project.findFirst({
        where: { id: version.projectId, workspaceId },
        select: { id: true, workspaceId: true, name: true, ownerMemberId: true }
      }) ?? undefined;
    } else if (!neutralProjectNames.has(version.project)) {
      const candidates = await prisma.project.findMany({
        where: { name: version.project, workspaceId },
        select: { id: true, workspaceId: true, name: true, ownerMemberId: true },
        take: 2
      });

      versionProject = selectUniqueProjectNameCandidate(candidates);
    }

    if ((version.projectId || !neutralProjectNames.has(version.project)) && !versionProject) {
      return {
        allowed: false,
        reason: "Bug 版本的项目归属无法在当前工作区唯一定位。",
        workspaceId,
        actorMemberId: actor?.id,
        capabilities: { ...readOnlyProjectCapabilities },
        projectScoped: true
      };
    }

    if (versionProject && project && versionProject.id !== project.id) {
      return {
        allowed: false,
        reason: "Bug 的项目与版本归属冲突，已拒绝访问。",
        workspaceId,
        actorMemberId: actor?.id,
        capabilities: { ...readOnlyProjectCapabilities },
        projectScoped: true
      };
    }

    project = project ?? versionProject;
  }

  if (!project) {
    return {
      allowed: true,
      workspaceId,
      actorMemberId: actor?.id,
      capabilities: { ...readOnlyProjectCapabilities },
      projectScoped: false
    };
  }

  const state = await resolveProjectAccessStateForActor({
    workspaceId,
    currentMember: actor,
    isLocalDemo: !isAuthServiceConfigured(),
    projectId: project.id
  });
  const allowed = state.isLocalDemo
    || state.isWorkspaceManager
    || state.isProjectOwner
    || state.accessLevel === "admin"
    || state.accessLevel === "member";

  return {
    allowed,
    ...(allowed ? {} : { reason: "当前成员至少需要该 Bug 所属项目的 member 访问级别。" }),
    workspaceId,
    projectId: project.id,
    actorMemberId: actor?.id,
    accessLevel: state.accessLevel,
    capabilities: state.capabilities,
    projectScoped: true
  };
}

async function resolveMutationProject(workspaceId: string, input: AuthorizeProjectMutationInput) {
  if (input.entityType === "project" && input.action === "create") {
    return undefined;
  }

  const record = input.record ?? {};
  const values = input.values ?? {};
  const projectId = asNonEmptyString(input.projectId)
    ?? asNonEmptyString(record.projectId)
    ?? asNonEmptyString(values.projectId)
    ?? (input.entityType === "project" ? asNonEmptyString(record.id) ?? asNonEmptyString(values.id) : undefined);
  const projectName = asNonEmptyString(input.projectName)
    ?? asNonEmptyString(record.project)
    ?? asNonEmptyString(values.project)
    ?? (input.entityType === "project" ? asNonEmptyString(record.name) : undefined);
  const prisma = getPrismaClient();

  if (projectId) {
    return prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, workspaceId: true, name: true, ownerMemberId: true }
    });
  }

  // 旧数据只有 project 名称时限定在当前工作区内回退查找；同名候选超过一个时必须拒绝授权，
  // 不能依赖数据库 findFirst 的未定义顺序把写权限随机落到某个项目。
  if (projectName) {
    const candidates = await prisma.project.findMany({
      where: { workspaceId, name: projectName },
      select: { id: true, workspaceId: true, name: true, ownerMemberId: true },
      take: 2
    });

    return selectUniqueProjectNameCandidate(candidates);
  }

  return undefined;
}

function mutationRequirementId(input: AuthorizeProjectMutationInput) {
  const record = input.record ?? {};
  const values = input.values ?? {};

  if (input.entityType === "requirement") {
    return asNonEmptyString(record.id) ?? asNonEmptyString(values.id);
  }

  return asNonEmptyString(record.requirementId) ?? asNonEmptyString(values.requirementId);
}

function mutationVersionId(input: AuthorizeProjectMutationInput) {
  const record = input.record ?? {};
  const values = input.values ?? {};

  if (input.entityType === "requirementVersion") {
    return asNonEmptyString(record.id) ?? asNonEmptyString(values.id);
  }

  return asNonEmptyString(record.versionId) ?? asNonEmptyString(values.versionId);
}

function attemptsProjectArchiveTransition(input: AuthorizeProjectMutationInput) {
  return input.entityType === "project"
    && input.action === "update"
    && isProjectArchiveStatusTransition({
      currentStatus: input.record?.status,
      nextStatus: input.values?.status
    });
}

function versionDeliveryLabelCatalogSignature(value: unknown) {
  return JSON.stringify(
    normalizeProjectDeliveryLabelCatalog(value, { fallbackToDefaults: false })
      .map((label) => ({
        id: label.id,
        name: label.name,
        active: label.active,
        deleted: label.deleted === true
      }))
  );
}

function attemptsVersionDeliveryLabelCatalogMutation(input: AuthorizeProjectMutationInput) {
  if (
    input.entityType !== "requirementVersion"
    || !input.values
    || !Object.prototype.hasOwnProperty.call(input.values, "deliveryLabelCatalog")
  ) {
    return false;
  }

  const submittedSignature = versionDeliveryLabelCatalogSignature(input.values.deliveryLabelCatalog);

  if (input.action === "create") {
    // 普通版本创建者可以接受系统四个默认标签，自定义/清空目录仍属于项目编辑者权限。
    return submittedSignature !== versionDeliveryLabelCatalogSignature(defaultProjectDeliveryLabels);
  }

  return submittedSignature !== versionDeliveryLabelCatalogSignature(
    input.record?.deliveryLabelCatalog
  );
}

async function actorOwnsRequirementVersionInProject(input: {
  actorMemberId: string;
  projectId: string;
  versionId?: string;
  workspaceId: string;
}) {
  if (!input.versionId) {
    return false;
  }

  const prisma = getPrismaClient();
  const version = await prisma.requirementVersion.findFirst({
    where: {
      id: input.versionId,
      workspaceId: input.workspaceId,
      ownerMemberId: input.actorMemberId
    },
    select: { project: true, projectId: true }
  });

  if (!version) {
    return false;
  }

  if (version.projectId) {
    return version.projectId === input.projectId;
  }

  const projectNameCandidates = await prisma.project.findMany({
    where: { workspaceId: input.workspaceId, name: version.project },
    select: { id: true },
    take: 2
  });

  return selectUniqueProjectNameCandidate(projectNameCandidates)?.id === input.projectId;
}

async function authorizeProjectMutationForActor(
  input: AuthorizeProjectMutationInput,
  context: ProjectAccessActorContext
): Promise<ProjectMutationAuthorization> {
  const { currentMember: actor, isLocalDemo, workspaceId } = context;

  if (isLocalDemo) {
    return {
      allowed: true,
      workspaceId,
      projectId: input.projectId,
      capabilities: { ...fullProjectCapabilities }
    };
  }

  const isWorkspaceManager = Boolean(actor && ["owner", "admin"].includes(actor.role));
  const project = await resolveMutationProject(workspaceId, input);

  if (isWorkspaceManager) {
    const isProjectCreate = input.entityType === "project" && input.action === "create";

    // 工作区管理员的“全权”仍严格限定在当前工作区；除新建项目外，目标项目无法在当前工作区定位时绝不能因管理员身份绕过边界。
    if (!isProjectCreate && !project) {
      return {
        allowed: false,
        reason: "目标记录不属于当前工作区，已拒绝写操作。",
        workspaceId,
        actorMemberId: actor?.id,
        capabilities: { ...readOnlyProjectCapabilities }
      };
    }

    return {
      allowed: true,
      workspaceId,
      projectId: project?.id ?? input.projectId,
      actorMemberId: actor?.id,
      capabilities: { ...fullProjectCapabilities }
    };
  }

  if (!actor) {
    return {
      allowed: false,
      reason: "你还不是当前工作区的启用成员。",
      workspaceId,
      capabilities: { ...readOnlyProjectCapabilities }
    };
  }

  if (!project) {
    return {
      allowed: false,
      reason: input.entityType === "project" && input.action === "create"
        ? "只有工作区所有者或管理员可以创建项目。"
        : "无法定位该记录所属项目，已拒绝写操作。",
      workspaceId,
      actorMemberId: actor.id,
      capabilities: { ...readOnlyProjectCapabilities }
    };
  }

  const state = await resolveProjectAccessStateForActor({
    workspaceId,
    currentMember: actor,
    isLocalDemo,
    projectId: project.id
  });
  const baseResult = {
    workspaceId,
    projectId: project.id,
    actorMemberId: actor.id,
    accessLevel: state.accessLevel,
    capabilities: state.capabilities
  };

  if (state.isProjectOwner) {
    return { allowed: true, ...baseResult };
  }

  if (state.accessLevel === "commenter" || state.accessLevel === "viewer") {
    return {
      allowed: false,
      reason: "当前项目访问级别为只读，不能执行写操作。",
      ...baseResult
    };
  }

  if (state.accessLevel === "admin") {
    const projectDeleteDenied = input.entityType === "project" && input.action === "delete";

    if (attemptsProjectArchiveTransition(input)) {
      return {
        allowed: false,
        reason: "项目归档或恢复只允许项目负责人或工作区管理员执行。",
        ...baseResult
      };
    }

    return projectDeleteDenied
      ? { allowed: false, reason: "删除项目只允许项目负责人或工作区管理员执行。", ...baseResult }
      : { allowed: true, ...baseResult };
  }

  if (attemptsVersionDeliveryLabelCatalogMutation(input)) {
    return {
      allowed: false,
      reason: "交付节点标签目录只允许项目负责人、项目管理员或工作区管理员维护。",
      ...baseResult
    };
  }

  const legacyProductDecision = getLegacyProductMutationDecision({
    legacyProductRole: state.legacyProductRole,
    entityType: input.entityType,
    action: input.action
  });

  if (legacyProductDecision !== undefined) {
    // 兼容判断只在无显式权限行时到达这里，且只覆盖需求/版本的旧增改删矩阵。
    return legacyProductDecision
      ? { allowed: true, ...baseResult }
      : {
          allowed: false,
          reason: "产品成员可以创建和编辑需求与版本，但不能删除。",
          ...baseResult
        };
  }

  const requirementId = mutationRequirementId(input);
  const versionId = mutationVersionId(input);
  let allowed = false;

  if (input.entityType === "requirementVersion") {
    const sourceProjectId = asNonEmptyString(input.sourceProjectId);
    const sourceOwnerMemberId = asNonEmptyString(input.sourceOwnerMemberId)
      ?? asNonEmptyString(input.record?.ownerMemberId);
    const ownsVersionUpdate = input.action === "update"
      && sourceOwnerMemberId === actor.id
      && (!sourceProjectId || sourceProjectId === project.id);

    // one2all 的版本负责人权限是记录级 canUpdate：可编辑/交接本人版本，但不能因此删除版本或管理同项目其它版本。
    // 目标授权带 sourceProjectId，确保跨项目移动时旧负责人身份不会被带到目标项目继续放行。
    allowed = input.action === "update" && (
      ownsVersionUpdate
      || hasScopedFunctionalRole(state.functionalRoles, ["delivery_manager"], undefined, versionId)
    );
  } else if (input.entityType === "risk") {
    allowed = hasProjectFunctionalRole(state.functionalRoles, ["delivery_manager"]);
  } else if (input.entityType === "requirement") {
    const ownsTargetVersion = await actorOwnsRequirementVersionInProject({
      actorMemberId: actor.id,
      projectId: project.id,
      versionId,
      workspaceId
    });
    if (input.action === "create") {
      // 版本总体负责人可在本人版本下创建需求；这是版本级授权，不外溢到无版本需求、其它版本或需求删除。
      allowed = ownsTargetVersion
        || hasScopedFunctionalRole(state.functionalRoles, ["delivery_manager"], undefined, versionId)
        || hasScopedFunctionalRole(state.functionalRoles, ["product_owner"], undefined, versionId);
    } else if (input.action === "delete") {
      // one2all 删除需求只认前置已放行的项目 owner/workspace admin/project admin；职能角色与版本 owner 都不能删除。
      allowed = false;
    } else {
      const productOwner = hasScopedFunctionalRole(
        state.functionalRoles,
        ["product_owner"],
        requirementId,
        versionId
      );
      const designOwner = hasScopedFunctionalRole(
        state.functionalRoles,
        ["design_owner"],
        requirementId,
        versionId
      );
      const changedFields = getChangedRequirementFields(input.record, input.values);

      // 版本 owner 可维护整条需求；participant 必须逐字段落在职责矩阵内，functional delivery_manager 不等于项目管理员。
      allowed = ownsTargetVersion || canUpdateRequirementFields({
        changedFields,
        productOwner,
        designOwner
      });
    }
  } else if (input.entityType === "task") {
    const record = input.record ?? {};
    const values = input.values ?? {};
    const sourceProjectId = asNonEmptyString(input.sourceProjectId);
    const ownsExistingTask = asNonEmptyString(record.ownerMemberId) === actor.id
      && (!sourceProjectId || sourceProjectId === project.id);
    const isRequirementParticipant = hasScopedFunctionalRole(
      state.functionalRoles,
      ["product_owner", "design_owner", "developer"],
      requirementId,
      versionId
    );

    if (input.action === "delete") {
      // 经办人与需求 participant 只有 update；functional delivery_manager 不等于项目管理员，任务删除仅前置管理者可达。
      allowed = false;
    } else if (input.action === "create") {
      allowed = hasScopedFunctionalRole(
        state.functionalRoles,
        ["product_owner", "developer"],
        asNonEmptyString(values.requirementId),
        asNonEmptyString(values.versionId)
      );
    } else {
      // update 必须读取旧 owner，禁止先把 PATCH ownerMemberId 改成自己再 self-claim。
      allowed = ownsExistingTask || isRequirementParticipant;
    }
  }

  return allowed
    ? { allowed: true, ...baseResult }
    : {
        allowed: false,
        reason: "当前成员没有该记录所需的职能角色或作用范围。",
        ...baseResult
      };
}

export async function authorizeProjectMutation(
  input: AuthorizeProjectMutationInput
): Promise<ProjectMutationAuthorization> {
  const accessContext = await getWorkspaceAccessContext(input.user ?? undefined, input.workspaceId);

  return authorizeProjectMutationForActor(input, {
    workspaceId: accessContext.currentWorkspace.id,
    currentMember: accessContext.currentMember?.status === "active" ? accessContext.currentMember : undefined,
    isLocalDemo: !isAuthServiceConfigured()
  });
}

/**
 * 队列 worker 没有原始 Cookie，只能使用 job 中稳定的工作区成员 ID 恢复权限上下文。
 *
 * 这里故意不启用 local-demo 全权捷径：job 等待期间成员可能被停用或撤权，
 * 每次都以当前成员表、项目权限行和需求派生角色重新计算，不把历史会话身份粗映射为管理员。
 */
export async function authorizeProjectMutationForActorMember(
  input: Omit<AuthorizeProjectMutationInput, "user" | "workspaceId"> & {
    workspaceId: string;
    actorMemberId: string;
  }
): Promise<ProjectMutationAuthorization> {
  const [authorization] = await authorizeProjectMutationsForActorMember({
    workspaceId: input.workspaceId,
    actorMemberId: input.actorMemberId,
    mutations: [input]
  });

  return authorization;
}

/**
 * 批量助手动作需逐条使用真实项目/需求作用域鉴权，但操作人成员只需从当前成员表解析一次。
 * 返回结果与 mutations 严格同序，调用方可以在入队或 worker 执行前做“全部通过才继续”的原子闸门。
 */
export async function authorizeProjectMutationsForActorMember(input: {
  workspaceId: string;
  actorMemberId: string;
  mutations: Array<Omit<AuthorizeProjectMutationInput, "user" | "workspaceId">>;
}): Promise<ProjectMutationAuthorization[]> {
  const members = await readDashboardMembersDatabase(input.workspaceId);
  const currentMember = members.find(
    (member) => member.id === input.actorMemberId && member.status === "active"
  );

  return Promise.all(input.mutations.map((mutation) => authorizeProjectMutationForActor(mutation, {
    workspaceId: input.workspaceId,
    currentMember,
    isLocalDemo: false
  })));
}
