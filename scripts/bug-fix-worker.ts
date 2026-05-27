import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  addBugFixJobCheck,
  appendBugFixJobLog,
  claimNextBugFixJob,
  completeBugFixJobWithMr,
  failBugFixJob,
  getBugFixJob,
  updateBugFixJobStatus
} from "@/server/repositories/bug-fix-jobs";
import { getBugFixExecutionContext } from "@/lib/bug-fix-jobs/context";
import { createMergeRequestBody, createMergeRequestTitle } from "@/lib/bug-fix-jobs/mr-template";
import { runAiCodeFix } from "@/lib/bug-fix-jobs/runner";
import { assertDiffIsAllowed, getDefaultBlockedPaths } from "@/lib/bug-fix-jobs/security";
import { GitHubProviderClient } from "@/lib/git-providers/github";
import type { BugFixCheckResult, ProjectRepository } from "@/types/dashboard";

const workerOnce = process.env.AI_BUG_FIX_WORKER_ONCE === "true";

function getWorkdirRoot() {
  return process.env.AI_BUG_FIX_WORKDIR || "/tmp/ai-pm-bug-fix-workspaces";
}

function getMaxChangedFiles() {
  return Number(process.env.AI_BUG_FIX_MAX_CHANGED_FILES || 20);
}

function getMaxDiffLines() {
  return Number(process.env.AI_BUG_FIX_MAX_DIFF_LINES || 1500);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "bug";
}

function runCommand(command: string, cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const outputChunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errorChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(outputChunks).toString("utf8");
      const errorOutput = Buffer.concat(errorChunks).toString("utf8");
      const combinedOutput = [output, errorOutput].filter(Boolean).join("\n");

      if (code && code !== 0) {
        reject(new Error(combinedOutput || `${command} 执行失败，退出码：${code}`));
        return;
      }

      resolve(combinedOutput);
    });
  });
}

async function runCheck(jobId: string, workspaceDir: string, name: string, command?: string): Promise<BugFixCheckResult> {
  if (!command) {
    const check = {
      id: `${jobId}-${name}`,
      jobId,
      name,
      command: "未配置",
      status: "skipped" as const,
      createdAt: new Date().toISOString()
    };

    await addBugFixJobCheck(check);
    return check;
  }

  const startedAt = Date.now();

  try {
    const output = await runCommand(command, workspaceDir);
    const check = {
      id: `${jobId}-${name}`,
      jobId,
      name,
      command,
      status: "passed" as const,
      durationMs: Date.now() - startedAt,
      outputTail: output.slice(-2000),
      createdAt: new Date().toISOString()
    };

    await addBugFixJobCheck(check);
    return check;
  } catch (error) {
    const check = {
      id: `${jobId}-${name}`,
      jobId,
      name,
      command,
      status: "failed" as const,
      durationMs: Date.now() - startedAt,
      outputTail: error instanceof Error ? error.message.slice(-2000) : "校验失败",
      createdAt: new Date().toISOString()
    };

    await addBugFixJobCheck(check);
    return check;
  }
}

async function getChangedFiles(workspaceDir: string) {
  const output = await runCommand("git diff --name-only", workspaceDir);

  return output.split("\n").map((item) => item.trim()).filter(Boolean);
}

async function getTotalDiffLines(workspaceDir: string) {
  const output = await runCommand("git diff --numstat", workspaceDir);

  return output
    .split("\n")
    .map((line) => line.trim().split(/\s+/).slice(0, 2))
    .reduce((total, [added, removed]) => total + Number(added || 0) + Number(removed || 0), 0);
}

function getInstallCommand(repository: ProjectRepository) {
  return repository.installCommand || `${repository.packageManager} install`;
}

function createGitProvider(repository: ProjectRepository) {
  if (repository.provider !== "github") {
    throw new Error("当前 Worker 首期只支持 GitHub 自动创建 PR");
  }

  return new GitHubProviderClient();
}

