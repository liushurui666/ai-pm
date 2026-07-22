import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/database/prisma";
import type { DashboardMember } from "@/types/dashboard";

type ProjectVisibilityProject = {
  id: string;
  name: string;
  ownerMemberId?: string | null;
};

type ProjectVisibilityRelation = {
  project: string;
  projectId?: string | null;
};

type ProjectVisibilityRequirement = ProjectVisibilityRelation & {
  designOwnerMemberId?: string | null;
  developerMemberIds: unknown;
  ownerMemberId?: string | null;
};

export type ProjectVisibilityFacts = {
  currentMember?: Pick<DashboardMember, "id" | "role" | "status" | "workspaceId">;
  explicitProjectIds?: Iterable<string>;
  isLocalDemo?: boolean;
  projects: ProjectVisibilityProject[];
  requirements?: ProjectVisibilityRequirement[];
  tasks?: Array<ProjectVisibilityRelation & { ownerMemberId?: string | null }>;
  versions?: Array<ProjectVisibilityRelation & { ownerMemberId?: string | null }>;
  workspaceId: string;
};

function normalizedProjectName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function jsonStringIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

export function uniqueProjectIdByName(projects: ProjectVisibilityProject[]) {
  const idsByName = new Map<string, string[]>();

  for (const project of projects) {
    const normalizedName = normalizedProjectName(project.name);

    idsByName.set(normalizedName, [...(idsByName.get(normalizedName) ?? []), project.id]);
  }

  return new Map(
    [...idsByName]
      .filter(([, projectIds]) => projectIds.length === 1)
      .map(([name, projectIds]) => [name, projectIds[0]])
  );
}

/**
 * 把稳定 projectId 和 legacy 项目名归属收口到同一处。
 * 只要记录已带 projectId，就绝不用名称改投其他项目；legacy 名称也必须在工作区唯一。
 */
export function resolveVisibleRecordProjectId(
  record: ProjectVisibilityRelation,
  projectIds: Set<string>,
  uniqueProjectIdsByName: Map<string, string>
) {
  if (record.projectId) {
    return projectIds.has(record.projectId) ? record.projectId : undefined;
  }

  return uniqueProjectIdsByName.get(normalizedProjectName(record.project));
}

/**
 * one2all 对齐的项目读取事实：工作区管理者、项目 owner、显式项目成员（viewer+）、
 * 版本总负责人、需求产品/设计/开发负责人、任务经办人均可读取所属项目。
 */
export function visibleProjectIds(input: ProjectVisibilityFacts) {
  const member = input.currentMember;
  const allProjectIds = new Set(input.projects.map((project) => project.id));

  if (
    input.isLocalDemo
    || (
      member?.workspaceId === input.workspaceId
      && member.status === "active"
      && (member.role === "owner" || member.role === "admin")
    )
  ) {
    return allProjectIds;
  }

  if (!member || member.workspaceId !== input.workspaceId || member.status !== "active") {
    return new Set<string>();
  }

  const result = new Set<string>();
  const uniqueProjectIdsByName = uniqueProjectIdByName(input.projects);
  const addRelationProject = (record: ProjectVisibilityRelation) => {
    const projectId = resolveVisibleRecordProjectId(record, allProjectIds, uniqueProjectIdsByName);

    if (projectId) {
      result.add(projectId);
    }
  };

  for (const project of input.projects) {
    if (project.ownerMemberId === member.id) {
      result.add(project.id);
    }
  }

  for (const projectId of input.explicitProjectIds ?? []) {
    if (allProjectIds.has(projectId)) {
      result.add(projectId);
    }
  }

  for (const version of input.versions ?? []) {
    if (version.ownerMemberId === member.id) {
      addRelationProject(version);
    }
  }

  for (const requirement of input.requirements ?? []) {
    if (
      requirement.ownerMemberId === member.id
      || requirement.designOwnerMemberId === member.id
      || jsonStringIds(requirement.developerMemberIds).includes(member.id)
    ) {
      addRelationProject(requirement);
    }
  }

  for (const task of input.tasks ?? []) {
    if (task.ownerMemberId === member.id) {
      addRelationProject(task);
    }
  }

  return result;
}

export function canReadProject(input: ProjectVisibilityFacts & { projectId: string }) {
  return visibleProjectIds(input).has(input.projectId);
}

export async function resolveVisibleProjectIds(input: {
  currentMember?: Pick<DashboardMember, "id" | "role" | "status" | "workspaceId">;
  isLocalDemo?: boolean;
  workspaceId: string;
}) {
  const prisma = getPrismaClient();
  const projects = await prisma.project.findMany({
    where: { workspaceId: input.workspaceId },
    select: { id: true, name: true, ownerMemberId: true }
  });

  if (
    input.isLocalDemo
    || (
      input.currentMember?.workspaceId === input.workspaceId
      && input.currentMember.status === "active"
      && (input.currentMember.role === "owner" || input.currentMember.role === "admin")
    )
  ) {
    return new Set(projects.map((project) => project.id));
  }

  if (
    !input.currentMember
    || input.currentMember.workspaceId !== input.workspaceId
    || input.currentMember.status !== "active"
  ) {
    return new Set<string>();
  }

  const memberId = input.currentMember.id;
  const [permissions, requirements, tasks, versions] = await Promise.all([
    prisma.projectMemberPermission.findMany({
      where: { workspaceId: input.workspaceId, memberId },
      select: { projectId: true }
    }),
    // developerMemberIds 是 JSON 集合；单次批量读取后在统一纯函数中解析，避免各数据库 JSON 过滤语义差异。
    prisma.requirement.findMany({
      where: { workspaceId: input.workspaceId },
      select: {
        project: true,
        projectId: true,
        ownerMemberId: true,
        designOwnerMemberId: true,
        developerMemberIds: true
      }
    }),
    prisma.projectTask.findMany({
      where: { workspaceId: input.workspaceId, ownerMemberId: memberId },
      select: { project: true, projectId: true, ownerMemberId: true }
    }),
    prisma.requirementVersion.findMany({
      where: { workspaceId: input.workspaceId, ownerMemberId: memberId },
      select: { project: true, projectId: true, ownerMemberId: true }
    })
  ]);

  return visibleProjectIds({
    currentMember: input.currentMember,
    explicitProjectIds: permissions.map((permission) => permission.projectId),
    isLocalDemo: input.isLocalDemo,
    projects,
    requirements: requirements.map((requirement) => ({
      ...requirement,
      developerMemberIds: requirement.developerMemberIds as Prisma.JsonValue
    })),
    tasks,
    versions,
    workspaceId: input.workspaceId
  });
}

export async function canCurrentMemberReadProject(input: {
  currentMember?: Pick<DashboardMember, "id" | "role" | "status" | "workspaceId">;
  isLocalDemo?: boolean;
  projectId: string;
  workspaceId: string;
}) {
  return (await resolveVisibleProjectIds(input)).has(input.projectId);
}
