import fs from "node:fs";
import path from "node:path";
import {
  ProjectMutationScopeError,
  resolveSingleProjectRelationTarget,
  selectUniqueProjectNameCandidate
} from "../src/lib/project-management/record-scope-core";
import {
  countRequirementVersionReferences,
  requiresRequirementVersionFallback,
  selectAutomaticRequirementVersionFallback
} from "../src/lib/project-management/deletion-policy";
import {
  canManageRequirementForActor,
  canManageTaskForActor,
  capabilitiesFromPermissionFacts,
  getLegacyProductMutationDecision,
  hasScopedFunctionalRole,
  resolveLegacyProjectProductRole
} from "../src/lib/project-management/effective-permissions";
import {
  canUpdateRequirementFields,
  getChangedRequirementFields,
  isProjectArchiveStatusTransition
} from "../src/lib/project-management/mutation-policy-core";
import {
  canReadProject,
  resolveVisibleRecordProjectId,
  uniqueProjectIdByName,
  visibleProjectIds
} from "../src/lib/project-management/visibility";
import {
  findDuplicateDeliveryMilestoneLabelId,
  getVersionDeliveryLabelCatalog,
  normalizeProjectDeliveryLabelCatalog
} from "../src/data/project-delivery-labels";
import { normalizeTaskPriority, taskPriorityOptions } from "../src/lib/tasks/priority";
import {
  getDeliveryNodes,
  getVersionProgress,
  getVersionTasks,
  resolveProjectIdForRecord
} from "../src/components/project-management-platform/views/projects-view/utils";
import type { DashboardMember } from "../src/types/dashboard";

type ProjectManagementCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const schemaPath = path.join(repoRoot, "prisma/schema.prisma");
const migrationPath = path.join(repoRoot, "prisma/migrations/20260722000100_align_one2all_pm/migration.sql");
const dashboardTypesPath = path.join(repoRoot, "src/types/dashboard.ts");
const dashboardSeedDataPath = path.join(repoRoot, "src/data/dashboard.ts");
const localDashboardPath = path.join(repoRoot, "src/data/local-dashboard.ts");
const databaseDashboardPath = path.join(repoRoot, "src/data/database-dashboard.ts");
const databaseSeedPath = path.join(repoRoot, "src/data/dashboard-database-seed.ts");
const projectsViewDir = path.join(repoRoot, "src/components/project-management-platform/views/projects-view");
const projectsViewPath = path.join(projectsViewDir, "index.tsx");
const projectsViewUtilsPath = path.join(projectsViewDir, "utils.ts");
const dashboardUpdatesPath = path.join(repoRoot, "src/components/project-management-platform/state/dashboard-updates.ts");
const formsDir = path.join(repoRoot, "src/components/project-management-platform/forms");
const recordsRoutePath = path.join(repoRoot, "app/api/records/route.ts");
const recordScopePath = path.join(repoRoot, "src/lib/project-management/record-scope.ts");
const projectAccessPath = path.join(repoRoot, "src/lib/project-management/access.ts");
const projectNormalizersPath = path.join(repoRoot, "src/lib/project-management/normalizers.ts");
const projectMutationPolicyPath = path.join(repoRoot, "src/lib/project-management/mutation-policy-core.ts");
const projectActivityPath = path.join(repoRoot, "src/lib/project-management/activity.ts");
const derivedRolesPath = path.join(repoRoot, "src/lib/project-management/derived-roles.ts");
const projectVisibilityPath = path.join(repoRoot, "src/lib/project-management/visibility.ts");
const effectivePermissionsPath = path.join(repoRoot, "src/lib/project-management/effective-permissions.ts");
const governanceRoutePath = path.join(repoRoot, "app/api/project-management/route.ts");
const governanceMutationsPath = path.join(repoRoot, "src/lib/project-management/mutations.ts");
const governanceQueriesPath = path.join(repoRoot, "src/lib/project-management/queries.ts");
const ownerTransferPath = path.join(repoRoot, "src/lib/project-management/owner-transfer.ts");
const platformPath = path.join(repoRoot, "src/components/project-management-platform/index.tsx");
const platformConstantsPath = path.join(repoRoot, "src/components/project-management-platform/constants.ts");
const overviewUtilsPath = path.join(repoRoot, "src/components/project-management-platform/views/overview-utils.ts");
const projectFieldsPath = path.join(formsDir, "project-fields/index.tsx");
const editRecordDrawersPath = path.join(formsDir, "edit-record-drawers/index.tsx");
const assistantQueuePath = path.join(repoRoot, "src/lib/ai/assistant-action-jobs/queue.ts");
const assistantToolsPath = path.join(repoRoot, "src/lib/ai/assistant-tools.ts");
const assistantClientPath = path.join(repoRoot, "src/lib/ai/client.ts");
const assistantRuntimePath = path.join(repoRoot, "src/lib/ai/assistant-internal-actions.ts");
const assistantRoutePath = path.join(repoRoot, "app/api/assistant/route.ts");
const documentAnalyzeRoutePath = path.join(repoRoot, "app/api/documents/analyze/route.ts");
const documentBreakdownPath = path.join(repoRoot, "src/lib/documents/breakdown.ts");
const weeklyReportPath = path.join(repoRoot, "src/lib/reports/weekly-report.ts");
const formUtilsPath = path.join(formsDir, "form-utils.ts");
const taskPriorityPath = path.join(repoRoot, "src/lib/tasks/priority.ts");
const assistantSecurityMigrationPath = path.join(
  repoRoot,
  "prisma/migrations/20260722000200_secure_assistant_task_actions/migration.sql"
);
const projectMembersPath = path.join(projectsViewDir, "project-members/index.tsx");
const projectRequirementsPath = path.join(projectsViewDir, "project-requirements/index.tsx");
const projectSchedulePath = path.join(projectsViewDir, "project-schedule/index.tsx");
const projectOverviewPath = path.join(projectsViewDir, "project-overview/index.tsx");
const projectDeliveryTablePath = path.join(projectsViewDir, "project-delivery-table/index.tsx");
const projectActivitiesPath = path.join(projectsViewDir, "project-activities/index.tsx");
const projectProgressCalendarPath = path.join(repoRoot, "src/components/project-management-platform/views/project-progress-calendar/index.tsx");
const projectSchedulerUtilsPath = path.join(repoRoot, "src/components/project-management-platform/views/project-scheduler-utils.ts");
const tasksViewPath = path.join(repoRoot, "src/components/project-management-platform/views/tasks-view/index.tsx");
const taskStageBoardPath = path.join(repoRoot, "src/components/project-management-platform/views/task-stage-board/index.tsx");
const taskOwnerBoardPath = path.join(repoRoot, "src/components/project-management-platform/views/task-owner-board/index.tsx");
const taskFieldsPath = path.join(formsDir, "task-fields/index.tsx");
const requirementFieldsPath = path.join(formsDir, "requirement-fields/index.tsx");
const versionParentFieldPath = path.join(formsDir, "version-parent-field/index.tsx");
const bugsViewPath = path.join(repoRoot, "src/components/project-management-platform/views/bugs-view/index.tsx");
const deliveryLabelMigrationPath = path.join(
  repoRoot,
  "prisma/migrations/20260722000300_add_project_delivery_label_catalog/migration.sql"
);
const versionDeliveryLabelMigrationPath = path.join(
  repoRoot,
  "prisma/migrations/20260722000500_add_requirement_version_delivery_label_catalog/migration.sql"
);
const versionOwnerMigrationPath = path.join(
  repoRoot,
  "prisma/migrations/20260722000400_add_requirement_version_owner/migration.sql"
);
const deliveryLabelDataPath = path.join(repoRoot, "src/data/project-delivery-labels.ts");
const deliveryLabelFieldsDir = path.join(formsDir, "delivery-label-catalog-fields");
const milestoneFieldsPath = path.join(formsDir, "milestone-fields/index.tsx");
const versionFieldsPath = path.join(formsDir, "version-fields/index.tsx");

function readText(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`缺少文件：${path.relative(repoRoot, filePath)}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): ProjectManagementCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "项目管理对齐契约冒烟失败"
      },
      name,
      ok: false
    };
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPrismaModel(schemaText: string, modelName: string) {
  const match = schemaText.match(new RegExp(`model\\s+${escapeRegExp(modelName)}\\s*\\{([\\s\\S]*?)\\n\\}`));

  assertSmoke(match, `Prisma schema 缺少 ${modelName} 模型。`);

  return match[1];
}

function assertPrismaFields(modelText: string, modelName: string, fields: string[]) {
  const missingFields = fields.filter((field) => !new RegExp(`^\\s*${escapeRegExp(field)}\\s+`, "m").test(modelText));

  assertSmoke(!missingFields.length, `${modelName} 缺少字段：${missingFields.join("、")}`);
}

function assertIncludesAll(text: string, values: string[], label: string) {
  const missingValues = values.filter((value) => !text.includes(value));

  assertSmoke(!missingValues.length, `${label} 缺少：${missingValues.join("、")}`);
}

function getMigrationSection(migrationText: string, marker: string) {
  const start = migrationText.indexOf(marker);

  assertSmoke(start >= 0, `PM 对齐迁移缺少分段：${marker}`);

  const nextSection = migrationText.indexOf("-- AlterTable:", start + marker.length);

  return migrationText.slice(start, nextSection >= 0 ? nextSection : undefined);
}

function getFormFieldNames(text: string) {
  const directNames = [...text.matchAll(/name\s*=\s*"([A-Za-z0-9]+)"/g)].map((match) => match[1]);
  const listNames = [...text.matchAll(/name\s*=\s*\{\[name,\s*"([A-Za-z0-9]+)"\]\}/g)].map((match) => match[1]);

  return new Set([...directNames, ...listNames]);
}

function verifyPrismaAndMigrationContracts() {
  const schemaText = readText(schemaPath);
  const migrationText = readText(migrationPath);
  const schemaFields: Record<string, string[]> = {
    Project: ["code", "startDate", "riskLevel", "healthStatus", "healthReason", "memberPermissions", "activities"],
    ProjectTask: ["projectId", "requirementId", "requirementTitle", "description", "taskType", "storyPoints", "estimatedMinutes", "completedAt"],
    Risk: ["projectId"],
    BugReport: ["projectId"],
    RequirementVersion: ["projectId", "type", "actualStartDate", "actualCompletedDate", "progress", "riskLevel", "healthStatus", "healthReason"],
    Requirement: ["projectId", "description", "designOwner", "designOwnerMemberId", "developerMemberIds", "startDate", "dueDate"],
    ProjectMemberPermission: ["workspaceId", "projectId", "memberId", "accessLevel", "functionalRoles", "createdByMemberId", "updatedByMemberId", "createdAt", "updatedAt"],
    ProjectActivity: ["workspaceId", "projectId", "actorMemberId", "actorName", "action", "entityType", "entityId", "target", "detail", "createdAt"]
  };

  for (const [modelName, fields] of Object.entries(schemaFields)) {
    assertPrismaFields(getPrismaModel(schemaText, modelName), modelName, fields);
  }

  const permissionModel = getPrismaModel(schemaText, "ProjectMemberPermission");
  const activityModel = getPrismaModel(schemaText, "ProjectActivity");

  // 项目成员必须在单项目内唯一；项目和工作区删除时治理数据跟随清理，避免悬挂权限。
  assertSmoke(permissionModel.includes("@@unique([projectId, memberId])"), "项目成员权限缺少 projectId + memberId 唯一约束。");
  assertSmoke(permissionModel.includes("onDelete: Cascade") && activityModel.includes("onDelete: Cascade"), "治理模型缺少项目/工作区级联约束。");

  const migrationFields: Record<string, string[]> = {
    projects: ["code", "startDate", "riskLevel", "healthStatus", "healthReason"],
    project_versions: ["projectId", "type", "actualStartDate", "actualCompletedDate", "progress", "riskLevel", "healthStatus", "healthReason"],
    project_tasks: ["projectId", "requirementId", "requirementTitle", "description", "taskType", "storyPoints", "estimatedMinutes", "completedAt"],
    risks: ["projectId"],
    bug_reports: ["projectId"],
    requirements: ["projectId", "description", "designOwner", "designOwnerMemberId", "designOwnerOpenId", "designOwnerUnionId", "designOwnerUserId", "designOwnerEmail", "designOwnerAvatarUrl", "developerMemberIds", "startDate", "dueDate"]
  };

  for (const [tableName, fields] of Object.entries(migrationFields)) {
    const sectionText = getMigrationSection(migrationText, `-- AlterTable: ${tableName}`);
    assertIncludesAll(sectionText, fields.map((field) => `ADD COLUMN \`${field}\``), `${tableName} 迁移字段`);
  }
  assertIncludesAll(
    migrationText,
    ["CREATE TABLE `project_member_permissions`", "CREATE TABLE `project_activities`", "FOREIGN KEY (`projectId`)", "ON DELETE CASCADE"],
    "PM 治理迁移"
  );
  assertSmoke(migrationText.includes("JSON_ARRAY()"), "迁移没有为历史需求回填开发负责人空数组。");
  assertSmoke(migrationText.includes("version.`projectId` = project.`id`"), "迁移没有按历史项目名回填版本 projectId。");

  return {
    checkedMigrationColumns: Object.values(migrationFields).reduce((total, fields) => total + fields.length, 0),
    checkedModels: Object.keys(schemaFields).length,
    governanceTables: 2
  };
}

