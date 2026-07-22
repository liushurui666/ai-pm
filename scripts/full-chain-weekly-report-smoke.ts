import fs from "node:fs";
import path from "node:path";
import { createWeeklyReportAiPrompt } from "@/lib/reports/weekly-report-ai";
import { createWeeklyReportFileName, createWeeklyReportMarkdown } from "@/lib/reports/weekly-report";
import { createWeeklyReportScope } from "@/lib/reports/weekly-report-scope";
import type { DashboardData } from "@/types/dashboard";
import { cloneDefaultProjectDeliveryLabels } from "@/data/project-delivery-labels";

type WeeklyReportCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const routePath = path.join(repoRoot, "app/api/assistant/weekly-report/route.ts");
const platformPath = path.join(repoRoot, "src/components/project-management-platform/index.tsx");
const overviewPath = path.join(repoRoot, "src/components/project-management-platform/views/overview-view/index.tsx");
const referenceDate = new Date("2026-06-25T10:30:00+08:00");

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): WeeklyReportCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "周报导出链路冒烟失败"
      },
      name,
      ok: false
    };
  }
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function createSmokeDashboardData(): DashboardData {
  const workspaceId = "weekly-smoke-ws";
  const ownerIdentity = {
    authUserId: "auth_weekly_owner",
    email: "weekly-owner@example.com",
    name: "周报用户",
    openId: "ou_weekly_owner",
    unionId: "on_weekly_owner",
    userId: "weekly_owner"
  };

  // 周报冒烟只需要覆盖“当前用户个人口径 + 工作区参考数据”的关键字段；
  // 这里刻意放入一条无关任务，确保个人周报不会把全工作区数据误导出。
  return {
    metrics: {
      activeProjects: 2,
      aiSavedHours: 12,
      deliveryRate: 55,
      overdueTasks: 1
    },
    projects: [
      {
        id: "project-weekly-owned",
        workspaceId,
        name: "周报项目",
        owner: ownerIdentity.name,
        ownerEmail: ownerIdentity.email,
        ownerMemberId: "member-weekly-owner",
        ownerOpenId: ownerIdentity.openId,
        ownerUnionId: ownerIdentity.unionId,
        ownerUserId: ownerIdentity.userId,
        status: "有风险",
        startDate: "2026-06-18",
        progress: 62,
        health: 66,
        riskLevel: "高",
        healthStatus: "有风险",
        dueDate: "2026-06-30",
        team: 5,
        riskCount: 2,
        summary: "核心链路仍有阻塞项，需要项目负责人持续推进。",
        deliveryLabelCatalog: cloneDefaultProjectDeliveryLabels(),
        milestones: [
          {
            id: "milestone-weekly-1",
            title: "周报里程碑",
            status: "进行中",
            dueDate: "2026-06-27",
            owner: ownerIdentity.name,
            note: "验证周报里程碑输出"
          }
        ]
      },
      {
        id: "project-weekly-other",
        workspaceId,
        name: "无关项目",
        owner: "其他人",
        status: "进行中",
        startDate: "2026-06-20",
        progress: 20,
        health: 90,
        riskLevel: "低",
        healthStatus: "正常",
        dueDate: "2026-07-10",
        team: 3,
        riskCount: 0,
        summary: "不应进入个人周报。",
        deliveryLabelCatalog: cloneDefaultProjectDeliveryLabels(),
        milestones: []
      }
    ],
    tasks: [
      {
        id: "task-weekly-open",
        workspaceId,
        title: "周报链路任务",
        stage: "进行中",
        owner: ownerIdentity.name,
        ownerEmail: ownerIdentity.email,
        ownerMemberId: "member-weekly-owner",
        ownerOpenId: ownerIdentity.openId,
        ownerUnionId: ownerIdentity.unionId,
        ownerUserId: ownerIdentity.userId,
        project: "周报项目",
        versionId: "version-weekly",
        versionName: "周报版本",
        priority: "高",
        startDate: "2026-06-20",
        dueDate: "2026-06-24",
        aiHint: "需要在本周补齐导出链路验证。"
      },
      {
        id: "task-weekly-done",
        workspaceId,
        title: "周报已完成任务",
        stage: "已完成",
        owner: ownerIdentity.name,
        project: "周报项目",
        versionId: "version-weekly",
        versionName: "周报版本",
        priority: "普通",
        startDate: "2026-06-18",
        dueDate: "2026-06-23",
        aiHint: "已完成周报基础模板。"
      },
      {
        id: "task-weekly-other",
        workspaceId,
        title: "无关任务",
        stage: "待处理",
        owner: "其他人",
        project: "无关项目",
        priority: "低",
        startDate: "2026-06-20",
        dueDate: "2026-06-29",
        aiHint: "不应进入个人周报。"
      }
    ],
    bugs: [
      {
        id: "bug-weekly",
        workspaceId,
        title: "周报导出严重 Bug",
        status: "修复中",
        severity: "严重",
        project: "周报项目",
        versionId: "version-weekly",
        versionName: "周报版本",
        reporter: ownerIdentity.name,
        owner: ownerIdentity.name,
        ownerEmail: ownerIdentity.email,
        ownerMemberId: "member-weekly-owner",
        ownerOpenId: ownerIdentity.openId,
        ownerUnionId: ownerIdentity.unionId,
        ownerUserId: ownerIdentity.userId,
        environment: "local",
        reproduction: "点击导出周报后验证下载。",
        expected: "生成 Markdown 文件。",
        actual: "需要冒烟覆盖。",
        createdAt: "2026-06-25T09:00:00+08:00"
      }
    ],
    risks: [
      {
        id: "risk-weekly",
        workspaceId,
        title: "周报链路缺少自动化",
        level: "高",
        owner: ownerIdentity.name,
        ownerEmail: ownerIdentity.email,
        ownerMemberId: "member-weekly-owner",
        ownerOpenId: ownerIdentity.openId,
        ownerUnionId: ownerIdentity.unionId,
        ownerUserId: ownerIdentity.userId,
        project: "周报项目",
        mitigation: "补齐周报导出冒烟脚本并纳入核心套件。"
      }
    ],
    requirementVersions: [
      {
        id: "version-weekly",
        workspaceId,
        name: "周报版本",
        project: "周报项目",
        type: "版本",
        status: "进行中",
        startDate: "2026-06-18",
        releaseDate: "2026-06-30",
        progress: 50,
        riskLevel: "高",
        healthStatus: "有风险",
        goal: "补齐周报导出全链路覆盖",
        milestones: []
      }
    ],
    requirements: [
      {
        id: "requirement-weekly",
        workspaceId,
        title: "周报导出需求",
        priority: "P0",
        status: "开发中",
        project: "周报项目",
        versionId: "version-weekly",
        versionName: "周报版本",
        owner: ownerIdentity.name,
        ownerEmail: ownerIdentity.email,
        ownerMemberId: "member-weekly-owner",
        ownerOpenId: ownerIdentity.openId,
        ownerUnionId: ownerIdentity.unionId,
        ownerUserId: ownerIdentity.userId,
        developerMemberIds: ["member-weekly-owner"],
        acceptance: "导出时出现全局 loading，完成后下载 .md 文件。",
        aiSummary: "周报导出需要固定模板和 AI 失败兜底。"
      }
    ],
    documents: [
      {
        id: "document-weekly",
        workspaceId,
        title: "周报测试说明",
        type: "技术方案",
        updatedAt: "2026-06-25",
        aiSummary: "说明周报导出链路的验证范围。"
      }
    ],
    workspaces: [
      {
        id: workspaceId,
        name: "默认/工作区:周报",
        description: "周报冒烟工作区",
        status: "active",
        createdAt: "2026-06-20T00:00:00+08:00",
        updatedAt: "2026-06-25T10:00:00+08:00"
      }
    ],
    members: [
      {
        id: "member-weekly-owner",
        workspaceId,
        name: ownerIdentity.name,
        email: ownerIdentity.email,
        registrationChannel: "feishu",
        role: "owner",
        status: "active",
        identities: [
          {
            provider: "feishu",
            providerUserId: ownerIdentity.authUserId,
            providerUnionId: ownerIdentity.unionId,
            providerTenantUserId: ownerIdentity.userId,
            email: ownerIdentity.email
          }
        ],
        notification: {
          channels: [],
          feishuEnabled: false,
          taskAssigned: true,
          requirementChanged: true
        },
        createdAt: "2026-06-20T00:00:00+08:00",
        updatedAt: "2026-06-25T10:00:00+08:00"
      }
    ],
    weeklyInsight: ["周报导出链路需要保持 AI 失败兜底和固定模板。"],
    meta: {
      source: "database",
      currentWorkspace: {
        id: workspaceId,
        name: "默认/工作区:周报",
        description: "周报冒烟工作区",
        status: "active",
        createdAt: "2026-06-20T00:00:00+08:00",
        updatedAt: "2026-06-25T10:00:00+08:00"
      },
      currentMember: {
        id: "member-weekly-owner",
        workspaceId,
        name: ownerIdentity.name,
        email: ownerIdentity.email,
        registrationChannel: "feishu",
        role: "owner",
        status: "active",
        identities: [],
        notification: {
          channels: [],
          feishuEnabled: false,
          taskAssigned: true,
          requirementChanged: true
        },
        createdAt: "2026-06-20T00:00:00+08:00",
        updatedAt: "2026-06-25T10:00:00+08:00"
      },
      user: ownerIdentity
    }
  };
}

