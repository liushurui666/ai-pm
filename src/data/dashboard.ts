import type { DashboardData, Project, TaskStage } from "@/types/dashboard";

export const dashboardData: DashboardData = {
  metrics: {
    activeProjects: 12,
    deliveryRate: 86,
    overdueTasks: 7,
    aiSavedHours: 34
  },
  projects: [
    {
      id: "p-001",
      name: "智能项目驾驶舱一期",
      owner: "林夏",
      status: "进行中",
      progress: 72,
      health: 88,
      dueDate: "2026-06-18",
      team: 9,
      riskCount: 2,
      summary: "指标体系已完成，AI 风险解释与报表生成进入联调。"
    },
    {
      id: "p-002",
      name: "企业知识库增强",
      owner: "周铭",
      status: "有风险",
      progress: 48,
      health: 62,
      dueDate: "2026-06-05",
      team: 6,
      riskCount: 4,
      summary: "文档解析质量不稳定，检索召回和权限过滤需要重点跟进。"
    },
    {
      id: "p-003",
      name: "AI 周报自动化",
      owner: "许诺",
      status: "进行中",
      progress: 81,
      health: 91,
      dueDate: "2026-05-29",
      team: 5,
      riskCount: 1,
      summary: "日报聚合、会议待办提取已上线灰度，等待管理层模板确认。"
    },
    {
      id: "p-004",
      name: "需求智能拆解",
      owner: "陈澈",
      status: "暂停",
      progress: 35,
      health: 70,
      dueDate: "2026-07-12",
      team: 7,
      riskCount: 2,
      summary: "暂停等待统一任务类型标准，模型提示词方案已准备。"
    }
  ],
  tasks: [
    {
      id: "t-001",
      title: "完成项目健康度计算规则",
      stage: "进行中",
      owner: "韩越",
      project: "智能项目驾驶舱一期",
      priority: "高",
      dueDate: "2026-05-19",
      aiHint: "依赖任务延期会影响报表可信度，建议今日完成规则确认。"
    },
    {
      id: "t-002",
      title: "梳理周报生成模板字段",
      stage: "评审中",
      owner: "许诺",
      project: "AI 周报自动化",
      priority: "中",
      dueDate: "2026-05-20",
      aiHint: "字段稳定后可以复用到月报与复盘报告。"
    },
    {
      id: "t-003",
      title: "补齐知识库权限过滤测试",
      stage: "待处理",
      owner: "阿齐",
      project: "企业知识库增强",
      priority: "高",
      dueDate: "2026-05-17",
      aiHint: "存在越权查询风险，建议提前联合法务和安全复核。"
    },
    {
      id: "t-004",
      title: "设计 AI 助手会话侧栏",
      stage: "已完成",
      owner: "李闻",
      project: "智能项目驾驶舱一期",
      priority: "低",
      dueDate: "2026-05-12",
      aiHint: "组件可以沉淀为全站通用 AI 面板。"
    },
    {
      id: "t-005",
      title: "定义需求拆解输出结构",
      stage: "进行中",
      owner: "陈澈",
      project: "需求智能拆解",
      priority: "中",
      dueDate: "2026-05-24",
      aiHint: "建议拆分为用户故事、研发任务、测试用例三类输出。"
    }
  ],
  risks: [
    {
      id: "r-001",
      title: "知识库解析链路存在稳定性波动",
      level: "高",
      owner: "周铭",
      project: "企业知识库增强",
      mitigation: "先限制复杂格式上传，增加失败重试和人工复核入口。"
    },
    {
      id: "r-002",
      title: "项目健康度评分口径尚未统一",
      level: "中",
      owner: "林夏",
      project: "智能项目驾驶舱一期",
      mitigation: "组织 PMO 评审评分权重，冻结一期指标。"
    },
    {
      id: "r-003",
      title: "AI 生成周报可能遗漏跨项目依赖",
      level: "中",
      owner: "许诺",
      project: "AI 周报自动化",
      mitigation: "在生成前加入依赖图扫描，输出遗漏提醒。"
    }
  ],
  requirements: [
    {
      id: "req-001",
      title: "AI 根据项目状态自动生成本周汇报",
      priority: "P0",
      status: "开发中",
      project: "AI 周报自动化",
      acceptance: "支持按项目、部门、负责人三个维度生成汇报。"
    },
    {
      id: "req-002",
      title: "管理层驾驶舱展示延期预测",
      priority: "P1",
      status: "设计中",
      project: "智能项目驾驶舱一期",
      acceptance: "至少展示延期概率、关键原因和建议动作。"
    },
    {
      id: "req-003",
      title: "会议纪要自动转任务",
      priority: "P1",
      status: "评审中",
      project: "需求智能拆解",
      acceptance: "识别待办、负责人、截止时间，允许人工确认后入库。"
    }
  ],
  documents: [
    {
      id: "d-001",
      title: "智能项目驾驶舱 PRD v1.4",
      type: "PRD",
      updatedAt: "2026-05-14 18:30",
      aiSummary: "新增健康度解释、风险聚合、管理层视图三块内容。"
    },
    {
      id: "d-002",
      title: "AI 周报评审会议纪要",
      type: "会议纪要",
      updatedAt: "2026-05-15 10:20",
      aiSummary: "确认周报模板本周冻结，待补充跨项目依赖字段。"
    },
    {
      id: "d-003",
      title: "知识库权限隔离技术方案",
      type: "技术方案",
      updatedAt: "2026-05-13 16:05",
      aiSummary: "建议采用租户级索引隔离，并增加查询后置权限校验。"
    }
  ],
  weeklyInsight: [
    "AI 判断本周最大风险来自知识库增强项目，主要受解析链路稳定性和权限测试滞后影响。",
    "智能项目驾驶舱一期当前健康度较高，但评分口径未冻结会影响管理层信任。",
    "AI 周报自动化已具备灰度条件，建议先面向 2 个项目试运行并收集采纳率。"
  ]
};

