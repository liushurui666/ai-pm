import { Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { FileCard } from "@ant-design/x";
import type { UIMessage } from "ai";
import { AssistantMarkdown } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-markdown";
import {
  downloadTextFile,
  getWeeklyReportDownload
} from "@/components/project-management-platform/drawers/assistant-drawer/assistant-message-utils";

const { Paragraph } = Typography;

type AssistantMessagePartProps = {
  part: UIMessage["parts"][number];
  role: UIMessage["role"];
};

function renderAssistantText(content: string) {
  const weeklyReport = getWeeklyReportDownload(content);

  function downloadWeeklyReport() {
    if (!weeklyReport) {
      return;
    }

    downloadTextFile(weeklyReport.fileName, weeklyReport.content);
  }

  return (
    <>
      <AssistantMarkdown content={content} />
      {weeklyReport ? (
        <FileCard
          aria-label="下载周报 Markdown"
          className="assistant-weekly-report-card assistant-file-card"
          icon="markdown"
          name={weeklyReport.fileName}
          byte={weeklyReport.byteLength}
          description="点击下载 .md 文件"
          mask={(
            <span className="assistant-weekly-report-card-mask">
              <DownloadOutlined />
              下载到本地
            </span>
          )}
          role="button"
          tabIndex={0}
          onClick={downloadWeeklyReport}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              downloadWeeklyReport();
            }
          }}
        />
      ) : null}
    </>
  );
}

// 单条可见文本 part 的展示逻辑独立出来，主抽屉只负责会话流转；
// reasoning/tool 过程已在 assistant-message-content 中聚合为唯一的 Ant Design X Think 面板。
export function AssistantMessagePart({
  part,
  role
}: AssistantMessagePartProps) {
  if (part.type === "text") {
    if (role === "assistant") {
      return renderAssistantText(part.text);
    }

    return (
      <Paragraph className="assistant-message-text">
        {part.text}
      </Paragraph>
    );
  }

  return null;
}
