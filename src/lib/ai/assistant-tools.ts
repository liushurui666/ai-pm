import type { ToolSet, UIMessage } from "ai";
import { z } from "zod";
import {
  executeAssistantInternalAction,
  type AssistantInternalActionRuntime
} from "@/lib/ai/assistant-internal-actions";
import {
  createDashScopeEmbedding,
  createDashScopeReranker,
  createKnowledgeRetriever,
  createPrismaTraceEval,
  createQdrantVectorStore
} from "@/lib/ai/knowledge";
import type { BugReport, DashboardData, DashboardMember, Requirement, RequirementVersion, Risk, Task } from "@/types/dashboard";

const today = () => new Date();
const defaultLimit = 8;

function clampLimit(limit?: number) {
  return Math.min(Math.max(Math.trunc(limit ?? defaultLimit), 1), 20);
}

function isBeforeToday(dateText: string) {
  const value = Date.parse(dateText);

  if (Number.isNaN(value)) {
    return false;
  }

  return value < today().setHours(0, 0, 0, 0);
}

function taskWeight(task: Task) {
  const priorityWeight: Record<Task["priority"], number> = { 高: 3, 中: 2, 低: 1 };
  const stageWeight: Record<Task["stage"], number> = { 待处理: 4, 进行中: 3, 评审中: 2, 已完成: 0 };

  return priorityWeight[task.priority] * 10 + stageWeight[task.stage] + (isBeforeToday(task.dueDate) ? 20 : 0);
}

function bugWeight(bug: BugReport) {
  const severityWeight: Record<BugReport["severity"], number> = { 阻塞: 4, 严重: 3, 一般: 2, 轻微: 1 };
  const statusWeight: Record<BugReport["status"], number> = { 新建: 4, 定位中: 3, 修复中: 2, 待验证: 1, 已关闭: 0 };

  return severityWeight[bug.severity] * 10 + statusWeight[bug.status];
}

function riskWeight(risk: Risk) {
  const levelWeight: Record<Risk["level"], number> = { 高: 3, 中: 2, 低: 1 };

  return levelWeight[risk.level];
}

function normalizeText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function sanitizeAssistantFactText(value: unknown) {
  if (value === null || value === undefined) {
    return value;
  }

  const text = typeof value === "string" ? value : String(value);

  // tools 返回的是模型可见的项目事实，不能把后端路由、query 或路径参数原样交给模型复述。
  // 这里仅把技术路径业务化，不改变任务、风险、Bug 等记录本身，让最终优先级判断仍由模型完成。
  return text
    .replace(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_./:{}?=&%-]+/g, "相关业务能力")
    .replace(/https?:\/\/[^\s，。；、)）]+/g, "相关业务链接")
    .replace(/\/[A-Za-z0-9_./:{}?=&%-]+/g, "相关业务能力")
    .replace(/\b[A-Za-z][A-Za-z0-9_-]*\?[A-Za-z0-9_=&%-]+/g, "相关业务查询")
    .replace(/相关业务能力\s*接口/g, "相关业务能力");
}

function sanitizeUnknownError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (!message.trim()) {
    return "知识索引暂不可用，需要稍后复核。";
  }

  if (/qdrant|embedding|api[_-]?key|dashscope|fetch|network|timeout|http|https|\/collections|\/embeddings/i.test(message)) {
    return "知识索引暂不可用，需要稍后复核。";
  }

  return sanitizeAssistantFactText(message);
}

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

