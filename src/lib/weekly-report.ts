import type { BugReport, DashboardData, Project, RequirementVersion, Risk, Task } from "@/types/dashboard";
import { createWeeklyReportScope } from "@/lib/weekly-report-scope";

type WeekRange = {
  end: Date;
  label: string;
  start: Date;
};

const dayMs = 24 * 60 * 60 * 1000;
const maxTableRows = 12;

const taskPriorityWeight: Record<Task["priority"], number> = { 高: 3, 中: 2, 低: 1 };
const taskStageWeight: Record<Task["stage"], number> = { 待处理: 4, 进行中: 3, 评审中: 2, 已完成: 1 };
const bugSeverityWeight: Record<BugReport["severity"], number> = { 阻塞: 4, 严重: 3, 一般: 2, 轻微: 1 };
const bugStatusWeight: Record<BugReport["status"], number> = { 新建: 4, 定位中: 3, 修复中: 2, 待验证: 1, 已关闭: 0 };
const riskLevelWeight: Record<Risk["level"], number> = { 高: 3, 中: 2, 低: 1 };

export function isWeeklyReportRequest(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("周报") || normalized.includes("汇报") || normalized.includes("weekly report");
}

export function createWeeklyReportFileName(data: DashboardData, referenceDate = new Date()) {
  const workspaceName = sanitizeFileName(data.meta?.currentWorkspace?.name || "AI-PM");
  const scope = createWeeklyReportScope(data);
  const reportName = scope.isPersonal ? `${sanitizeFileName(scope.ownerName)}-个人周报` : "团队项目周报";

  return `${workspaceName}-${reportName}-${formatDate(referenceDate)}.md`;
}