function verifyBugProjectIdentityContracts() {
  const schemaText = readText(schemaPath);
  const migrationText = readText(migrationPath);
  const localDashboardText = readText(localDashboardPath);
  const databaseDashboardText = readText(databaseDashboardPath);
  const projectsViewUtilsText = readText(projectsViewUtilsPath);
  const dashboardUpdatesText = readText(dashboardUpdatesPath);
  const bugModel = getPrismaModel(schemaText, "BugReport");
  const bugMigration = getMigrationSection(migrationText, "-- AlterTable: bug_reports");
  const stableIdBranch = projectsViewUtilsText.indexOf("if (recordProjectId)");
  const legacyNameBranch = projectsViewUtilsText.indexOf("normalize(getRecordProjectName(record))");

  assertSmoke(bugModel.includes("@@index([projectId])"), "BugReport.projectId 缺少查询索引。");
  assertIncludesAll(
    bugMigration,
    [
      "version.`workspaceId` = bug.`workspaceId`",
      "version.`id` = bug.`versionId`",
      "HAVING COUNT(*) = 1",
      "COALESCE(version.`projectId`, project.`id`)"
    ],
    "旧 Bug 项目 ID 安全回填"
  );
  assertIncludesAll(
    databaseDashboardText,
    [
      "projectId: toOptionalText(bug.projectId)",
      "projectId: bug.projectId",
      "upsertDashboardProjectScopeDatabase",
      "不会因为项目同名误伤其他记录"
    ],
    "Bug projectId 数据库映射与项目作用域写入"
  );
  assertIncludesAll(
    localDashboardText,
    [
      "function backfillBugProjectId",
      "projectIdByVersion",
      "function getUniqueProjectIdByName",
      "bug.projectId === project.id",
      "bugs: data.bugs.filter(belongsToDeletedProject)",
      "projectId: version.project === \"跨项目\" ? bug.projectId : version.projectId"
    ],
    "Bug projectId 归一化与改名/版本/删除级联"
  );
  assertSmoke(
    stableIdBranch >= 0 && legacyNameBranch > stableIdBranch,
    "ProjectsView 的项目归属没有优先使用 projectId。"
  );
  assertIncludesAll(
    dashboardUpdatesText,
    ["bug.projectId === project.id", "projectId: version.project === \"跨项目\" ? bug.projectId : version.projectId"],
    "Bug 前端乐观级联"
  );

  return {
    legacyBackfill: "workspace + version/project-name",
    projectRenameUsesStableId: true,
    uiPrefersStableId: true,
    versionCascadeKeepsProjectId: true
  };
}

function verifyRequirementVersionOwnerContracts() {
  const schemaText = readText(schemaPath);
  const typesText = readText(dashboardTypesPath);
  const migrationText = readText(versionOwnerMigrationPath);
  const localDashboardText = readText(localDashboardPath);
  const databaseDashboardText = readText(databaseDashboardPath);
  const seedText = readText(databaseSeedPath);
  const accessText = readText(projectAccessPath);
  const normalizersText = readText(projectNormalizersPath);
  const derivedRolesText = readText(derivedRolesPath);
  const effectivePermissionsText = readText(effectivePermissionsPath);
  const governanceQueriesText = readText(governanceQueriesPath);
  const routeText = readText(recordsRoutePath);
  const ownerFields = [
    "owner",
    "ownerMemberId",
    "ownerOpenId",
    "ownerUnionId",
    "ownerUserId",
    "ownerEmail",
    "ownerAvatarUrl"
  ];
  const versionModel = getPrismaModel(schemaText, "RequirementVersion");

  assertPrismaFields(versionModel, "RequirementVersion", ownerFields);
  assertSmoke(versionModel.includes("@@index([ownerMemberId])"), "RequirementVersion 总体负责人缺少查询索引。");
  assertIncludesAll(typesText, ownerFields.map((field) => `${field}?: string`), "RequirementVersion 总体负责人类型");
  assertIncludesAll(
    migrationText,
    [
      ...ownerFields.map((field) => `ADD COLUMN \`${field}\``),
      "NULLIF(TRIM(`productOwner`), '')",
      "NULLIF(TRIM(`devOwner`), '')",
      "ELSE `uiOwner`",
      "project_versions_ownerMemberId_idx"
    ],
    "版本总体负责人迁移与同角色身份回填"
  );
  assertIncludesAll(
    localDashboardText,
    ["owner: asText(values.owner) || undefined", "...createOwnerLink(values)"],
    "版本总体负责人本地归一化"
  );
  assertIncludesAll(
    databaseDashboardText,
    [
      "owner: toOptionalText(version.owner)",
      "ownerMemberId: toOptionalText(version.ownerMemberId)",
      "owner: version.owner ?? null",
      "ownerMemberId: version.ownerMemberId ?? null"
    ],
    "版本总体负责人数据库映射"
  );
  assertIncludesAll(
    seedText,
    [
      "code: project.code",
      "startDate: project.startDate",
      "riskLevel: project.riskLevel",
      "healthStatus: project.healthStatus",
      "projectId: task.projectId",
      "requirementId: task.requirementId",
      "description: task.description",
      "estimatedMinutes: task.estimatedMinutes",
      "completedAt: task.completedAt",
      "projectId: risk.projectId",
      "type: version.type",
      "actualCompletedDate: version.actualCompletedDate",
      "ownerMemberId: version.ownerMemberId",
      "projectId: requirement.projectId",
      "designOwnerMemberId: requirement.designOwnerMemberId",
      "developerMemberIds: asJson(requirement.developerMemberIds)",
      "dueDate: requirement.dueDate"
    ],
    "空库 dashboard seed 新字段"
  );
  assertIncludesAll(
    accessText,
    [
      "actorOwnsRequirementVersionInProject",
      "sourceOwnerMemberId === actor.id",
      "(!sourceProjectId || sourceProjectId === project.id)",
      "input.action === \"update\"",
      "const versionId = mutationVersionId(input)",
      "allowed = ownsTargetVersion"
    ],
    "版本负责人记录级权限"
  );
  assertIncludesAll(
    routeText,
    [
      "sourceProjectId: body.type === \"requirementVersion\" || body.type === \"task\"",
      "? authorization.projectId",
      "sourceOwnerMemberId: body.type === \"requirementVersion\""
    ],
    "版本负责人双重目标授权"
  );
  assertIncludesAll(
    typesText,
    ["\"plan_unit\"", "\"version_assignment\""],
    "版本负责人派生作用域类型"
  );
  assertIncludesAll(
    normalizersText,
    [
      "scopeType !== \"plan_unit\"",
      "sourceType !== \"version_assignment\"",
      "scopeType !== \"project\" ? { scopeId }"
    ],
    "plan_unit 角色归一化"
  );
  assertIncludesAll(
    derivedRolesText,
    [
      "deriveAssignedRoles",
      "prisma.requirementVersion.findMany",
      "roleKey: \"delivery_manager\"",
      "scopeType: \"plan_unit\"",
      "sourceType: \"version_assignment\"",
      "不能把版本负责人放大成整个项目"
    ],
    "版本负责人派生成员读模型"
  );
  assertIncludesAll(
    effectivePermissionsText,
    [
      "role.scopeType === \"plan_unit\"",
      "编辑本人负责的版本，并在该版本下创建需求",
      "role.scopeType === \"requirement\" && requirementId"
    ],
    "plan_unit 有效权限说明与作用域隔离"
  );
  assertIncludesAll(
    governanceQueriesText,
    ["deriveAssignedRoles", "需求/版本责任的读模型"],
    "项目成员查询保留版本派生负责人"
  );

  return {
    databaseOwnerFields: ownerFields.length,
    derivedMemberScope: "plan_unit",
    ownerCanCreateRequirementInOwnVersion: true,
    ownerCanDeleteVersion: false,
    ownerUpdateScope: "same-version-and-project",
    seedFieldGroups: 5
  };
}

function verifyProjectsViewContracts() {
  const viewText = readText(projectsViewPath);
  const componentNames = [
    "ProjectSetNavigation",
    "ProjectDeliveryTable",
    "ProjectOverview",
    "ProjectRequirements",
    "ProjectMembers",
    "ProjectActivities",
    "ProjectSchedule"
  ];
  const detailTabs = [
    { key: "overview", label: "概览", component: "ProjectOverview" },
    { key: "requirements", label: "需求", component: "ProjectRequirements" },
    { key: "members", label: "成员与权限", component: "ProjectMembers" },
    { key: "activities", label: "动态", component: "ProjectActivities" },
    { key: "schedule", label: "排期", component: "ProjectSchedule" }
  ];

  for (const componentName of componentNames) {
    const componentPath = path.join(
      projectsViewDir,
      componentName
        .replace(/^Project/, "project-")
        .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        .replace("project--", "project-")
        .replace("project-set-navigation", "project-set-navigation")
        .replace("project-delivery-table", "project-delivery-table")
    );

    assertSmoke(viewText.includes(`<${componentName}`), `ProjectsView 未接线 ${componentName}。`);
    // 主视图里的 import 和 JSX 都必须存在；目录检查只覆盖拆出的七个业务组件，不依赖组件文件内部实现细节。
    assertSmoke(fs.existsSync(path.join(componentPath, "index.tsx")), `${componentName} 缺少组件目录 index.tsx。`);
  }

  for (const tab of detailTabs) {
    assertSmoke(viewText.includes(`key: "${tab.key}"`), `项目/版本详情缺少 ${tab.key} Tab。`);
    assertSmoke(viewText.includes(tab.label), `项目/版本详情缺少「${tab.label}」文案。`);
    assertSmoke(viewText.includes(`<${tab.component}`), `${tab.key} Tab 未接线 ${tab.component}。`);
  }

  assertIncludesAll(viewText, ["项目管理", "项目集", "新建项目/版本", "onActiveProjectChange", "onActiveVersionChange"], "ProjectsView 项目管理入口");

  return {
    businessComponents: componentNames.length,
    detailTabs: detailTabs.length,
    hasProjectSetRail: true,
    hasPlanUnitTable: true
  };
}

