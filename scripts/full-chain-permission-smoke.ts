import { config as loadEnv } from "dotenv";
import {
  canPerformAction,
  findMemberForUser,
  findWorkspaceMemberForUser,
  getDashboardPermissions,
  getPermissionDeniedReason,
  type DashboardPermissionAction
} from "@/lib/access/permissions";
import type { DashboardMember, DashboardPermissions, FeishuUser, MemberRole } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";
const OTHER_WORKSPACE_ID = `${WORKSPACE_ID}-other`;

type PermissionExpectation = Omit<DashboardPermissions, "deniedReason">;

const expectedByRole: Record<MemberRole, PermissionExpectation> = {
  owner: {
    canManageMembers: true,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: true,
    canEditBugs: true,
    canEditBugsFully: true,
    canDeleteBugs: true,
    canDeleteRecords: true
  },
  admin: {
    canManageMembers: true,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: true,
    canEditBugs: true,
    canEditBugsFully: true,
    canDeleteBugs: true,
    canDeleteRecords: true
  },
  productAdmin: {
    canManageMembers: false,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: true,
    canEditBugs: true,
    canEditBugsFully: false,
    canDeleteBugs: false,
    canDeleteRecords: false
  },
  productMember: {
    canManageMembers: false,
    canCreateRequirements: true,
    canEditRequirements: true,
    canDeleteRequirements: false,
    canEditBugs: true,
    canEditBugsFully: false,
    canDeleteBugs: false,
    canDeleteRecords: false
  },
  frontend: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canEditBugs: true,
    canEditBugsFully: false,
    canDeleteBugs: false,
    canDeleteRecords: false
  },
  backend: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canEditBugs: true,
    canEditBugsFully: false,
    canDeleteBugs: false,
    canDeleteRecords: false
  },
  qa: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canEditBugs: true,
    canEditBugsFully: true,
    canDeleteBugs: true,
    canDeleteRecords: false
  },
  viewer: {
    canManageMembers: false,
    canCreateRequirements: false,
    canEditRequirements: false,
    canDeleteRequirements: false,
    canEditBugs: false,
    canEditBugsFully: false,
    canDeleteBugs: false,
    canDeleteRecords: false
  }
};

