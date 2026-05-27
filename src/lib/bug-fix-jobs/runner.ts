import { spawn } from "node:child_process";
import type { BugReport, ProjectRepository } from "@/types/dashboard";
import { createBugFixPrompt } from "./context";

export type AiCodeRunnerInput = {
  bug: BugReport;
  repository: ProjectRepository;
  workspaceDir: string;
};

export type AiCodeRunnerResult = {
  changedFiles: string[];
  riskNotes: string[];
  summary: string;
};

function getRunnerCommand() {
  const command = process.env.AI_BUG_FIX_RUNNER_COMMAND;

  if (!command) {
    throw new Error("缺少 AI_BUG_FIX_RUNNER_COMMAND，不能执行真实代码修复。");
  }

  return command;
}

function parseRunnerOutput(output: string): AiCodeRunnerResult {
  const trimmedOutput = output.trim();
  const jsonStart = trimmedOutput.lastIndexOf("{");

  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(trimmedOutput.slice(jsonStart)) as Partial<AiCodeRunnerResult>;

      if (parsed.summary) {
        return {
          summary: parsed.summary,
          changedFiles: Array.isArray(parsed.changedFiles) ? parsed.changedFiles : [],
          riskNotes: Array.isArray(parsed.riskNotes) ? parsed.riskNotes : []
        };
      }
    } catch {
      // Runner 可能输出日志后再输出摘要；解析失败时用完整输出兜底，但后续仍要求 git diff 存在。
    }
  }

  return {
    summary: trimmedOutput.slice(-1200) || "AI Runner 已执行，未返回结构化摘要。",
    changedFiles: [],
    riskNotes: []
  };
}

function runShellCommand(command: string, cwd: string, input: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errorChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf8");
      const errorOutput = Buffer.concat(errorChunks).toString("utf8");

      if (code && code !== 0) {
        reject(new Error(errorOutput || output || `AI Runner 执行失败，退出码：${code}`));
        return;
      }

      resolve([output, errorOutput].filter(Boolean).join("\n"));
    });

    child.stdin.end(input);
  });
}

// 真实 Runner 必须修改工作区代码；是否存在有效 diff 由 Worker 后续用 git diff 再次确认。
export async function runAiCodeFix(input: AiCodeRunnerInput): Promise<AiCodeRunnerResult> {
  const command = getRunnerCommand();
  const prompt = createBugFixPrompt({
    bug: input.bug,
    repository: input.repository
  });
  const output = await runShellCommand(command, input.workspaceDir, prompt);

  return parseRunnerOutput(output);
}
