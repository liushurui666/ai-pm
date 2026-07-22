import { readDashboardMembersDatabase } from "@/data/database-dashboard";
import { resolveProjectAccessState } from "@/lib/project-management/access";
import { ProjectManagementError } from "@/lib/project-management/types";
import type { DashboardMember, FeishuUser } from "@/types/dashboard";

type ProjectAccessState = Awaited<ReturnType<typeof resolveProjectAccessState>>;
type ProjectAccessStateWithProject = Omit<ProjectAccessState, "project"> & {
  project: NonNullable<ProjectAccessState["project"]>;
};

export function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function requireGovernanceCapability(
  input: { user?: FeishuUser | null; workspaceId?: string; projectId: string },
  capability: "canManageMembers" | "canTransferOwner"
) {
  const state = await resolveProjectAccessState(input);

  if (!state.project) {
    throw new ProjectManagementError("项目不存在或不属于当前工作区。", 404);
  }

  if (!state.capabilities[capability]) {
    throw new ProjectManagementError(
      capability === "canTransferOwner"
        ? "只有工作区所有者、工作区管理员或项目负责人可以更换项目负责人。"
        : "只有工作区管理员、项目负责人或项目管理员可以管理项目成员。",
      403
    );
  }

  return { ...state, project: state.project } satisfies ProjectAccessStateWithProject;
}

export function projectActivityActor(state: ProjectAccessState) {
  return {
    actorMemberId: state.currentMember?.id ?? null,
    actorName: state.currentMember?.name || (state.isLocalDemo ? "本地管理员" : "系统")
  };
}

export async function loadActiveWorkspaceMembers(workspaceId: string, memberIds: string[]) {
  const members = await readDashboardMembersDatabase(workspaceId);
  const membersById = new Map(members.map((member) => [member.id, member]));
  const missing = memberIds.filter((memberId) => !membersById.has(memberId));
  const disabled = memberIds.filter((memberId) => membersById.get(memberId)?.status !== "active");

  if (missing.length) {
    throw new ProjectManagementError(`以下成员不属于当前工作区：${missing.join("、")}`, 400);
  }

  if (disabled.length) {
    throw new ProjectManagementError(`已禁用成员不能加入项目：${disabled.map((id) => membersById.get(id)?.name || id).join("、")}`, 400);
  }

  return memberIds.map((memberId) => membersById.get(memberId) as DashboardMember);
}
