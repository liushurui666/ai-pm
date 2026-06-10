import type { UIMessage } from "ai";

// AI 助手抽屉的默认欢迎语与快捷问题集中放置，避免主组件同时承担会话编排和文案维护职责。
export const initialAssistantMessages: UIMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "我会持续观察项目进度、任务阻塞和风险变化。你可以问我：本周风险、生成周报、版本范围。"
      }
    ]
  }
];

// 快捷问题只负责填充输入框，不绕过 AI SDK tools；最终分析仍由模型基于工具事实完成。
export const assistantQuickSuggestions = [
  "我现在还有哪些待办？",
  "本周最大的交付风险是什么？",
  "未关闭 Bug 先处理哪些？",
  "生成本周项目周报摘要",
  "总结这轮对话关键结论"
];