function verifyMarkdownAndScope() {
  const data = createSmokeDashboardData();
  const scope = createWeeklyReportScope(data);
  const markdown = createWeeklyReportMarkdown(data, referenceDate);
  const requiredHeadings = Array.from({ length: 11 }, (_, index) => `## ${index + 1}.`);
  const missingHeadings = requiredHeadings.filter((heading) => !markdown.includes(heading));

  // 周报导出第一版默认按当前用户个人口径生成；这里用无关任务做反例，防止回退成全工作区导出。
  assertSmoke(scope.isPersonal, "登录态周报应使用个人口径。");
  assertSmoke(scope.ownerName === "周报用户", "个人周报 ownerName 不正确。");
  assertSmoke(markdown.startsWith("# 周报用户 个人项目周报"), "周报 Markdown 标题不是个人项目周报。");
  assertSmoke(!missingHeadings.length, `周报 Markdown 缺少章节：${missingHeadings.join(", ")}`);
  assertSmoke(markdown.includes("2026-06-22 ~ 2026-06-28"), "周报周期未按参考日期计算自然周。");
  assertSmoke(markdown.includes("周报链路任务"), "周报未包含当前用户相关任务。");
  assertSmoke(markdown.includes("普通"), "周报仍未输出对齐后的“普通”任务优先级。");
  assertSmoke(markdown.includes("周报导出严重 Bug"), "周报未包含当前用户相关 Bug。");
  assertSmoke(!markdown.includes("无关任务"), "个人周报不应包含无关项目任务。");
  assertSmoke(!markdown.includes("```"), "可下载 Markdown 不应包裹 fenced code block。");

  return {
    headingCount: requiredHeadings.length,
    markdownLength: markdown.length,
    scopedTasks: scope.tasks.length,
    scopedBugs: scope.bugs.length
  };
}

