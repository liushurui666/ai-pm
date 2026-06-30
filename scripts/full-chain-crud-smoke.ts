import { config as loadEnv } from "dotenv";
import { getPrismaClient } from "@/lib/database/prisma";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WORKSPACE_ID = process.env.AI_PM_QA_WORKSPACE_ID || "ws-default";
const SAFE_OWNER_EMAIL = process.env.AI_PM_QA_OWNER_EMAIL || "675948133@qq.com";

type SmokeOwner = {
  id: string;
  name: string;
  email: string | null;
  notification: unknown;
};

function getChannels(notification: unknown) {
  const settings = typeof notification === "object" && notification ? notification as { channels?: unknown } : {};

  return Array.isArray(settings.channels) ? settings.channels : [];
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function findSafeOwner() {
  const prisma = getPrismaClient();
  const preferredOwner = await prisma.dashboardMember.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      status: "active",
      email: SAFE_OWNER_EMAIL
    },
    select: {
      id: true,
      name: true,
      email: true,
      notification: true
    }
  });
  const candidates: SmokeOwner[] = preferredOwner
    ? [preferredOwner as SmokeOwner]
    : await prisma.dashboardMember.findMany({
        where: {
          workspaceId: WORKSPACE_ID,
          status: "active"
        },
        select: {
          id: true,
          name: true,
          email: true,
          notification: true
        },
        take: 100
      }) as SmokeOwner[];

  // 全链路冒烟会真实走通知入队判断；这里强制选择没有任何通知渠道的测试成员，
  // 避免 QA 脚本误把测试任务或 Bug 推送给真实飞书/邮箱成员。
  const owner = candidates.find((member) => getChannels(member.notification).length === 0) as SmokeOwner | undefined;

  if (!owner) {
    throw new Error(`工作区 ${WORKSPACE_ID} 缺少无通知渠道测试成员。`);
  }

  return owner;
}