// 周报生成保持纯函数，前端导出和后端兜底可以复用同一套口径。
export function createWeeklyReportMarkdown(data: DashboardData, referenceDate = new Date()) {
  const range = createWeekRange(referenceDate);
  const scope = createWeeklyReportScope(data);
  const workspaceName = data.meta?.currentWorkspace?.name || "AI PM";
  const reportTitle = scope.isPersonal ? `${scope.ownerName} 个人项目周报` : `${workspaceName} 团队项目周报`;
  const scopeLabel = scope.isPersonal ? `${scope.ownerName} 个人相关` : "团队";
  const reportInsightTitle = scope.isPersonal ? "## 11. 附：工作区洞察（参考）" : "## 11. 附：平台洞察";
  const deliveryRate = scope.isPersonal ? calculateTaskCompletionRate(scope.tasks) : data.metrics.deliveryRate;
  const openTasks = scope.tasks.filter((task) => task.stage !== "已完成");
  const doneTasks = scope.tasks.filter((task) => task.stage === "已完成");
  const overdueTasks = openTasks.filter((task) => isBeforeDate(task.dueDate, referenceDate));
  const weekDueTasks = scope.tasks.filter((task) => isDateInRange(task.dueDate, range));
  const openBugs = scope.bugs.filter((bug) => bug.status !== "已关闭");
  const closedBugs = scope.bugs.filter((bug) => bug.status === "已关闭");
  const newBugsThisWeek = scope.bugs.filter((bug) => isDateInRange(bug.createdAt, range));
  const severeBugs = openBugs.filter((bug) => bug.severity === "阻塞" || bug.severity === "严重");
  const highRisks = scope.risks.filter((risk) => risk.level === "高");
  const topRiskProject = getTopRiskProject(scope.projects);
  const activeVersions = scope.requirementVersions.filter((version) => version.status === "规划中" || version.status === "进行中");
  const activeRequirements = scope.requirements.filter((requirement) => !["已上线", "已关闭", "已驳回"].includes(requirement.status));

  return [
    `# ${reportTitle}`,
    "",
    `> 周期：${range.label}  `,
    `> 生成时间：${formatDate(referenceDate)}  `,
    `> 数据口径：基于 AI PM 站内数据自动生成；本报告口径为「${scopeLabel}」任务、Bug、风险、需求和项目，文档摘要为工作区参考信息。`,
    "",
    "## 1. 本周结论",
    createBulletList([
      `本周${scopeLabel}项目 ${scope.projects.length} 个，任务完成率 ${deliveryRate}%，当前未完成任务 ${openTasks.length} 个，其中逾期 ${overdueTasks.length} 个。`,
      `${scopeLabel}质量侧未关闭 Bug ${openBugs.length} 个，其中阻塞/严重 ${severeBugs.length} 个；本周新增相关 Bug ${newBugsThisWeek.length} 个，已关闭相关 Bug ${closedBugs.length} 个。`,
      topRiskProject
        ? `${scope.isPersonal ? "个人相关" : "最高关注"}项目「${topRiskProject.name}」健康度 ${topRiskProject.health}/100，登记风险 ${topRiskProject.riskCount} 个，需要持续跟进负责人 ${topRiskProject.owner} 的风险动作。`
        : `当前暂无${scopeLabel}高风险项目，建议继续维持任务、Bug 和风险的日常巡检节奏。`
    ]),
    "",
    "## 2. 核心指标",
    createTable(
      ["指标", "数值", "说明"],
      [
        ["相关项目", `${scope.projects.length} 个`, `本周纳入${scopeLabel}周报统计的项目数量`],
        ["任务完成率", `${deliveryRate}%`, scope.isPersonal ? "按个人相关任务计算" : "平台当前项目交付综合指标"],
        ["未完成任务", `${openTasks.length} 个`, `${scopeLabel}待处理/进行中/评审中任务合计，逾期 ${overdueTasks.length} 个`],
        ["未关闭 Bug", `${openBugs.length} 个`, `${scopeLabel}阻塞/严重 ${severeBugs.length} 个，待验证 ${openBugs.filter((bug) => bug.status === "待验证").length} 个`],
        ["高风险项", `${highRisks.length} 个`, `${scopeLabel}风险等级为高的项目风险`],
        ["相关版本", `${activeVersions.length} 个`, `${scopeLabel}规划中或进行中的需求版本`]
      ],
      "暂无核心指标。"
    ),
    "",
    "## 3. 项目概览",
    createTable(
      ["项目", "负责人", "状态", "进度", "健康度", "风险数", "截止日期", "本周判断"],
      sortProjectsByRisk(scope.projects).map((project) => [
        project.name,
        project.owner || "未分配",
        project.status,
        `${project.progress}%`,
        `${project.health}/100`,
        `${project.riskCount}`,
        project.dueDate,
        project.summary || buildProjectJudgement(project)
      ]),
      "暂无项目数据。"
    ),
    "",
    "## 4. 版本与里程碑推进",
    createLimitedTable(
      ["版本", "项目", "状态", "目标", "计划周期", "里程碑关注"],
      activeVersions
        .sort(compareVersionReleaseDate)
        .map((version) => [
          version.name,
          version.project,
          version.status,
          version.goal,
          `${version.startDate} ~ ${version.releaseDate}`,
          summarizeMilestones(version)
        ]),
      "暂无规划中或进行中的版本。"
    ),
    "",
    "## 5. 任务进展",
    "### 5.1 本周到期任务",
    createLimitedTable(
      ["任务", "项目/版本", "负责人", "优先级", "阶段", "周期", "AI 提示"],
      sortTasksForReport(weekDueTasks).map((task) => taskRow(task)),
      "本周暂无到期任务。"
    ),
    "",
    "### 5.2 已完成任务",
    createLimitedTable(
      ["任务", "项目/版本", "负责人", "优先级", "周期", "说明"],
      sortTasksForReport(doneTasks).map((task) => [
        task.title,
        formatProjectVersion(task.project, task.versionName),
        task.owner || "未分配",
        task.priority,
        `${task.startDate} ~ ${task.dueDate}`,
        task.aiHint || "已完成，建议在验收记录中补充结果。"
      ]),
      "暂无已完成任务。"
    ),
    "",
    "### 5.3 未完成与逾期任务",
    createLimitedTable(
      ["任务", "项目/版本", "负责人", "优先级", "阶段", "截止日期", "处理建议"],
      sortTasksForReport(openTasks).map((task) => [
        task.title,
        formatProjectVersion(task.project, task.versionName),
        task.owner || "未分配",
        task.priority,
        task.stage,
        task.dueDate,
        isBeforeDate(task.dueDate, referenceDate) ? "已逾期，需要明确新的完成时间和阻塞原因。" : task.aiHint || "按当前排期推进。"
      ]),
      "暂无未完成任务。"
    ),
    "",
    "## 6. Bug 与质量情况",
    "### 6.1 未关闭 Bug",
    createLimitedTable(
      ["Bug", "严重程度", "状态", "项目/版本", "负责人", "提交人", "创建时间", "处理建议"],
      sortBugsForReport(openBugs).map((bug) => [
        bug.title,
        bug.severity,
        bug.status,
        formatProjectVersion(bug.project, bug.versionName),
        bug.owner || "未分配",
        bug.reporter || "未填写",
        formatDateText(bug.createdAt),
        buildBugAction(bug)
      ]),
      "暂无未关闭 Bug。"
    ),
    "",
    "### 6.2 本周新增 Bug",
    createLimitedTable(
      ["Bug", "严重程度", "状态", "项目/版本", "负责人", "创建时间"],
      sortBugsForReport(newBugsThisWeek).map((bug) => [
        bug.title,
        bug.severity,
        bug.status,
        formatProjectVersion(bug.project, bug.versionName),
        bug.owner || "未分配",
        formatDateText(bug.createdAt)
      ]),
      "本周暂无新增 Bug。"
    ),
    "",
    "## 7. 风险与阻塞",
    createLimitedTable(
      ["风险", "等级", "项目", "负责人", "应对措施", "本周状态"],
      [...scope.risks]
        .sort((left, right) => riskLevelWeight[right.level] - riskLevelWeight[left.level])
        .map((risk) => [
          risk.title,
          risk.level,
          risk.project,
          risk.owner || "未分配",
          risk.mitigation,
          risk.level === "高" ? "需要管理层或项目负责人跟进闭环。" : "按计划观察。"
        ]),
      "暂无登记风险。"
    ),
    "",
    "## 8. 需求与文档",
    "### 8.1 进行中需求",
    createLimitedTable(
      ["需求", "优先级", "状态", "项目/版本", "负责人", "验收关注"],
      activeRequirements.map((requirement) => [
        requirement.title,
        requirement.priority,
        requirement.status,
        formatProjectVersion(requirement.project, requirement.versionName),
        requirement.owner || "未分配",
        requirement.acceptance || requirement.aiSummary || "需补充验收标准。"
      ]),
      "暂无进行中的需求。"
    ),
    "",
    "### 8.2 文档与 AI 摘要",
    createLimitedTable(
      ["文档", "类型", "更新时间", "AI 摘要"],
      scope.documents.map((document) => [document.title, document.type, document.updatedAt, document.aiSummary]),
      "暂无文档记录。"
    ),
    "",
    "## 9. 下周计划",
    createTable(
      ["优先级", "事项", "负责人", "目标结果"],
      buildNextWeekActions({ highRisks, openTasks, severeBugs, topRiskProject }),
      "暂无下周计划建议。"
    ),
    "",
    "## 10. 需要决策或支持",
    createBulletList(buildDecisionItems({ highRisks, overdueTasks, severeBugs, topRiskProject })),
    "",
    reportInsightTitle,
    createBulletList(data.weeklyInsight.length ? data.weeklyInsight : ["暂无平台洞察。"])
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

function formatDateText(value: string) {
  const date = parseDate(value);

  return date ? formatDate(date) : value;
}

function calculateTaskCompletionRate(tasks: Task[]) {
  if (!tasks.length) {
    return 0;
  }

  return Math.round((tasks.filter((task) => task.stage === "已完成").length / tasks.length) * 100);
}

function createTable(headers: string[], rows: Array<Array<string | number>>, emptyText: string) {
  if (!rows.length) {
    return `> ${emptyText}`;
  }

  const headerRow = `| ${headers.map(escapeMarkdownCell).join(" |")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" |")} |`;
  const bodyRows = rows.map((row) => `| ${row.map((cell) => escapeMarkdownCell(String(cell || "-"))).join(" |")} |`);

  return [headerRow, separatorRow, ...bodyRows].join("\n");
}

function createLimitedTable(headers: string[], rows: Array<Array<string | number>>, emptyText: string) {
  const visibleRows = rows.slice(0, maxTableRows);
  const table = createTable(headers, visibleRows, emptyText);
  const hiddenCount = rows.length - visibleRows.length;

  return hiddenCount > 0 ? `${table}\n\n> 还有 ${hiddenCount} 条记录未在周报正文展开，可在平台内查看完整列表。` : table;
}

function createBulletList(items: string[]) {
  const visibleItems = items.filter(Boolean);

  return visibleItems.length ? visibleItems.map((item) => `- ${item}`).join("\n") : "- 暂无。";
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim() || "-";
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60) || "AI-PM";
}

function getTopRiskProject(projects: Project[]) {
  return sortProjectsByRisk(projects)[0];
}

function sortProjectsByRisk(projects: Project[]) {
  return [...projects].sort((left, right) => {
    const leftScore = 100 - left.health + left.riskCount * 8;
    const rightScore = 100 - right.health + right.riskCount * 8;

    return rightScore - leftScore;
  });
}

function buildProjectJudgement(project: Project) {
  if (project.status === "有风险" || project.health < 70 || project.riskCount > 0) {
    return "需要关注风险闭环和健康度改善。";
  }

  if (project.progress >= 90) {
    return "接近收尾，建议聚焦验收和上线准备。";
  }

  return "按计划推进。";
}

function compareVersionReleaseDate(left: RequirementVersion, right: RequirementVersion) {
  return (parseDate(left.releaseDate)?.getTime() ?? 0) - (parseDate(right.releaseDate)?.getTime() ?? 0);
}

function summarizeMilestones(version: RequirementVersion) {
  const delayed = version.milestones.filter((milestone) => milestone.status === "延期");
  const running = version.milestones.filter((milestone) => milestone.status === "进行中");

  if (delayed.length) {
    return `延期 ${delayed.length} 个：${delayed.slice(0, 2).map((milestone) => milestone.title).join("、")}`;
  }

  if (running.length) {
    return `进行中 ${running.length} 个：${running.slice(0, 2).map((milestone) => milestone.title).join("、")}`;
  }

  return version.milestones.length ? "暂无延期里程碑。" : "未配置里程碑。";
}

function sortTasksForReport(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const stageDiff = taskStageWeight[right.stage] - taskStageWeight[left.stage];
    const priorityDiff = taskPriorityWeight[right.priority] - taskPriorityWeight[left.priority];
    const dueDiff = (parseDate(left.dueDate)?.getTime() ?? 0) - (parseDate(right.dueDate)?.getTime() ?? 0);

    return stageDiff || priorityDiff || dueDiff;
  });
}