function verifyFormFieldContracts() {
  const formContracts: Array<{
    file: string;
    fields: string[];
    label: string;
    markers: string[];
  }> = [
    {
      file: "project-fields/index.tsx",
      fields: ["code", "riskLevel", "startDate", "dueDate"],
      label: "项目集表单",
      markers: ["<OwnerSelect", "计划开始", "计划结束"]
    },
    {
      file: "version-fields/index.tsx",
      fields: ["type", "riskLevel", "status", "actualStartDate", "actualCompletedDate", "progress", "goal"],
      label: "项目/版本表单",
      markers: ["<VersionOwnerFields", "<MilestoneFields", "项目", "版本", "需求梳理", "验收中", "已归档"]
    },
    {
      file: "requirement-fields/index.tsx",
      fields: ["description", "designOwnerMemberId", "developerMemberIds", "startDate", "dueDate", "uiLink", "documentLink", "acceptance"],
      label: "需求表单",
      markers: ["mode=\"multiple\"", "<RequirementVersionSelectField", "产品负责人", "设计负责人", "开发负责人"]
    },
    {
      file: "task-fields/index.tsx",
      fields: ["description", "stage", "priority", "requirementId", "requirementTitle", "taskType", "storyPoints", "estimatedMinutes"],
      label: "任务表单",
      markers: ["<VersionOnlyField", "<OwnerSelect", "options={taskStages", "taskPriorityOptions.map"]
    },
    {
      file: "milestone-fields/index.tsx",
      fields: ["labelId", "type", "status", "dueDate", "actualCompletedDate", "note"],
      label: "交付节点表单",
      markers: ["<MilestoneOwnerSelect", "未开始", "延期", "实际完成"]
    }
  ];
  const details: Record<string, number> = {};

  for (const contract of formContracts) {
    const formText = readText(path.join(formsDir, contract.file));
    const fieldNames = getFormFieldNames(formText);
    const missingFields = contract.fields.filter((field) => !fieldNames.has(field));

    // 字段名是 API、表单初始化和持久化之间的稳定契约；只检查 name，不绑定 Ant Design 的具体布局写法。
    assertSmoke(!missingFields.length, `${contract.label} 缺少字段：${missingFields.join("、")}`);
    assertIncludesAll(formText, contract.markers, contract.label);
    details[contract.label] = contract.fields.length;
  }

  return {
    checkedForms: formContracts.length,
    fieldsByForm: details
  };
}

function verifyDeliveryLabelCatalogContracts() {
  const schemaText = readText(schemaPath);
  const migrationText = readText(deliveryLabelMigrationPath);
  const versionMigrationText = readText(versionDeliveryLabelMigrationPath);
  const typesText = readText(dashboardTypesPath);
  const dataText = readText(deliveryLabelDataPath);
  const databaseText = readText(databaseDashboardPath);
  const databaseSeedText = readText(databaseSeedPath);
  const localText = readText(localDashboardPath);
  const accessText = readText(projectAccessPath);
  const projectFieldsText = readText(projectFieldsPath);
  const deliveryLabelFieldsText = readText(path.join(deliveryLabelFieldsDir, "index.tsx"));
  const milestoneFieldsText = readText(milestoneFieldsPath);
  const versionFieldsText = readText(versionFieldsPath);
  const projectsViewUtilsText = readText(projectsViewUtilsPath);
  const overviewText = readText(projectOverviewPath);
  const deliveryTableText = readText(projectDeliveryTablePath);
  const recordScopeText = readText(recordScopePath);
  const projectModel = getPrismaModel(schemaText, "Project");
  const requirementVersionModel = getPrismaModel(schemaText, "RequirementVersion");
  const labelVersion = {
    deliveryNodes: [{
      id: "node-a",
      label: "旧展示名",
      labelId: "label-a",
      type: "历史快照"
    }],
    milestones: []
  } as unknown as Parameters<typeof getDeliveryNodes>[0];
  const missingCatalog = normalizeProjectDeliveryLabelCatalog(undefined);
  const explicitEmptyCatalog = normalizeProjectDeliveryLabelCatalog([]);
  const ownVersionCatalog = getVersionDeliveryLabelCatalog({
    deliveryLabelCatalog: [{ id: "label-a", name: "版本自有名称", active: true }]
  } as Parameters<typeof getVersionDeliveryLabelCatalog>[0], [
    { id: "label-a", name: "legacy 项目名称", active: true }
  ]);
  const explicitEmptyVersionCatalog = getVersionDeliveryLabelCatalog({
    deliveryLabelCatalog: []
  } as Parameters<typeof getVersionDeliveryLabelCatalog>[0], [
    { id: "label-a", name: "legacy 项目名称", active: true }
  ]);
  const duplicateMilestoneLabelId = findDuplicateDeliveryMilestoneLabelId([
    { id: "milestone-a", labelId: "label-a" },
    { id: "milestone-b", labelId: "label-a" }
  ]);

  assertSmoke(missingCatalog.length === 4, "缺失/legacy 标签目录没有回填系统默认值。");
  assertSmoke(explicitEmptyCatalog.length === 0, "显式空标签目录被错误恢复为系统默认值。");
  assertSmoke(ownVersionCatalog[0]?.name === "版本自有名称", "版本自有目录被 legacy 项目目录覆盖。");
  assertSmoke(explicitEmptyVersionCatalog.length === 0, "版本显式空目录错误回退到项目目录。");
  assertSmoke(duplicateMilestoneLabelId === "label-a", "重复交付节点 labelId 没有被识别。");

  assertSmoke(
    getDeliveryNodes(labelVersion, [{ id: "label-a", name: "当前新名", active: true }])[0]?.label === "当前新名",
    "启用标签改名后没有按稳定 labelId 展示当前名称。"
  );
  assertSmoke(
    getDeliveryNodes(labelVersion, [{ id: "label-a", name: "停用后新名", active: false }])[0]?.label === "历史快照（已停用）",
    "停用标签错误覆盖了历史节点快照。"
  );
  assertSmoke(
    getDeliveryNodes(labelVersion, [])[0]?.label === "历史快照（已删除）",
    "标签删除后历史节点快照丢失。"
  );
  assertSmoke(
    getDeliveryNodes(labelVersion, [{ id: "label-a", name: "删除前名称", active: false, deleted: true }])[0]?.label === "历史快照（已删除）",
    "软删除标签没有保留节点快照或已删除状态。"
  );

  assertPrismaFields(projectModel, "Project", ["deliveryLabelCatalog"]);
  assertPrismaFields(requirementVersionModel, "RequirementVersion", ["deliveryLabelCatalog"]);
  assertIncludesAll(
    migrationText,
    [
      "ADD COLUMN `deliveryLabelCatalog` JSON NULL",
      "JSON_ARRAY(",
      "delivery-product-review",
      "delivery-release",
      "MODIFY COLUMN `deliveryLabelCatalog` JSON NOT NULL"
    ],
    "交付节点标签迁移"
  );
  assertIncludesAll(
    versionMigrationText,
    [
      "ALTER TABLE `project_versions`",
      "ADD COLUMN `deliveryLabelCatalog` JSON NULL",
      "SET `version`.`deliveryLabelCatalog` = `project`.`deliveryLabelCatalog`",
      "delivery-version-",
      "JSON_SEARCH(`version`.`milestones`",
      "MODIFY COLUMN `deliveryLabelCatalog` JSON NOT NULL"
    ],
    "版本级交付标签迁移"
  );
  assertIncludesAll(
    typesText,
    ["export type ProjectDeliveryLabel", "deleted?: boolean", "deliveryLabelCatalog?: ProjectDeliveryLabel[]", "labelId?: string", "type?: string"],
    "交付节点标签类型"
  );
  assertIncludesAll(
    dataText,
    [
      "defaultProjectDeliveryLabels",
      "设计稿定稿",
      "研发完成",
      "normalizeProjectDeliveryLabelCatalog",
      "getVersionDeliveryLabelCatalog",
      "record.deleted === true",
      "fallbackToDefaults",
      "Array.isArray(value) || options.fallbackToDefaults === false",
      "createVersionDeliveryLabelId",
      "scopeDeliveryLabelCatalogToVersion",
      "remapVersionDeliveryMilestones",
      "findDuplicateDeliveryMilestoneLabelId",
      "删除全部标签后不会"
    ],
    "默认标签目录"
  );
  assertIncludesAll(
    databaseText,
    [
      "deliveryLabelCatalog: asJson(normalizeProjectDeliveryLabelCatalog(project.deliveryLabelCatalog))",
      "deliveryLabelCatalog: normalizeProjectDeliveryLabelCatalog(project.deliveryLabelCatalog)",
      "deliveryLabelCatalog: asJson(deliveryLabels.catalog)",
      "version.deliveryLabelCatalog",
      "remapVersionDeliveryMilestones"
    ],
    "标签目录数据库映射"
  );
  assertIncludesAll(
    databaseSeedText,
    [
      "getSeedVersionDeliveryState",
      "scopeDeliveryLabelCatalogToVersion",
      "deliveryLabelCatalog: asJson(delivery.catalog)",
      "milestones: asJson(delivery.milestones)"
    ],
    "版本标签种子持久化"
  );
  assertIncludesAll(
    localText,
    [
      "deliveryLabelCatalog: normalizeProjectDeliveryLabelCatalog(values.deliveryLabelCatalog)",
      "deliveryLabelCatalog: scopedDeliveryLabels.catalog",
      "scopeDeliveryLabelCatalogToVersion",
      "remapVersionDeliveryMilestones",
      "labelId: asText(milestone.labelId) || undefined",
      "findDuplicateDeliveryMilestoneLabelId(milestones)",
      "同一版本不能重复使用交付节点标签",
      "不再伪造没有 labelId 的兜底节点"
    ],
    "标签目录本地归一化"
  );

  assertSmoke(fs.existsSync(path.join(deliveryLabelFieldsDir, "index.tsx")), "标签目录组件缺少 index.tsx。");
  assertSmoke(fs.existsSync(path.join(deliveryLabelFieldsDir, "index.less")), "标签目录组件缺少 index.less。");
  assertSmoke(!projectFieldsText.includes("DeliveryLabelCatalogFields"), "项目资料表单仍在编辑共享交付标签目录。");
  assertIncludesAll(
    deliveryLabelFieldsText,
    ["usageCounts", "disabled = false", "name, \"deleted\"", "setFieldValue([\"deliveryLabelCatalog\", name, \"deleted\"], true)", "确认删除", "保留名称快照", "当前仅可编辑交付节点"],
    "版本标签目录软删除与历史提示"
  );
  assertIncludesAll(
    milestoneFieldsText,
    [
      "name={[name, \"labelId\"]}",
      "label.active",
      "name={[name, \"type\"]}",
      "selectedByOtherRows",
      "disabled: selectedByOtherRows.has(label.id)",
      "nextAvailableLabel",
      "历史快照",
      "已停用",
      "已删除"
    ],
    "版本节点标签选择"
  );
  assertIncludesAll(
    versionFieldsText,
    [
      "Form.useWatch(\"deliveryLabelCatalog\"",
      "<DeliveryLabelCatalogFields",
      "usageCounts={labelUsageCounts}",
      "labelCatalog={labelCatalog}"
    ],
    "版本表单自有标签接线"
  );
  assertSmoke(!versionFieldsText.includes("setFieldValue(\"milestones\""), "新版本仍根据默认标签自动生成 milestones。");
  assertIncludesAll(
    projectsViewUtilsText,
    ["getVersionDeliveryLabelCatalog(version, legacyProjectCatalog)", "label.active && !label.deleted", "currentLabelNames.get(node.labelId)", "node.type || node.label", "已删除"],
    "交付节点当前标签与历史快照解析"
  );
  assertIncludesAll(
    overviewText,
    ["getVersionDeliveryLabelCatalog(version, project.deliveryLabelCatalog)", "getDeliveryNodes(version, deliveryLabelCatalog)", "labelCatalog: deliveryLabelCatalog"],
    "版本路线图标签目录作用域"
  );
  assertIncludesAll(
    deliveryTableText,
    ["getVersionDeliveryLabelCatalog(version, legacyProjectLabelCatalog)", "getDeliveryNodes(version, versionLabelCatalog)"],
    "交付表逐版本标签目录作用域"
  );
  assertIncludesAll(
    recordScopeText,
    [
      "normalizeVersionMilestoneLabels",
      "deliveryLabelCatalog: true",
      "normalizeSubmittedVersionDeliveryLabelCatalog",
      "ensureVersionDeliveryLabelIdsAreNotForeign",
      "ensureCatalogUsesSoftDeleteForExistingLabels",
      "未选择当前版本的启用标签",
      "已停用",
      "keepsStoppedHistoricalSelection",
      "fallbackToDefaults: false",
      "claimLabelId",
      "重复使用了标签"
    ],
    "服务端节点标签边界"
  );
  assertIncludesAll(
    accessText,
    [
      "attemptsVersionDeliveryLabelCatalogMutation",
      "交付节点标签目录只允许项目负责人",
      "input.record?.deliveryLabelCatalog"
    ],
    "版本标签目录管理权限"
  );

  return {
    defaultLabels: 4,
    deletedSnapshotPreserved: true,
    duplicateLabelIdsRejected: true,
    explicitEmptyCatalogPreserved: true,
    historicalSnapshotPreserved: true,
    labelDisplayCases: 4,
    persistedPerVersion: true,
    projectEditorCatalogGate: true,
    versionCatalogEditor: true,
    serverRejectsInactiveLabels: true
  };
}

