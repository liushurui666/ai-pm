
import type { FeishuUser } from "@/types/dashboard";

// 身份字段来源可能是飞书、邮箱或手动录入，统一小写后再做匹配。
export function normalizeIdentity(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

// “只看我的”需要兼容多种负责人标识，避免只靠姓名导致跨语言账号匹配失败。
export function isMyOwnerRecord(
  record: {
    owner?: string;
    ownerEmail?: string;
    ownerOpenId?: string;
    ownerUnionId?: string;
    ownerUserId?: string;
  },
  currentUser?: FeishuUser
) {
  if (!currentUser) {
    return false;
  }

  const strictMatches = [
    [record.ownerOpenId, currentUser.openId],
    [record.ownerUnionId, currentUser.unionId],
    [record.ownerUserId, currentUser.userId],
    [record.ownerEmail, currentUser.email]
  ];

  if (strictMatches.some(([left, right]) => normalizeIdentity(left) && normalizeIdentity(left) === normalizeIdentity(right))) {
    return true;
  }

  const owner = normalizeIdentity(record.owner);

  return [currentUser.name, currentUser.enName, currentUser.email].some((value) => owner && owner === normalizeIdentity(value));
}
