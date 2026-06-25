import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createDashboardMember,
  createDashboardRecord,
  createDashboardWorkspace,
  deleteDashboardRecord,
  updateDashboardMember,
  updateDashboardRecord,
  updateDashboardTaskRecord
} from "@/data/local-dashboard";
import { safelyEnqueueRecordCleanupJob, safelyEnqueueRecordIndexJob } from "@/lib/ai/knowledge/record-indexing";
import { getPrismaClient } from "@/lib/database/prisma";
import type { DashboardEntityType } from "@/types/records";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";
const repoRoot = process.cwd();
const localDashboardPath = path.join(repoRoot, "src/data/local-dashboard.ts");

type CreatedRecord = {
  id: string;
  type: DashboardEntityType;
};

function createRunLabel() {
  return `service-e2e-${Date.now()}`;
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyDashboardReadPerformanceContracts() {
  const localDashboardText = readFileSync(localDashboardPath, "utf8");
  const createMemberBlock = localDashboardText.slice(
    localDashboardText.indexOf("export async function createDashboardMember"),
    localDashboardText.indexOf("export async function updateDashboardMember")
  );
  const updateMemberBlock = localDashboardText.slice(
    localDashboardText.indexOf("export async function updateDashboardMember"),
    localDashboardText.indexOf("export async function createDashboardWorkspace")
  );

  // dashboard 首屏和工作区切换都会触发项目指标派生；这里必须按工作区+项目名预分组，
  // 防止后续改动又退回每个项目重复 filter 全量任务/Bug/风险的 O(项目数 × 记录数) 读路径。
  assertSmoke(localDashboardText.includes("function groupRecordsByProject"), "项目指标派生缺少按项目预分组函数。");
  assertSmoke(localDashboardText.includes("const tasksByProject = groupRecordsByProject(data.tasks);"), "任务指标没有使用预分组 Map。");
  assertSmoke(localDashboardText.includes("const bugsByProject = groupRecordsByProject(data.bugs);"), "Bug 指标没有使用预分组 Map。");
  assertSmoke(localDashboardText.includes("const risksByProject = groupRecordsByProject(data.risks);"), "风险指标没有使用预分组 Map。");
  assertSmoke(!localDashboardText.includes("data.tasks.filter((task) => isLinkedToProject"), "项目指标任务派生仍在重复扫描全量任务。");
  assertSmoke(localDashboardText.includes("getProjectMetricKey(getWorkspaceId(record), projectName)"), "项目指标预分组缺少工作区隔离键。");
  // 成员配置是后台轻量操作，只需要工作区和成员表；如果这里回到 readDatabase()，
  // 用户改一个邮箱/角色也会被项目、任务、Bug、需求全量读取拖慢。
  assertSmoke(createMemberBlock.includes("readDashboardMembersDatabase(workspace.id)"), "成员新增没有使用按工作区成员轻量读取。");
  assertSmoke(!createMemberBlock.includes("readDatabase()"), "成员新增仍在读取整份 dashboard。");
  assertSmoke(updateMemberBlock.includes("readDashboardMemberDatabase(id)"), "成员更新没有按成员 id 轻量定位当前成员。");
  assertSmoke(updateMemberBlock.includes("readDashboardMembersDatabase(existingMember.workspaceId)"), "成员更新没有按工作区读取同区成员。");
  assertSmoke(!updateMemberBlock.includes("readDatabase()"), "成员更新仍在读取整份 dashboard。");
}

async function enqueueIndex<T extends DashboardEntityType>(
  result: Awaited<ReturnType<typeof createDashboardRecord<T> | typeof updateDashboardRecord<T>>>,
  operation: "created" | "updated"
) {
  await safelyEnqueueRecordIndexJob(result, operation);
}

async function cleanupCreatedRecords(records: CreatedRecord[]) {
  for (const record of records.toReversed()) {
    try {
      await deleteDashboardRecord(record.type, record.id);
      await safelyEnqueueRecordCleanupJob({
        id: record.id,
        type: record.type,
        workspaceId: WORKSPACE_ID
      });
    } catch (error) {
      // 冒烟脚本清理不能掩盖主流程失败；这里记录清理问题，后续再用 Prisma 兜底删除临时数据。
      console.warn(`[service-smoke] 清理 ${record.type}:${record.id} 失败`, error);
    }
  }
}

async function cleanupDirectly({
  memberId,
  runLabel,
  workspaceId
}: {
  memberId?: string;
  runLabel: string;
  workspaceId?: string;
}) {
  const prisma = getPrismaClient();

  // 业务 deleteDashboardRecord 会覆盖任务/Bug/需求；成员和临时工作区没有公开删除 API，
  // 所以脚本最后用 Prisma 兜底清理仅属于本次 runLabel 的测试数据。
  await prisma.projectTask.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      title: {
        contains: runLabel
      }
    }
  });
  await prisma.bugReport.deleteMany({
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

  if (memberId) {
    await prisma.dashboardMember.deleteMany({
      where: {
        id: memberId,
        workspaceId: WORKSPACE_ID
      }
    });
  }

  if (workspaceId) {
    await prisma.workspace.deleteMany({
      where: {
        id: workspaceId,
        name: {
          contains: runLabel
        }
      }
    });
  }
}

async function main() {
  verifyDashboardReadPerformanceContracts();

  const prisma = getPrismaClient();
  const runLabel = createRunLabel();
  const createdRecords: CreatedRecord[] = [];
  const timings: Array<{ durationMs: number; step: string }> = [];
  let stepStartedAt = Date.now();
  let memberId = "";
  let workspaceId = "";
  const before = {
    dashboardSideEffects: await prisma.dashboardSideEffectJob.count({
      where: {
        workspaceId: WORKSPACE_ID
      }
    }),
    indexJobs: await prisma.aiIndexJob.count({
      where: {
        workspaceId: WORKSPACE_ID
      }
    })
  };

  try {
    function markStep(step: string) {
      const now = Date.now();

      timings.push({
        durationMs: now - stepStartedAt,
        step
      });
      stepStartedAt = now;
    }

    const memberResult = await createDashboardMember({
      channels: [],
      email: `${runLabel}@example.test`,
      name: `服务层测试成员 ${runLabel}`,
      role: "productMember",
      status: "active"
    }, WORKSPACE_ID);

    memberId = memberResult.member.id;
    assertSmoke(memberResult.member.notification.channels.length === 0, "测试成员不应携带通知渠道");
    markStep("create member");

    const updatedMember = await updateDashboardMember(memberId, {
      ...memberResult.member,
      role: "qa",
      status: "disabled"
    });

    assertSmoke(updatedMember.member.role === "qa", "成员角色更新失败");
    assertSmoke(updatedMember.member.status === "disabled", "成员状态更新失败");
    markStep("update member");

    const ownerValues = {
      owner: memberResult.member.name,
      ownerMemberId: memberResult.member.id,
      ownerEmail: memberResult.member.email
    };
    const taskCreate = await createDashboardRecord("task", {
      ...ownerValues,
      aiHint: "服务层冒烟任务，可删除。",
      dueDate: "2026-06-30",
      priority: "中",
      project: "Codex Service Smoke",
      stage: "待处理",
      startDate: "2026-06-24",
      title: `服务层任务 ${runLabel}`,
      versionId: "rv-backlog",
      versionName: "未规划需求池"
    }, WORKSPACE_ID);

    createdRecords.push({ id: taskCreate.record.id, type: "task" });
    await enqueueIndex(taskCreate, "created");
    assertSmoke(taskCreate.record.ownerMemberId === memberId, "任务负责人成员 ID 未落库");
    markStep("create task");

    const quickTaskUpdate = await updateDashboardTaskRecord(taskCreate.record.id, {
      ...taskCreate.record,
      stage: "进行中"
    });

    await enqueueIndex(quickTaskUpdate, "updated");
    assertSmoke(quickTaskUpdate.record.stage === "进行中", "任务快速阶段更新失败");
    markStep("quick update task");

    const taskUpdate = await updateDashboardRecord("task", taskCreate.record.id, {
      ...quickTaskUpdate.record,
      stage: "评审中"
    });

    await enqueueIndex(taskUpdate, "updated");
    assertSmoke(taskUpdate.record.stage === "评审中", "任务阶段更新失败");
    markStep("update task");

    const bugCreate = await createDashboardRecord("bug", {
      ...ownerValues,
      actual: "用于服务层全链路验证。",
      environment: "local-3004",
      expected: "Bug 可创建、流转、删除。",
      project: "Codex Service Smoke",
      reporter: "Codex QA",
      reproduction: "1. 创建 Bug\n2. 更新状态\n3. 删除清理",
      severity: "一般",
      status: "新建",
      title: `服务层 Bug ${runLabel}`,
      versionId: "rv-backlog",
      versionName: "未规划需求池"
    }, WORKSPACE_ID);

    createdRecords.push({ id: bugCreate.record.id, type: "bug" });
    await enqueueIndex(bugCreate, "created");
    assertSmoke((bugCreate.record.flowRecords ?? []).length >= 1, "Bug 创建未生成初始流转记录");
    markStep("create bug");

    const bugUpdate = await updateDashboardRecord("bug", bugCreate.record.id, {
      ...bugCreate.record,
      status: "定位中"
    });

    await enqueueIndex(bugUpdate, "updated");
    assertSmoke(bugUpdate.record.status === "定位中", "Bug 状态更新失败");
    assertSmoke((bugUpdate.record.flowRecords ?? []).length >= 2, "Bug 更新未追加流转记录");
    markStep("update bug");

    const requirementCreate = await createDashboardRecord("requirement", {
      ...ownerValues,
      acceptance: "服务层验收：需求可创建、更新、删除。",
      priority: "P1",
      project: "Codex Service Smoke",
      status: "评审中",
      title: `服务层需求 ${runLabel}`,
      versionId: "rv-backlog",
      versionName: "未规划需求池"
    }, WORKSPACE_ID);

    createdRecords.push({ id: requirementCreate.record.id, type: "requirement" });
    await enqueueIndex(requirementCreate, "created");
    assertSmoke(requirementCreate.record.ownerMemberId === memberId, "需求负责人成员 ID 未落库");
    markStep("create requirement");

    const requirementUpdate = await updateDashboardRecord("requirement", requirementCreate.record.id, {
      ...requirementCreate.record,
      status: "待排期"
    });

    await enqueueIndex(requirementUpdate, "updated");
    assertSmoke(requirementUpdate.record.status === "待排期", "需求状态更新失败");
    markStep("update requirement");

    const workspaceCreate = await createDashboardWorkspace({
      description: "服务层冒烟临时工作区，会在脚本结束清理。",
      name: `服务层工作区 ${runLabel}`
    });

    workspaceId = workspaceCreate.workspace.id;
    assertSmoke(workspaceCreate.workspace.name.includes(runLabel), "工作区创建失败");
    markStep("create workspace");

    const afterMutations = {
      bugFlowCount: await prisma.bugFlowRecord.count({
        where: {
          bugId: bugCreate.record.id
        }
      }),
      dashboardSideEffectsForRecords: await prisma.dashboardSideEffectJob.count({
        where: {
          workspaceId: WORKSPACE_ID,
          entityId: {
            in: createdRecords.map((record) => record.id)
          }
        }
      }),
      indexJobsForRecords: await prisma.aiIndexJob.count({
        where: {
          workspaceId: WORKSPACE_ID,
          entityId: {
            in: createdRecords.map((record) => record.id)
          }
        }
      })
    };

    await cleanupCreatedRecords(createdRecords);
    markStep("cleanup records");

    const afterCleanup = {
      bugFlowLeft: await prisma.bugFlowRecord.count({
        where: {
          bugId: bugCreate.record.id
        }
      }),
      bugLeft: await prisma.bugReport.count({
        where: {
          id: bugCreate.record.id
        }
      }),
      requirementLeft: await prisma.requirement.count({
        where: {
          id: requirementCreate.record.id
        }
      }),
      taskLeft: await prisma.projectTask.count({
        where: {
          id: taskCreate.record.id
        }
      })
    };

    await cleanupDirectly({ memberId, runLabel, workspaceId });
    markStep("cleanup member and workspace");

    console.log(JSON.stringify({
      runLabel,
      workspaceId: WORKSPACE_ID,
      before,
      created: {
        bugId: bugCreate.record.id,
        memberId,
        requirementId: requirementCreate.record.id,
        taskId: taskCreate.record.id,
        workspaceId
      },
      afterMutations,
      afterCleanup,
      timings,
      messages: {
        bug: bugUpdate.message,
        member: updatedMember.message,
        requirement: requirementUpdate.message,
        task: taskUpdate.message,
        workspace: workspaceCreate.message
      }
    }, null, 2));
  } finally {
    await cleanupDirectly({ memberId, runLabel, workspaceId });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await getPrismaClient().$disconnect();
  process.exitCode = 1;
});