async function main() {
  const prisma = getPrismaClient();
  const owner = await findSafeOwner();
  const runId = `codex-e2e-${Date.now()}`;
  const taskId = createLocalId("task");
  const bugId = createLocalId("bug");
  const bugFlowCreatedId = createLocalId("bugFlow");
  const bugFlowUpdatedId = createLocalId("bugFlow");
  const now = new Date().toISOString();

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

  // 这个脚本只验证 MySQL 持久化、Bug 流转子表、索引队列表和通知副作用隔离；
  // 真实业务权限/API/页面流程会在浏览器测试里覆盖，避免脚本为了拿登录态而复用不稳定 Cookie。
  await prisma.projectTask.create({
    data: {
      id: taskId,
      workspaceId: WORKSPACE_ID,
      title: `Codex 全链路任务 ${runId}`,
      stage: "待处理",
      owner: owner.name,
      ownerMemberId: owner.id,
      ownerEmail: owner.email ?? undefined,
      project: "Codex E2E",
      versionId: "rv-backlog",
      versionName: "未规划需求池",
      priority: "中",
      startDate: "2026-06-24",
      dueDate: "2026-06-30",
      aiHint: "全链路测试任务，可删除。"
    }
  });
  await prisma.aiIndexJob.create({
    data: {
      workspaceId: WORKSPACE_ID,
      entityType: "task",
      entityId: taskId,
      jobType: "index_entity",
      dedupeKey: `${WORKSPACE_ID}:task:${taskId}:index_entity:${runId}`,
      payload: {
        source: "full-chain-crud-smoke",
        operation: "created",
        title: `Codex 全链路任务 ${runId}`
      }
    }
  });

  await prisma.projectTask.update({
    where: {
      id: taskId
    },
    data: {
      stage: "进行中"
    }
  });
  await prisma.aiIndexJob.create({
    data: {
      workspaceId: WORKSPACE_ID,
      entityType: "task",
      entityId: taskId,
      jobType: "index_entity",
      dedupeKey: `${WORKSPACE_ID}:task:${taskId}:index_entity:${runId}:updated`,
      payload: {
        source: "full-chain-crud-smoke",
        operation: "updated",
        title: `Codex 全链路任务 ${runId}`
      }
    }
  });

  await prisma.bugReport.create({
    data: {
      id: bugId,
      workspaceId: WORKSPACE_ID,
      title: `Codex 全链路 Bug ${runId}`,
      status: "新建",
      severity: "一般",
      project: "Codex E2E",
      versionId: "rv-backlog",
      versionName: "未规划需求池",
      reporter: "Codex QA",
      owner: owner.name,
      ownerMemberId: owner.id,
      ownerEmail: owner.email ?? undefined,
      environment: "local-3004",
      reproduction: "1. 创建测试 Bug\n2. 更新状态\n3. 删除清理",
      expected: "记录可写入、可流转、可删除。",
      actual: "用于全链路验证。",
      createdAt: now,
      flowRecords: {
        create: {
          id: bugFlowCreatedId,
          action: "created",
          at: now,
          operator: "Codex QA",
          to: "新建",
          note: "创建 Bug"
        }
      }
    }
  });
  await prisma.aiIndexJob.create({
    data: {
      workspaceId: WORKSPACE_ID,
      entityType: "bug",
      entityId: bugId,
      jobType: "index_entity",
      dedupeKey: `${WORKSPACE_ID}:bug:${bugId}:index_entity:${runId}`,
      payload: {
        source: "full-chain-crud-smoke",
        operation: "created",
        title: `Codex 全链路 Bug ${runId}`
      }
    }
  });

  await prisma.bugReport.update({
    where: {
      id: bugId
    },
    data: {
      status: "定位中",
      flowRecords: {
        create: {
          id: bugFlowUpdatedId,
          action: "statusChanged",
          at: new Date().toISOString(),
          operator: "Codex QA",
          from: "新建",
          to: "定位中",
          note: "状态流转"
        }
      }
    }
  });
  await prisma.aiIndexJob.create({
    data: {
      workspaceId: WORKSPACE_ID,
      entityType: "bug",
      entityId: bugId,
      jobType: "index_entity",
      dedupeKey: `${WORKSPACE_ID}:bug:${bugId}:index_entity:${runId}:updated`,
      payload: {
        source: "full-chain-crud-smoke",
        operation: "updated",
        title: `Codex 全链路 Bug ${runId}`
      }
    }
  });

  const afterCreateUpdate = {
    task: await prisma.projectTask.findUnique({
      where: {
        id: taskId
      },
      select: {
        id: true,
        title: true,
        stage: true,
        ownerMemberId: true
      }
    }),
    bug: await prisma.bugReport.findUnique({
      where: {
        id: bugId
      },
      select: {
        id: true,
        title: true,
        status: true,
        ownerMemberId: true
      }
    }),
    bugFlowCount: await prisma.bugFlowRecord.count({
      where: {
        bugId
      }
    }),
    dashboardSideEffectsForRecords: await prisma.dashboardSideEffectJob.count({
      where: {
        workspaceId: WORKSPACE_ID,
        entityId: {
          in: [taskId, bugId]
        }
      }
    }),
    indexJobsForRecords: await prisma.aiIndexJob.count({
      where: {
        workspaceId: WORKSPACE_ID,
        entityId: {
          in: [taskId, bugId]
        }
      }
    })
  };

  await prisma.projectTask.delete({
    where: {
      id: taskId
    }
  });
  await prisma.aiIndexJob.create({
    data: {
      workspaceId: WORKSPACE_ID,
      entityType: "task",
      entityId: taskId,
      jobType: "cleanup_source",
      dedupeKey: `${WORKSPACE_ID}:task:${taskId}:cleanup_source:${runId}`,
      payload: {
        source: "full-chain-crud-smoke",
        operation: "deleted"
      }
    }
  });
  await prisma.bugReport.delete({
    where: {
      id: bugId
    }
  });
  await prisma.aiIndexJob.create({
    data: {
      workspaceId: WORKSPACE_ID,
      entityType: "bug",
      entityId: bugId,
      jobType: "cleanup_source",
      dedupeKey: `${WORKSPACE_ID}:bug:${bugId}:cleanup_source:${runId}`,
      payload: {
        source: "full-chain-crud-smoke",
        operation: "deleted"
      }
    }
  });

  const afterDelete = {
    taskExists: Boolean(await prisma.projectTask.findUnique({
      where: {
        id: taskId
      },
      select: {
        id: true
      }
    })),
    bugExists: Boolean(await prisma.bugReport.findUnique({
      where: {
        id: bugId
      },
      select: {
        id: true
      }
    })),
    bugFlowLeft: await prisma.bugFlowRecord.count({
      where: {
        bugId
      }
    }),
    cleanupJobs: await prisma.aiIndexJob.count({
      where: {
        workspaceId: WORKSPACE_ID,
        entityId: {
          in: [taskId, bugId]
        },
        jobType: "cleanup_source"
      }
    }),
    dashboardSideEffectsForRecords: await prisma.dashboardSideEffectJob.count({
      where: {
        workspaceId: WORKSPACE_ID,
        entityId: {
          in: [taskId, bugId]
        }
      }
    })
  };

  console.log(JSON.stringify({
    runId,
    workspaceId: WORKSPACE_ID,
    safeOwner: {
      id: owner.id,
      name: owner.name,
      email: owner.email
    },
    before,
    created: {
      taskId,
      bugId
    },
    afterCreateUpdate,
    afterDelete,
    messages: {
      taskCreate: "任务写入成功，已创建 index_entity job。",
      taskUpdate: "任务阶段更新成功，已创建 index_entity job。",
      bugCreate: "Bug 写入成功，已创建初始流转记录和 index_entity job。",
      bugUpdate: "Bug 状态更新成功，已追加状态流转记录和 index_entity job。"
    }
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await getPrismaClient().$disconnect();
  process.exitCode = 1;
});
