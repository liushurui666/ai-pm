import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import type { DashboardMember, DashboardPermissions, FeishuUser, MemberRole } from "@/types/dashboard";

export type DashboardPermissionAction =
  | "member:manage"
  | "requirement:create"
  | "requirement:update"
  | "requirement:delete";

export const memberRoleLabels: Record<MemberRole, string> = {
  owner: "所有者",
  admin: "管理员",
  productAdmin: "产品管理员",
  productMember: "产品成员",
  frontend: "前端",
  backend: "后端",
  qa: "测试",
  viewer: "只读成员"
};

const rolePermissions: Record<MemberRole, Omit<DashboardPermissions, "deniedReason">> = {
  owner: {
    canManageMembers: true,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: true,
    canDeleteRecords: true
  },
  admin: {
    canManageMembers: true,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: true,
    canDeleteRecords: true
  },
  productAdmin: {
    canManageMembers: false,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: true,
    canDeleteRecords: false
  },
  productMember: {
    canManageMembers: false,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: false,
    canDeleteRecords: false
  },
  frontend: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canDeleteRecords: false
  },
  backend: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canDeleteRecords: false
  },
  qa: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canDeleteRecords: false
  },
  viewer: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canDeleteRecords: false
  }
};

const localAdminPermissions: DashboardPermissions = {
  canManageMembers: true,
  canCreateRequirements: true,
  canEditRequirements: true,
  canDeleteRequirements: true,
  canDeleteRecords: true
};

const noPermission: DashboardPermissions = {
  canManageMembers: false,
  canCreateRequirements: false,
  canEditRequirements: false,
  canDeleteRequirements: false,
  canDeleteRecords: false
};

function normalizeIdentity(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function getMemberIdentities(member: DashboardMember) {
  return [
    member.id,
    member.email,
    member.name,
    ...member.identities.flatMap((identity) => [
      identity.providerUserId,
      identity.providerUnionId,
      identity.providerTenantUserId,
      identity.email
    ])
  ]
    .map(normalizeIdentity)
    .filter(Boolean);
}

function getUserIdentities(user?: FeishuUser | null) {
  return [user?.openId, user?.unionId, user?.userId, user?.email, user?.name, user?.enName]
    .map(normalizeIdentity)
    .filter(Boolean);
}

export function findMemberForUser(members: DashboardMember[], user?: FeishuUser | null) {
  const userIdentities = getUserIdentities(user);

  if (!userIdentities.length) {
    return undefined;
  }

  return members.find((member) => {
    const memberIdentities = getMemberIdentities(member);

    return userIdentities.some((identity) => memberIdentities.includes(identity));
  });
}

export function findWorkspaceMemberForUser(members: DashboardMember[], workspaceId: string, user?: FeishuUser | null) {
  return findMemberForUser(
    members.filter((member) => member.workspaceId === workspaceId),
    user
  );
}

export function getDashboardPermissions(member?: DashboardMember | null): DashboardPermissions {
  if (!member && !isFeishuAuthConfigured()) {
    return localAdminPermissions;
  }

  if (!member) {
    return {
      ...noPermission,
      deniedReason: "你还不是成员，请联系管理员添加到成员管理。"
    };
  }

  if (member.status !== "active") {
    return {
      ...noPermission,
      deniedReason: "成员已被禁用，请联系管理员。"
    };
  }

  return rolePermissions[member.role];
}

export function canPerformAction(permissions: DashboardPermissions, action: DashboardPermissionAction) {
  if (action === "member:manage") {
    return permissions.canManageMembers;
  }

  if (action === "requirement:create") {
    return permissions.canCreateRequirements;
  }

  if (action === "requirement:update") {
    return permissions.canEditRequirements;
  }

  return permissions.canDeleteRequirements;
}

export function getPermissionDeniedReason(permissions: DashboardPermissions, action: DashboardPermissionAction) {
  if (permissions.deniedReason) {
    return permissions.deniedReason;
  }

  if (action === "member:manage") {
    return "只有所有者或管理员可以管理成员。";
  }

  if (action === "requirement:create") {
    return "只有产品成员及以上角色可以创建需求和版本。";
  }

  if (action === "requirement:update") {
    return "只有产品成员及以上角色可以编辑需求和版本。";
  }

  return "只有产品管理员及以上角色可以删除需求和版本。";
}
