import type { Requirement } from "@/types/dashboard";

export const requirementStatusOptions: Requirement["status"][] = [
  "待评审",
  "评审中",
  "待排期",
  "设计中",
  "开发中",
  "待上线",
  "已上线",
  "已关闭",
  "已驳回"
];

export const requirementStatusColor: Record<Requirement["status"], string> = {
  待评审: "default",
  评审中: "gold",
  待排期: "purple",
  设计中: "cyan",
  开发中: "blue",
  待上线: "orange",
  已上线: "green",
  已关闭: "default",
  已驳回: "red"
};

export function getSafeHttpUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function getRequirementCompleteness(requirement: Requirement) {
  const issues: string[] = [];
  let score = 100;

  if (!requirement.versionId || !requirement.versionName) {
    score -= 16;
    issues.push("缺版本");
  }

  if (!getSafeHttpUrl(requirement.uiLink)) {
    score -= 18;
    issues.push("缺 UI");
  }

  if (!getSafeHttpUrl(requirement.documentLink)) {
    score -= 18;
    issues.push("缺文档");
  }

  if (!requirement.acceptance || requirement.acceptance === "暂无验收标准。") {
    score -= 22;
    issues.push("缺验收");
  }

  if (requirement.aiMissingItems?.length) {
    score -= Math.min(24, requirement.aiMissingItems.length * 8);
    issues.push(...requirement.aiMissingItems.slice(0, 3));
  }

  const aiScore = typeof requirement.aiCompletenessScore === "number" ? requirement.aiCompletenessScore : null;
  const finalScore = aiScore === null ? score : Math.round((score + aiScore) / 2);

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    issues: Array.from(new Set(issues))
  };
}
