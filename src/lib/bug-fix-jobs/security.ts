import path from "node:path";

export type DiffSecurityInput = {
  allowedPaths: string[];
  blockedPaths: string[];
  changedFiles: string[];
  maxChangedFiles: number;
  totalDiffLines?: number;
  maxDiffLines?: number;
};

function normalizeRepoPath(filePath: string) {
  return filePath.split(path.sep).join("/").replace(/^\/+/, "");
}

function matchPattern(filePath: string, pattern: string) {
  const normalizedFile = normalizeRepoPath(filePath);
  const normalizedPattern = normalizeRepoPath(pattern);

  if (!normalizedPattern || normalizedPattern === "**") {
    return true;
  }

  if (normalizedPattern.endsWith("/**")) {
    return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  }

  if (normalizedPattern.startsWith("**/*.")) {
    return normalizedFile.endsWith(normalizedPattern.slice(4));
  }

  if (normalizedPattern.includes("*")) {
    const placeholder = "__DOUBLE_STAR__";
    const regexp = new RegExp(
      `^${normalizedPattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, placeholder)
        .replace(/\*/g, "[^/]*")
        .replaceAll(placeholder, ".*")}$`
    );

    return regexp.test(normalizedFile);
  }

  return normalizedFile === normalizedPattern || normalizedFile.startsWith(`${normalizedPattern}/`);
}

function isAllowed(filePath: string, allowedPaths: string[]) {
  return !allowedPaths.length || allowedPaths.some((pattern) => matchPattern(filePath, pattern));
}

function isBlocked(filePath: string, blockedPaths: string[]) {
  return blockedPaths.some((pattern) => matchPattern(filePath, pattern));
}

export function assertDiffIsAllowed(input: DiffSecurityInput) {
  const changedFiles = input.changedFiles.map(normalizeRepoPath).filter(Boolean);

  if (!changedFiles.length) {
    throw new Error("AI Runner 未产生代码变更，任务不能作为成功结果。");
  }

  if (changedFiles.length > input.maxChangedFiles) {
    throw new Error(`AI 改动文件数 ${changedFiles.length} 超过限制 ${input.maxChangedFiles}`);
  }

  if (input.totalDiffLines && input.maxDiffLines && input.totalDiffLines > input.maxDiffLines) {
    throw new Error(`AI 改动行数 ${input.totalDiffLines} 超过限制 ${input.maxDiffLines}`);
  }

  const blockedFile = changedFiles.find((filePath) => isBlocked(filePath, input.blockedPaths));

  if (blockedFile) {
    throw new Error(`AI 改动命中了禁止路径：${blockedFile}`);
  }

  const disallowedFile = changedFiles.find((filePath) => !isAllowed(filePath, input.allowedPaths));

  if (disallowedFile) {
    throw new Error(`AI 改动不在允许范围内：${disallowedFile}`);
  }
}

export function getDefaultBlockedPaths() {
  return [".env", ".env.*", "**/*.pem", "**/*.key", ".github/workflows/**", ".gitlab-ci.yml", "Dockerfile", "deploy/**", "infra/**"];
}
