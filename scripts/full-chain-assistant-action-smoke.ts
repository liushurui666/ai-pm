import { config as loadEnv } from "dotenv";
import {
  enqueueAssistantBulkActionJob,
  processAssistantActionJobs,
  waitForAssistantActionJob,
  type AssistantCreateTaskDraft
} from "@/lib/ai/assistant-action-jobs";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

// 冒烟脚本要自己控制 worker 消费时机；禁用 inline worker 可以避免入队后和脚本主流程并发抢 job。
process.env.ASSISTANT_ACTION_DISABLE_INLINE_WORKER = "true";

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";

function createRunLabel() {
  return `assistant-action-e2e-${Date.now()}`;
}

function createLocalId(prefix: string, runLabel: string) {
  return `${prefix}-${runLabel}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 191);
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertWorkspaceExists() {
  const workspace = await getPrismaClient().workspace.findUnique({
    where: {
      id: WORKSPACE_ID
    },
    select: {
      id: true,
      name: true
    }
  });

  assertSmoke(workspace, `工作区 ${WORKSPACE_ID} 不存在，无法执行 AI 助手动作冒烟。`);

  return workspace;
}

async function assertNoUserActionJobsInFlight(runLabel: string) {
  const prisma = getPrismaClient();
  const jobs = await prisma.assistantActionJob.findMany({
    where: {
      status: {
        in: ["queued", "running"]
      }
    },
    select: {
      id: true,
      requestedBy: true,
      status: true
    },
    take: 20
  });
  const foreignJobs = jobs.filter((job) => !String(job.requestedBy ?? "").includes(runLabel));

  // assistant action worker 当前是全局按 createdAt 抢任务；如果队列中已有用户任务，冒烟脚本不能继续消费，
  // 否则会把真实用户的批量动作抢走，造成难以排查的数据变更。
  assertSmoke(
    foreignJobs.length === 0,
    `检测到 ${foreignJobs.length} 个非本次测试的 queued/running AI 助手动作任务，请先处理后再运行冒烟脚本。`
  );
}

async function cleanupAssistantActionSmoke(runLabel: string) {
  const prisma = getPrismaClient();

  // 清理顺序按外键和业务影响从子表到主表执行；所有条件都带 runLabel，避免误删真实业务数据。
  await prisma.dashboardSideEffectJob.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      entityId: {
        contains: runLabel
      }
    }
  });
  await prisma.aiIndexJob.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      entityId: {
        contains: runLabel
      }
    }
  });
  await prisma.assistantActionJob.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      OR: [
        {
          requestedBy: {
            contains: runLabel
          }
        },
        {
          scope: {
            contains: runLabel
          }
        }
      ]
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
  await prisma.projectTask.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      title: {
        contains: runLabel
      }
    }
  });
  await prisma.dashboardMember.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      id: {
        contains: runLabel
      }
    }
  });
}

async function createSmokeMembers(runLabel: string) {
  const prisma = getPrismaClient();
  const now = new Date().toISOString();
  const sourceMember = {
    id: createLocalId("member-source", runLabel),
    workspaceId: WORKSPACE_ID,
    name: `动作源成员 ${runLabel}`,
    email: `source-${runLabel}@example.test`,
    role: "productMember",
    status: "active",
    registrationChannel: "email",
    identities: toJsonValue([]),
    notification: toJsonValue({
      channels: []
    }),
    createdAt: now,
    updatedAt: now
  };
  const targetMember = {
    id: createLocalId("member-target", runLabel),
    workspaceId: WORKSPACE_ID,
    name: `动作目标成员 ${runLabel}`,
    email: `target-${runLabel}@example.test`,
    role: "qa",
    status: "active",
    registrationChannel: "email",
    identities: toJsonValue([]),
    notification: toJsonValue({
      channels: []
    }),
    createdAt: now,
    updatedAt: now
  };

  await prisma.dashboardMember.createMany({
    data: [sourceMember, targetMember]
  });

  return {
    sourceMember,
    targetMember
  };
}

async function createSmokeRecords(runLabel: string, sourceMember: Awaited<ReturnType<typeof createSmokeMembers>>["sourceMember"]) {
  const prisma = getPrismaClient();
  const now = new Date().toISOString();
  const completeTaskId = createLocalId("task-complete", runLabel);
  const assignTaskId = createLocalId("task-assign", runLabel);
  const bugId = createLocalId("bug-close", runLabel);
  const ownerFields = {
    owner: sourceMember.name,
    ownerMemberId: sourceMember.id,
    ownerEmail: sourceMember.email
  };

  await prisma.projectTask.createMany({
    data: [
      {
        id: completeTaskId,
        workspaceId: WORKSPACE_ID,
        title: `助手动作完成任务 ${runLabel}`,
        stage: "进行中",
        ...ownerFields,
        project: "Codex Assistant Action Smoke",
        versionId: "rv-backlog",
        versionName: "未规划需求池",
        priority: "中",
        startDate: "2026-06-24",
        dueDate: "2026-06-30",
        aiHint: "AI 助手动作冒烟，可删除。"
      },
      {
        id: assignTaskId,
        workspaceId: WORKSPACE_ID,
        title: `助手动作转交任务 ${runLabel}`,
        stage: "待处理",
        ...ownerFields,
        project: "Codex Assistant Action Smoke",
        versionId: "rv-backlog",
        versionName: "未规划需求池",
        priority: "高",
        startDate: "2026-06-24",
        dueDate: "2026-06-30",
        aiHint: "AI 助手动作冒烟，可删除。"
      }
    ]
  });

  await prisma.bugReport.create({
    data: {
      id: bugId,
      workspaceId: WORKSPACE_ID,
      title: `助手动作关闭 Bug ${runLabel}`,
      status: "定位中",
      severity: "一般",
      project: "Codex Assistant Action Smoke",
      versionId: "rv-backlog",
      versionName: "未规划需求池",
      reporter: "Codex QA",
      ...ownerFields,
      environment: "local smoke",
      reproduction: "1. 创建测试 Bug\n2. AI 助手动作关闭",
      expected: "Bug 被关闭并追加流转。",
      actual: "用于 AI 助手动作冒烟。",
      createdAt: now,
      flowRecords: {
        create: {
          id: createLocalId("bugFlow", runLabel),
          action: "created",
          at: now,
          operator: "Codex QA",
          to: "定位中",
          note: "创建 AI 助手动作冒烟 Bug"
        }
      }
    }
  });

  return {
    assignTaskId,
    bugId,
    completeTaskId
  };
}

async function enqueueSmokeJobs({
  recordIds,
  runLabel,
  targetMember
}: {
  recordIds: Awaited<ReturnType<typeof createSmokeRecords>>;
  runLabel: string;
  targetMember: Awaited<ReturnType<typeof createSmokeMembers>>["targetMember"];
}) {
  const createdTaskIds = [
    createLocalId("task-created", runLabel),
    createLocalId("task-created", runLabel)
  ];
  const createTaskDrafts: AssistantCreateTaskDraft[] = createdTaskIds.map((_, index) => ({
    aiHint: "AI 助手批量创建任务冒烟，可删除。",
    dueDate: "2026-06-30",
    owner: index === 0 ? "我" : targetMember.name,
    ownerEmail: index === 0 ? undefined : targetMember.email,
    ownerMemberId: index === 0 ? undefined : targetMember.id,
    priority: index === 0 ? "中" : "高",
    project: "Codex Assistant Action Smoke",
    stage: "待处理",
    startDate: "2026-06-24",
    title: `助手动作创建任务 ${index + 1} ${runLabel}`,
    versionId: "rv-backlog",
    versionName: "未规划需求池"
  }));
  const requestedBy = targetMember.id;
  const jobs = await Promise.all([
    enqueueAssistantBulkActionJob({
      actionType: "complete_tasks",
      recordIds: [recordIds.completeTaskId],
      requestedBy,
      scope: `assistant-action-smoke-complete-${runLabel}`,
      targetType: "task",
      workspaceId: WORKSPACE_ID
    }),
    enqueueAssistantBulkActionJob({
      actionType: "close_bugs",
      recordIds: [recordIds.bugId],
      requestedBy,
      scope: `assistant-action-smoke-close-${runLabel}`,
      targetType: "bug",
      workspaceId: WORKSPACE_ID
    }),
    enqueueAssistantBulkActionJob({
      actionType: "assign_tasks",
      owner: {
        owner: targetMember.name,
        ownerEmail: targetMember.email,
        ownerMemberId: targetMember.id
      },
      recordIds: [recordIds.assignTaskId],
      requestedBy,
      scope: `assistant-action-smoke-assign-${runLabel}`,
      targetType: "task",
      workspaceId: WORKSPACE_ID
    }),
    enqueueAssistantBulkActionJob({
      actionType: "create_tasks",
      drafts: createTaskDrafts,
      recordIds: createdTaskIds,
      requestedBy,
      scope: `assistant-action-smoke-create-${runLabel}`,
      targetType: "task",
      workspaceId: WORKSPACE_ID
    })
  ]);
  const jobIds = jobs.map((job) => {
    const jobId = typeof job.队列任务ID === "string" ? job.队列任务ID : "";

    assertSmoke(jobId, "AI 助手动作入队未返回任务 ID");

    return jobId;
  });

  return {
    createdTaskIds,
    jobIds
  };
}

function getJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function verifySmokeResult({
  createdTaskIds,
  jobIds,
  recordIds,
  targetMember
}: {
  createdTaskIds: string[];
  jobIds: string[];
  recordIds: Awaited<ReturnType<typeof createSmokeRecords>>;
  targetMember: Awaited<ReturnType<typeof createSmokeMembers>>["targetMember"];
}) {
  const prisma = getPrismaClient();
  const jobs = await prisma.assistantActionJob.findMany({
    where: {
      id: {
        in: jobIds
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  assertSmoke(jobs.length === jobIds.length, "AI 助手动作任务数量不完整");
  assertSmoke(jobs.every((job) => job.status === "succeeded"), "AI 助手动作任务未全部成功");
  assertSmoke(jobs.every((job) => job.successCount === job.requestedCount && job.failedCount === 0), "AI 助手动作成功/失败计数异常");

  const [completeTask, assignTask, closedBug, createdTasks, closedBugFlowCount, indexJobCount, notificationJobCount] = await Promise.all([
    prisma.projectTask.findUnique({
      where: {
        id: recordIds.completeTaskId
      }
    }),
    prisma.projectTask.findUnique({
      where: {
        id: recordIds.assignTaskId
      }
    }),
    prisma.bugReport.findUnique({
      where: {
        id: recordIds.bugId
      }
    }),
    prisma.projectTask.findMany({
      where: {
        id: {
          in: createdTaskIds
        }
      },
      orderBy: {
        id: "asc"
      }
    }),
    prisma.bugFlowRecord.count({
      where: {
        bugId: recordIds.bugId,
        to: "已关闭",
        note: "AI 助手批量关闭"
      }
    }),
    prisma.aiIndexJob.count({
      where: {
        workspaceId: WORKSPACE_ID,
        entityId: {
          in: [recordIds.completeTaskId, recordIds.assignTaskId, recordIds.bugId, ...createdTaskIds]
        }
      }
    }),
    prisma.dashboardSideEffectJob.count({
      where: {
        workspaceId: WORKSPACE_ID,
        entityId: {
          in: createdTaskIds
        }
      }
    })
  ]);

  assertSmoke(completeTask?.stage === "已完成", "完成任务动作未把任务阶段改为已完成");
  assertSmoke(closedBug?.status === "已关闭", "关闭 Bug 动作未把 Bug 状态改为已关闭");
  assertSmoke(closedBugFlowCount === 1, "关闭 Bug 动作未追加正确流转记录");
  assertSmoke(assignTask?.ownerMemberId === targetMember.id, "转交任务动作未同步 ownerMemberId");
  assertSmoke(assignTask?.owner === targetMember.name, "转交任务动作未同步负责人姓名");
  assertSmoke(createdTasks.length === createdTaskIds.length, "批量创建任务数量不正确");
  assertSmoke(createdTasks.every((task) => task.ownerMemberId === targetMember.id), "批量创建任务未解析“我”或目标负责人身份");
  assertSmoke(notificationJobCount === 0, "无通知渠道测试成员不应产生 Dashboard 通知副作用任务");
  assertSmoke(indexJobCount >= 4, "AI 助手动作未投递足够的索引刷新任务");

  const createJob = jobs.find((job) => job.actionType === "create_tasks");
  const createResult = getJsonObject(createJob?.result);

  assertSmoke(createResult.通知入队数 === 0, "无通知渠道成员的批量创建任务不应入队通知");

  return {
    actionJobs: jobs.map((job) => ({
      actionType: job.actionType,
      id: job.id,
      status: job.status,
      successCount: job.successCount
    })),
    createdTaskCount: createdTasks.length,
    indexJobCount,
    notificationJobCount
  };
}

async function main() {
  const prisma = getPrismaClient();
  const runLabel = createRunLabel();
  const timings: Array<{ durationMs: number; step: string }> = [];
  let stepStartedAt = Date.now();

  function markStep(step: string) {
    const now = Date.now();

    timings.push({
      durationMs: now - stepStartedAt,
      step
    });
    stepStartedAt = now;
  }

  try {
    const workspace = await assertWorkspaceExists();

    await assertNoUserActionJobsInFlight(runLabel);
    markStep("preflight");

    const members = await createSmokeMembers(runLabel);

    markStep("create members");

    const recordIds = await createSmokeRecords(runLabel, members.sourceMember);

    markStep("create records");

    const { createdTaskIds, jobIds } = await enqueueSmokeJobs({
      recordIds,
      runLabel,
      targetMember: members.targetMember
    });

    markStep("enqueue jobs");

    const handled = await processAssistantActionJobs({
      limit: jobIds.length,
      workerId: `codex-assistant-action-${runLabel}`
    });

    assertSmoke(handled === jobIds.length, "AI 助手动作 worker 未处理全部测试任务");

    await Promise.all(jobIds.map((jobId) => waitForAssistantActionJob(jobId, 2_000)));
    // 动作完成后索引刷新使用 setTimeout 异步投递；短暂等待能让脚本验证索引 job，而不会跑真实索引 worker。
    await new Promise((resolve) => setTimeout(resolve, 500));
    markStep("process jobs");

    const verification = await verifySmokeResult({
      createdTaskIds,
      jobIds,
      recordIds,
      targetMember: members.targetMember
    });

    markStep("verify result");

    console.log(JSON.stringify({
      ok: true,
      runLabel,
      workspace,
      handled,
      verification,
      timings
    }, null, 2));
  } finally {
    await cleanupAssistantActionSmoke(runLabel);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[full-chain-assistant-action-smoke] failed", error);
  process.exitCode = 1;
});
