import { config as loadEnv } from "dotenv";
import {
  readDashboardRequirementVersionDatabase,
  upsertDashboardRequirementVersionDatabase
} from "@/data/database-dashboard";
import { cloneDefaultProjectDeliveryLabels } from "@/data/project-delivery-labels";
import { toJsonValue } from "@/lib/database/json";
import { getPrismaClient } from "@/lib/database/prisma";
import { authorizeProjectMutationForActorMember } from "@/lib/project-management/access";
import {
  ProjectMutationScopeError,
  resolveProjectMutationScope
} from "@/lib/project-management/record-scope";
import type { ProjectDeliveryLabel, RequirementVersion } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectScopeRejected(
  action: () => Promise<unknown>,
  expectedMessage: string
) {
  let error: unknown;

  try {
    await action();
  } catch (caught) {
    error = caught;
  }

  assertSmoke(error instanceof ProjectMutationScopeError, `预期版本标签操作被服务端拒绝：${expectedMessage}`);
  assertSmoke(
    error.message.includes(expectedMessage),
    `版本标签拒绝原因不符合预期：${error.message}`
  );
}

function versionRecord(input: {
  catalog?: ProjectDeliveryLabel[];
  id: string;
  name: string;
  ownerMemberId?: string;
  projectId: string;
  projectName: string;
  workspaceId: string;
}): RequirementVersion {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.name,
    project: input.projectName,
    projectId: input.projectId,
    type: "版本",
    status: "规划中",
    startDate: "2026-07-22",
    releaseDate: "2026-08-22",
    progress: 0,
    riskLevel: "低",
    healthStatus: "待评估",
    goal: "验证版本级交付标签持久化与隔离。",
    owner: input.ownerMemberId ? "版本负责人" : undefined,
    ownerMemberId: input.ownerMemberId,
    ...(input.catalog ? { deliveryLabelCatalog: input.catalog } : {}),
    milestones: []
  };
}

async function refreshVersion(workspaceId: string, versionId: string) {
  const version = await readDashboardRequirementVersionDatabase(workspaceId, versionId);

  assertSmoke(version, `版本 ${versionId} 保存后未能从数据库刷新读取`);
  return version;
}

async function saveScopedVersionUpdate(
  version: RequirementVersion,
  values: Record<string, unknown>
) {
  const scope = await resolveProjectMutationScope({
    workspaceId: version.workspaceId as string,
    entityType: "requirementVersion",
    action: "update",
    record: version as unknown as Record<string, unknown>,
    values
  });
  const nextVersion = {
    ...version,
    ...scope.values,
    id: version.id,
    workspaceId: version.workspaceId
  } as RequirementVersion;

  await upsertDashboardRequirementVersionDatabase(nextVersion);
  return refreshVersion(version.workspaceId as string, version.id);
}

