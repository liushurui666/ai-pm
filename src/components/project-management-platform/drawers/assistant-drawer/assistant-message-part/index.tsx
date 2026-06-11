import { Typography } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";
import { FileCard, Think, ThoughtChain, type ThoughtChainItemType } from "@ant-design/x";
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

type ToolPart = UIMessage["parts"][number] & {
  errorText?: string;
  state?: string;
};

type ReasoningPart = UIMessage["parts"][number] & {
  state?: string;
  text?: string;
};

const toolTitleMap: Record<string, string> = {
  "tool-account": "识别当前账号",
  "tool-conversation": "读取对话上下文",
  "tool-mywork": "读取我的待办",
  "tool-projects": "读取项目状态",
  "tool-risks": "分析风险",
  "tool-versions": "读取版本进展",
  "tool-weekly": "读取周报上下文",
  "tool-workload": "分析成员负载"
};

function getToolTitle(type: string) {
  return toolTitleMap[type] ?? "处理项目数据";
}

function getToolStatus(state?: string): ThoughtChainItemType["status"] {
  if (state === "output-available") {
    return "success";
  }

  if (state === "output-error" || state === "output-denied") {
    return "error";
  }

  if (state === "approval-responded") {
    return "abort";
  }

  return "loading";
}

function getToolDescription(state?: string) {
  if (state === "output-available") {
    return "项目事实已并入回答上下文";
  }

  if (state === "output-error" || state === "output-denied") {
    return "项目数据处理失败";
  }

  if (state === "input-streaming" || state === "input-available") {
    return "正在整理查询条件";
  }

  return "正在读取项目事实";
}

function renderAssistantText(content: string) {
  const weeklyReport = getWeeklyReportDownload(content);

  return (
    <>
      <AssistantMarkdown content={content} />
      {weeklyReport ? (
        <FileCard
          aria-label="下载周报 Markdown"
          className="assistant-weekly-report-card"
          icon="markdown"
          name={weeklyReport.fileName}
          byte={weeklyReport.byteLength}
          description="Markdown 周报"
          onClick={() => downloadTextFile(weeklyReport.fileName, weeklyReport.content)}
        />
      ) : null}
    </>
  );
}

function renderReasoning(part: ReasoningPart) {
  const reasoning = part.text?.trim();
  const streaming = part.state === "streaming";

  if (!reasoning && !streaming) {
    return null;
  }

  return (
    <Think
      className="assistant-think"
      defaultExpanded={Boolean(reasoning) || streaming}
      loading={streaming}
      title="思考过程"
      blink={streaming}
    >
      <Paragraph className="assistant-reasoning-text">
        {reasoning || "正在整理推理过程..."}
      </Paragraph>
    </Think>
  );
}

function renderToolThought(part: ToolPart) {
  const status = getToolStatus(part.state);
  const item: ThoughtChainItemType = {
    key: `${part.type}-${part.state ?? "running"}`,
    icon: <DatabaseOutlined />,
    title: getToolTitle(part.type),
    description: getToolDescription(part.state),
    content: status === "error" ? "这一步没有拿到完整项目事实，助手会基于已获取的信息继续处理。" : undefined,
    status,
    blink: status === "loading"
  };

  return (
    <ThoughtChain
      className="assistant-thought-chain"
      items={[item]}
      line={false}
    />
  );
}

// 单条消息 part 的展示逻辑独立出来，主抽屉只负责会话流转；tool/reasoning part 使用 Ant Design X 呈现业务化过程。
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

  if (part.type === "reasoning") {
    return renderReasoning(part);
  }

  if (part.type.startsWith("tool-")) {
    return renderToolThought(part);
  }

  return null;
}
