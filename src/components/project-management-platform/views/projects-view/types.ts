import type {
  BugReport,
  DashboardMember,
  Project,
  ProjectActivity as DashboardProjectActivity,
  ProjectMemberPermission,
  Requirement,
  RequirementVersion,
  Risk,
  Task
} from "@/types/dashboard";
import type {
  ProjectAccessLevel,
  ProjectFunctionalRole,
  ProjectFunctionalRoleAssignment,
  ProjectRoleScopeType
} from "@/types/dashboard";
import type { RequirementVersionOption } from "@/components/project-management-platform/types";
import type {
  ProjectCalendarItem,
  ProjectCalendarScheduleChange
} from "@/components/project-management-platform/views/project-calendar-utils";
import type { ProjectDetailTab } from "@/components/project-management-platform/project-deep-link";

export type { ProjectAccessLevel, ProjectFunctionalRole, ProjectRoleScopeType };
export type ProjectFunctionalRoleGrant = ProjectFunctionalRoleAssignment;

export type ProjectEffectivePermission = {
  grants?: string[];
  restrictions?: string[];
  sources?: string[];
};

export type ProjectPermissionInput = {
  projectId: string;
  permissionId?: string;
  memberId?: string;
  memberIds?: string[];
  accessLevel: ProjectAccessLevel;
  functionalRoles: ProjectFunctionalRoleGrant[];
};

export type ProjectOwnerTransferInput = {
  projectId: string;
  newOwnerMemberId: string;
  keepPreviousOwnerAsAdmin: boolean;
  reason: string;
};

export type ProjectPermission = ProjectMemberPermission & {
  effectivePermission?: ProjectEffectivePermission;
  capabilities?: {
    canEdit?: boolean;
    canRemove?: boolean;
    canViewEffectivePermission?: boolean;
  };
};

export type ProjectActivity = DashboardProjectActivity;

export type ProjectDeliveryNode = {
  id?: string;
  label: string;
  labelId?: string;
  type?: string;
  plannedDate?: string;
  dueDate?: string;
  actualCompletedDate?: string;
  status?: string;
  owner?: string;
  ownerMemberId?: string;
};

// 数据代理会逐步把 one2all 对齐字段落到公共模型；视图层先用可选扩展保持旧数据可渲染。
export type ProjectManagementProject = Project & {
  code?: string;
  startDate?: string;
  riskLevel?: string;
  healthReason?: string;
  versionCount?: number;
  requirementCount?: number;
  taskCount?: number;
  completedTaskCount?: number;
};

export type ProjectManagementVersion = RequirementVersion & {
  type?: string;
  owner?: string;
  ownerMemberId?: string;
  ownerAvatarUrl?: string;
  actualStartDate?: string;
  actualReleaseDate?: string;
  actualEndDate?: string;
  actualCompletedDate?: string;
  progress?: number;
  riskLevel?: string;
  health?: number | string;
  healthReason?: string;
  requirementCount?: number;
  taskCount?: number;
  completedTaskCount?: number;
  deliveryNodes?: ProjectDeliveryNode[];
};

export type ProjectManagementRequirement = Requirement & {
  description?: string;
  designOwner?: string;
  designOwnerMemberId?: string;
  developerOwners?: string[];
  developerOwnerMemberIds?: string[];
  startDate?: string;
  dueDate?: string;
};

export type ProjectManagementTask = Task & {
  requirementId?: string;
  requirementTitle?: string;
  description?: string;
  taskType?: string;
  storyPoints?: number;
  estimatedMinutes?: number;
};

export type ProjectsViewProps = {
  projects: ProjectManagementProject[];
  versions: ProjectManagementVersion[];
  requirements?: ProjectManagementRequirement[];
  tasks: ProjectManagementTask[];
  risks?: Risk[];
  bugs?: BugReport[];
  members?: DashboardMember[];
  projectPermissions?: ProjectPermission[];
  activities?: ProjectActivity[];
  currentMemberId?: string;
  versionFilter: string;
  versionOptions: RequirementVersionOption[];
  activeProjectId?: string;
  activeVersionId?: string;
  activeDetailTab?: ProjectDetailTab;
  onActiveProjectChange?: (projectId: string) => void;
  onActiveVersionChange?: (versionId?: string) => void;
  onActiveDetailTabChange?: (tab: ProjectDetailTab) => void;
  onCreateProject?: () => void;
  onEditProject?: (project: ProjectManagementProject) => void;
  onDeleteProject?: (project: ProjectManagementProject) => void;
  onCreateVersion?: () => void;
  onEditVersion?: (version: ProjectManagementVersion) => void;
  canEditVersion?: (version: ProjectManagementVersion) => boolean;
  onDeleteVersion?: (version: ProjectManagementVersion) => void;
  onUpdateVersionDeliveryNodes?: (
    version: ProjectManagementVersion,
    deliveryNodes: ProjectDeliveryNode[]
  ) => Promise<boolean | void>;
  onCreateRequirement?: (version: ProjectManagementVersion) => void;
  canCreateRequirementForVersion?: (version: ProjectManagementVersion) => boolean;
  canUpdateVersionDeliveryNodes?: (version: ProjectManagementVersion) => boolean;
  canEditRequirement?: (requirement: ProjectManagementRequirement) => boolean;
  canDeleteRequirement?: (requirement: ProjectManagementRequirement) => boolean;
  canEditTask?: (task: ProjectManagementTask) => boolean;
  onEditRequirement?: (requirement: ProjectManagementRequirement) => void;
  onDeleteRequirement?: (requirement: ProjectManagementRequirement) => void;
  onOpenRequirement?: (requirement: ProjectManagementRequirement) => void;
  onSaveProjectPermission?: (input: ProjectPermissionInput) => Promise<boolean | void>;
  onRemoveProjectPermission?: (permission: ProjectPermission) => Promise<boolean | void>;
  onLoadEffectivePermission?: (
    permission: ProjectPermission
  ) => Promise<ProjectEffectivePermission | void>;
  onTransferProjectOwner?: (input: ProjectOwnerTransferInput) => Promise<boolean | void>;
  onOpenCalendarItem: (item: ProjectCalendarItem) => void;
  onRescheduleCalendarItem: (
    item: ProjectCalendarItem,
    change: ProjectCalendarScheduleChange
  ) => Promise<boolean>;
  onVersionFilterChange: (value: string) => void;
};

export type ProjectRiskBlocker = {
  id: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail: string;
};
