import type { BugFixCheckResult, BugReport } from "@/types/dashboard";

export function createMergeRequestTitle(bug: BugReport) {
  return `fix: 修复 ${bug.title}`;
}

export function createMergeRequestBody({
  bug,
  changedFiles,
  checks,
  riskNotes,
  summary
}: {
  bug: BugReport;
  changedFiles: string[];
  checks: BugFixCheckResult[];
  riskNotes: string[];
  summary: string;
}) {
  const checkLines = checks.length
    ? checks.map((check) => `- ${check.status === "passed" ? "通过" : check.status === "failed" ? "失败" : "跳过"}：${check.command}`).join("\n")
    : "- 未配置校验命令";

  return [
    "## Bug",
    `- 标题：${bug.title}`,
    `- 严重程度：${bug.severity}`,
    `- 环境：${bug.environment}`,
    `- 复现步骤：${bug.reproduction}`,
    "",
    "## AI 修复摘要",
    summary,
    "",
    "## 改动文件",
    changedFiles.map((filePath) => `- ${filePath}`).join("\n") || "- 无",
    "",
    "## 校验结果",
    checkLines,
    "",
    "## 风险与人工 Review 重点",
    riskNotes.length ? riskNotes.map((note) => `- ${note}`).join("\n") : "- 请重点检查修复范围和边界场景。",
    "",
    "由 AI PM 自动生成，请人工 Review 后合并。"
  ].join("\n");
}