async function main() {
  const prisma = getPrismaClient();
  const runId = `pm-label-${Date.now().toString(36)}`;
  const workspaceId = `ws-${runId}`;
  const projectId = `project-${runId}`;
  const projectName = `版本标签项目-${runId}`;
  const actorMemberId = `member-${runId}`;
  const projectOwnerMemberId = `project-owner-${runId}`;
  const versionAId = `version-a-${runId}`;
  const versionBId = `version-b-${runId}`;
  const emptyVersionId = `version-empty-${runId}`;
  const now = new Date().toISOString();

  try {
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: `PM label smoke ${runId}`,
        description: "可级联清理的版本标签动态冒烟工作区",
        status: "active",
        createdAt: now,
        updatedAt: now
      }
    });
    await prisma.dashboardMember.create({
      data: {
        id: actorMemberId,
        workspaceId,
        name: "版本负责人",
        email: `${runId}@example.test`,
        registrationChannel: "email",
        role: "member",
        status: "active",
        identities: toJsonValue([]),
        notification: toJsonValue({ channels: [] }),
        createdAt: now,
        updatedAt: now
      }
    });
    await prisma.project.create({
      data: {
        id: projectId,
        workspaceId,
        name: projectName,
        owner: "项目负责人",
        ownerMemberId: projectOwnerMemberId,
        status: "进行中",
        startDate: "2026-07-22",
        progress: 0,
        health: 100,
        riskLevel: "低",
        healthStatus: "待评估",
        dueDate: "2026-08-22",
        team: 2,
        riskCount: 0,
        summary: "版本标签动态冒烟项目",
        deliveryLabelCatalog: toJsonValue(cloneDefaultProjectDeliveryLabels()),
        milestones: toJsonValue([])
      }
    });

    // 数据库 payload 为缺省目录的新版本生成 4 个版本唯一标签，不生成节点。
    await upsertDashboardRequirementVersionDatabase(versionRecord({
      id: versionAId,
      name: "Version A",
      ownerMemberId: actorMemberId,
      projectId,
      projectName,
      workspaceId
    }));
    await upsertDashboardRequirementVersionDatabase(versionRecord({
      id: versionBId,
      name: "Version B",
      projectId,
      projectName,
      workspaceId
    }));
    await upsertDashboardRequirementVersionDatabase(versionRecord({
      catalog: [],
      id: emptyVersionId,
      name: "Explicit empty",
      projectId,
      projectName,
      workspaceId
    }));

    let versionA = await refreshVersion(workspaceId, versionAId);
    const versionB = await refreshVersion(workspaceId, versionBId);
    const emptyVersion = await refreshVersion(workspaceId, emptyVersionId);
    const catalogA = versionA.deliveryLabelCatalog ?? [];
    const catalogB = versionB.deliveryLabelCatalog ?? [];

    assertSmoke(catalogA.length === 4 && catalogB.length === 4, "新版本必须默认 4 个交付标签");
    assertSmoke(versionA.milestones.length === 0 && versionB.milestones.length === 0, "新版本不应自动生成交付节点");
    assertSmoke(emptyVersion.deliveryLabelCatalog?.length === 0, "显式空目录保存刷新后不能回填默认标签");
    assertSmoke(
      catalogA.every((label) => !catalogB.some((candidate) => candidate.id === label.id)),
      "两个版本的默认 labelId 必须完全隔离"
    );

    const firstLabel = catalogA[0];
    const secondLabel = catalogA[1];
    assertSmoke(firstLabel && secondLabel, "Version A 缺少可用默认标签");
    versionA = await saveScopedVersionUpdate(versionA, {
      milestones: [{
        id: `${versionAId}-milestone-1`,
        title: "产品方案评审",
        labelId: firstLabel.id,
        type: firstLabel.name,
        status: "进行中",
        dueDate: "2026-07-30",
        owner: "版本负责人",
        ownerMemberId: actorMemberId,
        note: "验证改名与软删除快照"
      }]
    });

    const renamedCatalog = (versionA.deliveryLabelCatalog ?? []).map((label) => (
      label.id === firstLabel.id ? { ...label, name: "产品方案评审" } : label
    ));
    versionA = await saveScopedVersionUpdate(versionA, { deliveryLabelCatalog: renamedCatalog });
    assertSmoke(versionA.milestones[0]?.type === "产品方案评审", "启用标签改名必须同步节点 type");
    const refreshedVersionBAfterRename = await refreshVersion(workspaceId, versionBId);
    assertSmoke(
      refreshedVersionBAfterRename.deliveryLabelCatalog?.[0]?.name === catalogB[0]?.name,
      "Version A 改名不能污染 Version B 目录"
    );

    const softDeletedCatalog = (versionA.deliveryLabelCatalog ?? []).map((label) => (
      label.id === firstLabel.id ? { ...label, active: false, deleted: true } : label
    ));
    versionA = await saveScopedVersionUpdate(versionA, { deliveryLabelCatalog: softDeletedCatalog });
    const deletedLabel = versionA.deliveryLabelCatalog?.find((label) => label.id === firstLabel.id);
    assertSmoke(deletedLabel?.deleted === true && deletedLabel.active === false, "软删除标签必须持久化 deleted/inactive");
    assertSmoke(versionA.milestones[0]?.type === "产品方案评审", "软删除不能改写历史节点 type 快照");

    await expectScopeRejected(
      () => resolveProjectMutationScope({
        workspaceId,
        entityType: "requirementVersion",
        action: "update",
        record: versionA as unknown as Record<string, unknown>,
        values: {
          milestones: [{
            id: `${versionAId}-new-deleted-label-node`,
            title: "不能新选已删除标签",
            labelId: firstLabel.id,
            type: "产品方案评审",
            status: "未开始",
            dueDate: "2026-08-01",
            owner: "",
            note: ""
          }]
        }
      }),
      "已停用"
    );

    await expectScopeRejected(
      () => resolveProjectMutationScope({
        workspaceId,
        entityType: "requirementVersion",
        action: "update",
        record: versionA as unknown as Record<string, unknown>,
        values: {
          milestones: [0, 1].map((index) => ({
            id: `${versionAId}-duplicate-${index}`,
            title: `重复节点 ${index}`,
            labelId: secondLabel.id,
            type: secondLabel.name,
            status: "未开始",
            dueDate: "2026-08-02",
            owner: "",
            note: ""
          }))
        }
      }),
      "重复使用"
    );

    const foreignLabel = catalogB[0];
    assertSmoke(foreignLabel, "Version B 缺少跨版本校验标签");
    await expectScopeRejected(
      () => resolveProjectMutationScope({
        workspaceId,
        entityType: "requirementVersion",
        action: "update",
        record: versionA as unknown as Record<string, unknown>,
        values: {
          deliveryLabelCatalog: [
            ...(versionA.deliveryLabelCatalog ?? []),
            { ...foreignLabel, name: "Version B foreign label" }
          ]
        }
      }),
      "属于其他版本"
    );

    const nodeAuthorization = await authorizeProjectMutationForActorMember({
      workspaceId,
      actorMemberId,
      entityType: "requirementVersion",
      action: "update",
      record: versionA as unknown as Record<string, unknown>,
      // 完整编辑表单会带回未改动的目录；语义比较不得将它误判为目录管理。
      values: {
        deliveryLabelCatalog: versionA.deliveryLabelCatalog,
        milestones: versionA.milestones
      }
    });
    const catalogAuthorization = await authorizeProjectMutationForActorMember({
      workspaceId,
      actorMemberId,
      entityType: "requirementVersion",
      action: "update",
      record: versionA as unknown as Record<string, unknown>,
      values: {
        deliveryLabelCatalog: (versionA.deliveryLabelCatalog ?? []).map((label, index) => (
          index === 1 ? { ...label, name: `${label.name}-越权修改` } : label
        ))
      }
    });

    assertSmoke(nodeAuthorization.allowed, "版本负责人应可编辑本版本交付节点");
    assertSmoke(!catalogAuthorization.allowed, "版本负责人不能管理交付标签目录");

    process.stdout.write("✅ PM 版本级交付标签 DB 动态冒烟通过\n");
    process.stdout.write("✅ 覆盖 save/refresh、4 标签/0 节点、版本隔离、显式空目录、改名、软删除、停用/重复/跨版本拒绝与权限边界\n");
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`❌ PM 版本级交付标签 DB 动态冒烟失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
