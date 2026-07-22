import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyTaskRequirementDeepLinkToUrl,
  readTaskRequirementDeepLink,
  resolveTaskRequirementDeepLink
} from "../src/components/project-management-platform/task-requirement-deep-link";

const projects = [
  { id: "project-a", name: "A 项目" },
  { id: "project-b", name: "B 项目" }
];
const versions = [
  { id: "version-a", project: "A 项目", projectId: "project-a" },
  { id: "version-b", project: "B 项目", projectId: "project-b" }
];
const requirements = [
  { id: "requirement-a", project: "A 项目", projectId: "project-a", versionId: "version-a" },
  { id: "requirement-unplanned", project: "A 项目", projectId: "project-a" }
];

// 纯 helper 必须先从当前可见数据补齐标准关系，不依赖 URL 恰好传入全部伴随参数。
assert.deepEqual(
  resolveTaskRequirementDeepLink({
    requested: { requirementId: "requirement-a" },
    projects,
    requirements,
    versions
  }),
  { requirementId: "requirement-a", projectId: "project-a", versionId: "version-a" }
);

assert.deepEqual(
  readTaskRequirementDeepLink("?requirementId=%20requirement-a%20&projectId=project-a&versionId=version-a"),
  { requirementId: "requirement-a", projectId: "project-a", versionId: "version-a" }
);

for (const requested of [
  { requirementId: "missing" },
  { requirementId: "requirement-a", projectId: "project-b" },
  { requirementId: "requirement-a", projectId: "project-a", versionId: "version-b" }
]) {
  assert.deepEqual(
    resolveTaskRequirementDeepLink({ requested, projects, requirements, versions }),
    {},
    `失效或冲突深链未被清理：${JSON.stringify(requested)}`
  );
}

assert.deepEqual(
  resolveTaskRequirementDeepLink({
    requested: { requirementId: "requirement-a" },
    projects,
    requirements,
    versions: [{ id: "version-a", project: "B 项目", projectId: "project-b" }]
  }),
  {},
  "需求版本归属其他项目时仍被回放。"
);

assert.deepEqual(
  resolveTaskRequirementDeepLink({
    requested: { requirementId: "backlog-requirement" },
    projects,
    requirements: [{
      id: "backlog-requirement",
      project: "A 项目",
      projectId: "project-a",
      versionId: "rv-backlog"
    }],
    versions: [{ id: "rv-backlog", project: "跨项目" }]
  }),
  { requirementId: "backlog-requirement", projectId: "project-a", versionId: "rv-backlog" },
  "工作区级未规划需求池被误判为跨项目冲突。"
);

assert.deepEqual(
  resolveTaskRequirementDeepLink({
    requested: { requirementId: "legacy-requirement" },
    projects,
    requirements: [{ id: "legacy-requirement", project: "A 项目" }],
    versions
  }),
  { requirementId: "legacy-requirement", projectId: "project-a", versionId: undefined },
  "唯一历史项目名未能安全回退。"
);

assert.deepEqual(
  resolveTaskRequirementDeepLink({
    requested: { requirementId: "legacy-requirement" },
    projects: [...projects, { id: "project-a-duplicate", name: "A 项目" }],
    requirements: [{ id: "legacy-requirement", project: "A 项目" }],
    versions
  }),
  {},
  "同名项目被错误猜测归属。"
);

const canonicalUrl = applyTaskRequirementDeepLinkToUrl(
  new URL("https://example.test/workbench?view=projects&detailTab=members&requirementId=old"),
  { requirementId: "requirement-a", projectId: "project-a", versionId: "version-a" }
);

assert.equal(canonicalUrl.searchParams.get("requirementId"), "requirement-a");
assert.equal(canonicalUrl.searchParams.get("projectId"), "project-a");
assert.equal(canonicalUrl.searchParams.get("versionId"), "version-a");
assert.equal(canonicalUrl.searchParams.has("detailTab"), false);

applyTaskRequirementDeepLinkToUrl(canonicalUrl);
assert.equal(canonicalUrl.searchParams.has("requirementId"), false);
assert.equal(canonicalUrl.searchParams.has("projectId"), false);
assert.equal(canonicalUrl.searchParams.has("versionId"), false);

// 静态接线检查覆盖 SSR、push/replace、popstate 以及需求视图入口，防止纯 helper 存在但未被产品链路使用。
const repoRoot = process.cwd();
const pageText = fs.readFileSync(path.join(repoRoot, "app/workbench/page.tsx"), "utf8");
const platformText = fs.readFileSync(
  path.join(repoRoot, "src/components/project-management-platform/index.tsx"),
  "utf8"
);
const requirementColumnsText = fs.readFileSync(
  path.join(repoRoot, "src/components/project-management-platform/columns/requirement-columns/index.tsx"),
  "utf8"
);

for (const token of [
  "requirementId?: string | string[]",
  "initialTaskRequirementId",
  "initialTaskProjectId",
  "initialTaskVersionId",
  "view === \"tasks\" && requirementId"
]) {
  assert.ok(pageText.includes(token), `SSR 参数链路缺失：${token}`);
}

for (const token of [
  "writeTaskRequirementDeepLink(resolved, \"push\")",
  "writeTaskRequirementDeepLink(undefined, \"replace\")",
  "window.addEventListener(\"popstate\", replayWorkbenchDeepLink)",
  "setTaskRequirementFilter(null)",
  "onOpenRequirement={openRequirementTasks}"
]) {
  assert.ok(platformText.includes(token), `客户端深链接线缺失：${token}`);
}

assert.ok(requirementColumnsText.includes("onOpenTasks(requirement)"), "需求视图标题未接入任务筛选。");

console.log(JSON.stringify({
  checked: 12,
  ok: true,
  scope: "task requirement URL/SSR/popstate deep link"
}, null, 2));
