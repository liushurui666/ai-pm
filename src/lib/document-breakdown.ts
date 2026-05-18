import dayjs from "dayjs";
import type { DocumentTaskBreakdown } from "@/types/records";

const taskSignals = ["任务", "待办", "推进", "完成", "确认", "设计", "开发", "测试", "上线", "评审", "补齐"];

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
      .slice(0, 5);

  return {
    documentTitle: fileName.replace(/\.[^.]+$/, ""),
    documentType: inferDocumentType(fileName, documentText),
    summary: documentText.slice(0, 120) || "已上传文档，系统已生成初步任务拆解。",
    tasks: lines.map((line, index) => ({
      title: cleanTaskTitle(line) || `处理文档事项 ${index + 1}`,
      priority: inferPriority(line),
      dueDate: inferDueDate(line, index),
      aiHint: `根据文档内容自动拆解：${line.slice(0, 90)}`
    }))
  };
}
