import type { UIMessage } from "ai";

const messageTimeCache = new Map<string, string>();
const weeklyReportTitlePattern = /^#\s+(.{0,80}?(?:周报|weekly report).*)$/im;
const weeklyReportSectionPattern = /^##\s+(?:\d+\.|[一二三四五六七八九十]+[、.])\s*/m;
const fileNameUnsafePattern = /[\\/:*?"<>|\u0000-\u001f]/g;

function formatMessageTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

// 消息时间在本地会话内按 messageId 缓存，避免流式过程中每次重渲染都刷新显示时间。
export function getCachedMessageTime(messageId: string) {
  const cachedTime = messageTimeCache.get(messageId);

  if (cachedTime) {
    return cachedTime;
  }

  const nextTime = formatMessageTime();

  messageTimeCache.set(messageId, nextTime);
  return nextTime;
}

// 导出、复制等操作只能处理用户可见文本；tool 过程统一转为业务化占位，避免把内部执行细节暴露给用户。
export function getMessagePlainText(message: UIMessage) {
  return message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }

      if (part.type === "reasoning") {
        return part.text ? `思考过程：\n${part.text}` : "";
      }

      if (part.type.startsWith("tool-")) {
        return "[正在处理项目数据]";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function sanitizeFileName(input: string) {
  return input
    .replace(fileNameUnsafePattern, "")
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "") || "AI项目周报";
}

function formatDownloadDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

export function getWeeklyReportDownload(content: string) {
  const markdown = content.trim();
  const titleMatch = markdown.match(weeklyReportTitlePattern);
  const hasWeeklyReportTitle = Boolean(titleMatch);
  const hasReportStructure = weeklyReportSectionPattern.test(markdown) || markdown.includes("| 指标 |") || markdown.includes("| 项目 |");

  if (!hasWeeklyReportTitle || !hasReportStructure) {
    return null;
  }

  const title = sanitizeFileName(titleMatch?.[1] ?? "AI项目周报");
  const byteLength = new TextEncoder().encode(markdown).byteLength;

  return {
    byteLength,
    content: markdown,
    fileName: `${title}-${formatDownloadDate()}.md`
  };
}

// 对话导出使用 Markdown，保留用户和助手文本，便于项目经理将结论贴到周报或复盘文档。
export function buildConversationMarkdown(messages: UIMessage[]) {
  const lines = [
    "# AI 项目助手对话记录",
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    ""
  ];

  messages.forEach((message) => {
    const text = getMessagePlainText(message);

    if (!text) {
      return;
    }

    lines.push(`## ${message.role === "user" ? "你" : "AI 项目助手"}`, "", text, "");
  });

  return lines.join("\n");
}

// 浏览器端下载只生成本地 Blob，不经过后端，避免把聊天内容写入额外服务。
export function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], {
    type: "text/markdown;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