async function executeJob() {
  const job = await claimNextBugFixJob();

  if (!job) {
    return false;
  }

  const context = await getBugFixExecutionContext(job.id);
  const branchName = `ai-fix/${context.bug.id}-${slugify(context.bug.title)}`;
  const workspaceDir = path.join(getWorkdirRoot(), job.id);

  try {
    await appendBugFixJobLog(job.id, `准备临时工作区：${workspaceDir}`);
    await rm(workspaceDir, { force: true, recursive: true });
    await mkdir(path.dirname(workspaceDir), { recursive: true });
    await updateBugFixJobStatus(job.id, "preparing", {
      fixBranch: branchName
    });
    await runCommand(`git clone --depth 1 --branch ${job.baseBranch} ${context.repository.cloneUrl} ${workspaceDir}`, process.cwd());
    await runCommand(`git checkout -b ${branchName}`, workspaceDir);
    await runCommand("git config user.name \"AI PM\"", workspaceDir);
    await runCommand("git config user.email \"ai-pm@example.local\"", workspaceDir);
    await updateBugFixJobStatus(job.id, "coding");
    await appendBugFixJobLog(job.id, "开始调用 AI Coding Runner 修改代码");

    const runnerResult = await runAiCodeFix({
      workspaceDir,
      bug: context.bug,
      repository: context.repository
    });
    const changedFiles = await getChangedFiles(workspaceDir);
    const totalDiffLines = await getTotalDiffLines(workspaceDir);

    assertDiffIsAllowed({
      changedFiles,
      totalDiffLines,
      maxChangedFiles: getMaxChangedFiles(),
      maxDiffLines: getMaxDiffLines(),
      allowedPaths: context.repository.allowedPaths,
      blockedPaths: [...getDefaultBlockedPaths(), ...context.repository.blockedPaths]
    });

    await updateBugFixJobStatus(job.id, "testing", {
      changedFiles,
      summary: runnerResult.summary
    });

    const checks = [
      await runCheck(job.id, workspaceDir, "install", getInstallCommand(context.repository)),
      await runCheck(job.id, workspaceDir, "lint", context.repository.lintCommand),
      await runCheck(job.id, workspaceDir, "test", context.repository.testCommand),
      await runCheck(job.id, workspaceDir, "build", context.repository.buildCommand)
    ];
    const hasFailedCheck = checks.some((check) => check.status === "failed");

    await runCommand("git add -A", workspaceDir);
    await runCommand(`git commit -m "fix: 修复 ${context.bug.title.replaceAll("\"", "'")}"`, workspaceDir);
    await updateBugFixJobStatus(job.id, "pushing");
    await runCommand(`git push origin ${branchName}`, workspaceDir);

    const committedSha = (await runCommand("git rev-parse HEAD", workspaceDir)).trim();
    const gitProvider = createGitProvider(context.repository);
    const latestJob = await getBugFixJob(job.id);
    const body = createMergeRequestBody({
      bug: context.bug,
      changedFiles,
      checks: latestJob?.checks ?? checks,
      riskNotes: runnerResult.riskNotes,
      summary: runnerResult.summary
    });
    const mr = await gitProvider.createMergeRequest({
      repoFullName: context.repository.repoFullName,
      sourceBranch: branchName,
      targetBranch: job.baseBranch,
      title: createMergeRequestTitle(context.bug),
      body,
      reviewers: context.repository.defaultReviewers,
      draft: hasFailedCheck
    });

    await completeBugFixJobWithMr({
      jobId: job.id,
      changedFiles,
      commitSha: committedSha,
      mrNumber: mr.number,
      mrState: mr.state,
      mrUrl: mr.url,
      summary: runnerResult.summary
    });
    await appendBugFixJobLog(job.id, `已创建 MR：${mr.url}`);

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 修复任务执行失败";

    await failBugFixJob(job.id, message);
    return true;
  }
}

async function main() {
  if (process.env.AI_BUG_FIX_ENABLED !== "true") {
    throw new Error("AI_BUG_FIX_ENABLED 未开启，Worker 不会执行自动修复。");
  }

  do {
    const handled = await executeJob();

    if (workerOnce) {
      break;
    }

    if (!handled) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
