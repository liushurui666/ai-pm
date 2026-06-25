import fs from "node:fs";
import path from "node:path";
import { updateDashboardWithWorkspace } from "@/components/project-management-platform/state/dashboard-updates";
import type { DashboardData, DashboardMember, DashboardWorkspace } from "@/types/dashboard";

type WorkspaceManagementCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const routePath = path.join(repoRoot, "app/api/workspaces/route.ts");
const platformPath = path.join(repoRoot, "src/components/project-management-platform/index.tsx");
const accountPopoverPath = path.join(
  repoRoot,
  "src/components/project-management-platform/shared/workbench-sidebar/account-popover/index.tsx"
);
const drawerPath = path.join(repoRoot, "src/components/project-management-platform/drawers/workspace-drawer/index.tsx");
const localDashboardPath = path.join(repoRoot, "src/data/local-dashboard.ts");

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): WorkspaceManagementCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "工作区管理冒烟失败"
      },
      name,
      ok: false
    };
  }
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function createWorkspace(id: string, name: string): DashboardWorkspace {
  const now = "2026-06-25T00:00:00.000Z";

  return {
    id,
    name,
    description: `${name} 描述`,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function createMember(id: string, workspaceId: string, role: DashboardMember["role"]): DashboardMember {
  const now = "2026-06-25T00:00:00.000Z";

  return {
    id,
    workspaceId,
    name: `成员 ${id}`,
    email: `${id}@example.test`,
    registrationChannel: "github",
    role,
    status: "active",
    identities: [
      {
        provider: "github",
        providerUserId: `auth_${id}`,
        email: `${id}@example.test`
      }
    ],
    notification: {
      channels: [],
      feishuEnabled: false,
      taskAssigned: true,
      requirementChanged: true
    },
    createdAt: now,
    updatedAt: now
  };
}

function createDashboardData(): DashboardData {
  const workspace = createWorkspace("workspace-existing", "既有工作区");
  const currentMember = createMember("member-viewer", workspace.id, "viewer");

  return {
    metrics: {
      activeProjects: 0,
      aiSavedHours: 0,
      deliveryRate: 0,
      overdueTasks: 0
    },
    projects: [],
    tasks: [],
    bugs: [],
    risks: [],
    requirementVersions: [],
    requirements: [],
    documents: [],
    workspaces: [workspace],
    members: [currentMember],
    weeklyInsight: [],
    meta: {
      source: "database",
      currentWorkspace: workspace,
      currentMember,
      permissions: {
        canCreateRequirements: false,
        canDeleteBugs: false,
        canDeleteRecords: false,
        canDeleteRequirements: false,
        canEditBugs: false,
        canEditBugsFully: false,
        canEditRequirements: false,
        canManageMembers: false,
        deniedReason: "viewer 只能查看当前工作区"
      },
      user: {
        authProvider: "github",
        authUserId: "auth_member-viewer",
        email: "member-viewer@example.test",
        name: "只读成员",
        openId: "auth_member-viewer"
      }
    }
  };
}

function verifyRouteContract() {
  const routeText = readText(routePath);

  // 工作区创建是平台级动作：服务端只要求登录和基础参数，不读取当前工作区权限。
  assertSmoke(routeText.includes("getSession()"), "工作区创建接口缺少会话读取。");
  assertSmoke(routeText.includes("isAuthServiceConfigured() && !session"), "工作区创建接口缺少未登录保护。");
  assertSmoke(routeText.includes("工作区参数不完整"), "工作区创建接口缺少参数校验。");
  assertSmoke(routeText.includes("createDashboardWorkspace(body.values, session?.user)"), "工作区创建接口没有把登录用户作为 owner 传入服务层。");
  assertSmoke(!routeText.includes("getDashboardPermissions"), "工作区创建接口不应复用当前工作区权限。");
  assertSmoke(!routeText.includes("canManageMembers"), "工作区创建接口不应要求成员管理权限。");

  return {
    authProtected: true,
    platformLevelAction: true
  };
}

function verifyServiceContract() {
  const localDashboardText = readText(localDashboardPath);

  // 服务层负责重名校验、创建 owner 成员和增量写库，避免新建空间误触全量 dashboard 同步。
  assertSmoke(localDashboardText.includes("工作区名称已存在"), "工作区创建服务缺少重名保护。");
  assertSmoke(localDashboardText.includes("createMemberFromUser(user, \"owner\", workspace.id)"), "工作区创建服务没有把创建者写成 owner。");
  assertSmoke(localDashboardText.includes("createDashboardWorkspaceDatabase(workspace, member)"), "工作区创建服务没有走增量写库 helper。");
  assertSmoke(!localDashboardText.includes("await writeDashboardDatabase({\n    ...data,\n    workspaces"), "工作区创建服务不应走全量 dashboard 写库。");

  return {
    duplicateGuard: true,
    ownerCreated: true,
    incrementalWrite: true
  };
}

function verifyFrontendContract() {
  const platformText = readText(platformPath);
  const accountPopoverText = readText(accountPopoverPath);
  const drawerText = readText(drawerPath);

  // 回归重点：只读成员也能创建自己的新工作区，前端入口不能再被当前工作区 member:manage 权限禁用。
  assertSmoke(platformText.includes("canCreateWorkspace={Boolean(data)}"), "工作区创建入口不应绑定 canManageMembers 权限。");
  assertSmoke(!platformText.includes("canCreateWorkspace={Boolean(permissions?.canManageMembers)}"), "工作区创建入口仍被成员管理权限限制。");
  assertSmoke(platformText.includes("fetchWithAuthRedirect(\"/api/workspaces\""), "前端没有调用工作区创建接口。");
  assertSmoke(platformText.includes("currentWorkspaceId"), "工作区创建请求没有携带当前工作区上下文。");
  assertSmoke(platformText.includes("values: serializeCreateValues(values)"), "工作区创建请求没有序列化表单值。");
  assertSmoke(platformText.includes("updateDashboardWithWorkspace"), "工作区创建成功后没有更新本地工作区列表。");
  assertSmoke(platformText.includes("await switchWorkspace(payload.workspace.id)"), "工作区创建成功后没有立即切换到新工作区。");
  assertSmoke(platformText.includes("workspaceForm.resetFields()"), "打开新建工作区前没有重置表单。");
  assertSmoke(accountPopoverText.includes("showWorkspaceControls && workspaces?.length"), "左下角/顶栏工作区控件开关契约丢失。");
  assertSmoke(accountPopoverText.includes("新建工作区"), "账号弹层缺少新建工作区入口。");
  assertSmoke(drawerText.includes("title=\"新建工作区\""), "工作区抽屉标题缺失。");
  assertSmoke(drawerText.includes("请输入工作区名称"), "工作区抽屉缺少名称必填校验。");
  assertSmoke(drawerText.includes("DrawerFooterActions"), "工作区抽屉没有复用统一 footer 操作。");

  return {
    createAllowedForLoadedWorkbench: true,
    switchesAfterCreate: true,
    drawerValidated: true
  };
}

function verifyDashboardUpdate() {
  const data = createDashboardData();
  const workspace = createWorkspace("workspace-created", "新工作区");
  const owner = createMember("member-owner", workspace.id, "owner");
  const updated = updateDashboardWithWorkspace(data, workspace, owner, "已创建工作区：新工作区。");

  // 这个纯函数决定了接口返回后 UI 是否马上出现新工作区和 owner 成员；
  // 对 viewer 样本执行可证明创建能力不依赖当前工作区管理权限。
  assertSmoke(updated.workspaces[0]?.id === workspace.id, "新工作区没有插入工作区列表头部。");
  assertSmoke(updated.members.some((member) => member.id === owner.id && member.role === "owner"), "新工作区 owner 成员没有进入本地成员列表。");
  assertSmoke(updated.meta?.message === "已创建工作区：新工作区。", "创建成功消息没有写入 meta。");
  assertSmoke(data.meta?.permissions?.canManageMembers === false, "测试样本必须是无成员管理权限的 viewer。");

  return {
    memberCount: updated.members.length,
    workspaceCount: updated.workspaces.length,
    viewerCanCreateLocally: true
  };
}

const results = [
  runCheck("route contract", verifyRouteContract),
  runCheck("service contract", verifyServiceContract),
  runCheck("frontend contract", verifyFrontendContract),
  runCheck("dashboard update", verifyDashboardUpdate)
];
const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  checked: results.length,
  failed: failed.length,
  results
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
