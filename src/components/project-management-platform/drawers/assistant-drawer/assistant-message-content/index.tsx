import "./index.less";
import { Typography } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";
import { Think, ThoughtChain, type ThoughtChainItemType } from "@ant-design/x";
import type { UIMessage } from "ai";
import { AssistantMessagePart } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-message-part";

const { Paragraph } = Typography;

type AssistantMessageContentProps = {
  message: UIMessage;
};

type ToolPart = UIMessage["parts"][number] & {
  state?: string;
};

type ReasoningPart = UIMessage["parts"][number] & {
  state?: string;
  text?: string;
};

const toolTitleMap: Record<string, string> = {
  "tool-account": "识别当前账号",
  "tool-conversation": "读取对话上下文",
  "tool-bulkOperations": "批量执行工作区动作",
  "tool-mywork": "读取我的待办",
  "tool-operations": "执行工作区动作",
  "tool-projects": "读取项目状态",
  "tool-risks": "分析风险",
  "tool-versions": "读取版本进展",
  "tool-weekly": "读取周报上下文",
  "tool-workload": "分析成员负载"
};

function isReasoningPart(part: UIMessage["parts"][number]): part is ReasoningPart {
  return part.type === "reasoning";
}

function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return part.type.startsWith("tool-");
}

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

function collectReasoningText(parts: UIMessage["parts"]) {
  const uniqueReasoning = new Set<string>();

  parts.filter(isReasoningPart).forEach((part) => {
    const reasoning = part.text?.trim();

    if (reasoning) {
      uniqueReasoning.add(reasoning);
    }
  });

  return Array.from(uniqueReasoning).join("\n\n");
}

function collectLatestToolParts(parts: UIMessage["parts"]) {
  const toolPartMap = new Map<string, ToolPart>();

  parts.filter(isToolPart).forEach((part) => {
    // AI SDK 流式 part 可能先给 input-streaming 再给 output-available；
    // 以 tool 类型为 key 只保留最新状态，避免同一个业务步骤在界面里重复出现。
    toolPartMap.set(part.type, part);
  });

  return Array.from(toolPartMap.values());
}

function createThoughtItems(toolParts: ToolPart[]): ThoughtChainItemType[] {
  return toolParts.map((part) => {
    const status = getToolStatus(part.state);

    return {
      blink: status === "loading",
      content: status === "error" ? "这一步没有拿到完整项目事实，助手会基于已获取的信息继续处理。" : undefined,
      description: getToolDescription(part.state),
      icon: <DatabaseOutlined />,
      key: part.type,
      status,
      title: getToolTitle(part.type)
    };
  });
}

function getProcessSummary({
  hasStreamingReasoning,
  reasoningText,
  thoughtItems
}: {
  hasStreamingReasoning: boolean;
  reasoningText: string;
  thoughtItems: ThoughtChainItemType[];
}) {
  const loadingCount = thoughtItems.filter((item) => item.status === "loading").length;
  const successCount = thoughtItems.filter((item) => item.status === "success").length;

  if (loadingCount > 0 || hasStreamingReasoning) {
    return thoughtItems.length > 0 ? `${successCount}/${thoughtItems.length} 项完成` : "生成中";
  }

  if (thoughtItems.length > 0) {
    return `${successCount}/${thoughtItems.length} 项完成`;
  }

  return reasoningText ? "已收起" : "等待内容";
}

function renderProcessPanel(parts: UIMessage["parts"]) {
  const reasoningText = collectReasoningText(parts);
  const reasoningParts = parts.filter(isReasoningPart);
  const hasStreamingReasoning = reasoningParts.some((part) => part.state === "streaming");
  const thoughtItems = createThoughtItems(collectLatestToolParts(parts));

  if (!reasoningText && !hasStreamingReasoning && thoughtItems.length === 0) {
    return null;
  }

  const isLoading = hasStreamingReasoning || thoughtItems.some((item) => item.status === "loading");
  const summary = getProcessSummary({
    hasStreamingReasoning,
    reasoningText,
    thoughtItems
  });

  return (
    <div className="assistant-process">
      <Think
        blink={isLoading}
        className="assistant-process-think"
        classNames={{
          content: "assistant-process-think-content"
        }}
        defaultExpanded={false}
        loading={isLoading}
        title={(
          <span className="assistant-process-title">
            <span>思考过程</span>
            <span className="assistant-process-badge">{summary}</span>
          </span>
        )}
      >
        <div className="assistant-process-content">
          {reasoningText || hasStreamingReasoning ? (
            <Paragraph className="assistant-process-reasoning">
              {reasoningText || "正在整理推理过程..."}
            </Paragraph>
          ) : null}
          {thoughtItems.length > 0 ? (
            <ThoughtChain
              className="assistant-process-chain"
              items={thoughtItems}
              line="solid"
            />
          ) : null}
        </div>
      </Think>
    </div>
  );
}

// 组件边界只做“单条 UIMessage 如何展示”：把底层 reasoning/tool 流式分片合并成一个过程面板，
// 正文仍交给原有 part renderer，确保 Markdown、周报下载卡和用户气泡行为不被复制出第二套实现。
export function AssistantMessageContent({ message }: AssistantMessageContentProps) {
  const isAssistant = message.role === "assistant";

  return (
    <div className="assistant-message-content">
      {isAssistant ? renderProcessPanel(message.parts) : null}
      {message.parts.map((part, index) => {
        if (part.type !== "text") {
          return null;
        }

        return (
          <AssistantMessagePart
            key={`${message.id}-part-${index}`}
            part={part}
            role={message.role}
          />
        );
      })}
    </div>
  );
}
