// 项目治理领域只从这个入口暴露 API 服务与跨接口 helper，避免 route 和 records 写链直接依赖内部查询细节。
export {
  authorizeProjectMutation,
  authorizeProjectMutationForActorMember,
  authorizeProjectMutationsForActorMember
} from "@/lib/project-management/access";
export { recordProjectActivityForMutation } from "@/lib/project-management/activity";
export {
  canManageRequirementForActor,
  canManageTaskForActor
} from "@/lib/project-management/effective-permissions";
export { getProjectManagementSnapshot } from "@/lib/project-management/queries";
export {
  addProjectMembers,
  removeProjectMember,
  updateProjectMember
} from "@/lib/project-management/mutations";
export { transferProjectOwner } from "@/lib/project-management/owner-transfer";
export {
  parseFunctionalRolesInput,
  parseProjectAccessLevel
} from "@/lib/project-management/normalizers";
export { ProjectManagementError } from "@/lib/project-management/types";
export type {
  AuthorizeProjectMutationInput,
  EffectiveProjectPermission,
  ProjectActorAccess,
  ProjectCapabilities,
  ProjectManagementSnapshot,
  ProjectMemberPermissionView,
  ProjectMutationAuthorization,
  RecordProjectActivityInput,
  RecordProjectActivityResult
} from "@/lib/project-management/types";
