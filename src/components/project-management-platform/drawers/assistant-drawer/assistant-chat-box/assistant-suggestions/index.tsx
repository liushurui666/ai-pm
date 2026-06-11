"use client";

import { Button } from "antd";
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
  return (
    <div className={className} aria-label="快捷提问">
      {assistantQuickSuggestions.map((suggestion) => (
        <Button
          className="assistant-suggestion"
          key={suggestion}
          disabled={disabled}
          onClick={() => onSelectSuggestion(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
