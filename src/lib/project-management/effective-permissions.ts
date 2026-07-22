import type {
  DashboardMember,
  ProjectAccessLevel,
  ProjectFunctionalRoleAssignment
} from "@/types/dashboard";
import type {
  EffectiveProjectPermission,
  LegacyProjectProductRole,
  ProjectActorAccess,
  ProjectCapabilities,
  ProjectMutationAction,
  ProjectMutationEntityType
} from "@/lib/project-management/types";

export const fullProjectCapabilities: ProjectCapabilities = {
  canUpdateProject: true,
  canArchiveProject: true,
  canDeleteProject: true,
  canManageMembers: true,
  canTransferOwner: true,
  canCreatePlanUnit: true,
  canDeletePlanUnit: true,
  canCreateRequirements: true,
  canManageRequirements: true,
  canDeleteRequirements: true,
  canManageTasks: true
};

export const readOnlyProjectCapabilities: ProjectCapabilities = {
  canUpdateProject: false,
  canArchiveProject: false,
  canDeleteProject: false,
  canManageMembers: false,
  canTransferOwner: false,
  canCreatePlanUnit: false,
  canDeletePlanUnit: false,
  canCreateRequirements: false,
  canManageRequirements: false,
  canDeleteRequirements: false,
  canManageTasks: false
};

const accessLevelLabels: Record<ProjectAccessLevel, string> = {
  admin: "项目管理员",
  member: "项目成员",
  commenter: "可评论成员",
  viewer: "只读成员"
};

const functionalRoleLabels: Record<string, string> = {
  delivery_manager: "交付负责人",
  product_owner: "产品负责人",
  design_owner: "设计负责人",
  developer: "开发负责人",
  tester: "测试负责人",
  quality_owner: "质量负责人",
  ops_release: "发布负责人",
  business_acceptor: "业务验收人",
  stakeholder: "项目干系人"
};

export function hasProjectFunctionalRole(roles: ProjectFunctionalRoleAssignment[], roleKeys: string[]) {
  return roles.some((role) => role.scopeType === "project" && roleKeys.includes(role.roleKey));
}

export function hasScopedFunctionalRole(
  roles: ProjectFunctionalRoleAssignment[],
  roleKeys: string[],
  requirementId?: string,
  versionId?: string
) {
  return roles.some((role) => {
    if (!roleKeys.includes(role.roleKey)) {
      return false;
    }

    return role.scopeType === "project"
      || Boolean(role.scopeType === "plan_unit" && versionId && role.scopeId === versionId)
      || Boolean(role.scopeType === "requirement" && requirementId && role.scopeId === requirementId);
  });
}

function hasFullProjectWriteAccess(
  capabilities: ProjectCapabilities,
  actorAccess: ProjectActorAccess
) {
  // owner、工作区管理员和项目管理员都会拥有成员治理能力；用服务端下发的 capability 判断，
  // 避免前端再根据工作区中文角色猜权限，同时覆盖本地演示模式。
  return capabilities.canManageMembers || actorAccess.accessLevel === "admin";
}

export function canManageRequirementForActor(input: {
  actorAccess: ProjectActorAccess;
  capabilities: ProjectCapabilities;
  requirementId?: string;
  versionId?: string;
  action: "create" | "update" | "delete";
}) {
  if (hasFullProjectWriteAccess(input.capabilities, input.actorAccess)) {
    return true;
  }

  if (input.action === "create") {
    // 新需求还没有 requirementId，但 plan_unit 产品/交付职责可在本版本内创建，不外溢到其它版本。
    return input.capabilities.canCreateRequirements || hasScopedFunctionalRole(
      input.actorAccess.functionalRoles,
      ["product_owner", "delivery_manager"],
      undefined,
      input.versionId
    );
  }

  if (!input.capabilities.canManageRequirements) {
    return false;
  }

  if (input.action === "delete" && !input.capabilities.canDeleteRequirements) {
    return false;
  }

  if (input.actorAccess.legacyProductRole) {
    // 旧产品角色没有职能作用域，但服务端仍保留旧版全项目需求权限矩阵。
    return input.action !== "delete" || input.actorAccess.legacyProductRole === "productAdmin";
  }

  return hasScopedFunctionalRole(
    input.actorAccess.functionalRoles,
    ["product_owner", "design_owner"],
    input.requirementId,
    input.versionId
  );
}

