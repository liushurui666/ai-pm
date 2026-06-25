import { config as loadEnv } from "dotenv";
import { createDashboardRecord, updateDashboardRecord } from "@/data/local-dashboard";
import { createVersionDashboardSnapshots } from "@/components/project-management-platform/views/version-dashboard-utils";
import { getPrismaClient } from "@/lib/database/prisma";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createRunLabel() {
  return `version-scope-e2e-${Date.now()}`;
}

async function cleanupByRunLabel(runLabel: string) {
  const prisma = getPrismaClient();

  // 版本范围冒烟会创建项目、父子版本和三类关联记录；全部带 runLabel，
  // 直接按标记清理可以避免 deleteDashboardRecord 的版本迁移副作用干扰断言。
  await prisma.bugReport.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      title: {
        contains: runLabel
      }
    }
  });
  await prisma.projectTask.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      title: {
        contains: runLabel
      }
    }
  });
  await prisma.requirement.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      title: {
        contains: runLabel
      }
    }
  });
  await prisma.requirementVersion.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      name: {
        contains: runLabel
      }
    }
  });
  await prisma.project.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      name: {
        contains: runLabel
      }
    }
  });
}

async function readLinkedRecords(ids: {
  bugId: string;
  requirementId: string;
  taskId: string;
}) {
  const prisma = getPrismaClient();
  const [bug, requirement, task] = await Promise.all([
    prisma.bugReport.findUnique({ where: { id: ids.bugId } }),
    prisma.requirement.findUnique({ where: { id: ids.requirementId } }),
    prisma.projectTask.findUnique({ where: { id: ids.taskId } })
  ]);

  assertSmoke(bug, "Bug 应已落库");
  assertSmoke(requirement, "需求应已落库");
  assertSmoke(task, "任务应已落库");

  return {
    bug: {
      project: bug.project,
      versionId: bug.versionId ?? undefined,
      versionName: bug.versionName ?? undefined
    },
    requirement: {
      project: requirement.project,
      versionId: requirement.versionId ?? undefined,
      versionName: requirement.versionName ?? undefined
    },
    task: {
      project: task.project,
      versionId: task.versionId ?? undefined,
      versionName: task.versionName ?? undefined
    }
  };
}

function assertRecordVersionScope({
  bug,
  expectedProject,
  expectedVersionId,
  expectedVersionName,
  requirement,
  task
}: {
  bug: Pick<BugReport, "project" | "versionId" | "versionName">;
  expectedProject: string;
  expectedVersionId: string;
  expectedVersionName: string;
  requirement: Pick<Requirement, "project" | "versionId" | "versionName">;
  task: Pick<Task, "project" | "versionId" | "versionName">;
}) {
  for (const [label, record] of [
    ["需求", requirement],
    ["任务", task],
    ["Bug", bug]
  ] as const) {
    assertSmoke(record.versionId === expectedVersionId, `${label} 应绑定目标版本 ID`);
    assertSmoke(record.versionName === expectedVersionName, `${label} 应绑定目标版本名称`);
    assertSmoke(record.project === expectedProject, `${label} 应继承目标版本项目`);
  }
}

