import { Tag, Typography } from "antd";
import type { UIMessage } from "ai";
import { AssistantMarkdown } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-markdown";

const { Paragraph } = Typography;

type AssistantMessagePartProps = {
  part: UIMessage["parts"][number];
  role: UIMessage["role"];
};

// 单条消息 part 的展示逻辑独立出来，主抽屉只负责会话流转；tool part 仅显示业务化加载态，避免暴露内部工具名。
export function AssistantMessagePart({
  part,
  role
}: AssistantMessagePartProps) {
  if (part.type === "text") {
    if (role === "assistant") {
      return <AssistantMarkdown content={part.text} />;
    }

    return (
      <Paragraph className="assistant-message-text">
        {part.text}
      </Paragraph>
    );
  }

  if (part.type.startsWith("tool-")) {
    return (
      <Tag className="assistant-tool-tag" color="processing">
        正在处理项目数据
      </Tag>
    );
  }

  return null;
}
