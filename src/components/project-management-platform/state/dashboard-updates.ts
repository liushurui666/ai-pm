import dayjs from "dayjs";
import type { BugReport, DashboardData, DashboardMember, DashboardWorkspace, DocumentItem, Project, Requirement, RequirementVersion, Risk, Task } from "@/types/dashboard";
import type { CreateRecordResult, DeleteRecordResult, DocumentAnalyzeResult } from "@/types/records";
import { fallbackRequirementVersionId } from "@/components/project-management-platform/constants";

// 乐观更新后同步重算顶部指标，避免等待刷新时出现数量和列表不一致。
function recalculateMetrics(data: DashboardData) {
  const activeProjects = data.projects.filter((project) => project.status !== "已完成").length;
  const deliveryRate = data.projects.length
    ? Math.round(data.projects.reduce((sum, project) => sum + project.progress, 0) / data.projects.length)
    : 0;
  const overdueTasks = data.tasks.filter(
    (task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(dayjs().startOf("day"))
  ).length;

  return {
    activeProjects,
    deliveryRate,
    overdueTasks,
    aiSavedHours: Math.max(0, data.requirements.length * 3 + data.documents.length * 2 + data.tasks.length + data.bugs.length)
  };
}

// 创建记录成功后先做本地乐观插入，随后由静默刷新校准持久化数据。
export function updateDashboardWithRecord(data: DashboardData, result: CreateRecordResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    projects: [...data.projects],
    tasks: [...data.tasks],
    bugs: [...data.bugs],
    risks: [...data.risks],
    requirementVersions: [...data.requirementVersions],
    requirements: [...data.requirements],
    documents: [...data.documents],
    workspaces: [...data.workspaces],
    members: [...data.members],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  if (result.type === "project") {
    nextData.projects = [result.record as Project, ...nextData.projects];
  }

  if (result.type === "task") {
    nextData.tasks = [result.record as Task, ...nextData.tasks];
  }

  if (result.type === "bug") {
    nextData.bugs = [result.record as BugReport, ...nextData.bugs];
  }

  if (result.type === "risk") {
    nextData.risks = [result.record as Risk, ...nextData.risks];
  }

  if (result.type === "requirementVersion") {
    nextData.requirementVersions = [result.record as RequirementVersion, ...nextData.requirementVersions];
  }

  if (result.type === "requirement") {
    nextData.requirements = [result.record as Requirement, ...nextData.requirements];
  }

  if (result.type === "document") {
    nextData.documents = [result.record as DocumentItem, ...nextData.documents];
  }

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

// 更新记录时同步处理版本改名带来的需求、任务和 Bug 反向引用。
export function updateDashboardWithRecordUpdate(data: DashboardData, result: CreateRecordResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    projects: [...data.projects],
    tasks: [...data.tasks],
    bugs: [...data.bugs],
    risks: [...data.risks],
    requirementVersions: [...data.requirementVersions],
    requirements: [...data.requirements],
    documents: [...data.documents],
    workspaces: [...data.workspaces],
    members: [...data.members],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  if (result.type === "task") {
    const task = result.record as Task;
    nextData.tasks = nextData.tasks.map((item) => item.id === task.id ? task : item);
  }

  if (result.type === "project") {
    const project = result.record as Project;
    nextData.projects = nextData.projects.map((item) => item.id === project.id ? project : item);
  }

  if (result.type === "bug") {
    const bug = result.record as BugReport;
    nextData.bugs = nextData.bugs.map((item) => item.id === bug.id ? bug : item);
  }

  if (result.type === "requirementVersion") {
    const version = result.record as RequirementVersion;
    nextData.requirementVersions = nextData.requirementVersions.map((item) => item.id === version.id ? version : item);
    nextData.requirements = nextData.requirements.map((requirement) =>
      requirement.versionId === version.id
        ? {
            ...requirement,
            versionName: version.name,
            project: version.project
          }
        : requirement
    );
    nextData.tasks = nextData.tasks.map((task) =>
      task.versionId === version.id
        ? {
            ...task,
            versionName: version.name,
            project: version.project === "跨项目" ? task.project : version.project
          }
        : task
    );
    nextData.bugs = nextData.bugs.map((bug) =>
      bug.versionId === version.id
        ? {
            ...bug,
            versionName: version.name,
            project: version.project === "跨项目" ? bug.project : version.project
          }
        : bug
    );
  }

  if (result.type === "requirement") {
    const requirement = result.record as Requirement;
    nextData.requirements = nextData.requirements.map((item) => item.id === requirement.id ? requirement : item);
  }

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

// 删除需求版本时把关联记录迁移到兜底版本，避免列表里留下失效 versionId。
export function updateDashboardWithRecordDeletion(data: DashboardData, result: DeleteRecordResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    projects: [...data.projects],
    tasks: [...data.tasks],
    bugs: [...data.bugs],
    risks: [...data.risks],
    requirementVersions: [...data.requirementVersions],
    requirements: [...data.requirements],
    documents: [...data.documents],
    workspaces: [...data.workspaces],
    members: [...data.members],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  if (result.type === "requirement") {
    nextData.requirements = nextData.requirements.filter((requirement) => requirement.id !== result.id);
  }

  if (result.type === "bug") {
    nextData.bugs = nextData.bugs.filter((bug) => bug.id !== result.id);
  }

  if (result.type === "requirementVersion") {
    const fallbackVersion =
      result.fallbackVersion ??
      nextData.requirementVersions.find((version) => version.id === fallbackRequirementVersionId) ??
      nextData.requirementVersions.find((version) => version.id !== result.id);

    nextData.requirementVersions = nextData.requirementVersions.filter((version) => version.id !== result.id);

    if (fallbackVersion) {
      nextData.requirements = nextData.requirements.map((requirement) =>
        requirement.versionId === result.id
          ? {
              ...requirement,
              versionId: fallbackVersion.id,
              versionName: fallbackVersion.name,
              project: fallbackVersion.project === "跨项目" ? requirement.project : fallbackVersion.project
            }
          : requirement
      );
      nextData.tasks = nextData.tasks.map((task) =>
        task.versionId === result.id
          ? {
              ...task,
              versionId: fallbackVersion.id,
              versionName: fallbackVersion.name,
              project: fallbackVersion.project === "跨项目" ? task.project : fallbackVersion.project
            }
          : task
      );
      nextData.bugs = nextData.bugs.map((bug) =>
        bug.versionId === result.id
          ? {
              ...bug,
              versionId: fallbackVersion.id,
              versionName: fallbackVersion.name,
              project: fallbackVersion.project === "跨项目" ? bug.project : fallbackVersion.project
            }
          : bug
      );
    }
  }

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

// 成员新增和更新共用一个入口，同时刷新当前成员快照避免权限展示滞后。
export function updateDashboardWithMember(data: DashboardData, member: DashboardMember, message?: string): DashboardData {
  const exists = data.members.some((item) => item.id === member.id);

  return {
    ...data,
    members: exists ? data.members.map((item) => item.id === member.id ? member : item) : [member, ...data.members],
    meta: data.meta
      ? {
          ...data.meta,
          message: message ?? data.meta.message,
          currentMember: data.meta.currentMember?.id === member.id ? member : data.meta.currentMember
        }
      : undefined
  };
}

// 新建工作区后同步写入工作区列表和首个成员，随后切换接口会拉取完整数据。
export function updateDashboardWithWorkspace(
  data: DashboardData,
  workspace: DashboardWorkspace,
  member?: DashboardMember,
  message?: string
): DashboardData {
  const workspaceExists = data.workspaces.some((item) => item.id === workspace.id);
  const nextMembers = member ? updateDashboardWithMember(data, member).members : data.members;

  return {
    ...data,
    workspaces: workspaceExists ? data.workspaces.map((item) => item.id === workspace.id ? workspace : item) : [workspace, ...data.workspaces],
    members: nextMembers,
    meta: data.meta
      ? {
          ...data.meta,
          message: message ?? data.meta.message
        }
      : undefined
  };
}

// 文档拆解结果一次性新增文档和任务，先让任务看板立即可见。
export function updateDashboardWithDocumentAnalysis(data: DashboardData, result: DocumentAnalyzeResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    tasks: [...result.tasks, ...data.tasks],
    bugs: [...data.bugs],
    documents: [result.document, ...data.documents],
    workspaces: [...data.workspaces],
    members: [...data.members],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}
