const requirementProductUpdateFields = new Set([
  "title",
  "priority",
  "description",
  "owner",
  "ownerMemberId",
  "ownerOpenId",
  "ownerUnionId",
  "ownerUserId",
  "ownerEmail",
  "ownerAvatarUrl",
  "documentLink",
  "acceptance",
  "aiSummary",
  "aiRisks",
  "aiMissingItems",
  "aiFrontendNotes",
  "aiBackendNotes",
  "aiTestingNotes",
  "aiCompletenessScore"
]);
const requirementDesignUpdateFields = new Set([
  "uiLink",
  "designOwner",
  "designOwnerMemberId",
  "designOwnerOpenId",
  "designOwnerUnionId",
  "designOwnerUserId",
  "designOwnerEmail",
  "designOwnerAvatarUrl"
]);
const ignoredRequirementUpdateFields = new Set(["id", "workspaceId"]);
const stringArrayFields = new Set([
  "developerMemberIds",
  "aiRisks",
  "aiMissingItems",
  "aiFrontendNotes",
  "aiBackendNotes",
  "aiTestingNotes"
]);

export function isProjectArchiveStatusTransition(input: {
  currentStatus?: unknown;
  nextStatus?: unknown;
}) {
  const normalizeStatus = (value: unknown) => typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
  const currentStatus = normalizeStatus(input.currentStatus);
  const nextStatus = normalizeStatus(input.nextStatus);

  return Boolean(
    nextStatus
    && nextStatus !== currentStatus
    && (currentStatus === "已归档" || nextStatus === "已归档")
  );
}

function normalizedStringArray(value: unknown, sort = false) {
  let candidate = value;

  if (typeof value === "string" && value.trim()) {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch {
      candidate = value.split(/[,\n，、]/);
    }
  }

  const items = Array.isArray(candidate)
    ? candidate.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];

  return sort ? [...new Set(items)].sort() : items;
}

function normalizeRequirementMutationValue(field: string, value: unknown) {
  if (stringArrayFields.has(field)) {
    return normalizedStringArray(value, field === "developerMemberIds");
  }

  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  return value ?? undefined;
}

function sameMutationValue(field: string, previous: unknown, next: unknown) {
  const normalizedPrevious = normalizeRequirementMutationValue(field, previous);
  const normalizedNext = normalizeRequirementMutationValue(field, next);

  if (typeof normalizedPrevious === "object" || typeof normalizedNext === "object") {
    return JSON.stringify(normalizedPrevious) === JSON.stringify(normalizedNext);
  }

  return normalizedPrevious === normalizedNext;
}

export function getChangedRequirementFields(
  record: Record<string, unknown> | null | undefined,
  values: Record<string, unknown> | null | undefined
) {
  const previous = record ?? {};
  const next = values ?? {};

  return Object.keys(next).filter((field) => (
    !ignoredRequirementUpdateFields.has(field)
    && !sameMutationValue(field, previous[field], next[field])
  ));
}

export function canUpdateRequirementFields(input: {
  changedFields: string[];
  designOwner: boolean;
  productOwner: boolean;
}) {
  return (input.productOwner || input.designOwner) && input.changedFields.every((field) => (
    (input.productOwner && requirementProductUpdateFields.has(field))
    || (input.designOwner && requirementDesignUpdateFields.has(field))
  ));
}
