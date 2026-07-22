import type {
  DashboardMember,
  FeishuUser,
  Project,
  ProjectAccessLevel,
  ProjectActivity,
  ProjectActivityEntityType,
  ProjectFunctionalRoleAssignment,
  ProjectMemberPermission
} from "@/types/dashboard";

export type ProjectCapabilities = {
  canUpdateProject: boolean;
  canArchiveProject?: boolean;
  canDeleteProject: boolean;
  canManageMembers: boolean;
  canTransferOwner: boolean;
  canCreatePlanUnit: boolean;
  canDeletePlanUnit: boolean;
  canCreateRequirements: boolean;
  canManageRequirements: boolean;
  canDeleteRequirements: boolean;
  canManageTasks: boolean;
};

// 当前操作者的作用域事实只包含项目判权所需字段，前端据此做逐需求、逐任务门禁，
// 不再把“某个需求上有职责”错误放大成整个项目都可编辑。
export type ProjectActorAccess = {
  memberId?: string;
  accessLevel?: ProjectAccessLevel;
  functionalRoles: ProjectFunctionalRoleAssignment[];
  legacyProductRole?: LegacyProjectProductRole;
};

// 旧版工作区产品角色只用于无显式项目权限行时的精确兼容，不作为新项目职能角色持久化。
export type LegacyProjectProductRole = "productAdmin" | "productMember";

export type EffectiveProjectPermission = {
  grants: string[];
  sources: string[];
  restrictions: string[];
};

// API 展示层在稳定 ProjectMemberPermission 上附加成员资料和中文权限解释，不重新定义一套存储类型。
export type ProjectMemberPermissionView = ProjectMemberPermission & {
  member?: DashboardMember;
  effectivePermission: EffectiveProjectPermission;
  capabilities: {
    canEdit: boolean;
    canRemove: boolean;
    canViewEffectivePermission: boolean;
  };
};

export type ProjectManagementSnapshot = {
  project: Project;
  permissions: ProjectMemberPermissionView[];
  activities: ProjectActivity[];
  capabilities: ProjectCapabilities;
  actorAccess: ProjectActorAccess;
  effectivePermission: EffectiveProjectPermission;
};

export type ProjectGovernanceActor = {
  user?: FeishuUser | null;
  workspaceId?: string;
  projectId: string;
};

export type ProjectMutationEntityType = Exclude<ProjectActivityEntityType, "bug">;
export type ProjectMutationAction = "create" | "update" | "delete";

export type AuthorizeProjectMutationInput = {
  user?: FeishuUser | null;
  workspaceId?: string;
  projectId?: string;
  projectName?: string;
  entityType: ProjectMutationEntityType;
  action: ProjectMutationAction;
  record?: Record<string, unknown> | null;
  values?: Record<string, unknown> | null;
  // PATCH 的第二次目标授权携带旧项目/旧负责人事实：同项目交接可由旧版本负责人完成，跨项目不能复用旧权限。
  sourceProjectId?: string;
  sourceOwnerMemberId?: string;
};

export type ProjectMutationAuthorization = {
  allowed: boolean;
  reason?: string;
  workspaceId: string;
  projectId?: string;
  actorMemberId?: string;
  accessLevel?: ProjectAccessLevel;
  capabilities: ProjectCapabilities;
};

export type RecordProjectActivityInput = {
  user?: FeishuUser | null;
  workspaceId?: string;
  projectId?: string;
  projectName?: string;
  entityType: ProjectActivityEntityType;
  action: ProjectMutationAction;
  record: Record<string, unknown>;
  detail?: string;
};

export type RecordProjectActivityResult =
  | { recorded: true; activity: ProjectActivity }
  | { recorded: false; error: string };

export type AddProjectMembersInput = ProjectGovernanceActor & {
  memberIds: string[];
  accessLevel?: ProjectAccessLevel;
  functionalRoles?: ProjectFunctionalRoleAssignment[];
};

export type TransferProjectOwnerInput = ProjectGovernanceActor & {
  newOwnerMemberId: string;
  keepPreviousOwnerAsAdmin?: boolean;
  reason: string;
};

export type UpdateProjectMemberInput = ProjectGovernanceActor & {
  permissionId?: string;
  memberId?: string;
  accessLevel?: ProjectAccessLevel;
  functionalRoles?: ProjectFunctionalRoleAssignment[];
};

export type RemoveProjectMemberInput = ProjectGovernanceActor & {
  permissionId?: string;
  memberId?: string;
};

export class ProjectManagementError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ProjectManagementError";
  }
}
