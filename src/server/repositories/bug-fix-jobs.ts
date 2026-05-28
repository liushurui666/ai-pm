import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/database/prisma";
import type { BugFixCheckResult, BugFixJob, BugFixJobLog, BugFixJobStatus } from "@/types/dashboard";

const activeJobStatuses: BugFixJobStatus[] = ["queued", "preparing", "analyzing", "coding", "testing", "pushing"];

type BugFixJobWithRelations = Prisma.BugFixJobGetPayload<{
  include: {
    checks: true;
    logs: true;
  };
}>;

function createFlowId() {
  return `bugFlow-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function toBugFixJob(job: BugFixJobWithRelations): BugFixJob {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    bugId: job.bugId,
    repositoryId: job.repositoryId,
    status: job.status,
    baseBranch: job.baseBranch,
    fixBranch: job.fixBranch ?? undefined,
    commitSha: job.commitSha ?? undefined,
    mrUrl: job.mrUrl ?? undefined,
    mrNumber: job.mrNumber ?? undefined,
    mrState: job.mrState ?? undefined,
    summary: job.summary ?? undefined,
    changedFiles: job.changedFiles,
    error: job.error ?? undefined,
    requestedBy: job.requestedBy ?? undefined,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString(),
    logs: job.logs.map((log): BugFixJobLog => ({
      id: log.id,
      jobId: log.jobId,
      level: log.level,
      message: log.message,
      createdAt: log.createdAt.toISOString()
    })),
    checks: job.checks.map((check): BugFixCheckResult => ({
      id: check.id,
      jobId: check.jobId,
      name: check.name,
      command: check.command,
      status: check.status,
      durationMs: check.durationMs ?? undefined,
      outputTail: check.outputTail ?? undefined,
      createdAt: check.createdAt.toISOString()
    }))
  };
}

export async function listBugFixJobsByBug(bugId: string) {
  const prisma = getPrismaClient();
  const jobs = await prisma.bugFixJob.findMany({
    where: {
      bugId
    },
    include: {
      checks: {
        orderBy: { createdAt: "asc" }
      },
      logs: {
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return jobs.map(toBugFixJob);
}

export async function getBugFixJob(jobId: string) {
  const prisma = getPrismaClient();
  const job = await prisma.bugFixJob.findUnique({
    where: {
      id: jobId
    },
    include: {
      checks: {
        orderBy: { createdAt: "asc" }
      },
      logs: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  return job ? toBugFixJob(job) : undefined;
}

export async function createBugFixJob({
  baseBranch,
  bugId,
  repositoryId,
  requestedBy,
  workspaceId
}: {
  baseBranch: string;
  bugId: string;
  repositoryId: string;
  requestedBy?: string;
  workspaceId: string;
}) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const bug = await tx.bugReport.findUnique({
      where: {
        id: bugId
      }
    });
    const repository = await tx.projectRepository.findUnique({
      where: {
        id: repositoryId
      }
    });

    if (!bug || bug.workspaceId !== workspaceId) {
      throw new Error("Bug 不存在或不属于当前工作区");
    }

    if (!repository || repository.workspaceId !== workspaceId || repository.status !== "active") {
      throw new Error("目标仓库不存在、未启用或不属于当前工作区");
    }

    const activeJob = await tx.bugFixJob.findFirst({
      where: {
        bugId,
        status: {
          in: activeJobStatuses
        }
      }
    });

    if (activeJob) {
      throw new Error("当前 Bug 已有 AI 修复任务在执行中");
    }

    const job = await tx.bugFixJob.create({
      data: {
        workspaceId,
        bugId,
        repositoryId,
        baseBranch,
        requestedBy,
        status: "queued"
      },
      include: {
        checks: true,
        logs: true
      }
    });

    await tx.bugReport.update({
      where: {
        id: bugId
      },
      data: {
        aiFixLatestJobId: job.id,
        aiFixStatus: "queued",
        aiFixError: null,
        aiFixUpdatedAt: new Date()
      }
    });
    await tx.bugFlowRecord.create({
      data: {
        id: createFlowId(),
        bugId,
        action: "updated",
        at: new Date().toISOString(),
        operator: requestedBy || "系统",
        note: "创建 AI 修复 MR 任务",
        to: bug.status
      }
    });

    return toBugFixJob(job);
  });
}

export async function cancelBugFixJob(jobId: string, operator = "系统") {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const job = await tx.bugFixJob.findUnique({
      where: {
        id: jobId
      }
    });

    if (!job) {
      throw new Error("AI 修复任务不存在");
    }

    if (!activeJobStatuses.includes(job.status)) {
      throw new Error("当前任务状态不能取消");
    }

    const nextJob = await tx.bugFixJob.update({
      where: {
        id: jobId
      },
      data: {
        status: "canceled",
        finishedAt: new Date(),
        error: "任务已取消"
      },
      include: {
        checks: true,
        logs: true
      }
    });

    await tx.bugReport.update({
      where: {
        id: job.bugId
      },
      data: {
        aiFixStatus: "canceled",
        aiFixError: "任务已取消",
        aiFixUpdatedAt: new Date()
      }
    });
    await tx.bugFixJobLog.create({
      data: {
        jobId,
        level: "warn",
        message: `${operator} 取消了 AI 修复任务`
      }
    });

    return toBugFixJob(nextJob);
  });
}

export async function appendBugFixJobLog(jobId: string, message: string, level: "info" | "warn" | "error" = "info") {
  const prisma = getPrismaClient();

  await prisma.bugFixJobLog.create({
    data: {
      jobId,
      level,
      message
    }
  });
}

export async function addBugFixJobCheck({
  command,
  durationMs,
  jobId,
  name,
  outputTail,
  status
}: {
  command: string;
  durationMs?: number;
  jobId: string;
  name: string;
  outputTail?: string;
  status: "passed" | "failed" | "skipped";
}) {
  const prisma = getPrismaClient();

  await prisma.bugFixJobCheck.create({
    data: {
      jobId,
      name,
      command,
      status,
      durationMs,
      outputTail
    }
  });
}

export async function updateBugFixJobStatus(jobId: string, status: BugFixJobStatus, data: Partial<{
  commitSha: string;
  error: string;
  fixBranch: string;
  mrNumber: string;
  mrState: string;
  mrUrl: string;
  summary: string;
  changedFiles: string[];
}> = {}) {
  const prisma = getPrismaClient();

  await prisma.bugFixJob.update({
    where: {
      id: jobId
    },
    data: {
      ...data,
      status,
      startedAt: status === "preparing" ? new Date() : undefined,
      finishedAt: ["mr_created", "failed", "canceled"].includes(status) ? new Date() : undefined
    }
  });
}

export async function claimNextBugFixJob() {
  const prisma = getPrismaClient();
  const queuedJob = await prisma.bugFixJob.findFirst({
    where: {
      status: "queued"
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (!queuedJob) {
    return undefined;
  }

  const claimed = await prisma.bugFixJob.updateMany({
    where: {
      id: queuedJob.id,
      status: "queued"
    },
    data: {
      status: "preparing",
      startedAt: new Date()
    }
  });

  if (claimed.count !== 1) {
    return undefined;
  }

  await appendBugFixJobLog(queuedJob.id, "Worker 已领取 AI 修复任务");

  return getBugFixJob(queuedJob.id);
}

export async function completeBugFixJobWithMr({
  changedFiles,
  commitSha,
  jobId,
  mrNumber,
  mrState,
  mrUrl,
  summary
}: {
  changedFiles: string[];
  commitSha?: string;
  jobId: string;
  mrNumber: string;
  mrState: string;
  mrUrl: string;
  summary: string;
}) {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const job = await tx.bugFixJob.update({
      where: {
        id: jobId
      },
      data: {
        status: "mr_created",
        changedFiles,
        commitSha,
        mrNumber,
        mrState,
        mrUrl,
        summary,
        finishedAt: new Date()
      }
    });
    const bug = await tx.bugReport.findUnique({
      where: {
        id: job.bugId
      }
    });
    const nextBugStatus = bug && ["新建", "定位中"].includes(bug.status) ? "修复中" : bug?.status;

    await tx.bugReport.update({
      where: {
        id: job.bugId
      },
      data: {
        status: nextBugStatus,
        aiFixLatestJobId: job.id,
        aiFixStatus: "mr_created",
        aiFixBranch: job.fixBranch,
        aiFixMrUrl: mrUrl,
        aiFixSummary: summary,
        aiFixError: null,
        aiFixUpdatedAt: new Date()
      }
    });
    await tx.bugFlowRecord.create({
      data: {
        id: createFlowId(),
        bugId: job.bugId,
        action: "updated",
        at: new Date().toISOString(),
        operator: "AI PM",
        note: `AI 已创建修复 MR：${mrUrl}`,
        to: nextBugStatus
      }
    });
  });
}

export async function failBugFixJob(jobId: string, error: string) {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const job = await tx.bugFixJob.update({
      where: {
        id: jobId
      },
      data: {
        status: "failed",
        error,
        finishedAt: new Date()
      }
    });

    await tx.bugReport.update({
      where: {
        id: job.bugId
      },
      data: {
        aiFixStatus: "failed",
        aiFixError: error,
        aiFixUpdatedAt: new Date()
      }
    });
    await tx.bugFixJobLog.create({
      data: {
        jobId,
        level: "error",
        message: error
      }
    });
  });
}
