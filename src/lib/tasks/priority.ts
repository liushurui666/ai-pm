import type { TaskPriority } from "@/types/dashboard";

// 任务优先级使用 one2all 主流程的四档语义；数组同时供表单和筛选复用，避免各入口再次出现“中/普通”分叉。
export const taskPriorityOptions = ["紧急", "高", "普通", "低"] as const satisfies readonly TaskPriority[];

// 历史数据和旧队列 job 可能仍持有“中”；读取和每条写入边界都经过此函数，保证不需数据库迁移也能渐进收敛为“普通”。
export function normalizeTaskPriority(value: unknown): TaskPriority {
  const priority = typeof value === "string" ? value.trim() : "";

  if (priority === "中" || priority.toLowerCase() === "normal") {
    return "普通";
  }

  if (taskPriorityOptions.includes(priority as TaskPriority)) {
    return priority as TaskPriority;
  }

  if (priority.includes("紧急") || priority.toLowerCase().includes("urgent")) {
    return "紧急";
  }

  if (priority.includes("高") || priority.includes("P0") || priority.toLowerCase() === "high") {
    return "高";
  }

  if (priority.includes("低") || priority.includes("P2") || priority.toLowerCase() === "low") {
    return "低";
  }

  return "普通";
}