export function canManageTaskForActor(input: {
  actorAccess: ProjectActorAccess;
  capabilities: ProjectCapabilities;
  requirementId?: string;
  versionId?: string;
  ownerMemberId?: string;
}) {
  if (hasFullProjectWriteAccess(input.capabilities, input.actorAccess)) {
    return true;
  }
  const ownsTask = Boolean(
    input.ownerMemberId
    && input.actorAccess.memberId
    && input.ownerMemberId === input.actorAccess.memberId
  );

  // one2all update 口径：旧记录经办人可维护本人任务；需求产品、设计、开发参与者可维护职责范围内任务。
  // 不要求经办人同时具备 developer role，避免“任务已指派但本人无权履职”。删除权限由服务端 action 分支另行收紧。
  return ownsTask || hasScopedFunctionalRole(
    input.actorAccess.functionalRoles,
    ["product_owner", "design_owner", "developer"],
    input.requirementId,
    input.versionId
  );
}

export function resolveLegacyProjectProductRole(
  memberRole: DashboardMember["role"] | undefined,
  hasExplicitProjectPermission: boolean
): LegacyProjectProductRole | undefined {
  // 不用 SQL 把旧角色回填成职能角色：productMember 的“可增改、不可删”无法用现有 product_owner 无损表达，
  // 粗映射会永久新增删除权，而且后续工作区角色调整也不会同步。因此把兼容集中在读时决策层。
  // 显式项目权限是管理员对单项目的最新决策；即使工作区仍是产品角色，viewer/commenter 也必须覆盖旧权限。
  if (hasExplicitProjectPermission) {
    return undefined;
  }

  return memberRole === "productAdmin" || memberRole === "productMember" ? memberRole : undefined;
}

export function getLegacyProductMutationDecision(input: {
  legacyProductRole?: LegacyProjectProductRole;
  entityType: ProjectMutationEntityType;
  action: ProjectMutationAction;
}) {
  if (
    !input.legacyProductRole
    || (input.entityType !== "requirement" && input.entityType !== "requirementVersion")
  ) {
    return undefined;
  }

  // 只恢复旧矩阵已有能力：productAdmin 增改删，productMember 仅增改；不外溢到项目集、风险或任务。
  return input.action !== "delete" || input.legacyProductRole === "productAdmin";
}

export function capabilitiesFromPermissionFacts(input: {
  isLocalDemo: boolean;
  isWorkspaceManager: boolean;
  isProjectOwner: boolean;
  accessLevel?: ProjectAccessLevel;
  functionalRoles: ProjectFunctionalRoleAssignment[];
  legacyProductRole?: LegacyProjectProductRole;
}) {
  if (input.isLocalDemo || input.isWorkspaceManager || input.isProjectOwner) {
    return { ...fullProjectCapabilities };
  }

  if (input.accessLevel === "admin") {
    // 项目管理员可管理项目内业务，但删除项目和转交唯一负责人仍留给项目负责人或工作区管理员。
    return {
      canUpdateProject: true,
      canArchiveProject: false,
      canDeleteProject: false,
      canManageMembers: true,
      canTransferOwner: false,
      canCreatePlanUnit: true,
      canDeletePlanUnit: true,
      canCreateRequirements: true,
      canManageRequirements: true,
      canDeleteRequirements: true,
      canManageTasks: true
    } satisfies ProjectCapabilities;
  }

  if (input.accessLevel !== "member") {
    return { ...readOnlyProjectCapabilities };
  }

  if (input.legacyProductRole) {
    const canDeleteLegacyProductRecords = input.legacyProductRole === "productAdmin";

    // 旧角色兼容必须把“增改”与“删除”分开表达，否则 productMember 会因项目页共用回调被误升级。
    return {
      ...readOnlyProjectCapabilities,
      canCreatePlanUnit: true,
      canDeletePlanUnit: canDeleteLegacyProductRecords,
      canCreateRequirements: true,
      canManageRequirements: true,
      canDeleteRequirements: canDeleteLegacyProductRecords
    } satisfies ProjectCapabilities;
  }

  const canManageRequirements = input.functionalRoles.some((role) => ["product_owner", "design_owner"].includes(role.roleKey));
  const canCreateRequirements = hasProjectFunctionalRole(input.functionalRoles, ["product_owner"]);
  const canManageTasks = input.functionalRoles.some((role) => ["product_owner", "design_owner", "developer"].includes(role.roleKey));

  return {
    ...readOnlyProjectCapabilities,
    canCreatePlanUnit: false,
    canDeletePlanUnit: false,
    canCreateRequirements,
    canManageRequirements,
    canDeleteRequirements: false,
    canManageTasks
  };
}