async function main() {
  const prisma = getPrismaClient();
  const runLabel = createRunLabel();
  const wrongProject = `错误项目 ${runLabel}`;
  const projectName = `版本范围项目 ${runLabel}`;
  const rejectedChildProjectName = `不应生效项目 ${runLabel}`;

  await cleanupByRunLabel(runLabel);

  try {
    await createDashboardRecord("project", {
      dueDate: "2026-07-30",
      health: 90,
      name: projectName,
      owner: "Codex QA",
      progress: 10,
      riskCount: 0,
      status: "进行中",
      summary: "版本范围冒烟临时项目。"
    }, WORKSPACE_ID);

    const parentVersionResult = await createDashboardRecord("requirementVersion", {
      goal: "验证父子版本范围聚合。",
      name: `父版本 ${runLabel}`,
      productOwner: "Codex QA",
      project: projectName,
      releaseDate: "2026-07-30",
      startDate: "2026-06-25",
      status: "进行中"
    }, WORKSPACE_ID);
    const parentVersion = parentVersionResult.record as RequirementVersion;
    const childVersionResult = await createDashboardRecord("requirementVersion", {
      goal: "验证子版本继承父版本项目。",
      name: `子版本 ${runLabel}`,
      parentVersionId: parentVersion.id,
      project: wrongProject,
      releaseDate: "2026-07-20",
      startDate: "2026-06-26",
      status: "规划中"
    }, WORKSPACE_ID);
    const childVersion = childVersionResult.record as RequirementVersion;

    assertSmoke(childVersion.parentVersionName === parentVersion.name, "子版本应由服务端回填父版本名称");
    assertSmoke(childVersion.project === projectName, "子版本应由服务端继承父版本项目");

    const requirementResult = await createDashboardRecord("requirement", {
      acceptance: "版本范围一致性通过。",
      owner: "Codex QA",
      priority: "P1",
      project: wrongProject,
      status: "评审中",
      title: `版本范围需求 ${runLabel}`,
      versionId: childVersion.id,
      versionName: "错误版本名称"
    }, WORKSPACE_ID);
    const taskResult = await createDashboardRecord("task", {
      aiHint: "版本范围冒烟任务。",
      dueDate: "2026-07-05",
      owner: "Codex QA",
      priority: "中",
      project: wrongProject,
      stage: "待处理",
      startDate: "2026-06-26",
      title: `版本范围任务 ${runLabel}`,
      versionId: childVersion.id,
      versionName: "错误版本名称"
    }, WORKSPACE_ID);
    const bugResult = await createDashboardRecord("bug", {
      actual: "版本范围冒烟 Bug。",
      environment: "local",
      expected: "项目和版本口径一致。",
      owner: "Codex QA",
      project: wrongProject,
      reporter: "Codex QA",
      reproduction: "1. 提交错误 project\n2. 服务端按版本修正",
      severity: "一般",
      status: "新建",
      title: `版本范围 Bug ${runLabel}`,
      versionId: childVersion.id,
      versionName: "错误版本名称"
    }, WORKSPACE_ID);
    const requirement = requirementResult.record as Requirement;
    const task = taskResult.record as Task;
    const bug = bugResult.record as BugReport;

    assertRecordVersionScope({
      bug,
      expectedProject: projectName,
      expectedVersionId: childVersion.id,
      expectedVersionName: childVersion.name,
      requirement,
      task
    });

    const snapshots = createVersionDashboardSnapshots({
      bugs: [bug],
      requirements: [requirement],
      tasks: [task],
      versions: [parentVersion, childVersion]
    });
    const parentSnapshot = snapshots.find((snapshot) => snapshot.id === parentVersion.id);
    const childSnapshot = snapshots.find((snapshot) => snapshot.id === childVersion.id);

    assertSmoke(parentSnapshot?.scopeVersionIds.includes(childVersion.id), "父版本大屏口径应包含子版本");
    assertSmoke(parentSnapshot?.requirementCount === 1 && parentSnapshot.taskCount === 1 && parentSnapshot.bugCount === 1, "父版本大屏应汇总子版本需求/任务/Bug");
    assertSmoke(childSnapshot?.requirementCount === 1 && childSnapshot.taskCount === 1 && childSnapshot.bugCount === 1, "子版本大屏应统计自身需求/任务/Bug");

    const updatedChildVersionResult = await updateDashboardRecord("requirementVersion", childVersion.id, {
      ...childVersion,
      name: `子版本更新 ${runLabel}`,
      parentVersionId: parentVersion.id,
      parentVersionName: parentVersion.name,
      project: rejectedChildProjectName
    });
    const updatedChildVersion = updatedChildVersionResult.record as RequirementVersion;
    const linkedAfterVersionUpdate = await readLinkedRecords({
      bugId: bug.id,
      requirementId: requirement.id,
      taskId: task.id
    });

    assertRecordVersionScope({
      bug: linkedAfterVersionUpdate.bug,
      expectedProject: projectName,
      expectedVersionId: updatedChildVersion.id,
      expectedVersionName: updatedChildVersion.name,
      requirement: linkedAfterVersionUpdate.requirement,
      task: linkedAfterVersionUpdate.task
    });
    assertSmoke(updatedChildVersion.project === projectName, "编辑子版本时仍应继承父版本项目，不能被提交值覆盖");

    console.log(JSON.stringify({
      ok: true,
      childVersion: {
        id: childVersion.id,
        parentVersionName: childVersion.parentVersionName,
        project: childVersion.project
      },
      linkedRecords: {
        bugId: bug.id,
        requirementId: requirement.id,
        taskId: task.id
      },
      parentSnapshot: {
        bugCount: parentSnapshot?.bugCount,
        requirementCount: parentSnapshot?.requirementCount,
        scopeVersionIds: parentSnapshot?.scopeVersionIds,
        taskCount: parentSnapshot?.taskCount
      },
      runLabel,
      updatedChildVersion: {
        id: updatedChildVersion.id,
        name: updatedChildVersion.name,
        project: updatedChildVersion.project
      }
    }, null, 2));
  } finally {
    await cleanupByRunLabel(runLabel);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("[full-chain-version-scope-smoke] failed", error);
  await getPrismaClient().$disconnect();
  process.exitCode = 1;
});
