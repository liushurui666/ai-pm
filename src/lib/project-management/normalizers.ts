import type { Prisma } from "@prisma/client";
import type {
  ProjectAccessLevel,
  ProjectActivity,
  ProjectFunctionalRole,
  ProjectFunctionalRoleAssignment,
  ProjectMemberPermission
} from "@/types/dashboard";
import { ProjectManagementError } from "@/lib/project-management/types";

export const projectAccessLevels = ["admin", "member", "commenter", "viewer"] as const satisfies readonly ProjectAccessLevel[];

export const projectFunctionalRoles = [
  "delivery_manager",
  "product_owner",
  "design_owner",
  "developer",
  "tester",
  "quality_owner",
  "ops_release",
  "business_acceptor",
  "stakeholder"
] as const satisfies readonly ProjectFunctionalRole[];

const accessLevelSet = new Set<string>(projectAccessLevels);
const functionalRoleSet = new Set<string>(projectFunctionalRoles);

type ProjectPermissionDatabaseRecord = Omit<
  ProjectMemberPermission,
  "accessLevel" | "functionalRoles" | "createdByMemberId" | "updatedByMemberId" | "createdAt" | "updatedAt"
> & {
  accessLevel: string;
  functionalRoles: Prisma.JsonValue;
  createdByMemberId: string | null;
  updatedByMemberId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectActivityDatabaseRecord = Omit<ProjectActivity, "actorMemberId" | "entityType" | "createdAt"> & {
  actorMemberId: string | null;
  entityType: string;
  createdAt: Date;
};

export function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseProjectAccessLevel(value: unknown, fieldRequired = true): ProjectAccessLevel | undefined {
  const normalized = asNonEmptyString(value);

  if (!normalized && !fieldRequired) {
    return undefined;
  }

  if (!normalized || !accessLevelSet.has(normalized)) {
    throw new ProjectManagementError("项目访问级别必须是 admin、member、commenter 或 viewer。", 400);
  }

  return normalized as ProjectAccessLevel;
}

function normalizeFunctionalRoleItem(value: unknown, strict: boolean): ProjectFunctionalRoleAssignment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (strict) {
      throw new ProjectManagementError("项目职能角色格式不正确。", 400);
    }

    return undefined;
  }

  const record = value as Record<string, unknown>;
  const roleKey = asNonEmptyString(record.roleKey);
  const scopeType = asNonEmptyString(record.scopeType);
  const scopeId = asNonEmptyString(record.scopeId);
  const sourceType = asNonEmptyString(record.sourceType);

  if (
    !roleKey
    || !functionalRoleSet.has(roleKey)
    || (scopeType !== "project" && scopeType !== "requirement" && scopeType !== "plan_unit")
  ) {
    if (strict) {
      throw new ProjectManagementError("项目职能角色或作用范围不在允许集合内。", 400);
    }

    return undefined;
  }

  if (scopeType !== "project" && !scopeId) {
    if (strict) {
      throw new ProjectManagementError("需求级或计划单元级职能角色必须指定 scopeId。", 400);
    }

    return undefined;
  }

  if (
    sourceType
    && sourceType !== "manual"
    && sourceType !== "requirement_assignment"
    && sourceType !== "version_assignment"
  ) {
    if (strict) {
      throw new ProjectManagementError("职能角色 sourceType 不合法。", 400);
    }

    return undefined;
  }

  return {
    roleKey: roleKey as ProjectFunctionalRole,
    scopeType,
    ...(scopeType !== "project" ? { scopeId } : {}),
    ...(sourceType ? { sourceType: sourceType as NonNullable<ProjectFunctionalRoleAssignment["sourceType"]> } : {}),
    ...(asNonEmptyString(record.sourceId) ? { sourceId: asNonEmptyString(record.sourceId) } : {}),
    ...(asNonEmptyString(record.sourceLabel) ? { sourceLabel: asNonEmptyString(record.sourceLabel) } : {})
  };
}

function normalizeFunctionalRoleList(value: unknown, strict: boolean) {
  if (!Array.isArray(value)) {
    if (strict) {
      throw new ProjectManagementError("functionalRoles 必须是数组。", 400);
    }

    return [];
  }

  const seen = new Set<string>();
  const roles: ProjectFunctionalRoleAssignment[] = [];

  for (const item of value) {
    const role = normalizeFunctionalRoleItem(item, strict);

    if (!role) {
      continue;
    }

    // 去重时将来源也纳入 key，以便手工角色与需求指派自动角色可并存、可独立回收。
    const identity = [role.roleKey, role.scopeType, role.scopeId ?? "", role.sourceType ?? "", role.sourceId ?? ""].join(":");

    if (!seen.has(identity)) {
      seen.add(identity);
      roles.push(role);
    }
  }

  return roles;
}

export function parseFunctionalRolesInput(value: unknown) {
  return normalizeFunctionalRoleList(value, true);
}

export function normalizeStoredFunctionalRoles(value: unknown) {
  return normalizeFunctionalRoleList(value, false);
}

export function mapProjectMemberPermissionRecord(record: ProjectPermissionDatabaseRecord): ProjectMemberPermission {
  return {
    ...record,
    accessLevel: accessLevelSet.has(record.accessLevel) ? record.accessLevel as ProjectAccessLevel : "viewer",
    functionalRoles: normalizeStoredFunctionalRoles(record.functionalRoles),
    createdByMemberId: record.createdByMemberId ?? undefined,
    updatedByMemberId: record.updatedByMemberId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapProjectActivityRecord(record: ProjectActivityDatabaseRecord): ProjectActivity {
  return {
    ...record,
    actorMemberId: record.actorMemberId ?? undefined,
    entityType: record.entityType as ProjectActivity["entityType"],
    createdAt: record.createdAt.toISOString()
  };
}
