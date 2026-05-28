import type { BugReport, DashboardData, DocumentItem, FeishuUser, Project, Requirement, RequirementVersion, Risk, Task } from "@/types/dashboard";

export type WeeklyReportScope = {
  bugs: BugReport[];
  documents: DocumentItem[];
  isPersonal: boolean;
  ownerName: string;
  projects: Project[];
  requirementVersions: RequirementVersion[];
  requirements: Requirement[];
  risks: Risk[];
  tasks: Task[];
};

function normalizeIdentity(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isOwnerRecordForUser(
  record: {
    owner?: string;
    ownerEmail?: string;
    ownerOpenId?: string;
    ownerUnionId?: string;
    ownerUserId?: string;
  },
  user?: FeishuUser
) {
  if (!user) {
    return false;
  }

  const strictMatches = [
    [record.ownerOpenId, user.openId],
    [record.ownerUnionId, user.unionId],
    [record.ownerUserId, user.userId],
    [record.ownerEmail, user.email]
  ];

  if (strictMatches.some(([left, right]) => normalizeIdentity(left) && normalizeIdentity(left) === normalizeIdentity(right))) {
    return true;
  }

  const owner = normalizeIdentity(record.owner);

  return [user.name, user.enName, user.email].some((value) => owner && owner === normalizeIdentity(value));
}

function isReporterForUser(bug: BugReport, user?: FeishuUser) {
  if (!user) {
    return false;
  }

  const reporter = normalizeIdentity(bug.reporter);

  return [user.name, user.enName, user.email].some((value) => reporter && reporter === normalizeIdentity(value));
}

function uniqueNames(values: string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

// 个人周报按“我负责的记录 + 我负责项目下的记录”收口，避免导出全局工作区周报。
export function createWeeklyReportScope(data: DashboardData): WeeklyReportScope {
  const user = data.meta?.user;

  if (!user) {
    return {
      bugs: data.bugs,
      documents: data.documents,
      isPersonal: false,
      ownerName: "团队",
      projects: data.projects,
      requirementVersions: data.requirementVersions,
      requirements: data.requirements,
      risks: data.risks,
      tasks: data.tasks
    };
  }

  const ownedProjects = data.projects.filter((project) => isOwnerRecordForUser(project, user));
  const ownedProjectNames = uniqueNames(ownedProjects.map((project) => project.name));
  const isOwnedProjectRecord = (project?: string) => Boolean(project && ownedProjectNames.has(project));
  const tasks = data.tasks.filter((task) => isOwnerRecordForUser(task, user) || isOwnedProjectRecord(task.project));
  const bugs = data.bugs.filter((bug) => isOwnerRecordForUser(bug, user) || isReporterForUser(bug, user) || isOwnedProjectRecord(bug.project));
  const risks = data.risks.filter((risk) => isOwnerRecordForUser(risk, user) || isOwnedProjectRecord(risk.project));
  const requirements = data.requirements.filter((requirement) => isOwnerRecordForUser(requirement, user) || isOwnedProjectRecord(requirement.project));
  const relatedProjectNames = uniqueNames([
    ...ownedProjects.map((project) => project.name),
    ...tasks.map((task) => task.project),
    ...bugs.map((bug) => bug.project),
    ...risks.map((risk) => risk.project),
    ...requirements.map((requirement) => requirement.project)
  ]);
  const relatedVersionIds = uniqueNames([
    ...tasks.map((task) => task.versionId ?? ""),
    ...bugs.map((bug) => bug.versionId ?? ""),
    ...requirements.map((requirement) => requirement.versionId ?? "")
  ]);
  const relatedVersionNames = uniqueNames([
    ...tasks.map((task) => task.versionName ?? ""),
    ...bugs.map((bug) => bug.versionName ?? ""),
    ...requirements.map((requirement) => requirement.versionName ?? "")
  ]);

  return {
    bugs,
    documents: data.documents,
    isPersonal: true,
    ownerName: user.name || user.email || "我",
    projects: data.projects.filter((project) => relatedProjectNames.has(project.name)),
    requirementVersions: data.requirementVersions.filter((version) => (
      relatedProjectNames.has(version.project) ||
      relatedVersionIds.has(version.id) ||
      relatedVersionNames.has(version.name)
    )),
    requirements,
    risks,
    tasks
  };
}
