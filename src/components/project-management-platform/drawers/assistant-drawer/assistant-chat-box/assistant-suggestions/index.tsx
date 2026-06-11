"use client";

import { Prompts, type PromptsItemType } from "@ant-design/x";
import { assistantQuickSuggestions } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-constants";

type AssistantSuggestionsProps = {
  className?: string;
  disabled: boolean;
  onSelectSuggestion: (suggestion: string) => void;
};

// 快捷问题只把用户意图放入输入框，不绕过 AI SDK tools；真正的数据判断仍交给模型与服务端工具链。
export function AssistantSuggestions({
  className = "assistant-suggestions",
  disabled,
  onSelectSuggestion
}: AssistantSuggestionsProps) {
  const promptItems: PromptsItemType[] = assistantQuickSuggestions.map((suggestion) => ({
    disabled,
    key: suggestion,
    label: suggestion
  }));

  return (
    <Prompts
      aria-label="快捷提问"
      className={className}
      items={promptItems}
      wrap
      // 快捷问题仍然只补全输入，不直接触发业务接口；这样能用 Ant Design X 的交互外观，
      // 又不破坏“由 AI SDK tools/skills 决策”的项目约束。
      onItemClick={({ data }) => {
        if (disabled || typeof data.label !== "string") {
          return;
        }

        onSelectSuggestion(data.label);
      }}
    />
  );
}
