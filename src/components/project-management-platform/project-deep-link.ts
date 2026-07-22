import type { Project, RequirementVersion } from "@/types/dashboard";

export const projectDetailTabs = [
  "overview",
  "requirements",
  "members",
  "activities",
  "schedule"
] as const;

export type ProjectDetailTab = (typeof projectDetailTabs)[number];

export type ProjectDeepLinkState = {
  projectId?: string;
  versionId?: string;
  detailTab: ProjectDetailTab;
};

const projectDetailTabSet = new Set<string>(projectDetailTabs);

export function normalizeProjectDetailTab(value?: string | null): ProjectDetailTab {
  return value && projectDetailTabSet.has(value) ? value as ProjectDetailTab : "overview";
}

export function readProjectDeepLink(search: string): ProjectDeepLinkState {
  const params = new URLSearchParams(search);

  return {
    projectId: params.get("projectId")?.trim() || undefined,
    versionId: params.get("versionId")?.trim() || undefined,
    detailTab: normalizeProjectDetailTab(params.get("detailTab"))
  };
}

export function resolveProjectDeepLink(input: {
  requested: ProjectDeepLinkState;
  projects: Project[];
  versions: RequirementVersion[];
  fallbackProjectId?: string;
}): ProjectDeepLinkState {
  const requestedProject = input.requested.projectId
    ? input.projects.find((project) => project.id === input.requested.projectId)
    : undefined;
  const fallbackProject = input.projects.find((project) => project.id === input.fallbackProjectId)
    ?? input.projects[0];
  const project = requestedProject ?? fallbackProject;

  if (!project) {
    return { detailTab: "overview" };
  }

  // 深链只接受稳定 projectId；历史同名项目不能靠名称猜归属，否则会跨项目打开详情和权限快照。
  const version = requestedProject && input.requested.versionId
    ? input.versions.find((candidate) => (
        candidate.id === input.requested.versionId
        && candidate.projectId === requestedProject.id
      ))
    : undefined;

  return {
    projectId: project.id,
    versionId: version?.id,
    detailTab: version ? input.requested.detailTab : "overview"
  };
}

export function applyProjectDeepLinkToUrl(url: URL, state?: Partial<ProjectDeepLinkState>) {
  url.searchParams.delete("projectId");
  url.searchParams.delete("versionId");
  url.searchParams.delete("detailTab");

  if (!state?.projectId) {
    return url;
  }

  url.searchParams.set("projectId", state.projectId);

  if (state.versionId) {
    url.searchParams.set("versionId", state.versionId);

    if (state.detailTab && state.detailTab !== "overview") {
      url.searchParams.set("detailTab", state.detailTab);
    }
  }

  return url;
}