function createConversationContext(messages: UIMessage[]) {
  const turns = messages
    .map((message, index) => ({
      序号: index + 1,
      角色: message.role === "user" ? "用户" : "助手",
      内容: getMessageText(message),
      是否初始欢迎语: message.id === "assistant-welcome"
    }))
    .filter((turn) => turn.内容);
  const latestUserTurnIndex = [...turns].reverse().findIndex((turn) => turn.角色 === "用户");
  const latestUserTurn = latestUserTurnIndex >= 0 ? turns[turns.length - 1 - latestUserTurnIndex] : undefined;
  const previousUserTurns = latestUserTurn
    ? turns.filter((turn) => turn.角色 === "用户" && turn.序号 < latestUserTurn.序号)
    : turns.filter((turn) => turn.角色 === "用户");
  const previousAssistantTurns = latestUserTurn
    ? turns.filter((turn) => turn.角色 === "助手" && turn.序号 < latestUserTurn.序号)
    : turns.filter((turn) => turn.角色 === "助手");

  // 对话回看属于聊天事实，不属于项目数据分析；这里只返回结构化历史，最终如何解释仍交给模型完成。
  return {
    当前用户消息: latestUserTurn?.内容 || "暂无",
    用户上一句话: previousUserTurns.at(-1)?.内容 || "暂无上一条用户消息",
    助手上一句话: previousAssistantTurns.at(-1)?.内容 || "暂无上一条助手消息",
    最近用户消息: previousUserTurns.slice(-5).map((turn) => ({
      序号: turn.序号,
      内容: turn.内容
    })),
    最近对话: turns.slice(-8)
  };
}

function matchesOwner(owner: string | undefined, query?: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return true;
  }

  return normalizeText(owner).includes(normalizedQuery);
}