const actionExpectationByRole: Record<MemberRole, Record<DashboardPermissionAction, boolean>> = {
  owner: {
    "member:manage": true,
    "bug:update": true,
    "bug:delete": true,
    "requirement:create": true,
    "requirement:update": true,
    "requirement:delete": true
  },
  admin: {
    "member:manage": true,
    "bug:update": true,
    "bug:delete": true,
    "requirement:create": true,
    "requirement:update": true,
    "requirement:delete": true
  },
  productAdmin: {
    "member:manage": false,
    "bug:update": true,
    "bug:delete": false,
    "requirement:create": true,
    "requirement:update": true,
    "requirement:delete": true
  },
  productMember: {
    "member:manage": false,
    "bug:update": true,
    "bug:delete": false,
    "requirement:create": true,
    "requirement:update": true,
    "requirement:delete": false
  },
  frontend: {
    "member:manage": false,
    "bug:update": true,
    "bug:delete": false,
    "requirement:create": false,
    "requirement:update": false,
    "requirement:delete": false
  },
  backend: {
    "member:manage": false,
    "bug:update": true,
    "bug:delete": false,
    "requirement:create": false,
    "requirement:update": false,
    "requirement:delete": false
  },
  qa: {
    "member:manage": false,
    "bug:update": true,
    "bug:delete": true,
    "requirement:create": false,
    "requirement:update": false,
    "requirement:delete": false
  },
  viewer: {
    "member:manage": false,
    "bug:update": false,
    "bug:delete": false,
    "requirement:create": false,
    "requirement:update": false,
    "requirement:delete": false
  }
};

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createMember(role: MemberRole, overrides: Partial<DashboardMember> = {}): DashboardMember {
  const now = new Date().toISOString();
  const authUserId = `auth-permission-${role}`;

  return {
    id: `member-permission-${role}`,
    workspaceId: WORKSPACE_ID,
    name: `权限测试 ${role}`,
    email: `${role}@permission-smoke.test`,
    registrationChannel: "email",
    role,
    status: "active",
    identities: [
      {
        provider: "email",
        providerUserId: authUserId,
        email: `${role}@permission-smoke.test`
      }
    ],
    notification: {
      channels: [],
      feishuEnabled: false,
      taskAssigned: false,
      requirementChanged: false
    },
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createUser(authUserId: string, overrides: Partial<FeishuUser> = {}): FeishuUser {
  return {
    authProvider: "email",
    authUserId,
    email: `${authUserId}@permission-smoke.test`,
    name: `权限用户 ${authUserId}`,
    openId: `open-${authUserId}`,
    ...overrides
  };
}

function pickPermissionShape(permissions: DashboardPermissions): PermissionExpectation {
  return {
    canManageMembers: permissions.canManageMembers,
    canCreateRequirements: permissions.canCreateRequirements,
    canEditRequirements: permissions.canEditRequirements,
    canDeleteRequirements: permissions.canDeleteRequirements,
    canEditBugs: permissions.canEditBugs,
    canEditBugsFully: permissions.canEditBugsFully,
    canDeleteBugs: permissions.canDeleteBugs,
    canDeleteRecords: permissions.canDeleteRecords
  };
}

function assertSamePermissionShape(role: MemberRole, actual: PermissionExpectation, expected: PermissionExpectation) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key as keyof PermissionExpectation];

    assertSmoke(actualValue === expectedValue, `${role} 的 ${key} 权限应为 ${expectedValue}，实际为 ${actualValue}`);
  }
}

function verifyRoleMatrix() {
  const roles = Object.keys(expectedByRole) as MemberRole[];
  const matrix = roles.map((role) => {
    const permissions = getDashboardPermissions(createMember(role));
    const actualShape = pickPermissionShape(permissions);

    assertSamePermissionShape(role, actualShape, expectedByRole[role]);

    for (const [action, expected] of Object.entries(actionExpectationByRole[role])) {
      const allowed = canPerformAction(permissions, action as DashboardPermissionAction);

      assertSmoke(allowed === expected, `${role} 执行 ${action} 应为 ${expected}，实际为 ${allowed}`);
    }

    return {
      role,
      ...actualShape
    };
  });

  return matrix;
}

function verifyDeniedStates() {
  const disabledPermissions = getDashboardPermissions(createMember("admin", {
    status: "disabled"
  }));
  const missingMemberPermissions = getDashboardPermissions(undefined);

  // 正式 Better Auth 运行态下，禁用成员和未加入成员必须全部拒绝；这个分支保护登录成功但未被加入工作区的用户。
  assertSmoke(!disabledPermissions.canManageMembers, "禁用管理员不应继续管理成员");
  assertSmoke(!disabledPermissions.canEditBugs, "禁用成员不应继续编辑 Bug");
  assertSmoke(disabledPermissions.deniedReason === "成员已被禁用，请联系管理员。", "禁用成员拒绝原因不正确");
  assertSmoke(!missingMemberPermissions.canManageMembers, "未加入成员不应拥有管理权限");
  assertSmoke(!missingMemberPermissions.canCreateRequirements, "未加入成员不应创建需求");
  assertSmoke(missingMemberPermissions.deniedReason === "你还不是成员，请联系管理员添加到成员管理。", "未加入成员拒绝原因不正确");

  const deniedReasons = {
    bugDelete: getPermissionDeniedReason(getDashboardPermissions(createMember("productMember")), "bug:delete"),
    memberManage: getPermissionDeniedReason(getDashboardPermissions(createMember("viewer")), "member:manage"),
    requirementCreate: getPermissionDeniedReason(getDashboardPermissions(createMember("viewer")), "requirement:create"),
    requirementDelete: getPermissionDeniedReason(getDashboardPermissions(createMember("productMember")), "requirement:delete")
  };

  assertSmoke(deniedReasons.bugDelete.includes("测试"), "Bug 删除拒绝原因应提示测试/管理员权限");
  assertSmoke(deniedReasons.memberManage.includes("所有者") || deniedReasons.memberManage.includes("管理员"), "成员管理拒绝原因应提示管理员权限");
  assertSmoke(deniedReasons.requirementCreate.includes("产品成员"), "需求创建拒绝原因应提示产品成员权限");
  assertSmoke(deniedReasons.requirementDelete.includes("产品管理员"), "需求删除拒绝原因应提示产品管理员权限");

  return {
    disabledDeniedReason: disabledPermissions.deniedReason,
    missingDeniedReason: missingMemberPermissions.deniedReason,
    deniedReasons
  };
}