function verifyFileNameAndPrompt() {
  const data = createSmokeDashboardData();
  const fileName = createWeeklyReportFileName(data, referenceDate);
  const prompt = createWeeklyReportAiPrompt(data, referenceDate);

  // 文件名会直接用于浏览器下载；必须清洗工作区名称里的路径敏感字符，避免不同系统保存失败。
  assertSmoke(fileName.endsWith(".md"), "周报下载文件名必须是 .md。");
  assertSmoke(!/[\\/:*?"<>|]/.test(fileName.replace(".md", "")), `周报文件名未清洗非法字符：${fileName}`);
  assertSmoke(fileName.includes("默认-工作区-周报"), "周报文件名未保留清洗后的工作区名称。");
  assertSmoke(fileName.includes("周报用户-个人周报"), "周报文件名未体现个人周报口径。");
  assertSmoke(prompt.systemPrompt.includes("不要编造数据中不存在的项目"), "AI 周报 system prompt 缺少事实约束。");
  assertSmoke(prompt.userPrompt.includes("必须完整输出第 1 章到第 11 章"), "AI 周报 user prompt 缺少完整章节约束。");
  assertSmoke(prompt.userPrompt.includes("> 生成时间：2026-06-25"), "AI 周报模板生成时间未使用参考日期。");
  assertSmoke(prompt.userPrompt.includes("\"是否个人周报\": true"), "AI 周报结构化数据未标记个人周报。");

  return {
    fileName,
    systemPromptLength: prompt.systemPrompt.length,
    userPromptLength: prompt.userPrompt.length
  };
}

function verifyRouteContract() {
  const routeText = readText(routePath);

  // 周报接口属于 AI 助手域，但它是概览页直连下载入口；必须保持登录保护、workspace 透传和本地兜底。
  assertSmoke(routeText.includes("export const runtime = \"nodejs\""), "周报接口未固定 nodejs runtime。");
  assertSmoke(routeText.includes("maxDuration = 120"), "周报接口缺少长生成 maxDuration。");
  assertSmoke(routeText.includes("isAuthServiceConfigured() && !session"), "周报接口缺少登录保护。");
  assertSmoke(routeText.includes("getDashboardData(session?.user, body?.workspaceId)"), "周报接口未按 workspaceId 读取当前工作区数据。");
  assertSmoke(routeText.includes("createWeeklyReportMarkdown(data)"), "周报接口缺少本地固定模板兜底。");
  assertSmoke(routeText.includes("!isAiAssistantConfigured()"), "周报接口缺少未配置 AI 的兜底分支。");
  assertSmoke(routeText.includes("AI 周报生成暂时不可用"), "周报接口缺少 AI 失败可读 warning。");

  return {
    protected: true,
    fallback: true,
    workspaceScoped: true
  };
}

function verifyOverviewUiContract() {
  const platformText = readText(platformPath);
  const overviewText = readText(overviewPath);

  // 概览页导出周报不走 ChatBox 抽屉，前端只展示全局 loading 并在接口返回后下载 Markdown。
  assertSmoke(overviewText.includes("导出周报"), "概览页缺少导出周报按钮。");
  assertSmoke(overviewText.includes("onClick={onGenerateReport}"), "概览页导出按钮未绑定生成回调。");
  assertSmoke(platformText.includes("weeklyReportExporting"), "主壳缺少周报导出 loading 状态。");
  assertSmoke(platformText.includes("pm-global-loading"), "周报导出缺少全局 loading 遮罩。");
  assertSmoke(platformText.includes("AI 正在生成周报"), "周报导出 loading 文案缺失。");
  assertSmoke(platformText.includes("/api/assistant/weekly-report"), "前端未调用周报专用接口。");
  assertSmoke(platformText.includes("downloadMarkdownFile(createWeeklyReportFileName(data), payload.reply)"), "前端未用固定文件名下载 Markdown。");
  assertSmoke(platformText.includes("finally {\n      setWeeklyReportExporting(false);"), "周报导出结束后未释放 loading。");
  assertSmoke(!platformText.includes("setAssistantOpen(true)"), "周报导出不应打开旧助手抽屉。");

  return {
    downloadsMarkdown: true,
    globalLoading: true,
    noAssistantDrawer: true
  };
}

const results = [
  runCheck("markdown and personal scope", verifyMarkdownAndScope),
  runCheck("file name and ai prompt", verifyFileNameAndPrompt),
  runCheck("route contract", verifyRouteContract),
  runCheck("overview ui contract", verifyOverviewUiContract)
];
const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  checked: results.length,
  failed: failed.length,
  results
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
