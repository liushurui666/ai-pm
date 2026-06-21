const INLINE_CODE_PATTERN = /`([^`]+)`/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(BOLD_PATTERN, "<strong>$1</strong>")
    .replace(INLINE_CODE_PATTERN, "<code>$1</code>");
}

function getAppUrl(view?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3003";
  const url = new URL("/workbench", baseUrl);

  if (view) {
    url.searchParams.set("view", view);
  }

  return url.toString();
}

function renderParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => renderInlineMarkdown(line.trim()))
        .filter(Boolean);

      return lines.length ? `<p>${lines.join("<br />")}</p>` : "";
    })
    .filter(Boolean)
    .join("");
}

// 这里不用额外引 React Email，先把飞书卡片已有 Markdown 文案转成保守 HTML；
// 通知邮件只承载事务消息，简单结构比复杂模板更不容易在各邮箱客户端渲染翻车。
export function renderDashboardNotificationEmail(input: {
  title: string;
  text: string;
  view?: string;
}) {
  const actionUrl = getAppUrl(input.view);
  const title = escapeHtml(input.title);
  const body = renderParagraphs(input.text || "请进入 AI PM 查看详情。");

  return {
    text: `${input.title}\n\n${input.text || "请进入 AI PM 查看详情。"}\n\n打开 AI PM：${actionUrl}`,
    html: [
      "<!doctype html>",
      "<html>",
      "<body style=\"margin:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033;\">",
      "<div style=\"max-width:640px;margin:0 auto;padding:28px 16px;\">",
      "<div style=\"background:#ffffff;border:1px solid #e7ebf3;border-radius:8px;padding:24px;\">",
      `<h1 style=\"margin:0 0 16px;font-size:20px;line-height:1.4;color:#111827;\">${title}</h1>`,
      `<div style=\"font-size:14px;line-height:1.8;color:#374151;\">${body}</div>`,
      `<a href=\"${escapeHtml(actionUrl)}\" style=\"display:inline-block;margin-top:20px;padding:10px 16px;border-radius:8px;background:#2f6bff;color:#ffffff;text-decoration:none;font-weight:600;\">打开 AI PM</a>`,
      "</div>",
      "<p style=\"margin:14px 0 0;font-size:12px;color:#8a94a6;\">这是一封 AI PM 自动通知邮件，请勿直接回复。</p>",
      "</div>",
      "</body>",
      "</html>"
    ].join("")
  };
}