function createCurrentUserMatcher(data: DashboardData) {
  const member = data.meta?.currentMember;
  const user = data.meta?.user;
  const memberId = member?.id;
  const identityValues = new Set(
    [
      member?.name,
      member?.email,
      member?.notification.feishuOpenId,
      member?.notification.feishuUnionId,
      member?.notification.feishuUserId,
      user?.name,
      user?.email,
      user?.authUserId,
      user?.openId,
      user?.unionId,
      user?.userId,
      ...(member?.identities.flatMap((identity) => [
        identity.providerUserId,
        identity.providerUnionId,
        identity.providerTenantUserId,
        identity.email
      ]) ?? [])
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim().toLowerCase())
  );
  const currentUser = {
    成员ID: member?.id,
    姓名: member?.name || user?.name || "未识别当前用户",
    邮箱: member?.email || user?.email,
    角色: member?.role,
    状态: member?.status,
    注册渠道: member?.registrationChannel,
    工作区: data.meta?.currentWorkspace?.name || "默认工作区",
    已绑定成员: Boolean(member),
    匹配依据: member
      ? "优先按 ownerMemberId，其次按姓名、邮箱、Feishu/OpenID/UnionID 等身份字段匹配。"
      : "当前会话没有匹配到平台成员，只能按登录用户姓名、邮箱和开放平台身份字段尝试匹配。"
  };

  // 当前用户匹配同时覆盖新旧数据：新数据应优先写 ownerMemberId，历史数据可能只有姓名或飞书身份。
  function owns(record: {
    owner?: string;
    ownerAvatarUrl?: string;
    ownerEmail?: string;
    ownerMemberId?: string;
    ownerOpenId?: string;
    ownerUnionId?: string;
    ownerUserId?: string;
  }) {
    if (memberId && record.ownerMemberId === memberId) {
      return true;
    }

    return [
      record.owner,
      record.ownerEmail,
      record.ownerOpenId,
      record.ownerUnionId,
      record.ownerUserId
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .some((value) => identityValues.has(value.trim().toLowerCase()));
  }

  return {
    currentUser,
    member,
    owns
  };
}

function matchesVersion(version: RequirementVersion, query?: { versionId?: string; versionName?: string }) {
  const versionId = normalizeText(query?.versionId);
  const versionName = normalizeText(query?.versionName);

  if (versionId && version.id.toLowerCase() === versionId) {
    return true;
  }

  if (versionName && version.name.toLowerCase().includes(versionName)) {
    return true;
  }

  return !versionId && !versionName;
}

function compactTask(task: Task) {
  return {
    id: task.id,
    标题: sanitizeAssistantFactText(task.title),
    阶段: task.stage,
    负责人: task.owner || "未分配",
    项目: sanitizeAssistantFactText(task.project),
    版本: sanitizeAssistantFactText(task.versionName) || "未关联版本",
    优先级: task.priority,
    开始日期: task.startDate,
    截止日期: task.dueDate,
    是否逾期: task.stage !== "已完成" && isBeforeToday(task.dueDate),
    AI提示: sanitizeAssistantFactText(task.aiHint)
  };
}

function compactBug(bug: BugReport) {
  return {
    id: bug.id,
    标题: sanitizeAssistantFactText(bug.title),
    严重程度: bug.severity,
    状态: bug.status,
    项目: sanitizeAssistantFactText(bug.project),
    版本: sanitizeAssistantFactText(bug.versionName) || "未关联版本",
    负责人: bug.owner || "未分配",
    提交人: bug.reporter,
    创建时间: bug.createdAt
  };
}

function compactRisk(risk: Risk) {
  return {
    id: risk.id,
    标题: sanitizeAssistantFactText(risk.title),
    等级: risk.level,
    负责人: risk.owner || "未分配",
    项目: sanitizeAssistantFactText(risk.project),
    应对措施: sanitizeAssistantFactText(risk.mitigation)
  };
}

function compactRequirement(requirement: Requirement) {
  return {
    id: requirement.id,
    标题: sanitizeAssistantFactText(requirement.title),
    优先级: requirement.priority,
    状态: requirement.status,
    项目: sanitizeAssistantFactText(requirement.project),
    版本: sanitizeAssistantFactText(requirement.versionName) || "未关联版本",
    负责人: requirement.owner || "未分配",
    验收标准: sanitizeAssistantFactText(requirement.acceptance),
    AI摘要: sanitizeAssistantFactText(requirement.aiSummary),
    AI风险: sanitizeAssistantFactText(requirement.aiRisks)
  };
}

function compactVersion(version: RequirementVersion) {
  return {
    id: version.id,
    名称: sanitizeAssistantFactText(version.name),
    项目: sanitizeAssistantFactText(version.project),
    状态: version.status,
    开始日期: version.startDate,
    发布日期: version.releaseDate,
    目标: sanitizeAssistantFactText(version.goal),
    产品负责人: version.productOwner || "未分配",
    UI负责人: version.uiOwner || "未分配",
    开发负责人: version.devOwner || "未分配",
    里程碑: version.milestones.map((milestone) => ({
      标题: sanitizeAssistantFactText(milestone.title),
      状态: milestone.status,
      截止日期: milestone.dueDate,
      负责人: milestone.owner || "未分配",
      备注: sanitizeAssistantFactText(milestone.note)
    }))
  };
}

function compactProject(project: DashboardData["projects"][number]) {
  return {
    id: project.id,
    名称: sanitizeAssistantFactText(project.name),
    负责人: project.owner || "未分配",
    状态: project.status,
    进度: project.progress,
    健康度: project.health,
    截止日期: project.dueDate,
    团队人数: project.team,
    风险数: project.riskCount,
    摘要: sanitizeAssistantFactText(project.summary)
  };
}

function createKnowledgeSearchTool(data: DashboardData) {
  return {
    description: [
      "检索当前工作区已自动索引的版本、需求、Bug、任务和飞书文档片段。",
      "当用户询问历史背景、文档内容、跨对象关联、上下文证据、模糊问题、之前记录里怎么说，或当前结构化列表不足以回答时使用。",
      "该能力只返回候选知识片段；最终结论必须结合片段内容和其他业务 tools 自主判断。"
    ].join("\n"),
    inputSchema: z.object({
      query: z.string().min(2).max(300).describe("用于检索知识索引的自然语言问题或关键词"),
      limit: z.number().int().min(1).max(10).default(6).describe("返回知识片段数量上限")
    }),
    execute: async ({ query, limit }: { query: string; limit: number }) => {
      const workspaceId = data.meta?.currentWorkspace?.id;

      if (!workspaceId) {
        return {
          知识索引状态: "当前工作区未识别，无法检索知识索引。",
          片段: []
        };
      }

      try {
        const retriever = createKnowledgeRetriever({
          embedding: createDashScopeEmbedding(),
          vectorStore: createQdrantVectorStore(),
          reranker: createDashScopeReranker(),
          traceEval: createPrismaTraceEval()
        });
        const matches = await retriever.search({
          workspaceId,
          query,
          limit: clampLimit(limit)
        });

        return {
          知识索引状态: matches.length ? "已返回匹配片段" : "当前知识索引没有匹配片段",
          片段: matches.map((match, index) => ({
            序号: index + 1,
            标题: sanitizeAssistantFactText(match.title),
            小节: sanitizeAssistantFactText(match.heading),
            内容: sanitizeAssistantFactText(match.content),
            相关度: typeof match.score === "number" ? Number(match.score.toFixed(4)) : undefined,
            来源类型: sanitizeAssistantFactText(match.metadata?.sourceType ?? match.metadata?.entityType),
            元数据: sanitizeAssistantFactText(JSON.stringify(match.metadata ?? {}))
          }))
        };
      } catch (error) {
        return {
          知识索引状态: sanitizeUnknownError(error),
          片段: []
        };
      }
    }
  };
}

// 这些工具是 ChatBox 读取对话事实和项目事实的唯一入口；工具只返回结构化数据，不直接拼最终回复，确保判断由模型基于 tools 自主完成。
export function createAssistantTools(
  data: DashboardData,
  messages: UIMessage[] = [],
  actionRuntime?: AssistantInternalActionRuntime
): ToolSet {
  const currentUserMatcher = createCurrentUserMatcher(data);

  return {
    conversation: {
      description: "读取当前 ChatBox 的多轮对话历史；当用户问“上一句/上一句话/刚才我说/我刚说/你刚才说/前面说了什么”，或纠正“我说的是我不是你/不是这个/你理解错了”这类对话指代时必须使用。这个入口只返回聊天事实，不读取项目数据。",
      inputSchema: z.object({}),
      execute: () => createConversationContext(messages)
    },
    knowledge: createKnowledgeSearchTool(data),
    account: {
      description: "读取当前登录用户、工作区成员、角色和身份匹配依据；当用户问“我是谁”“当前账号”“我的权限/身份”时必须使用。",
      inputSchema: z.object({}),
      execute: () => ({
        当前用户: currentUserMatcher.currentUser,
        当前工作区: data.meta?.currentWorkspace,
        权限: data.meta?.permissions,
        成员总数: data.members.length,
        可用成员: data.members
          .filter((member: DashboardMember) => member.status === "active")
          .map((member: DashboardMember) => ({
            id: member.id,
            姓名: member.name,
            邮箱: member.email,
            角色: member.role,
            注册渠道: member.registrationChannel
          }))
      })
    },
    mywork: {
      description: "按当前登录人/当前工作区成员读取“我的待办、我负责的任务、分配给我的 Bug、我的风险和我的需求”；仅当用户明确询问个人项目事项、任务、Bug、风险、需求或分配关系时使用。",
      inputSchema: z.object({
        includeDone: z.boolean().default(false).describe("是否包含已完成任务、已关闭 Bug、已上线/已关闭需求"),
        limit: z.number().int().min(1).max(20).default(defaultLimit).describe("每类返回数量上限")
      }),
      execute: ({ includeDone, limit }) => {
        const rowLimit = clampLimit(limit);
        const myTasks = data.tasks.filter((task) => currentUserMatcher.owns(task));
        const myBugs = data.bugs.filter((bug) => currentUserMatcher.owns(bug));
        const myRisks = data.risks.filter((risk) => currentUserMatcher.owns(risk));
        const myRequirements = data.requirements.filter((requirement) => currentUserMatcher.owns(requirement));
        const visibleTasks = includeDone ? myTasks : myTasks.filter((task) => task.stage !== "已完成");
        const visibleBugs = includeDone ? myBugs : myBugs.filter((bug) => bug.status !== "已关闭");
        const visibleRequirements = includeDone
          ? myRequirements
          : myRequirements.filter((requirement) => !["已上线", "已关闭", "已驳回"].includes(requirement.status));

        return {
          当前用户: currentUserMatcher.currentUser,
          统计: {
            我的未完成任务数: myTasks.filter((task) => task.stage !== "已完成").length,
            我的逾期任务数: myTasks.filter((task) => task.stage !== "已完成" && isBeforeToday(task.dueDate)).length,
            我的高优先级任务数: myTasks.filter((task) => task.stage !== "已完成" && task.priority === "高").length,
            我的未关闭Bug数: myBugs.filter((bug) => bug.status !== "已关闭").length,
            我的风险数: myRisks.length,
            我的待处理需求数: myRequirements.filter((requirement) => !["已上线", "已关闭", "已驳回"].includes(requirement.status)).length
          },
          我的任务: visibleTasks
            .sort((left, right) => taskWeight(right) - taskWeight(left))
            .slice(0, rowLimit)
            .map(compactTask),
          我的Bug: visibleBugs
            .sort((left, right) => bugWeight(right) - bugWeight(left))
            .slice(0, rowLimit)
            .map(compactBug),
          我的风险: myRisks
            .sort((left, right) => riskWeight(right) - riskWeight(left))
            .slice(0, rowLimit)
            .map(compactRisk),
          我的需求: visibleRequirements
            .slice(0, rowLimit)
            .map(compactRequirement)
        };
      }
    },
    projects: {
      description: "读取当前工作区项目概览、核心指标、活跃版本和整体风险信号。",
      inputSchema: z.object({
        scope: z.enum(["all", "active", "risky"]).default("active").describe("all=全部项目，active=进行中/有风险项目，risky=风险优先项目"),
        limit: z.number().int().min(1).max(20).default(defaultLimit).describe("返回项目数量上限")
      }),
      execute: ({ scope, limit }) => {
        const rowLimit = clampLimit(limit);
        const projects = [...data.projects]
          .filter((project) => {
            if (scope === "active") {
              return project.status === "进行中" || project.status === "有风险";
            }

            if (scope === "risky") {
              return project.status === "有风险" || project.riskCount > 0 || project.health < 75;
            }

            return true;
          })
          .sort((left, right) => (right.riskCount * 10 + (100 - right.health)) - (left.riskCount * 10 + (100 - left.health)))
          .slice(0, rowLimit)
          .map(compactProject);

        return {
          工作区: data.meta?.currentWorkspace?.name || "默认工作区",
          数据源: data.meta?.source || "unknown",
          指标: data.metrics,
          项目: projects,
          活跃版本数: data.requirementVersions.filter((version) => version.status === "规划中" || version.status === "进行中").length,
          未完成任务数: data.tasks.filter((task) => task.stage !== "已完成").length,
          未关闭Bug数: data.bugs.filter((bug) => bug.status !== "已关闭").length,
          高风险数: data.risks.filter((risk) => risk.level === "高").length,
          周洞察: data.weeklyInsight.slice(0, 6).map((item) => sanitizeAssistantFactText(item))
        };
      }
    },
    risks: {
      description: "读取风险、逾期任务、高优先级任务和未关闭 Bug，用于分析交付阻塞和本周风险。",
      inputSchema: z.object({
        riskLevel: z.enum(["全部", "高", "中", "低"]).default("全部").describe("筛选风险等级"),
        owner: z.string().optional().describe("按负责人姓名模糊筛选，可不填"),
        limit: z.number().int().min(1).max(20).default(defaultLimit).describe("每类返回数量上限")
      }),
      execute: ({ riskLevel, owner, limit }) => {
        const rowLimit = clampLimit(limit);
        const risks = data.risks
          .filter((risk) => riskLevel === "全部" || risk.level === riskLevel)
          .filter((risk) => matchesOwner(risk.owner, owner))
          .sort((left, right) => riskWeight(right) - riskWeight(left))
          .slice(0, rowLimit)
          .map(compactRisk);
        const openTasks = data.tasks.filter((task) => task.stage !== "已完成").filter((task) => matchesOwner(task.owner, owner));
        const openBugs = data.bugs.filter((bug) => bug.status !== "已关闭").filter((bug) => matchesOwner(bug.owner, owner));

        return {
          风险: risks,
          逾期任务: openTasks
            .filter((task) => isBeforeToday(task.dueDate))
            .sort((left, right) => taskWeight(right) - taskWeight(left))
            .slice(0, rowLimit)
            .map(compactTask),
          高优先级任务: openTasks
            .filter((task) => task.priority === "高")
            .sort((left, right) => taskWeight(right) - taskWeight(left))
            .slice(0, rowLimit)
            .map(compactTask),
          未关闭Bug: openBugs
            .sort((left, right) => bugWeight(right) - bugWeight(left))
            .slice(0, rowLimit)
            .map(compactBug)
        };
      }
    },
    versions: {
      description: "读取指定版本或活跃版本范围内的任务、Bug、需求和里程碑。",
      inputSchema: z.object({
        versionId: z.string().optional().describe("版本 id，已知时优先使用"),
        versionName: z.string().optional().describe("版本名称关键词"),
        limit: z.number().int().min(1).max(20).default(defaultLimit).describe("每类返回数量上限")
      }),
      execute: ({ versionId, versionName, limit }) => {
        const rowLimit = clampLimit(limit);
        const matchedVersions = data.requirementVersions
          .filter((version) => matchesVersion(version, { versionId, versionName }))
          .sort((left, right) => Date.parse(right.releaseDate) - Date.parse(left.releaseDate))
          .slice(0, rowLimit);
        const matchedVersionIds = new Set(matchedVersions.map((version) => version.id));
        const matchedVersionNames = new Set(matchedVersions.map((version) => version.name));
        const shouldIncludeByVersion = (record: { versionId?: string; versionName?: string }) => {
          if (!matchedVersions.length) {
            return false;
          }

          return Boolean(
            (record.versionId && matchedVersionIds.has(record.versionId)) ||
              (record.versionName && matchedVersionNames.has(record.versionName))
          );
        };

        return {
          匹配版本: matchedVersions.map(compactVersion),
          任务: data.tasks
            .filter(shouldIncludeByVersion)
            .sort((left, right) => taskWeight(right) - taskWeight(left))
            .slice(0, rowLimit)
            .map(compactTask),
          Bug: data.bugs
            .filter(shouldIncludeByVersion)
            .sort((left, right) => bugWeight(right) - bugWeight(left))
            .slice(0, rowLimit)
            .map(compactBug),
          需求: data.requirements
            .filter(shouldIncludeByVersion)
            .slice(0, rowLimit)
            .map(compactRequirement)
        };
      }
    },
    workload: {
      description: "读取成员当前任务、Bug 和风险负载，用于判断负责人压力与协作瓶颈。",
      inputSchema: z.object({
        owner: z.string().optional().describe("负责人姓名关键词，可不填表示统计全部成员"),
        limit: z.number().int().min(1).max(20).default(defaultLimit).describe("返回成员数量上限")
      }),
      execute: ({ owner, limit }) => {
        const rowLimit = clampLimit(limit);
        const owners = new Map<string, {
          owner: string;
          openTasks: Task[];
          overdueTasks: Task[];
          highPriorityTasks: Task[];
          openBugs: BugReport[];
          risks: Risk[];
        }>();

        const ensureOwner = (name: string) => {
          const key = name || "未分配";
          const existing = owners.get(key);

          if (existing) {
            return existing;
          }

          const next = {
            owner: key,
            openTasks: [],
            overdueTasks: [],
            highPriorityTasks: [],
            openBugs: [],
            risks: []
          };

          owners.set(key, next);

          return next;
        };

        data.tasks.filter((task) => task.stage !== "已完成").forEach((task) => {
          const bucket = ensureOwner(task.owner || "未分配");

          bucket.openTasks.push(task);

          if (isBeforeToday(task.dueDate)) {
            bucket.overdueTasks.push(task);
          }

          if (task.priority === "高") {
            bucket.highPriorityTasks.push(task);
          }
        });
        data.bugs.filter((bug) => bug.status !== "已关闭").forEach((bug) => ensureOwner(bug.owner || "未分配").openBugs.push(bug));
        data.risks.forEach((risk) => ensureOwner(risk.owner || "未分配").risks.push(risk));

        return Array.from(owners.values())
          .filter((item) => matchesOwner(item.owner, owner))
          .map((item) => ({
            负责人: item.owner,
            未完成任务数: item.openTasks.length,
            逾期任务数: item.overdueTasks.length,
            高优先级任务数: item.highPriorityTasks.length,
            未关闭Bug数: item.openBugs.length,
            风险数: item.risks.length,
            代表任务: [...item.openTasks].sort((left, right) => taskWeight(right) - taskWeight(left)).slice(0, 3).map(compactTask),
            代表Bug: [...item.openBugs].sort((left, right) => bugWeight(right) - bugWeight(left)).slice(0, 3).map(compactBug)
          }))
          .sort((left, right) => (
            right.逾期任务数 * 20 + right.高优先级任务数 * 10 + right.未关闭Bug数 * 6 + right.风险数 * 4 + right.未完成任务数
          ) - (
            left.逾期任务数 * 20 + left.高优先级任务数 * 10 + left.未关闭Bug数 * 6 + left.风险数 * 4 + left.未完成任务数
          ))
          .slice(0, rowLimit);
      }
    },
    weekly: {
      description: "读取生成周报或阶段汇报所需的结构化上下文，不直接生成周报正文。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).default(defaultLimit).describe("每类数据返回数量上限")
      }),
      execute: ({ limit }) => {
        const rowLimit = clampLimit(limit);
        const openTasks = data.tasks.filter((task) => task.stage !== "已完成");
        const openBugs = data.bugs.filter((bug) => bug.status !== "已关闭");
        const activeVersions = data.requirementVersions.filter((version) => version.status === "规划中" || version.status === "进行中");

        return {
          工作区: data.meta?.currentWorkspace?.name || "默认工作区",
          核心指标: data.metrics,
          项目: [...data.projects]
            .sort((left, right) => (right.riskCount * 10 + (100 - right.health)) - (left.riskCount * 10 + (100 - left.health)))
            .slice(0, rowLimit)
            .map(compactProject),
          活跃版本: activeVersions.slice(0, rowLimit).map(compactVersion),
          未完成任务: [...openTasks].sort((left, right) => taskWeight(right) - taskWeight(left)).slice(0, rowLimit).map(compactTask),
          未关闭Bug: [...openBugs].sort((left, right) => bugWeight(right) - bugWeight(left)).slice(0, rowLimit).map(compactBug),
          风险: [...data.risks].sort((left, right) => riskWeight(right) - riskWeight(left)).slice(0, rowLimit).map(compactRisk),
          需求: data.requirements.slice(0, rowLimit).map(compactRequirement),
          周洞察: data.weeklyInsight.map((item) => sanitizeAssistantFactText(item))
        };
      }
    },
    ...(actionRuntime
      ? {
          operations: {
            description: [
              "执行 AI PM 平台内部业务动作；当用户明确要求你帮他创建、更新、关闭、删除、保存、发起、配置或修改时使用。",
              "只能调用当前站点同源 /api/* JSON 业务接口，不要调用认证或助手自身接口。",
              "常见动作：更新记录使用 PATCH /api/records，body 为 { type, id, workspaceId, values }；关闭 Bug 时 type=bug，values.status=已关闭。",
              "创建记录使用 POST /api/records，body 必须为 { type, workspaceId, values }，不要把字段直接平铺到 body 顶层。",
              "创建版本模板：{ type:'requirementVersion', values:{ name, project:'跨项目', status:'规划中', startDate:'YYYY-MM-DD', releaseDate:'YYYY-MM-DD', goal, productOwner, productOwnerMemberId } }。",
              "创建需求模板：{ type:'requirement', values:{ title, priority:'P1', status:'待评审', project, versionId, versionName, owner, ownerMemberId, acceptance } }。",
              "删除记录使用 DELETE /api/records；成员管理使用 /api/members；创建工作区使用 /api/workspaces；创建 AI 修复任务使用 /api/bug-fix-jobs。",
              "调用前必须先用读取类能力确认目标记录和权限；调用后只基于业务结果回答，不要暴露接口路径、请求参数或技术过程。"
            ].join("\n"),
            inputSchema: z.object({
              method: z.enum(["GET", "POST", "PATCH", "DELETE"]).describe("内部业务动作的 HTTP 方法"),
              path: z.string().min(1).describe("内部业务接口相对路径，必须以 /api/ 开头，可携带 query"),
              body: z.record(z.string(), z.unknown()).optional().describe("JSON 请求体；GET 不需要填写")
            }),
            // 动作 tool 只负责把模型决策转换为现有内部 API 调用；权限、数据校验和副作用仍由对应业务 API 承担。
            execute: (input) => executeAssistantInternalAction(input, actionRuntime)
          }
        }
      : {})
  };
}
