import type { ProjectDeliveryLabel, RequirementVersion } from "@/types/dashboard";

// one2all 的交付节点标签属于单个 plan unit/version；稳定 ID 让节点在标签改名后仍能保持关联。
export const defaultProjectDeliveryLabels: readonly ProjectDeliveryLabel[] = [
  { id: "delivery-product-review", name: "产品评审", active: true },
  { id: "delivery-design-freeze", name: "设计稿定稿", active: true },
  { id: "delivery-development-complete", name: "研发完成", active: true },
  { id: "delivery-business-acceptance", name: "验收", active: true }
];

export function cloneDefaultProjectDeliveryLabels(): ProjectDeliveryLabel[] {
  return defaultProjectDeliveryLabels.map((label) => ({ ...label }));
}

function stableDeliveryLabelHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

// 新建版本和新增标签都使用版本级 ID：同一项目目录拷贝到两个版本后不会共享外键。
export function createVersionDeliveryLabelId(versionId: string, sourceId: string, index: number) {
  return `delivery-version-${stableDeliveryLabelHash(versionId)}-${stableDeliveryLabelHash(sourceId)}-${index + 1}`;
}

function normalizedLabelId(value: unknown, name: string, index: number) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 120);
  }

  // 无 ID 的历史 JSON 使用名称与序号生成可重复的兼容 ID，下次保存后即成为稳定值。
  const asciiName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `delivery-label-${asciiName || "custom"}-${index + 1}`;
}

// 读取和写入共用同一归一化规则：去空名、去重名/ID，同时限制目录大小避免异常请求撑大项目行。
export function normalizeProjectDeliveryLabelCatalog(
  value: unknown,
  options: { fallbackToDefaults?: boolean } = {}
): ProjectDeliveryLabel[] {
  const labels: ProjectDeliveryLabel[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  if (Array.isArray(value)) {
    for (const [index, item] of value.slice(0, 30).entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim().slice(0, 40) : "";

      if (!name) {
        continue;
      }

      const id = normalizedLabelId(record.id, name, index);
      const normalizedName = name.toLocaleLowerCase("zh-CN");

      if (seenIds.has(id) || seenNames.has(normalizedName)) {
        continue;
      }

      seenIds.add(id);
      seenNames.add(normalizedName);
      const deleted = record.deleted === true;

      labels.push({ id, name, active: !deleted && record.active !== false, deleted });
    }
  }

  // 显式数组（包括 []）代表用户保存的真实目录；只有字段缺失/旧格式值才回填系统默认。
  // 这样用户删除全部标签后不会在下一次读取或无关项目更新时“复活”默认目录。
  if (Array.isArray(value) || options.fallbackToDefaults === false) {
    return labels;
  }

  return cloneDefaultProjectDeliveryLabels();
}

export function scopeDeliveryLabelCatalogToVersion(
  versionId: string,
  value: unknown,
  options: {
    fallbackValue?: unknown;
    preserveIds?: ReadonlySet<string>;
  } = {}
) {
  const sourceValue = Array.isArray(value)
    ? value
    : Array.isArray(options.fallbackValue)
      ? options.fallbackValue
      : undefined;
  const catalog = normalizeProjectDeliveryLabelCatalog(sourceValue);
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();
  const generatedVersionPrefix = `delivery-version-${stableDeliveryLabelHash(versionId)}-`;
  const scopedCatalog = catalog.map((label, index) => {
    const canPreserveId = options.preserveIds?.has(label.id) === true
      || label.id.startsWith(generatedVersionPrefix);
    let id = canPreserveId
      ? label.id
      : createVersionDeliveryLabelId(versionId, label.id, index);
    let collisionIndex = index;

    while (usedIds.has(id)) {
      collisionIndex += 1;
      id = createVersionDeliveryLabelId(versionId, `${label.id}-${collisionIndex}`, collisionIndex);
    }

    usedIds.add(id);
    idMap.set(label.id, id);

    return { ...label, id };
  });

  return { catalog: scopedCatalog, idMap };
}

// 标签重键时同步节点关联；启用标签改名后同步 type，已停用/删除标签保留历史快照。
export function remapVersionDeliveryMilestones(
  value: unknown,
  catalog: readonly ProjectDeliveryLabel[],
  idMap: ReadonlyMap<string, string>
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const labelsById = new Map(catalog.map((label) => [label.id, label]));

  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }

    const milestone = item as Record<string, unknown>;
    const sourceLabelId = typeof milestone.labelId === "string" ? milestone.labelId.trim() : "";

    if (!sourceLabelId) {
      return milestone;
    }

    const labelId = idMap.get(sourceLabelId) ?? sourceLabelId;
    const label = labelsById.get(labelId);

    return {
      ...milestone,
      labelId,
      ...(label?.active && !label.deleted ? { type: label.name } : {})
    };
  });
}

export function getVersionDeliveryLabelCatalog(
  version: Pick<RequirementVersion, "deliveryLabelCatalog">,
  legacyProjectCatalog?: unknown
) {
  // 显式 [] 是版本自己保存的空目录，不能回退；仅字段缺失的 legacy 版本借用项目目录读取。
  return normalizeProjectDeliveryLabelCatalog(
    Array.isArray(version.deliveryLabelCatalog)
      ? version.deliveryLabelCatalog
      : legacyProjectCatalog
  );
}

export function findDuplicateDeliveryMilestoneLabelId(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seenLabelIds = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const rawLabelId = (item as Record<string, unknown>).labelId;
    const labelId = typeof rawLabelId === "string" ? rawLabelId.trim() : "";

    if (!labelId) {
      continue;
    }

    if (seenLabelIds.has(labelId)) {
      return labelId;
    }

    seenLabelIds.add(labelId);
  }

  return undefined;
}
