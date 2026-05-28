import type { BugReport, DashboardData, RequirementVersion, Risk, Task } from "@/types/dashboard";
import { createWeeklyReportScope } from "@/lib/reports/weekly-report-scope";

type WeekRange = {
  end: Date;
  label: string;
  start: Date;
};

const dayMs = 24 * 60 * 60 * 1000;
const contextRowLimit = 5;

// AI 周报只把“模板 + 个人范围结构化数据”交给模型，避免模型自己扩展不存在的字段。
export function createWeeklyReportAiPrompt(data: DashboardData, referenceDate = new Date()) {
  const range = createWeekRange(referenceDate);
  const scope = createWeeklyReportScope(data);
  const workspaceName = data.meta?.currentWorkspace?.name || "AI PM";
  const reportTitle = scope.isPersonal ? `${scope.ownerName} 个人项目周报` : `${workspaceName} 团队项目周报`;
  const scopeLabel = scope.isPersonal ? `${scope.ownerName} 个人相关` : "团队";
  const openTasks = scope.tasks.filter((task) => task.stage !== "已完成");
  const openBugs = scope.bugs.filter((bug) => bug.status !== "已关闭");
  const severeBugs = openBugs.filter((bug) => bug.severity === "阻塞" || bug.severity === "严重");
  const highRisks = scope.risks.filter((risk) => risk.level === "高");

  return {
    systemPrompt: [
      "你是 AI PM 平台的项目周报撰写助手。",
      "你必须基于用户提供的结构化数据生成 Markdown 周报，不要编造数据中不存在的项目、任务、Bug、风险、负责人或日期。",
      "可以对本周结论、处理建议、下周计划做项目经理风格的总结和润色，但表格里的事实字段必须来自数据。",
      "输出必须是纯 Markdown，不要包裹 ```markdown 代码块，不要解释生成过程。"
    ].join("\n"),
    userPrompt: [
      "请严格按照下面模板生成周报，保留所有一级/二级/三级标题顺序。",
      "必须完整输出第 1 章到第 11 章，不要在中途停止。",
      "每个表格最多输出 5 行，优先保留高优先级、逾期、阻塞、严重、高风险和最新记录。",
      "表格内容保持精炼，处理建议控制在一句话。",
      "如果某个章节没有数据，用“暂无。”或空表说明，不要删除章节。",
      "",
      "【Markdown 模板】",
      createMarkdownTemplate({ range, reportTitle, scopeLabel }),
      "",
      "【结构化数据】",
      JSON.stringify({
        报告信息: {
          标题: reportTitle,
          工作区: workspaceName,
          周期: range.label,
          生成时间: formatDate(referenceDate),
          口径: scopeLabel,
          是否个人周报: scope.isPersonal
        },
        核心指标: {
          相关项目数: scope.projects.length,
          任务完成率: calculateTaskCompletionRate(scope.tasks),
          未完成任务数: openTasks.length,
          逾期任务数: openTasks.filter((task) => isBeforeDate(task.dueDate, referenceDate)).length,
          未关闭Bug数: openBugs.length,
          阻塞严重Bug数: severeBugs.length,
          高风险数: highRisks.length,
          相关版本数: scope.requirementVersions.length
        },
        项目: limitRows(scope.projects.map((project) => ({
          名称: project.name,
          负责人: project.owner || "未分配",
          状态: project.status,
          进度: project.progress,
          健康度: project.health,
          风险数: project.riskCount,
          截止日期: project.dueDate,
          摘要: project.summary
        }))),
        版本: limitRows(scope.requirementVersions.map(versionContext)),
        本周到期任务: limitRows(scope.tasks.filter((task) => isDateInRange(task.dueDate, range)).map(taskContext)),
        已完成任务: limitRows(scope.tasks.filter((task) => task.stage === "已完成").map(taskContext)),
        未完成任务: limitRows(openTasks.map(taskContext)),
        未关闭Bug: limitRows(openBugs.map(bugContext)),
        本周新增Bug: limitRows(scope.bugs.filter((bug) => isDateInRange(bug.createdAt, range)).map(bugContext)),
        风险: limitRows(scope.risks.map(riskContext)),
        需求: limitRows(scope.requirements.map((requirement) => ({
          标题: requirement.title,
          优先级: requirement.priority,
          状态: requirement.status,
          项目: requirement.project,
          版本: requirement.versionName,
          负责人: requirement.owner || "未分配",
          验收标准: requirement.acceptance,
          AI摘要: requirement.aiSummary
        }))),
        文档: limitRows(scope.documents.map((document) => ({
          标题: document.title,
          类型: document.type,
          更新时间: document.updatedAt,
          AI摘要: document.aiSummary
        }))),
        工作区洞察: data.weeklyInsight
      }, null, 2)
    ].join("\n")
  };
}