function verifyIdentityMatching() {
  const owner = createMember("owner");
  const viewer = createMember("viewer", {
    id: "member-permission-viewer-other-workspace",
    workspaceId: OTHER_WORKSPACE_ID,
    identities: [
      {
        provider: "email",
        providerUserId: "auth-permission-viewer",
        email: "viewer@permission-smoke.test"
      }
    ]
  });
  const emailOnlyMember = createMember("productMember", {
    id: "member-permission-email-only",
    identities: [
      {
        provider: "email",
        providerUserId: "legacy-email-only@example.test",
        email: "legacy-email-only@example.test"
      }
    ]
  });
  const members = [owner, viewer, emailOnlyMember];

  const matchedOwner = findMemberForUser(members, createUser("auth-permission-owner"));
  const scopedOwner = findWorkspaceMemberForUser(members, WORKSPACE_ID, createUser("auth-permission-owner"));
  const scopedViewer = findWorkspaceMemberForUser(members, WORKSPACE_ID, createUser("auth-permission-viewer"));
  const otherWorkspaceViewer = findWorkspaceMemberForUser(members, OTHER_WORKSPACE_ID, createUser("auth-permission-viewer"));
  const emailGuessUser = createUser("auth-email-guess", {
    email: "legacy-email-only@example.test",
    openId: "legacy-email-only@example.test"
  });

  // 登录身份只允许用 Auth Service 的 authUserId 匹配成员 identities.providerUserId；
  // 不能因为 email/openId 恰好相同就把历史成员误认为当前用户，否则跨 provider 登录会串权限。
  assertSmoke(matchedOwner?.id === owner.id, "findMemberForUser 未按 authUserId 匹配 owner");
  assertSmoke(scopedOwner?.id === owner.id, "findWorkspaceMemberForUser 未匹配当前工作区 owner");
  assertSmoke(!scopedViewer, "工作区过滤不应返回其他工作区成员");
  assertSmoke(otherWorkspaceViewer?.id === viewer.id, "指定其他工作区时应返回对应成员");
  assertSmoke(!findMemberForUser(members, emailGuessUser), "仅 email/openId 相同不应匹配成员权限");

  return {
    matchedOwnerId: matchedOwner?.id,
    otherWorkspaceViewerId: otherWorkspaceViewer?.id,
    emailGuessMatched: Boolean(findMemberForUser(members, emailGuessUser))
  };
}

async function main() {
  const matrix = verifyRoleMatrix();
  const deniedStates = verifyDeniedStates();
  const identityMatching = verifyIdentityMatching();

  console.log(JSON.stringify({
    ok: true,
    workspaceId: WORKSPACE_ID,
    checkedRoles: matrix.length,
    checkedActions: Object.keys(actionExpectationByRole.owner).length,
    matrix,
    deniedStates,
    identityMatching
  }, null, 2));
}

main().catch((error) => {
  console.error("[full-chain-permission-smoke] failed", error);
  process.exitCode = 1;
});