const stageOrder: TaskStage[] = ["待处理", "进行中", "评审中", "已完成"];

export function getTasksByStage(stage: TaskStage) {
  return dashboardData.tasks.filter((task) => task.stage === stage);
}

export function getStageOrder() {
  return stageOrder;
}

function getTopRiskProject(projects: Project[]) {
  return [...projects].sort((left, right) => {
    const leftRiskScore = (100 - left.health) + left.riskCount * 8;
    const rightRiskScore = (100 - right.health) + right.riskCount * 8;

    return rightRiskScore - leftRiskScore;
  })[0];
}

export function createAssistantReply(message: string, data: DashboardData = dashboardData) {
  const normalized = message.toLowerCase();
  const topRiskProject = getTopRiskProject(data.projects);
  const highRiskCount = data.risks.filter((risk) => risk.level === "高").length;
  const overdueCount = data.metrics.overdueTasks;

  if (normalized.includes("风险") || normalized.includes("延期")) {
    if (!topRiskProject) {
      return "当前没有可分析的项目数据。请先确认飞书多维表格是否已同步项目记录。";
    }

    return [
      `当前最需要关注的是「${topRiskProject.name}」。`,
      `原因：该项目健康度为 ${topRiskProject.health}，登记风险 ${topRiskProject.riskCount} 个；全局还有 ${highRiskCount} 个高风险项和 ${overdueCount} 个逾期任务。`,
      `建议：先由 ${topRiskProject.owner} 确认阻塞点，今天关闭最高优先级风险，并把延期影响同步到项目周报。`
    ].join("\n");
  }

  if (normalized.includes("周报") || normalized.includes("汇报")) {
    return [
      `本周项目总体交付达成率为 ${data.metrics.deliveryRate}%，当前活跃项目 ${data.metrics.activeProjects} 个。`,
      `重点进展：${data.projects.slice(0, 2).map((project) => project.name).join("、") || "暂无项目"} 正在推进。`,
      `主要风险：${topRiskProject ? `${topRiskProject.name} 健康度为 ${topRiskProject.health}` : "暂无风险项目"}，建议在周报中单独标记责任人和下个检查点。`
    ].join("\n");
  }

  if (normalized.includes("任务") || normalized.includes("拆解")) {
    const firstRequirement = data.requirements[0];

    return [
      `建议围绕${firstRequirement ? `「${firstRequirement.title}」` : "当前需求"}拆成三组任务：产品确认范围、研发实现接口、测试补充验收用例。`,
      "每个任务都需要保留 AI 生成依据，方便项目经理确认和回溯。",
      `优先级建议：先处理 ${data.tasks.filter((task) => task.priority === "高").length} 个高优先级任务，再推进评审中任务。`
    ].join("\n");
  }

  return [
    "我已经结合当前项目数据做了快速判断。",
    `整体交付率为 ${data.metrics.deliveryRate}%，逾期任务 ${data.metrics.overdueTasks} 个。`,
    "你可以继续问我：哪些任务可能延期、帮我生成周报、或者把某个需求拆成任务。"
  ].join("\n");
}