function roleScopeLabel(role: ProjectFunctionalRoleAssignment) {
  const roleLabel = functionalRoleLabels[role.roleKey] ?? "项目职能角色";

  if (role.scopeType === "project") {
    return `${roleLabel}（整个项目）`;
  }

  return role.scopeType === "plan_unit"
    ? `${roleLabel}（${role.sourceLabel || "指定项目或版本"}）`
    : `${roleLabel}（${role.sourceLabel || "指定需求"}）`;
}

export function buildEffectiveProjectPermission(input: {
  member?: DashboardMember;
  isLocalDemo?: boolean;
  isWorkspaceManager?: boolean;
  isProjectOwner?: boolean;
  accessLevel?: ProjectAccessLevel;
  functionalRoles?: ProjectFunctionalRoleAssignment[];
  legacyProductRole?: LegacyProjectProductRole;
}): EffectiveProjectPermission {
  const roles = input.functionalRoles ?? [];

  if (input.member?.status === "disabled") {
    return { grants: [], sources: ["工作区成员身份"], restrictions: ["该成员已被禁用，当前不具有项目权限。"] };
  }

  if (input.isLocalDemo || input.isWorkspaceManager || input.isProjectOwner) {
    const source = input.isLocalDemo
      ? "本地演示模式"
      : input.isWorkspaceManager
        ? input.member?.role === "owner" ? "工作区所有者" : "工作区管理员"
        : "项目负责人";

    return {
      grants: ["查看项目", "编辑项目", "删除项目", "管理成员", "更换负责人", "管理版本、风险、需求和任务"],
      sources: [source],
      restrictions: []
    };
  }

  const sources = [input.accessLevel ? `项目访问级别：${accessLevelLabels[input.accessLevel]}` : "工作区成员身份"];
  sources.push(...roles.map(roleScopeLabel));

  if (input.accessLevel === "admin") {
    return {
      grants: ["查看项目", "编辑项目", "管理成员", "管理版本、风险、需求和任务"],
      sources,
      restrictions: ["不能删除项目或更换项目负责人。"]
    };
  }

  if (input.accessLevel === "member" && input.legacyProductRole) {
    const isLegacyAdmin = input.legacyProductRole === "productAdmin";

    return {
      grants: [
        "查看项目",
        "创建和编辑计划单元（项目/版本）",
        "创建和编辑需求",
        ...(isLegacyAdmin ? ["删除计划单元（项目/版本）和需求"] : [])
      ],
      sources: [input.legacyProductRole === "productAdmin"
        ? "旧工作区角色兼容：产品管理员（未配置显式项目权限）"
        : "旧工作区角色兼容：产品成员（未配置显式项目权限）"],
      restrictions: [
        ...(!isLegacyAdmin ? ["不能删除计划单元（项目/版本）或需求。"] : []),
        "兼容权限不包含编辑项目集、管理项目成员、风险或任务。"
      ]
    };
  }

  if (input.accessLevel === "member") {
    const grants = ["查看项目"];

    if (hasProjectFunctionalRole(roles, ["delivery_manager"])) grants.push("管理职责范围内的版本与风险");
    if (roles.some((role) => role.roleKey === "delivery_manager" && role.scopeType === "plan_unit")) {
      grants.push("编辑本人负责的版本，并在该版本下创建需求");
    }
    if (roles.some((role) => ["product_owner", "design_owner"].includes(role.roleKey))) grants.push("管理职责范围内的需求");
    if (roles.some((role) => role.roleKey === "developer")) grants.push("管理本人或职责范围内的任务");

    return {
      grants,
      sources,
      restrictions: roles.length ? ["写操作仅限于已分配的职能和作用范围。"] : ["未分配职能角色，当前仅可查看项目。"]
    };
  }

  if (input.accessLevel === "commenter") {
    return { grants: ["查看项目", "参与项目讨论"], sources, restrictions: ["不能修改项目、成员或业务记录。"] };
  }

  return { grants: ["查看项目"], sources, restrictions: ["当前是只读权限，不能执行项目写操作。"] };
}
