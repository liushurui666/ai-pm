import dayjs from "dayjs";
import type { DocumentTaskBreakdown } from "@/types/records";

const taskSignals = ["任务", "待办", "推进", "完成", "确认", "设计", "开发", "测试", "上线", "评审", "补齐", "接口", "页面", "权限"];
const FALLBACK_TASK_LIMIT = 24;

function inferDocumentType(fileName: string, text: string): DocumentTaskBreakdown["documentType"] {
  const content = `${fileName}\n${text}`;

  if (content.includes("会议") || content.includes("纪要")) {
    return "会议纪要";
  }

  if (content.includes("技术") || content.includes("架构") || content.includes("接口")) {
    return "技术方案";
  }

  if (content.includes("复盘")) {
    return "复盘";
  }

  return "PRD";
}

function inferPriority(line: string) {
  if (/P0|高优|紧急|阻塞|风险|今天|今日|必须/.test(line)) {
    return "高" as const;
  }

  if (/低优|可选|后续|优化/.test(line)) {
    return "低" as const;
  }

  return "中" as const;
}

function inferDueDate(line: string, index: number) {
  const dateMatch = line.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/);

  if (dateMatch) {
    return dayjs(dateMatch[0].replace(/[年月/.]/g, "-").replace(/日$/, "")).format("YYYY-MM-DD");
  }

  const days = inferPriority(line) === "高" ? 2 : 5 + index;

  return dayjs().add(days, "day").format("YYYY-MM-DD");
}

function cleanTaskTitle(line: string) {
  return line
    .replace(/^[-*•\d.、\s]+/, "")
    .replace(/^(任务|待办|TODO|Action|行动项)[:：\s-]*/i, "")
    .trim()
    .slice(0, 60);
}

function createRoleTasks(line: string, index: number) {
  const baseTitle = cleanTaskTitle(line) || `处理文档事项 ${index + 1}`;
  const priority = inferPriority(line);

  return [
    {
      title: `【前端】实现${baseTitle}的页面交互与状态反馈`,
      priority,
      dueDate: inferDueDate(line, index),
      aiHint: `从前端视角拆解：补齐页面/组件、表单校验、权限可见性、异常空状态和响应式体验。原文依据：${line.slice(0, 80)}`
    },
    {
      title: `【后端】支撑${baseTitle}的数据接口与业务规则`,
      priority,
      dueDate: inferDueDate(line, index + 1),
      aiHint: `从后端视角拆解：确认接口、数据模型、鉴权权限、持久化、通知、幂等、日志和异常处理。原文依据：${line.slice(0, 80)}`
    },
    {
      title: `【测试】验证${baseTitle}的主流程与边界场景`,
      priority,
      dueDate: inferDueDate(line, index + 2),
      aiHint: `从测试视角拆解：覆盖测试用例、接口联调、端到端流程、权限边界、异常场景和回归验收。原文依据：${line.slice(0, 80)}`
    }
  ];
}

export function createFallbackDocumentTaskBreakdown({
  documentText,
  fileName
}: {
  documentText: string;
  fileName: string;
}): DocumentTaskBreakdown {
  const meaningfulLines = documentText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && taskSignals.some((signal) => line.includes(signal)))
    .slice(0, 8);
  const lines = meaningfulLines.length
    ? meaningfulLines
    : documentText
      .split(/[。；;\n]+/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 8)
      .slice(0, 6);
  const sourceLines = lines.length ? lines : [`确认 ${fileName.replace(/\.[^.]+$/, "")} 的需求范围与验收标准`];

  return {
    documentTitle: fileName.replace(/\.[^.]+$/, ""),
    documentType: inferDocumentType(fileName, documentText),
    summary: documentText.slice(0, 120) || "已上传文档，系统已生成初步任务拆解。",
    tasks: sourceLines.flatMap((line, index) => createRoleTasks(line, index * 3)).slice(0, FALLBACK_TASK_LIMIT)
  };
}
