import type { Prisma } from "@prisma/client";

// MySQL 下 Prisma 不支持 String[] 标量数组，数组型业务字段统一存成 JSON；写入前深拷贝能去掉 undefined，避免驱动序列化差异。
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// 从数据库 JSON 字段恢复字符串数组时做类型收窄，避免历史脏数据或手工改库导致非字符串值进入业务层。
export function fromJsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