function verifyRecordsRouteContracts() {
  const routeText = readText(recordsRoutePath);
  const recordScopeText = readText(recordScopePath);
  const authorizationCalls = (routeText.match(/authorizeProjectMutation\s*\(/g) ?? []).length;
  const activityCalls = (routeText.match(/recordProjectActivityForMutation\s*\(/g) ?? []).length;
  const scopeResolutionCalls = (routeText.match(/resolveProjectMutationScope\s*\(/g) ?? []).length;

  // PATCH 必须分别校验源项目和归一化后的目标项目，不能只信任请求中的 projectId 或旧记录归属。
  assertSmoke(authorizationCalls >= 4, `records route 的项目变更鉴权调用不足：${authorizationCalls}。`);
  assertSmoke(activityCalls >= 3, `records route 的项目动态记录调用不足：${activityCalls}。`);
  assertSmoke(scopeResolutionCalls >= 2, `records route 的项目关联归一化调用不足：${scopeResolutionCalls}。`);
  assertIncludesAll(routeText, ["action: \"create\"", "action: \"update\"", "action: \"delete\""], "records route 项目变更动作");
  assertIncludesAll(routeText, ["requirementVersion", "requirement", "task", "risk"], "records route 项目治理实体");
  assertIncludesAll(
    routeText,
    ["createTargetAuthorizationRecord", "projectId: mutationScope.projectId", "values: mutationScope.values", "targetAuthorization"],
    "records route 目标项目鉴权"
  );
  assertIncludesAll(
    recordScopeText,
    [
      "resolveSubmittedProjectReference",
      "resolveVersionReference",
      "resolveRequirementReference",
      "resolveSingleProjectRelationTarget",
      "任务的 requirementId 与 versionId 不属于同一需求版本",
      "目标记录不属于当前工作区"
    ],
    "项目关联安全归一化"
  );
  assertSmoke(routeText.includes("body.type !== \"project\""), "项目删除后的活动级联边界没有显式处理。");

  return {
    activityCalls,
    authorizationCalls,
    protectedMutationMethods: 3,
    scopeResolutionCalls
  };
}

function verifyProjectRelationSecurityContracts() {
  const projectA = { id: "project-a", name: "项目 A" };
  const projectB = { id: "project-b", name: "项目 B" };
  const normalized = resolveSingleProjectRelationTarget([
    { relation: "projectId", project: projectA },
    { relation: "versionId", project: { ...projectA } },
    { relation: "requirementId", project: { ...projectA } }
  ]);

  assertSmoke(normalized?.id === projectA.id, "同项目关联没有归一化到稳定 projectId。");

  let conflict: unknown;

  try {
    resolveSingleProjectRelationTarget([
      { relation: "versionId", project: projectA },
      { relation: "requirementId", project: projectB }
    ]);
  } catch (error) {
    conflict = error;
  }

  assertSmoke(conflict instanceof ProjectMutationScopeError, "跨项目关联没有被项目作用域校验拒绝。");
  assertSmoke(conflict.status === 400, "跨项目关联应返回可修正的 400 参数错误。");
  assertSmoke(conflict.message.includes("versionId") && conflict.message.includes("requirementId"), "跨项目错误缺少冲突关联说明。");

  return {
    checkedRelations: 3,
    rejectsCrossProjectReferences: true,
    targetProjectAuthorizationRequired: true
  };
}

function verifyWorkspaceAndLegacyFallbackContracts() {
  const routeText = readText(recordsRoutePath);
  const accessText = readText(projectAccessPath);
  const activityText = readText(projectActivityPath);
  const derivedRolesText = readText(derivedRolesPath);
  const mutationsText = readText(governanceMutationsPath);
  const localDashboardText = readText(localDashboardPath);
  const databaseDashboardText = readText(databaseDashboardPath);
  const oneCandidate = { id: "project-a", name: "同名项目" };

  // 名称回退是跨鉴权、角色、审计和本地兼容逻辑共用的安全边界，纯函数覆盖 0/1/多候选三种结果。
  assertSmoke(selectUniqueProjectNameCandidate([]) === undefined, "空项目名候选不应产生回退目标。");
  assertSmoke(
    selectUniqueProjectNameCandidate([oneCandidate]) === oneCandidate,
    "唯一项目名候选应返回稳定目标。"
  );
  assertSmoke(
    selectUniqueProjectNameCandidate([oneCandidate, { id: "project-b", name: "同名项目" }]) === undefined,
    "同工作区重名项目不应随机选择回退目标。"
  );

  const emptyReferences = { requirements: 0, tasks: 0, bugs: 0 };
  const usedReferences = { requirements: 1, tasks: 2, bugs: 3 };

  assertSmoke(countRequirementVersionReferences(emptyReferences) === 0, "空版本引用计数错误。");
  assertSmoke(!requiresRequirementVersionFallback(emptyReferences), "完全空的版本不应被强制要求 fallback。");
  assertSmoke(countRequirementVersionReferences(usedReferences) === 6, "版本引用总数计算错误。");
  assertSmoke(requiresRequirementVersionFallback(usedReferences), "有业务引用的版本必须要求安全迁移目标。");

  const systemFallback = { id: "rv-backlog" };
  const uniqueSibling = { id: "version-only" };
  const preferredSystem = selectAutomaticRequirementVersionFallback(systemFallback, [uniqueSibling, { id: "version-b" }]);
  const selectedUniqueSibling = selectAutomaticRequirementVersionFallback(undefined, [uniqueSibling]);
  const ambiguousSiblings = selectAutomaticRequirementVersionFallback(undefined, [uniqueSibling, { id: "version-b" }]);

  assertSmoke(preferredSystem.fallback === systemFallback && !preferredSystem.ambiguous, "系统兜底版本应优先于兄弟候选。");
  assertSmoke(selectedUniqueSibling.fallback === uniqueSibling && !selectedUniqueSibling.ambiguous, "唯一兄弟版本应允许自动迁移。");
  assertSmoke(ambiguousSiblings.fallback === undefined && ambiguousSiblings.ambiguous, "多个兄弟版本必须拒绝随机迁移。");

  // 文档是工作区级需求资产：POST 覆盖 workspaceId，PATCH 还必须先按旧记录校验租户，二者沿用需求增改权限。
  assertSmoke(
    (routeText.match(/body\.type === "document"/g) ?? []).length >= 2,
    "records route 没有同时保护文档 POST/PATCH。"
  );
  assertIncludesAll(
    routeText,
    [
      "canPerformAction(accessContext.permissions, \"requirement:create\")",
      "canPerformAction(accessContext.permissions, \"requirement:update\")",
      "getDashboardRecordById(\"document\", body.id)",
      "recordBelongsToWorkspace(existingDocument, accessContext.currentWorkspace.id)",
      "workspaceId: accessContext.currentWorkspace.id"
    ],
    "文档工作区 IDOR 防护"
  );

  assertIncludesAll(accessText, ["project.findMany", "take: 2", "selectUniqueProjectNameCandidate"], "项目名鉴权唯一回退");
  assertIncludesAll(activityText, ["project.findMany", "take: 2", "selectUniqueProjectNameCandidate"], "项目活动唯一回退");
  assertIncludesAll(
    derivedRolesText,
    ["projectNameCandidates", "take: 2", "uniqueNameProject?.id === input.projectId", "canUseLegacyProjectName ?"],
    "需求派生角色唯一回退"
  );
  assertIncludesAll(
    mutationsText,
    ["projectNameCandidates", "take: 2", "uniqueNameProject?.id === input.projectId", "canUseLegacyProjectName ?"],
    "需求职责范围唯一回退"
  );
  assertIncludesAll(
    localDashboardText,
    [
      "requiresRequirementVersionFallback(referenceCounts)",
      "if (needsFallback)",
      "if (fallbackVersion)",
      "没有可安全迁移的同项目版本",
      "selectUniqueProjectNameCandidate(sameNameProjects)",
      "selectAutomaticRequirementVersionFallback(systemFallback, siblingCandidates)"
    ],
    "版本删除与本地项目名回退"
  );
  const deleteFunctionStart = localDashboardText.indexOf("export async function deleteDashboardRecord");
  const deleteFunctionText = deleteFunctionStart >= 0 ? localDashboardText.slice(deleteFunctionStart) : "";

  assertSmoke(deleteFunctionStart >= 0, "无法定位 dashboard 删除入口。");
  assertSmoke(!deleteFunctionText.includes("writeDatabase(savedData)"), "删除入口仍在用旧快照触发全库同步。");
  assertIncludesAll(
    databaseDashboardText,
    [
      "DASHBOARD_DELETE_TRANSACTION_OPTIONS",
      "isolationLevel: \"Serializable\"",
      "deleteDashboardRequirementVersionDatabase",
      "deleteDashboardProjectDatabase",
      "deleteDashboardRiskDatabase",
      "deleteDashboardDocumentDatabase",
      "projectRepository.count",
      "selectAutomaticRequirementVersionFallback(systemFallback, siblingCandidates)",
      "版本及其需求/任务/Bug 的迁移在同一事务内完成"
    ],
    "增量删除与并发引用重检"
  );

  return {
    documentMethodsProtected: 2,
    emptyVersionCanDelete: true,
    nameCandidateCases: 3,
    referencedVersionRequiresFallback: true,
    versionFallbackCases: 3,
    wholeDatabaseSyncOnDelete: false
  };
}

function verifyGovernanceApiContracts() {
  const routeText = readText(governanceRoutePath);
  const mutationsText = readText(governanceMutationsPath);
  const ownerTransferText = readText(ownerTransferPath);

  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    assertSmoke(routeText.includes(`export async function ${method}(`), `项目治理 API 缺少 ${method} 方法。`);
  }

  assertIncludesAll(
    routeText,
    ["getProjectManagementSnapshot", "addProjectMembers", "updateProjectMember", "removeProjectMember", "transferProjectOwner", "body.action === \"members\"", "body.action === \"transferOwner\""],
    "项目治理 API 命令"
  );
  assertIncludesAll(
    ownerTransferText,
    [
      "export async function transferProjectOwner",
      "更换项目负责人必须填写交接原因",
      "input.keepPreviousOwnerAsAdmin ?? true",
      "projectOwnerSnapshot(newOwner)",
      "accessLevel: \"admin\"",
      "action: \"owner_transferred\"",
      "prisma.$transaction"
    ],
    "项目负责人交接"
  );
  assertIncludesAll(
    mutationsText,
    [
      "nextAccessLevel === \"commenter\"",
      "nextAccessLevel === \"viewer\"",
      "deriveAssignedRoles",
      "该成员仍承担需求或版本责任",
      "nextRoles = []"
    ],
    "评论者/查看者职能角色清理与自动职责保护"
  );
  assertSmoke(mutationsText.includes("不能移除当前项目负责人"), "项目治理缺少负责人不可直接移除保护。");

  return {
    commands: 5,
    httpMethods: 4,
    ownerTransferTransactional: true
  };
}

function verifyOne2allMutationPermissionMatrixContracts() {
  const accessText = readText(projectAccessPath);
  const effectivePermissionsText = readText(effectivePermissionsPath);
  const mutationPolicyText = readText(projectMutationPolicyPath);
  const routeText = readText(recordsRoutePath);
  const documentAnalyzeText = readText(documentAnalyzeRoutePath);
  const ownerOnlyTaskActor = {
    memberId: "member-assignee",
    accessLevel: "member" as const,
    functionalRoles: []
  };
  const designProjectRoles = [{
    roleKey: "design_owner" as const,
    scopeType: "project" as const,
    sourceType: "manual" as const
  }];
  const deliveryProjectRoles = [{
    roleKey: "delivery_manager" as const,
    scopeType: "project" as const,
    sourceType: "manual" as const
  }];
  const designCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "member",
    functionalRoles: designProjectRoles
  });
  const deliveryCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "member",
    functionalRoles: deliveryProjectRoles
  });

  assertSmoke(
    canManageTaskForActor({
      actorAccess: ownerOnlyTaskActor,
      capabilities: capabilitiesFromPermissionFacts({
        isLocalDemo: false,
        isWorkspaceManager: false,
        isProjectOwner: false,
        accessLevel: "member",
        functionalRoles: []
      }),
      ownerMemberId: "member-assignee"
    }),
    "任务经办人仍被错误要求 developer role。"
  );
  assertSmoke(!designCapabilities.canCreateRequirements, "design_owner-only 被误授予新建需求能力。");
  assertSmoke(designCapabilities.canManageRequirements, "design_owner 缺少设计字段维护入口。");
  assertSmoke(!designCapabilities.canDeleteRequirements, "design_owner 被误授予需求删除能力。");
  assertSmoke(!deliveryCapabilities.canDeletePlanUnit, "delivery_manager 被误授予版本删除能力。");
  assertSmoke(!deliveryCapabilities.canCreatePlanUnit, "delivery_manager 被误授予版本创建能力。");
  assertSmoke(!deliveryCapabilities.canDeleteRequirements, "delivery_manager 被误授予需求删除能力。");
  const semanticFormRecord = {
    uiLink: "https://example.com/old-design",
    ownerMemberId: undefined,
    aiRisks: ["风险 A"],
    aiMissingItems: []
  };
  const semanticDesignValues = {
    uiLink: "https://example.com/new-design",
    ownerMemberId: "",
    aiRisks: JSON.stringify(["风险 A"]),
    aiMissingItems: "[]"
  };
  const designChangedFields = getChangedRequirementFields(semanticFormRecord, semanticDesignValues);

  assertSmoke(
    designChangedFields.length === 1 && designChangedFields[0] === "uiLink",
    `需求表单等价值被误判 changed：${designChangedFields.join("、")}`
  );
  assertSmoke(
    canUpdateRequirementFields({ changedFields: designChangedFields, productOwner: false, designOwner: true }),
    "design_owner 无法仅更新 designUrl/uiLink。"
  );
  assertSmoke(
    !canUpdateRequirementFields({
      changedFields: [...designChangedFields, "priority"],
      productOwner: false,
      designOwner: true
    }),
    "design_owner 被误授予产品优先级字段。"
  );
  assertIncludesAll(
    accessText,
    [
      "getChangedRequirementFields(input.record, input.values)",
      "canUpdateRequirementFields",
      "input.action === \"delete\"",
      "职能角色与版本 owner 都不能删除",
      "hasScopedFunctionalRole(state.functionalRoles, [\"product_owner\"], undefined, versionId)",
      "[\"product_owner\", \"design_owner\", \"developer\"]",
      "ownsExistingTask",
      "functional delivery_manager 不等于项目管理员",
      "update 必须读取旧 owner"
    ],
    "one2all requirement/task 服务端动作矩阵"
  );
  assertIncludesAll(
    mutationPolicyText,
    [
      "requirementProductUpdateFields",
      "requirementDesignUpdateFields",
      "stringArrayFields",
      "JSON.parse(value)",
      "field === \"developerMemberIds\"",
      "input.changedFields.every"
    ],
    "需求字段矩阵语义比较"
  );
  assertIncludesAll(
    effectivePermissionsText,
    [
      "const canCreateRequirements = hasProjectFunctionalRole(input.functionalRoles, [\"product_owner\"])",
      "canDeletePlanUnit: false",
      "canCreatePlanUnit: false",
      "canDeleteRequirements: false",
      "return ownsTask || hasScopedFunctionalRole"
    ],
    "one2all 客户端能力矩阵"
  );
  assertIncludesAll(
    routeText,
    [
      "body.type === \"requirementVersion\" || body.type === \"task\"",
      "sourceProjectId",
      "taskScopeFields",
      "attemptsTaskScopeRebinding",
      "任务不能通过普通编辑改绑项目、版本或需求",
      "status: 409"
    ],
    "任务/版本跨项目双重目标授权"
  );
  assertIncludesAll(
    documentAnalyzeText,
    [
      "ownerMemberId: targetVersion.ownerMemberId",
      "entityType: \"requirementVersion\"",
      "action: \"update\"",
      "if (!breakdownAuthorization.allowed)",
      "不能用缺少 requirementId 的普通 task:create 误拒"
    ],
    "版本负责人/delivery_manager 文档拆任务授权"
  );

  return {
    designCanCreateRequirement: false,
    requirementDeleteRoles: ["project-owner", "workspace-manager", "project-admin"],
    requirementUpdatePolicy: "field-matrix",
    semanticDesignOnlyUpdate: true,
    taskActionsSeparated: ["create", "update", "delete"],
    taskAssigneeCanUpdateWithoutDeveloperRole: true,
    taskScopeRebindingViaPatch: false
  };
}