function taskRow(task: Task) {
  return [
    task.title,
    formatProjectVersion(task.project, task.versionName),
    task.owner || "未分配",
    task.priority,
    task.stage,
    `${task.startDate} ~ ${task.dueDate}`,
    task.aiHint || "按计划推进。"
  ];
}

function sortBugsForReport(bugs: BugReport[]) {
  return [...bugs].sort((left, right) => {
    const severityDiff = bugSeverityWeight[right.severity] - bugSeverityWeight[left.severity];
    const statusDiff = bugStatusWeight[right.status] - bugStatusWeight[left.status];
    const dateDiff = (parseDate(right.createdAt)?.getTime() ?? 0) - (parseDate(left.createdAt)?.getTime() ?? 0);

    return severityDiff || statusDiff || dateDiff;
  });
}

function buildBugAction(bug: BugReport) {
  if (bug.severity === "阻塞" || bug.severity === "严重") {
    return "优先确认修复责任人与验证时间。";
  }

  if (bug.status === "待验证") {
    return "测试侧确认回归结果，满足条件后关闭。";
  }

  return "按当前处理流程推进。";
}

function formatProjectVersion(project: string, versionName?: string) {
  return versionName ? `${project} / ${versionName}` : project;
}

function buildNextWeekActions({
  highRisks,
  openTasks,
  severeBugs,
  topRiskProject
}: {
  highRisks: Risk[];
  openTasks: Task[];
  severeBugs: BugReport[];
  topRiskProject?: Project;
}) {
  const actions: Array<Array<string | number>> = [];

  if (topRiskProject) {
    actions.push(["P0", `推进「${topRiskProject.name}」风险闭环`, topRiskProject.owner || "项目负责人", "明确风险状态、下个检查点和是否影响交付"]);
  }

  actions.push(...highRisks.slice(0, 4).map((risk) => [
    "P0",
    risk.title,
    risk.owner || "未分配",
    risk.mitigation || "补充风险应对方案"
  ]));

  actions.push(...severeBugs.slice(0, 4).map((bug) => [
    bug.severity === "阻塞" ? "P0" : "P1",
    `关闭 Bug：${bug.title}`,
    bug.owner || "未分配",
    "完成修复、回归验证和状态闭环"
  ]));

  actions.push(...openTasks.slice(0, 4).map((task) => [
    task.priority === "高" ? "P1" : "P2",
    task.title,
    task.owner || "未分配",
    task.stage === "评审中" ? "完成评审并进入下一阶段" : "推进到可验收状态"
  ]));

  return actions.slice(0, maxTableRows);
}

function buildDecisionItems({
  highRisks,
  overdueTasks,
  severeBugs,
  topRiskProject
}: {
  highRisks: Risk[];
  overdueTasks: Task[];
  severeBugs: BugReport[];
  topRiskProject?: Project;
}) {
  const items = [];

  if (topRiskProject && topRiskProject.health < 70) {
    items.push(`请确认「${topRiskProject.name}」是否需要调整范围、资源或发布时间。`);
  }

  if (highRisks.length) {
    items.push(`请管理层关注 ${highRisks.length} 个高风险项，优先确认风险接受、规避或升级路径。`);
  }

  if (overdueTasks.length) {
    items.push(`请各负责人更新 ${overdueTasks.length} 个逾期任务的真实完成时间和阻塞原因。`);
  }

  if (severeBugs.length) {
    items.push(`请研发和测试同步 ${severeBugs.length} 个阻塞/严重 Bug 的修复排期与回归窗口。`);
  }

  return items.length ? items : ["暂无需要额外决策的事项。"];
}