function createMarkdownTemplate({
  range,
  reportTitle,
  scopeLabel
}: {
  range: WeekRange;
  reportTitle: string;
  scopeLabel: string;
}) {
  return [
    `# ${reportTitle}`,
    "",
    `> 周期：${range.label}  `,
    `> 生成时间：${formatDate(new Date())}  `,
    `> 数据口径：基于 AI PM 站内数据自动生成；本报告口径为「${scopeLabel}」任务、Bug、风险、需求和项目，文档摘要为工作区参考信息。`,
    "",
    "## 1. 本周结论",
    "- 用 3 条 bullet 总结本周进展、质量状态和最需要关注的事项。",
    "",
    "## 2. 核心指标",
    "| 指标 | 数值 | 说明 |",
    "| --- | --- | --- |",
    "| 相关项目 |  |  |",
    "| 任务完成率 |  |  |",
    "| 未完成任务 |  |  |",
    "| 未关闭 Bug |  |  |",
    "| 高风险项 |  |  |",
    "| 相关版本 |  |  |",
    "",
    "## 3. 项目概览",
    "| 项目 | 负责人 | 状态 | 进度 | 健康度 | 风险数 | 截止日期 | 本周判断 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "",
    "## 4. 版本与里程碑推进",
    "| 版本 | 项目 | 状态 | 目标 | 计划周期 | 里程碑关注 |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "## 5. 任务进展",
    "### 5.1 本周到期任务",
    "| 任务 | 项目/版本 | 负责人 | 优先级 | 阶段 | 周期 | AI 提示 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "",
    "### 5.2 已完成任务",
    "| 任务 | 项目/版本 | 负责人 | 优先级 | 周期 | 说明 |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "### 5.3 未完成与逾期任务",
    "| 任务 | 项目/版本 | 负责人 | 优先级 | 阶段 | 截止日期 | 处理建议 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "",
    "## 6. Bug 与质量情况",
    "### 6.1 未关闭 Bug",
    "| Bug | 严重程度 | 状态 | 项目/版本 | 负责人 | 提交人 | 创建时间 | 处理建议 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "",
    "### 6.2 本周新增 Bug",
    "| Bug | 严重程度 | 状态 | 项目/版本 | 负责人 | 创建时间 |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "## 7. 风险与阻塞",
    "| 风险 | 等级 | 项目 | 负责人 | 应对措施 | 本周状态 |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "## 8. 需求与文档",
    "### 8.1 进行中需求",
    "| 需求 | 优先级 | 状态 | 项目/版本 | 负责人 | 验收关注 |",
    "| --- | --- | --- | --- | --- | --- |",
    "",
    "### 8.2 文档与 AI 摘要",
    "| 文档 | 类型 | 更新时间 | AI 摘要 |",
    "| --- | --- | --- | --- |",
    "",
    "## 9. 下周计划",
    "| 优先级 | 事项 | 负责人 | 目标结果 |",
    "| --- | --- | --- | --- |",
    "",
    "## 10. 需要决策或支持",
    "- 列出需要管理者、协作者或跨团队支持的事项。",
    "",
    "## 11. 附：工作区洞察（参考）",
    "- 列出可参考的平台洞察。"
  ].join("\n");
}

function createWeekRange(referenceDate: Date): WeekRange {
  const start = new Date(referenceDate);
  const day = start.getDay() || 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day + 1);

  const end = new Date(start.getTime() + 6 * dayMs);
  end.setHours(23, 59, 59, 999);

  return {
    end,
    label: `${formatDate(start)} ~ ${formatDate(end)}`,
    start
  };
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(value: string, range: WeekRange) {
  const date = parseDate(value);

  return Boolean(date && date >= range.start && date <= range.end);
}

function isBeforeDate(value: string, referenceDate: Date) {
  const date = parseDate(value);
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);

  return Boolean(date && date < reference);
}

function calculateTaskCompletionRate(tasks: Task[]) {
  if (!tasks.length) {
    return 0;
  }

  return Math.round((tasks.filter((task) => task.stage === "已完成").length / tasks.length) * 100);
}

function formatProjectVersion(project: string, versionName?: string) {
  return versionName ? `${project} / ${versionName}` : project;
}

function limitRows<T>(rows: T[]) {
  return rows.slice(0, contextRowLimit);
}

function taskContext(task: Task) {
  return {
    标题: task.title,
    项目版本: formatProjectVersion(task.project, task.versionName),
    负责人: task.owner || "未分配",
    优先级: task.priority,
    阶段: task.stage,
    开始日期: task.startDate,
    截止日期: task.dueDate,
    AI提示: task.aiHint
  };
}

function bugContext(bug: BugReport) {
  return {
    标题: bug.title,
    严重程度: bug.severity,
    状态: bug.status,
    项目版本: formatProjectVersion(bug.project, bug.versionName),
    负责人: bug.owner || "未分配",
    提交人: bug.reporter || "未填写",
    创建时间: bug.createdAt,
    环境: bug.environment
  };
}

function riskContext(risk: Risk) {
  return {
    标题: risk.title,
    等级: risk.level,
    项目: risk.project,
    负责人: risk.owner || "未分配",
    应对措施: risk.mitigation
  };
}

function versionContext(version: RequirementVersion) {
  return {
    名称: version.name,
    项目: version.project,
    状态: version.status,
    开始日期: version.startDate,
    发布日期: version.releaseDate,
    目标: version.goal,
    里程碑: version.milestones.map((milestone) => ({
      标题: milestone.title,
      状态: milestone.status,
      截止日期: milestone.dueDate,
      负责人: milestone.owner,
      备注: milestone.note
    }))
  };
}