function verifyOwnerAndLegacyPermissionContracts() {
  const routeText = readText(recordsRoutePath);
  const accessText = readText(projectAccessPath);
  const effectivePermissionsText = readText(effectivePermissionsPath);
  const governanceQueriesText = readText(governanceQueriesPath);
  const platformText = readText(platformPath);
  const projectFieldsText = readText(projectFieldsPath);
  const editRecordDrawersText = readText(editRecordDrawersPath);
  const projectMembersText = readText(projectMembersPath);
  const productAdminRole = resolveLegacyProjectProductRole("productAdmin", false);
  const productMemberRole = resolveLegacyProjectProductRole("productMember", false);

  assertSmoke(productAdminRole === "productAdmin", "无显式项目权限时没有恢复 productAdmin 兼容角色。");
  assertSmoke(productMemberRole === "productMember", "无显式项目权限时没有恢复 productMember 兼容角色。");
  assertSmoke(resolveLegacyProjectProductRole("productAdmin", true) === undefined, "显式项目权限没有覆盖 productAdmin fallback。");
  assertSmoke(resolveLegacyProjectProductRole("productMember", true) === undefined, "显式项目权限没有覆盖 productMember fallback。");

  for (const entityType of ["requirement", "requirementVersion"] as const) {
    for (const action of ["create", "update", "delete"] as const) {
      assertSmoke(
        getLegacyProductMutationDecision({ legacyProductRole: productAdminRole, entityType, action }) === true,
        `productAdmin 应允许 ${entityType}:${action}。`
      );
      assertSmoke(
        getLegacyProductMutationDecision({ legacyProductRole: productMemberRole, entityType, action }) === (action !== "delete"),
        `productMember 的 ${entityType}:${action} 与旧权限矩阵不一致。`
      );
    }
  }
  assertSmoke(
    getLegacyProductMutationDecision({ legacyProductRole: productAdminRole, entityType: "risk", action: "delete" }) === undefined,
    "旧产品角色权限不应外溢到风险。"
  );

  const productMemberCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "member",
    functionalRoles: [],
    legacyProductRole: productMemberRole
  });
  const productAdminCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "member",
    functionalRoles: [],
    legacyProductRole: productAdminRole
  });
  const explicitViewerCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "viewer",
    functionalRoles: [],
    legacyProductRole: resolveLegacyProjectProductRole("productAdmin", true)
  });
  const explicitCommenterCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "commenter",
    functionalRoles: [],
    legacyProductRole: resolveLegacyProjectProductRole("productMember", true)
  });

  assertSmoke(productAdminCapabilities.canDeletePlanUnit, "productAdmin 项目页缺少版本删除能力。");
  assertSmoke(productAdminCapabilities.canDeleteRequirements, "productAdmin 项目页缺少需求删除能力。");
  assertSmoke(productMemberCapabilities.canCreatePlanUnit, "productMember 项目页缺少版本增改能力。");
  assertSmoke(productMemberCapabilities.canManageRequirements, "productMember 项目页缺少需求增改能力。");
  assertSmoke(!productMemberCapabilities.canDeletePlanUnit, "productMember 被误授予版本删除权。");
  assertSmoke(!productMemberCapabilities.canDeleteRequirements, "productMember 被误授予需求删除权。");
  assertSmoke(
    Object.values(explicitViewerCapabilities).every((value) => value === false),
    "显式 viewer 未完全覆盖旧产品角色权限。"
  );
  assertSmoke(
    Object.values(explicitCommenterCapabilities).every((value) => value === false),
    "显式 commenter 未完全覆盖旧产品角色权限。"
  );

  // 兼容逻辑必须是唯一的读时决策入口，不在 migration 中把 productMember 粗回填为可删除的 product_owner。
  assertIncludesAll(accessText, ["resolveLegacyProjectProductRole(currentMember?.role, Boolean(permission))", "getLegacyProductMutationDecision"], "旧产品角色鉴权接线");
  assertIncludesAll(effectivePermissionsText, ["不用 SQL 把旧角色回填", "canDeletePlanUnit", "canDeleteRequirements"], "旧角色无损兼容说明");
  assertIncludesAll(
    platformText,
    ["canDeleteActivePlanUnits", "canManageActiveProjectRequirement", "activeProjectCapabilities?.canDeletePlanUnit", "\"update\" | \"delete\""],
    "项目页删除能力拆分"
  );

  // 项目负责人交接只能走治理 API：后端拒绝普通 PATCH，编辑抽屉不展示也不提交 owner 快照。
  assertIncludesAll(routeText, ["projectOwnerFields", "attemptsProjectOwnerTransfer", "项目负责人不能在普通编辑中修改", "status: 409"], "普通 PATCH 负责人保护");
  assertIncludesAll(projectFieldsText, ["showOwner = true", "{showOwner ? ("], "项目表单负责人可见性开关");
  assertIncludesAll(editRecordDrawersText, ["showOwner={false}", "负责人交接请在“成员与权限”页完成"], "项目编辑抽屉负责人保护");
  assertIncludesAll(platformText, ["projectOwnerFieldNames", "!projectOwnerFieldNames.has(key)"], "项目编辑提交 owner 过滤");
  assertIncludesAll(
    governanceQueriesText,
    ["effectivePermissionForActor", "canViewEffectivePermission", "仅项目管理员或权限本人可查看有效权限详情"],
    "有效权限 API 脱敏"
  );
  assertIncludesAll(
    projectMembersText,
    ["permission.capabilities?.canViewEffectivePermission === false", "row.permission.capabilities?.canViewEffectivePermission !== false"],
    "有效权限查看入口"
  );

  return {
    explicitPermissionOverridesLegacy: true,
    effectivePermissionRedacted: true,
    legacyActionsChecked: 12,
    ownerTransferBypassBlocked: true,
    productMemberDeleteHidden: true
  };
}

function verifyScopedUiPermissionContracts() {
  const platformText = readText(platformPath);
  const viewText = readText(projectsViewPath);
  const viewUtilsText = readText(projectsViewUtilsPath);
  const requirementsText = readText(projectRequirementsPath);
  const scheduleText = readText(projectSchedulePath);
  const activitiesText = readText(projectActivitiesPath);
  const progressCalendarText = readText(projectProgressCalendarPath);
  const schedulerUtilsText = readText(projectSchedulerUtilsPath);
  const tasksViewText = readText(tasksViewPath);
  const stageBoardText = readText(taskStageBoardPath);
  const ownerBoardText = readText(taskOwnerBoardPath);
  const membersText = readText(projectMembersPath);
  const routeText = readText(governanceRoutePath);
  const mutationsText = readText(governanceMutationsPath);
  const taskFieldsText = readText(taskFieldsPath);
  const requirementFieldsText = readText(requirementFieldsPath);
  const editRecordDrawersText = readText(editRecordDrawersPath);
  const versionFieldsText = readText(versionFieldsPath);
  const versionParentFieldText = readText(versionParentFieldPath);
  const bugsViewText = readText(bugsViewPath);
  const identityProjects = [
    { id: "project-a", name: "Alpha" },
    { id: "project-b", name: "Beta" },
    { id: "project-c", name: "Duplicate" },
    { id: "project-d", name: "Duplicate" }
  ] as unknown as Parameters<typeof resolveProjectIdForRecord>[1];

  assertSmoke(
    resolveProjectIdForRecord({ projectId: "project-a", project: "Beta" }, identityProjects) === "project-a",
    "任务项目归属没有优先使用稳定 projectId。"
  );
  assertSmoke(
    resolveProjectIdForRecord({ projectId: "missing", project: "Alpha" }, identityProjects) === undefined,
    "无效稳定 projectId 被错误降级为名称匹配。"
  );
  assertSmoke(
    resolveProjectIdForRecord({ project: "Beta" }, identityProjects) === "project-b",
    "历史任务的唯一项目名称未能安全回退。"
  );
  assertSmoke(
    resolveProjectIdForRecord({ project: "Duplicate" }, identityProjects) === undefined,
    "重名项目的历史任务被错误授权。"
  );
  const treeVersions = [
    { id: "version-root", name: "Root", milestones: [], progress: 0 },
    { id: "version-child", name: "Child", parentVersionId: "version-root", milestones: [], progress: 0 }
  ] as unknown as NonNullable<Parameters<typeof getVersionTasks>[2]>;
  const treeTasks = [
    { id: "task-root", versionId: "version-root", stage: "已完成" },
    { id: "task-child", versionId: "version-child", stage: "进行中" }
  ] as unknown as Parameters<typeof getVersionTasks>[0];
  const treeScopedTasks = getVersionTasks(treeTasks, treeVersions[0], treeVersions);

  assertSmoke(treeScopedTasks.length === 2, "父版本展示没有聚合子树任务。");
  assertSmoke(
    getVersionProgress(treeVersions[0], treeScopedTasks) === 50,
    "父版本展示进度没有按子树实时完成率计算。"
  );
  const requirementScopedActor = {
    memberId: "member-product",
    accessLevel: "member" as const,
    functionalRoles: [{
      roleKey: "product_owner" as const,
      scopeType: "requirement" as const,
      scopeId: "requirement-a",
      sourceType: "manual" as const
    }]
  };
  const requirementScopedCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "member",
    functionalRoles: requirementScopedActor.functionalRoles
  });

  assertSmoke(
    !canManageRequirementForActor({
      actorAccess: requirementScopedActor,
      capabilities: requirementScopedCapabilities,
      action: "create"
    }),
    "需求级产品负责人不应获得项目级新建需求入口。"
  );
  assertSmoke(
    canManageRequirementForActor({
      actorAccess: requirementScopedActor,
      capabilities: requirementScopedCapabilities,
      requirementId: "requirement-a",
      action: "update"
    }),
    "需求级产品负责人无法编辑职责范围内需求。"
  );
  assertSmoke(
    !canManageRequirementForActor({
      actorAccess: requirementScopedActor,
      capabilities: requirementScopedCapabilities,
      requirementId: "requirement-b",
      action: "delete"
    }),
    "需求级产品负责人被误授予其他需求删除入口。"
  );

  const taskScopedActor = {
    memberId: "member-dev",
    accessLevel: "member" as const,
    functionalRoles: [{
      roleKey: "developer" as const,
      scopeType: "requirement" as const,
      scopeId: "requirement-a",
      sourceType: "manual" as const
    }]
  };
  const taskScopedCapabilities = capabilitiesFromPermissionFacts({
    isLocalDemo: false,
    isWorkspaceManager: false,
    isProjectOwner: false,
    accessLevel: "member",
    functionalRoles: taskScopedActor.functionalRoles
  });

  assertSmoke(
    canManageTaskForActor({
      actorAccess: taskScopedActor,
      capabilities: taskScopedCapabilities,
      requirementId: "requirement-a",
      ownerMemberId: "another-member"
    }),
    "需求级开发负责人无法编辑职责范围内任务。"
  );
  assertSmoke(
    canManageTaskForActor({
      actorAccess: taskScopedActor,
      capabilities: taskScopedCapabilities,
      requirementId: "requirement-b",
      ownerMemberId: "member-dev"
    }),
    "开发负责人无法编辑本人任务。"
  );
  assertSmoke(
    !canManageTaskForActor({
      actorAccess: taskScopedActor,
      capabilities: taskScopedCapabilities,
      requirementId: "requirement-b",
      ownerMemberId: "another-member"
    }),
    "开发负责人被误授予其他需求、其他负责人的任务权限。"
  );

  assertIncludesAll(
    platformText,
    [
      "activeProjectActorAccess",
      "projectManagementSnapshots",
      "projectManagementSnapshotCacheRef",
      "projectManagementFailuresRef",
      "projectManagementRequestsRef",
      "taskScopedProjectIds",
      "getProjectManagementSnapshotForRecord",
      "Promise.all(taskScopedProjectIds.map",
      "canManageActiveProjectRequirement",
      "canManageActiveProjectTask",
      "canManageTaskWithSnapshot",
      "canCreateTaskForRequirement",
      "canEditTask={canManageActiveProjectTask}",
      "canCreate={taskRequirementFilter",
      "当前任务只读"
    ],
    "主容器细粒度权限接线"
  );
  assertSmoke(
    !platformText.includes("readOnly={!Boolean(permissions?.canEditBugs)}"),
    "TasksView 仍错误复用工作区 Bug 编辑权限。"
  );
  assertSmoke(
    !platformText.includes("projectManagementRequestSeqRef"),
    "跨项目治理请求仍共用单一 requestSeq，并发结果会互相丢失。"
  );
  assertIncludesAll(
    requirementsText,
    ["canEditRequirement?.(requirement)", "canDeleteRequirement?.(requirement)"],
    "需求逐行操作门禁"
  );
  assertIncludesAll(
    tasksViewText,
    [
      "canCreate = false",
      "canEditTask = denyTaskEdit",
      "editableTaskCount",
      "task.versionId === requirementFilter.versionId",
      "task.projectId === requirementFilter.projectId",
      "当前范围只读"
    ],
    "任务页保守只读与逐任务门禁"
  );
  assertIncludesAll(stageBoardText, ["canEditTask(task)", "disabled: !editable", "task-stage-card-readonly"], "阶段看板逐任务门禁");
  assertIncludesAll(ownerBoardText, ["canEditTask(task)", "disabled: !editable", "task-owner-card-readonly"], "负责人看板逐任务门禁");

  assertIncludesAll(
    viewUtilsText,
    ["getVersionScopeIds", "getVersionBugs", "getVersionActivities", "scopeIds.has(candidate.parentVersionId)", "return false;"],
    "计划单元版本子树过滤"
  );
  assertIncludesAll(
    viewText,
    ["getVersionRequirements(projectRequirements, selectedVersion, scopedVersions)", "getVersionTasks(projectTasks, selectedVersion, scopedVersions)", "getVersionBugs(projectBugs, selectedVersion, scopedVersions)", "activities={versionActivities}"],
    "计划单元详情子树数据接线"
  );
  assertIncludesAll(activitiesText, ["scopeLabel", "仅展示", "计划单元动态"], "计划单元动态范围说明");

  assertIncludesAll(scheduleText, ["canEditTask", "editableCount", "只读排期", "任务拖拽、缩放与编辑均已锁定"], "排期权限摘要");
  assertIncludesAll(progressCalendarText, ["item.editable", "blockReadOnlyTaskInteraction", "eventMoveHandling={hasEditableItems", "eventResizeHandling={hasEditableItems"], "排期拖拽与缩放门禁");
  assertIncludesAll(schedulerUtilsText, ["project-scheduler-event-readonly", "当前任务只读", "item.editable ?", "getEventResizeAreas"], "排期只读视觉模型");

  assertIncludesAll(
    membersText,
    ["!permission.id.startsWith(\"derived:\")", "升级为稳定的项目成员身份"],
    "派生成员显式升级入口"
  );
  assertIncludesAll(
    routeText,
    ["accessLevel: hasOwn(body, \"accessLevel\")", "functionalRoles: hasOwn(body, \"functionalRoles\")"],
    "项目成员原子新增 API"
  );
  assertIncludesAll(
    mutationsText,
    ["const accessLevel = input.accessLevel ?? \"member\"", "await validateFunctionalRoleScopes", "functionalRoles: toJsonValue(functionalRoles)", "prisma.$transaction"],
    "项目成员原子新增事务"
  );
  assertIncludesAll(
    platformText,
    ["if (!input.permissionId)", "accessLevel: input.accessLevel", "functionalRoles", "已有显式权限行才走 PATCH"],
    "项目成员新增单请求前端流程"
  );
  assertIncludesAll(taskFieldsText, ["precision={0}", "step={1}", "Number.isInteger(value)", "故事点必须为整数"], "故事点整数约束");
  assertIncludesAll(
    platformText,
    [
      "role.scopeType === \"plan_unit\" && Boolean(targetVersionId)",
      "role.scopeType === \"plan_unit\" && Boolean(taskVersionId)",
      "role.scopeType === \"plan_unit\" && Boolean(requirement.versionId)",
      "roleAppliesToVersion(\"delivery_manager\")",
      "role.scopeId === version.id",
      "action === \"delete\" || action === \"createSubVersion\""
    ],
    "plan_unit 前端精确作用域"
  );
  assertIncludesAll(
    requirementFieldsText,
    ["lockRelations = false", "lockRelations ? (", "[\"versionId\", \"versionName\", \"project\", \"projectId\"]"],
    "需求编辑关系锁"
  );
  assertIncludesAll(editRecordDrawersText, ["fieldAccess={fieldAccess}", "lockRelations"], "需求编辑抽屉关系锁接线");
  const governanceFieldsStart = platformText.indexOf("const governanceFields = [");
  const governanceFieldsEnd = platformText.indexOf("];", governanceFieldsStart);
  const governanceFieldsText = platformText.slice(governanceFieldsStart, governanceFieldsEnd);

  assertSmoke(governanceFieldsStart >= 0 && governanceFieldsEnd > governanceFieldsStart, "无法定位需求治理字段白名单。");
  assertSmoke(!/project|versionId|versionName/.test(governanceFieldsText), "需求编辑仍会提交项目/版本改绑字段。");
  assertIncludesAll(
    versionFieldsText,
    ["name=\"projectId\"", "disabled={Boolean(editingVersionId)}", "form.setFieldValue(\"project\""],
    "版本创建可选项目与编辑归属锁"
  );
  assertIncludesAll(
    versionParentFieldText,
    ["versionOptions.filter((option) => option.projectId === projectId)", "parentVersionId: undefined", "projectId: selectedParentVersion.projectId"],
    "版本父子同项目表单约束"
  );
  assertIncludesAll(
    platformText,
    [
      "url.searchParams.get(\"workspaceId\") !== dashboardWorkspaceId",
      "applyTaskRequirementDeepLinkToUrl(url);",
      "applyProjectDeepLinkToUrl(url, fallbackProject.projectId",
      "不得拿其 ID 跨租户回放"
    ],
    "项目/需求深链工作区防串扰"
  );
  assertIncludesAll(
    platformText,
    ["bugScopedProjectIds", "hasProjectWriteAccessForRecord", "canEditBugForActor", "canDeleteBugForActor", "[\"admin\", \"member\"]"],
    "Bug 逐项目访问级别门禁"
  );
  assertIncludesAll(bugsViewText, ["typeof canEditBugs === \"function\"", "typeof canDeleteBugs === \"function\""], "Bug 列表逐行操作门禁");

  return {
    atomicMemberCreate: true,
    projectResolutionCases: 4,
    requirementScopeCases: 3,
    scheduleReadOnly: true,
    snapshotCacheByProject: true,
    taskScopeCases: 3,
    versionSubtreeEntities: 4,
    workspaceSafeDeepLink: true
  };
}

function verifyHealthAndLegacyContracts() {
  const localDashboardText = readText(localDashboardPath);
  const typesText = readText(dashboardTypesPath);
  const healthStart = localDashboardText.indexOf("function calculateTaskCompletionProgress");
  const healthEnd = localDashboardText.indexOf("function createMetrics", healthStart);
  const healthText = healthStart >= 0 && healthEnd > healthStart
    ? localDashboardText.slice(healthStart, healthEnd)
    : localDashboardText;

  // one2all 口径：完成任务数 / 总任务数；提前完成正常，无任务/无周期待评估；落后 10/20 个百分点分级。
  assertIncludesAll(
    healthText,
    [
      "one2all",
      "completedTaskCount / tasks.length",
      "progress >= 100",
      "!tasks.length || !hasValidCycle",
      "riskLevel === \"高\"",
      "riskLevel === \"中\" || behind >= 10",
      "behind >= 20",
      "plannedDeliveryOverdue",
      "overdueTasks",
      "healthStatus: \"待评估\"",
      "healthStatus: \"正常\"",
      "healthStatus: \"有风险\"",
      "healthStatus: \"已偏离\""
    ],
    "项目健康度派生规则"
  );

  // 新 PM 状态与老 AI PM 数据要共存：历史项目风险态、版本“进行中”、P0/P1/P2 和原需求状态均不可在读取时丢失。
  assertIncludesAll(typesText, ["ProjectStatus", "\"有风险\"", "\"已归档\"", "\"进行中\"", "\"P0\"", "\"P1\"", "\"P2\"", "\"待评审\"", "\"待排期\"", "\"待上线\"", "\"待梳理\"", "\"验收中\""], "新旧 PM 类型兼容");
  assertIncludesAll(
    localDashboardText,
    [
      "function normalizeProjectStatus",
      "function normalizeTaskStage",
      "import { normalizeTaskPriority } from \"@/lib/tasks/priority\"",
      "function normalizeRequirementPriority",
      "function normalizeRequirementStatus",
      "function normalizeRequirementVersionStatus",
      "function normalizeProjectHealthStatus",
      "没有 ID 的历史行",
      "未跑迁移的开发库"
    ],
    "新旧 PM 读取兼容"
  );
  assertIncludesAll(
    localDashboardText,
    [
      "childVersionIdsByParent",
      "const getVersionScopeIds",
      "const visited = new Set<string>()",
      "const versionScopeIds = getVersionScopeIds(version)",
      "子版本只聚合自身子树"
    ],
    "版本子树进度与健康度聚合"
  );

  return {
    healthThresholds: [10, 20],
    legacyNormalizers: 7,
    progressRule: "done/total",
    versionProgressScope: "self-and-descendants"
  };
}

function verifyTaskPriorityContracts() {
  const typesText = readText(dashboardTypesPath);
  const normalizerText = readText(taskPriorityPath);
  const localText = readText(localDashboardPath);
  const databaseText = readText(databaseDashboardPath);
  const seedWriterText = readText(databaseSeedPath);
  const seedDataText = readText(dashboardSeedDataPath);
  const taskFieldsText = readText(taskFieldsPath);
  const tasksViewText = readText(tasksViewPath);
  const formUtilsText = readText(formUtilsPath);
  const constantsText = readText(platformConstantsPath);
  const overviewText = readText(overviewUtilsPath);
  const toolsText = readText(assistantToolsPath);
  const queueText = readText(assistantQueuePath);
  const assistantClientText = readText(assistantClientPath);
  const documentBreakdownText = readText(documentBreakdownPath);
  const documentAnalyzeText = readText(documentAnalyzeRoutePath);
  const weeklyReportText = readText(weeklyReportPath);
  const expectedOptions = ["紧急", "高", "普通", "低"];
  const compatibilityCases: Array<[unknown, string]> = [
    ["中", "普通"],
    ["普通", "普通"],
    ["normal", "普通"],
    ["紧急", "紧急"],
    ["高", "高"],
    ["低", "低"],
    [undefined, "普通"]
  ];

  assertSmoke(
    JSON.stringify(taskPriorityOptions) === JSON.stringify(expectedOptions),
    "任务优先级选项没有严格对齐 one2all 的紧急/高/普通/低四档。"
  );
  for (const [input, expected] of compatibilityCases) {
    assertSmoke(normalizeTaskPriority(input) === expected, `任务优先级 ${String(input)} 未规范为 ${expected}。`);
  }

  assertIncludesAll(
    typesText,
    [
      "export type TaskPriority = \"紧急\" | \"高\" | \"普通\" | \"低\"",
      "priority: TaskPriority",
      "export type ProjectRiskLevel = \"低\" | \"中\" | \"高\"",
      "priority: \"P0\" | \"P1\" | \"P2\" | \"低\" | \"普通\" | \"高\" | \"紧急\""
    ],
    "任务、风险与需求优先级类型边界"
  );
  assertIncludesAll(normalizerText, ["priority === \"中\"", "return \"普通\"", "taskPriorityOptions"], "历史任务优先级规范器");
  assertIncludesAll(localText, ["normalizeTaskPriority(values.priority)"], "本地任务写入规范化");
  assertSmoke(
    (databaseText.match(/priority: normalizeTaskPriority\(task\.priority\)/g) ?? []).length >= 2,
    "数据库任务读写边界没有同时应用优先级规范器。"
  );
  assertIncludesAll(seedWriterText, ["priority: normalizeTaskPriority(task.priority)"], "数据库种子写入规范化");
  assertSmoke(!/priority:\s*"中"/.test(seedDataText), "默认任务数据仍写入历史优先级“中”。");

  assertIncludesAll(taskFieldsText, ["taskPriorityOptions", "taskPriorityOptions.map"], "任务表单优先级选项");
  assertIncludesAll(tasksViewText, ["taskPriorityOptions", "filters: taskPriorityOptions.map"], "任务筛选优先级选项");
  assertSmoke(
    /if \(type === "task"\)[\s\S]{0,220}priority: "普通"/.test(formUtilsText),
    "新建任务默认优先级不是“普通”。"
  );
  assertSmoke(
    /if \(type === "risk"\)[\s\S]{0,100}level: "中"/.test(formUtilsText),
    "任务优先级对齐误改了风险等级“中”。"
  );
  assertIncludesAll(constantsText, ["Record<Task[\"priority\"] | Requirement[\"priority\"]", "普通: \"blue\""], "任务优先级颜色");
  assertIncludesAll(overviewText, ["Record<Task[\"priority\"], string>", "普通: \"blue\"", "普通: 2"], "任务总览优先级展示与权重");

  assertIncludesAll(toolsText, ["normalizeTaskPriority(task.priority)", "z.enum([\"紧急\", \"高\", \"普通\", \"低\"]).default(\"普通\")"], "AI 助手任务优先级");
  assertSmoke(
    (queueText.match(/normalizeTaskPriority\(/g) ?? []).length >= 2,
    "AI 助手队列没有在历史 payload 读取和 worker 写入两侧规范任务优先级。"
  );
  assertIncludesAll(assistantClientText, ["normalizeTaskPriority(task.priority)", "\\\"紧急\\\"|\\\"高\\\"|\\\"普通\\\"|\\\"低\\\""], "AI 文档任务生成优先级");
  assertIncludesAll(documentBreakdownText, ["return \"普通\" as const"], "文档拆解默认任务优先级");
  assertSmoke(
    (documentAnalyzeText.match(/priority: "普通" as const/g) ?? []).length >= 3,
    "文档分析补位任务没有全部使用“普通”优先级。"
  );
  assertIncludesAll(weeklyReportText, ["紧急: 4", "高: 3", "普通: 2", "低: 1"], "周报任务优先级权重");

  return {
    historicalMiddleReadAs: normalizeTaskPriority("中"),
    newWriteNormalizedAs: normalizeTaskPriority(taskPriorityOptions[2]),
    options: taskPriorityOptions,
    requirementPriorityIndependent: true,
    riskMiddlePreserved: true,
    writeBoundariesNormalized: 4
  };
}

function verifyAssistantTaskAuthorizationContracts() {
  const schemaText = readText(schemaPath);
  const queueText = readText(assistantQueuePath);
  const toolsText = readText(assistantToolsPath);
  const runtimeText = readText(assistantRuntimePath);
  const routeText = readText(assistantRoutePath);
  const accessText = readText(projectAccessPath);
  const migrationText = readText(assistantSecurityMigrationPath);
  const actionJobModel = getPrismaModel(schemaText, "AssistantActionJob");
  const jobCreateStart = queueText.indexOf("prisma.assistantActionJob.create");
  const jobCreateEnd = queueText.indexOf("scheduleAssistantActionJobProcessing", jobCreateStart);
  const jobCreateText = queueText.slice(jobCreateStart, jobCreateEnd);

  assertPrismaFields(actionJobModel, "AssistantActionJob", ["requestedByMemberId"]);
  assertSmoke(
    actionJobModel.includes("@@index([workspaceId, requestedByMemberId])"),
    "AssistantActionJob 缺少 actor 成员查询索引。"
  );
  assertIncludesAll(
    migrationText,
    ["ADD COLUMN `requestedByMemberId`", "assistant_action_jobs_workspaceId_requestedByMemberId_idx"],
    "AI 助手 actor 迁移"
  );

  // route 只解析稳定成员 ID，Cookie 仅留在同源即时请求 runtime，不能进入持久化 job payload。
  assertIncludesAll(
    routeText,
    ["getWorkspaceAccessContext", "actorMemberId: actorMember?.id", "workspaceId: resolvedWorkspaceId"],
    "assistant route 稳定 actor"
  );
  assertSmoke(runtimeText.includes("actorMemberId?: string"), "assistant runtime 没有传递稳定 actorMemberId。");
  assertSmoke(jobCreateStart >= 0 && jobCreateEnd > jobCreateStart, "无法定位 assistant action job 持久化代码。");
  assertSmoke(jobCreateText.includes("requestedByMemberId"), "assistant action job 未持久化 actorMemberId。");
  assertSmoke(!/cookie|token/i.test(jobCreateText), "assistant action job 不应持久化 Cookie/Token。");

  assertIncludesAll(
    toolsText,
    [
      "resolveBulkActionActorMemberId",
      "requestedByMemberId: actorMemberId",
      "requirementId",
      "projectId: version.projectId"
    ],
    "assistant task tool 入队身份与关联"
  );
  assertIncludesAll(
    accessText,
    [
      "authorizeProjectMutationsForActorMember",
      "member.id === input.actorMemberId && member.status === \"active\"",
      "isLocalDemo: false",
      "mutations.map"
    ],
    "actor-member 共享项目鉴权"
  );
  assertIncludesAll(
    queueText,
    [
      "prepareAuthorizedAssistantTaskMutation",
      "resolveProjectMutationScope",
      "authorizeProjectMutationsForActorMember",
      "const boundary = deniedIndex % 2 === 0 ? \"源\" : \"目标\"",
      "项目/需求作用域",
      "readActiveAssistantTaskActor",
      "actorMemberId: job.requestedByMemberId",
      "projectActivity.createMany"
    ],
    "assistant worker 双层鉴权与活动日志"
  );
  assertSmoke(
    (queueText.match(/prepareAuthorizedAssistantTaskMutation\s*\(/g) ?? []).length >= 3,
    "任务鉴权闸门没有同时覆盖定义、入队和 worker 执行。"
  );
  assertSmoke(
    (queueText.match(/projectActivity\.createMany/g) ?? []).length >= 3,
    "create/complete/assign 任务动作未全部写入 ProjectActivity。"
  );
  assertIncludesAll(
    queueText,
    [
      "prepareAuthorizedAssistantBugMutation",
      "if (updated.count !== targetIds.length)",
      "Bug 在执行期间发生并发变更，已回滚本次批量关闭。"
    ],
    "assistant Bug 双层鉴权与并发回滚"
  );

  return {
    activityWritePaths: 3,
    authorizationBoundaries: ["enqueue", "worker"],
    bugCloseConcurrencyGuard: true,
    persistedCredential: "member-id-only",
    sourceAndTargetScopeChecked: true
  };
}

function verifyP1SecurityClosureContracts() {
  const accessText = readText(projectAccessPath);
  const visibilityText = readText(projectVisibilityPath);
  const databaseText = readText(databaseDashboardPath);
  const localText = readText(localDashboardPath);
  const mutationsText = readText(governanceMutationsPath);
  const queriesText = readText(governanceQueriesPath);
  const routeText = readText(recordsRoutePath);
  const recordScopeText = readText(recordScopePath);
  const projects = [
    { id: "project-a", name: "Alpha", ownerMemberId: "member-owner" },
    { id: "project-b", name: "Beta", ownerMemberId: "member-other" },
    { id: "project-c", name: "Duplicate", ownerMemberId: "member-other" },
    { id: "project-d", name: "Duplicate", ownerMemberId: "member-other" }
  ];
  const activeMember = (id: string, role: DashboardMember["role"] = "backend") => ({
    id,
    role,
    status: "active" as const,
    workspaceId: "workspace-a"
  });
  const participantFacts = {
    currentMember: activeMember("member-participant"),
    explicitProjectIds: ["project-c"],
    projects,
    requirements: [{
      project: "Alpha",
      projectId: "project-a",
      developerMemberIds: ["member-participant"]
    }],
    tasks: [],
    versions: [{
      project: "Beta",
      ownerMemberId: "member-participant"
    }],
    workspaceId: "workspace-a"
  };
  const participantVisible = visibleProjectIds(participantFacts);
  const projectIds = new Set(projects.map((project) => project.id));
  const uniqueIdsByName = uniqueProjectIdByName(projects);
  const planUnitRoles = [{
    roleKey: "product_owner" as const,
    scopeType: "plan_unit" as const,
    scopeId: "version-a",
    sourceType: "manual" as const
  }];

  assertSmoke(
    visibleProjectIds({
      currentMember: activeMember("workspace-manager", "admin"),
      projects,
      workspaceId: "workspace-a"
    }).size === projects.length,
    "workspace manager 没有看到当前工作区全部项目。"
  );
  assertSmoke(
    canReadProject({
      currentMember: activeMember("member-owner"),
      projectId: "project-a",
      projects,
      workspaceId: "workspace-a"
    }),
    "project owner 没有读取本项目。"
  );
  assertSmoke(
    participantVisible.has("project-a")
      && participantVisible.has("project-b")
      && participantVisible.has("project-c")
      && !participantVisible.has("project-d"),
    "需求/版本/显式成员的可见项目并集不正确。"
  );
  assertSmoke(
    resolveVisibleRecordProjectId({ project: "Duplicate" }, projectIds, uniqueIdsByName) === undefined,
    "legacy 重名项目记录被错误归属。"
  );
  assertSmoke(
    resolveVisibleRecordProjectId(
      { project: "Alpha", projectId: "missing" },
      projectIds,
      uniqueIdsByName
    ) === undefined,
    "无效稳定 projectId 被错误降级为名称回退。"
  );
  assertSmoke(
    hasScopedFunctionalRole(planUnitRoles, ["product_owner"], undefined, "version-a"),
    "plan_unit 职能角色没有在目标版本生效。"
  );
  assertSmoke(
    !hasScopedFunctionalRole(planUnitRoles, ["product_owner"], undefined, "version-b"),
    "plan_unit 职能角色外溢到其它版本。"
  );
  assertSmoke(
    isProjectArchiveStatusTransition({ currentStatus: "进行中", nextStatus: "已归档" })
      && isProjectArchiveStatusTransition({ currentStatus: "已归档", nextStatus: "进行中" })
      && !isProjectArchiveStatusTransition({ currentStatus: "进行中", nextStatus: "暂停" }),
    "项目归档/恢复过渡识别不正确。"
  );

  assertIncludesAll(
    databaseText,
    [
      "DASHBOARD_ASSIGNMENT_TRANSACTION_OPTIONS",
      "syncAssignmentProjectMemberPermissions",
      "status: \"active\"",
      "accessLevel: { in: [\"viewer\", \"commenter\"] }",
      "accessLevel: \"member\"",
      "action: \"assignment_permission_synced\"",
      "upsertDashboardRequirementDatabase",
      "upsertDashboardRequirementVersionDatabase"
    ],
    "责任指派与项目成员权限同事务同步"
  );
  assertIncludesAll(
    mutationsText,
    [
      "validateFunctionalRoleScopes",
      "role.scopeType === \"plan_unit\"",
      "requirementVersion.findMany",
      "该成员仍承担需求或版本责任"
    ],
    "手工职能作用域与责任成员保护"
  );
  assertIncludesAll(
    visibilityText,
    [
      "export function visibleProjectIds",
      "export function canReadProject",
      "export async function resolveVisibleProjectIds",
      "developerMemberIds",
      "ownerMemberId",
      "uniqueProjectIdByName"
    ],
    "统一项目读取可见性"
  );
  assertIncludesAll(
    queriesText,
    ["canCurrentMemberReadProject", "当前成员无权查看该项目"],
    "snapshot 逐项目读取闸门"
  );
  assertIncludesAll(
    localText,
    [
      "scopeDataToVisibleProjects",
      "resolveVisibleProjectIds",
      "requirementVersions: data.requirementVersions.filter",
      "bugs: data.bugs.filter",
      "repositories: (data.repositories ?? []).filter"
    ],
    "dashboard 可见项目过滤"
  );
  assertIncludesAll(
    accessText,
    [
      "hasScopedFunctionalRole(state.functionalRoles, [\"delivery_manager\"], undefined, versionId)",
      "authorizeProjectMemberAccess",
      "state.accessLevel === \"member\"",
      "attemptsProjectArchiveTransition",
      "项目归档或恢复只允许"
    ],
    "plan_unit、Bug 项目成员与归档服务端闸门"
  );
  assertIncludesAll(
    routeText,
    [
      "attemptsRequirementScopeRebinding",
      "attemptsRequirementVersionProjectRebinding",
      "需求不能通过普通编辑改绑项目或版本",
      "版本不能通过普通编辑改绑项目",
      "sourceProjectAccess",
      "targetProjectAccess"
    ],
    "普通 PATCH 关系锁定与 Bug 源/目标项目闸门"
  );
  assertIncludesAll(
    recordScopeText,
    [
      "ensureVersionParentDoesNotCreateCycle",
      "父级版本必须与当前版本属于同一项目",
      "不能借 parentVersionId 绕过 projectId 改绑闸门"
    ],
    "版本父子同项目与无环校验"
  );

  return {
    archiveTransitionsChecked: 3,
    assignmentPermissionSync: "transactional",
    bugProjectGate: "source-and-target-member-plus",
    planUnitScopeIsolation: true,
    visibilityGrantKinds: 6
  };
}

const results = [
  runCheck("prisma and migration contracts", verifyPrismaAndMigrationContracts),
  runCheck("bug project identity contracts", verifyBugProjectIdentityContracts),
  runCheck("requirement version owner contracts", verifyRequirementVersionOwnerContracts),
  runCheck("projects view contracts", verifyProjectsViewContracts),
  runCheck("form field contracts", verifyFormFieldContracts),
  runCheck("records route contracts", verifyRecordsRouteContracts),
  runCheck("project relation security contracts", verifyProjectRelationSecurityContracts),
  runCheck("workspace and legacy fallback contracts", verifyWorkspaceAndLegacyFallbackContracts),
  runCheck("governance api contracts", verifyGovernanceApiContracts),
  runCheck("one2all mutation permission matrix contracts", verifyOne2allMutationPermissionMatrixContracts),
  runCheck("owner and legacy permission contracts", verifyOwnerAndLegacyPermissionContracts),
  runCheck("scoped ui permission contracts", verifyScopedUiPermissionContracts),
  runCheck("health and legacy contracts", verifyHealthAndLegacyContracts),
  runCheck("task priority compatibility contracts", verifyTaskPriorityContracts),
  runCheck("delivery label catalog contracts", verifyDeliveryLabelCatalogContracts),
  runCheck("assistant task authorization contracts", verifyAssistantTaskAuthorizationContracts),
  runCheck("p1 security closure contracts", verifyP1SecurityClosureContracts)
];
const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  checked: results.length,
  failed: failed.length,
  ok: failed.length === 0,
  results
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
