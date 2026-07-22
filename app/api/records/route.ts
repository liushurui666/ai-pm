import { NextRequest, NextResponse } from "next/server";
import {
  createDashboardRecord,
  createDashboardTaskRecord,
  deleteDashboardRecord,
  getDashboardBugById,
  getDashboardRecordById,
  getWorkspaceAccessContext,
  updateDashboardRecord,
  updateDashboardTaskRecord
} from "@/data/local-dashboard";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import { canPerformAction, getPermissionDeniedReason } from "@/lib/access/permissions";
import { safelyEnqueueRecordCleanupJob, safelyEnqueueRecordIndexJob } from "@/lib/ai/knowledge/record-indexing";
import { getSession } from "@/lib/auth/session";
import { authorizeProjectMemberAccess, authorizeProjectMutation } from "@/lib/project-management/access";
import { recordProjectActivityForMutation } from "@/lib/project-management/activity";
import {
  ProjectMutationScopeError,
  resolveProjectMutationScope
} from "@/lib/project-management/record-scope";
import type { ProjectMutationEntityType } from "@/lib/project-management/types";
import type { BugReport } from "@/types/dashboard";
import type { DashboardEntityType } from "@/types/records";

const entityTypes = new Set<DashboardEntityType>([
  "project",
  "task",
  "bug",
  "risk",
  "requirementVersion",
  "requirement",
  "document"
]);

function isRequirementManagementType(type: DashboardEntityType) {
  return type === "requirement" || type === "requirementVersion";
}

const projectMutationTypes = new Set<ProjectMutationEntityType>([
  "project",
  "requirementVersion",
  "requirement",
  "task",
  "risk"
]);

function isProjectMutationType(type: DashboardEntityType): type is ProjectMutationEntityType {
  return projectMutationTypes.has(type as ProjectMutationEntityType);
}

function isProjectActivityType(type: DashboardEntityType): type is ProjectMutationEntityType | "bug" {
  return isProjectMutationType(type) || type === "bug";
}

function asActivityRecord(record: unknown) {
  return record as Record<string, unknown>;
}

function createTargetAuthorizationRecord(
  type: ProjectMutationEntityType,
  existingRecord: Record<string, unknown>,
  values: Record<string, unknown>
) {
  const prospectiveRecord = {
    ...existingRecord,
    ...values
  };

  if (type === "task") {
    // 目标项目和需求作用域按归一化后的关联判断，但任务负责人仍必须使用旧值，避免 PATCH 先改成自己再绕过授权。
    prospectiveRecord.ownerMemberId = existingRecord.ownerMemberId;
  }

  return prospectiveRecord;
}

function recordBelongsToWorkspace(record: unknown, workspaceId: string) {
  const recordWorkspaceId = asActivityRecord(record).workspaceId;

  return typeof recordWorkspaceId === "string" && recordWorkspaceId === workspaceId;
}

function getDeleteAction(type: DashboardEntityType) {
  if (isRequirementManagementType(type)) {
    return "requirement:delete";
  }

  if (type === "bug") {
    return "bug:delete";
  }

  return "member:manage";
}

const limitedBugUpdateFields = [
  "status",
  "owner",
  "ownerMemberId",
  "ownerOpenId",
  "ownerUnionId",
  "ownerUserId",
  "ownerEmail",
  "ownerAvatarUrl"
] as const;

const projectOwnerFields = [
  "owner",
  "ownerMemberId",
  "ownerOpenId",
  "ownerUnionId",
  "ownerUserId",
  "ownerEmail",
  "ownerAvatarUrl"
] as const;

const taskScopeFields = [
  "project",
  "projectId",
  "versionId",
  "versionName",
  "requirementId",
  "requirementTitle"
] as const;

const requirementScopeFields = ["project", "projectId", "versionId", "versionName"] as const;
const requirementVersionProjectFields = ["project", "projectId"] as const;

const quickTaskUpdateFields = new Set([
  "stage",
  "owner",
  "ownerMemberId",
  "ownerOpenId",
  "ownerUnionId",
  "ownerUserId",
  "ownerEmail",
  "ownerAvatarUrl"
]);

function normalizeOwnerFieldValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value ?? "";
}

function attemptsProjectOwnerTransfer(
  existingRecord: Record<string, unknown>,
  values: Record<string, unknown>
) {
  // 项目负责人交接必须走治理接口，不能借普通项目 PATCH 绕过交接原因、旧负责人保留策略和动态审计。
  return projectOwnerFields.some((field) => (
    Object.prototype.hasOwnProperty.call(values, field)
    && normalizeOwnerFieldValue(values[field]) !== normalizeOwnerFieldValue(existingRecord[field])
  ));
}

function attemptsTaskScopeRebinding(
  existingRecord: Record<string, unknown>,
  values: Record<string, unknown>
) {
  return taskScopeFields.some((field) => (
    Object.prototype.hasOwnProperty.call(values, field)
    && normalizeOwnerFieldValue(values[field]) !== normalizeOwnerFieldValue(existingRecord[field])
  ));
}

function attemptsRequirementScopeRebinding(
  existingRecord: Record<string, unknown>,
  values: Record<string, unknown>
) {
  return requirementScopeFields.some((field) => (
    Object.prototype.hasOwnProperty.call(values, field)
    && normalizeOwnerFieldValue(values[field]) !== normalizeOwnerFieldValue(existingRecord[field])
  ));
}

function attemptsRequirementVersionProjectRebinding(
  existingRecord: Record<string, unknown>,
  values: Record<string, unknown>
) {
  return requirementVersionProjectFields.some((field) => (
    Object.prototype.hasOwnProperty.call(values, field)
    && normalizeOwnerFieldValue(values[field]) !== normalizeOwnerFieldValue(existingRecord[field])
  ));
}

function createLimitedBugUpdateValues(existingBug: BugReport, values: Record<string, unknown>) {
  const nextValues: Record<string, unknown> = { ...existingBug };

  for (const field of limitedBugUpdateFields) {
    if (Object.prototype.hasOwnProperty.call(values, field)) {
      nextValues[field] = values[field];
    }
  }

  return nextValues;
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json(
      {
        error: "未登录"
      },
      {
        status: 401
      }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    type?: DashboardEntityType;
    workspaceId?: string;
    values?: Record<string, unknown>;
  } | null;

  if (!body?.type || !entityTypes.has(body.type) || !body.values) {
    return NextResponse.json(
      {
        error: "创建参数不完整"
      },
      {
        status: 400
      }
    );
  }

  try {
    let createValues = body.values;
    let mutationWorkspaceId = body.workspaceId;

    if (body.type === "bug") {
      const accessContext = await getWorkspaceAccessContext(session?.user, body.workspaceId);

      if (!canPerformAction(accessContext.permissions, "bug:update")) {
        return NextResponse.json(
          { error: getPermissionDeniedReason(accessContext.permissions, "bug:update") },
          { status: 403 }
        );
      }


      const projectAccess = await authorizeProjectMemberAccess({
        user: session?.user,
        workspaceId: accessContext.currentWorkspace.id,
        record: body.values
      });

      if (!projectAccess.allowed) {
        return NextResponse.json({ error: projectAccess.reason }, { status: 403 });
      }

      // Bug 新建沿用“非只读成员可维护 Bug”的既有权限矩阵，但工作区必须由服务端会话重新解析，
      // 不能信任请求体中的 workspaceId，否则可借伪造工作区把记录写到其他租户。
      mutationWorkspaceId = accessContext.currentWorkspace.id;
    }

    if (body.type === "document") {
      const accessContext = await getWorkspaceAccessContext(session?.user, body.workspaceId);

      if (!canPerformAction(accessContext.permissions, "requirement:create")) {
        return NextResponse.json(
          { error: getPermissionDeniedReason(accessContext.permissions, "requirement:create") },
          { status: 403 }
        );
      }

      // 文档属于工作区级需求资产，服务端必须用当前会话解析出的工作区覆盖请求值；
      // 否则调用方可伪造 workspaceId，把文档写入自己无权访问的租户。
      mutationWorkspaceId = accessContext.currentWorkspace.id;
      createValues = {
        ...body.values,
        workspaceId: accessContext.currentWorkspace.id
      };
    }

    if (isProjectMutationType(body.type)) {
      const accessContext = await getWorkspaceAccessContext(session?.user, body.workspaceId);
      const mutationScope = await resolveProjectMutationScope({
        workspaceId: accessContext.currentWorkspace.id,
        entityType: body.type,
        action: "create",
        values: body.values
      });
      const authorization = await authorizeProjectMutation({
        user: session?.user,
        workspaceId: mutationScope.workspaceId,
        projectId: mutationScope.projectId,
        projectName: mutationScope.projectName
          ?? (typeof mutationScope.values.name === "string" ? mutationScope.values.name : undefined),
        entityType: body.type,
        action: "create",
        values: mutationScope.values
      });

      if (!authorization.allowed) {
        return NextResponse.json({ error: authorization.reason || "当前成员无权创建该项目记录。" }, { status: 403 });
      }

      createValues = mutationScope.values;
      mutationWorkspaceId = mutationScope.workspaceId;
    }

    // 任务创建只写 project_tasks 当前行，版本回填和负责人通知都可以用轻量查询完成；
    // 需求、Bug、版本等仍保留完整路径，避免漏掉权限、流转和级联同步语义。
    const result = body.type === "task"
      ? await createDashboardTaskRecord(createValues, mutationWorkspaceId)
      : await createDashboardRecord(body.type, createValues, mutationWorkspaceId, session?.user);

    if (isProjectActivityType(body.type)) {
      await recordProjectActivityForMutation({
        user: session?.user,
        workspaceId: mutationWorkspaceId,
        entityType: body.type,
        action: "create",
        record: asActivityRecord(result.record)
      });
    }

    // RAG 索引只在业务数据保存成功后入队；失败不影响创建响应，避免用户看到后台索引状态。
    await safelyEnqueueRecordIndexJob(result, "created");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProjectMutationScopeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建记录失败"
      },
      {
        status: 502
      }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json(
      {
        error: "未登录"
      },
      {
        status: 401
      }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    type?: DashboardEntityType;
    id?: string;
    workspaceId?: string;
    values?: Record<string, unknown>;
  } | null;

  if (!body?.type || !entityTypes.has(body.type) || !body.id || !body.values) {
    return NextResponse.json(
      {
        error: "更新参数不完整"
      },
      {
        status: 400
      }
    );
  }

  let updateValues = body.values;
  let mutationWorkspaceId = body.workspaceId;

  if (body.type === "bug") {
    const { currentWorkspace, permissions } = await getWorkspaceAccessContext(session?.user, body.workspaceId);
    const existingBug = await getDashboardBugById(body.id);

    if (!existingBug || !recordBelongsToWorkspace(existingBug, currentWorkspace.id)) {
      return NextResponse.json({ error: "记录不存在或不属于当前工作区" }, { status: 404 });
    }

    if (!canPerformAction(permissions, "bug:update")) {
      return NextResponse.json(
        {
          error: getPermissionDeniedReason(permissions, "bug:update")
        },
        {
          status: 403
        }
      );
    }

    const sourceProjectAccess = await authorizeProjectMemberAccess({
      user: session?.user,
      workspaceId: currentWorkspace.id,
      record: asActivityRecord(existingBug)
    });

    if (!sourceProjectAccess.allowed) {
      return NextResponse.json({ error: sourceProjectAccess.reason }, { status: 403 });
    }

    if (!permissions.canEditBugsFully) {
      updateValues = createLimitedBugUpdateValues(existingBug, body.values);
    }

    const targetProjectAccess = await authorizeProjectMemberAccess({
      user: session?.user,
      workspaceId: currentWorkspace.id,
      record: {
        ...asActivityRecord(existingBug),
        ...updateValues
      }
    });

    if (!targetProjectAccess.allowed) {
      return NextResponse.json({ error: targetProjectAccess.reason }, { status: 403 });
    }

    mutationWorkspaceId = currentWorkspace.id;
  }

  try {
    if (body.type === "document") {
      const accessContext = await getWorkspaceAccessContext(session?.user, body.workspaceId);
      const existingDocument = await getDashboardRecordById("document", body.id);

      if (!existingDocument || !recordBelongsToWorkspace(existingDocument, accessContext.currentWorkspace.id)) {
        return NextResponse.json({ error: "记录不存在或不属于当前工作区" }, { status: 404 });
      }

      if (!canPerformAction(accessContext.permissions, "requirement:update")) {
        return NextResponse.json(
          { error: getPermissionDeniedReason(accessContext.permissions, "requirement:update") },
          { status: 403 }
        );
      }

      // 更新目标以数据库旧记录和当前会话工作区为准，既拒绝跨工作区 IDOR，也不允许 values.workspaceId 改租户。
      mutationWorkspaceId = accessContext.currentWorkspace.id;
      updateValues = {
        ...body.values,
        workspaceId: accessContext.currentWorkspace.id
      };
    }

    if (isProjectMutationType(body.type)) {
      const existingRecord = await getDashboardRecordById(body.type, body.id);

      if (!existingRecord) {
        return NextResponse.json({ error: "记录不存在或已被删除" }, { status: 404 });
      }

      if (body.type === "project" && attemptsProjectOwnerTransfer(asActivityRecord(existingRecord), updateValues)) {
        return NextResponse.json(
          { error: "项目负责人不能在普通编辑中修改，请前往“成员与权限”使用负责人交接。" },
          { status: 409 }
        );
      }

      if (body.type === "task" && attemptsTaskScopeRebinding(asActivityRecord(existingRecord), updateValues)) {
        // one2all 普通任务 PATCH 不承担跨项目/版本/需求迁移；禁止经办人利用 update 权限改绑作用域。
        return NextResponse.json(
          { error: "任务不能通过普通编辑改绑项目、版本或需求，请由项目管理员走专用迁移流程。" },
          { status: 409 }
        );
      }

      if (body.type === "requirement" && attemptsRequirementScopeRebinding(asActivityRecord(existingRecord), updateValues)) {
        return NextResponse.json(
          { error: "需求不能通过普通编辑改绑项目或版本，请由项目管理员走专用迁移流程。" },
          { status: 409 }
        );
      }

      if (
        body.type === "requirementVersion"
        && attemptsRequirementVersionProjectRebinding(asActivityRecord(existingRecord), updateValues)
      ) {
        return NextResponse.json(
          { error: "版本不能通过普通编辑改绑项目，请由项目管理员走专用迁移流程。" },
          { status: 409 }
        );
      }

      const authorization = await authorizeProjectMutation({
        user: session?.user,
        workspaceId: body.workspaceId,
        entityType: body.type,
        action: "update",
        record: asActivityRecord(existingRecord),
        values: updateValues
      });

      if (!authorization.allowed) {
        return NextResponse.json({ error: authorization.reason || "当前成员无权更新该项目记录。" }, { status: 403 });
      }

      const mutationScope = await resolveProjectMutationScope({
        workspaceId: authorization.workspaceId,
        entityType: body.type,
        action: "update",
        record: asActivityRecord(existingRecord),
        values: updateValues
      });
      const targetAuthorization = await authorizeProjectMutation({
        user: session?.user,
        workspaceId: mutationScope.workspaceId,
        projectId: mutationScope.projectId,
        projectName: mutationScope.projectName,
        entityType: body.type,
        action: "update",
        record: createTargetAuthorizationRecord(
          body.type,
          asActivityRecord(existingRecord),
          mutationScope.values
        ),
        values: mutationScope.values,
        // 版本负责人是记录级 update 权限：同项目交接保留旧负责人事实，跨项目目标授权则不复用。
        sourceProjectId: body.type === "requirementVersion" || body.type === "task"
          ? authorization.projectId
          : undefined,
        sourceOwnerMemberId: body.type === "requirementVersion"
          && typeof asActivityRecord(existingRecord).ownerMemberId === "string"
          ? asActivityRecord(existingRecord).ownerMemberId as string
          : undefined
      });

      if (!targetAuthorization.allowed) {
        return NextResponse.json(
          { error: targetAuthorization.reason || "当前成员无权把记录写入目标项目。" },
          { status: 403 }
        );
      }

      updateValues = mutationScope.values;
      mutationWorkspaceId = mutationScope.workspaceId;
    }

    // 任务看板拖拽会高频 PATCH，只需要保存 project_tasks 当前行并返回更新后的任务；
    // 普通任务编辑、版本联动和其他实体仍走完整 updateDashboardRecord，避免轻量路径漏掉复杂业务同步。
    const result = body.type === "task" && updateValues.__quickTaskUpdate === true
      ? await updateDashboardTaskRecord(
          body.id,
          // 快速入口仅服务阶段拖拽和负责人转交；其它字段即使由客户端夹带也不能进入轻量合并路径。
          Object.fromEntries(Object.entries(updateValues).filter(([key]) => quickTaskUpdateFields.has(key))),
          session?.user
        )
      : await updateDashboardRecord(body.type, body.id, updateValues, session?.user);

    if (isProjectActivityType(body.type)) {
      await recordProjectActivityForMutation({
        user: session?.user,
        workspaceId: mutationWorkspaceId,
        entityType: body.type,
        action: "update",
        record: asActivityRecord(result.record)
      });
    }

    // 更新记录后只投递轻量 index job，worker 再异步做 chunk、embedding 和 Qdrant 写入。
    await safelyEnqueueRecordIndexJob(result, "updated");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProjectMutationScopeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "更新记录失败"
      },
      {
        status: 502
      }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json(
      {
        error: "未登录"
      },
      {
        status: 401
      }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    type?: DashboardEntityType;
    id?: string;
    workspaceId?: string;
  } | null;

  if (!body?.type || !entityTypes.has(body.type) || !body.id) {
    return NextResponse.json(
      {
        error: "删除参数不完整"
      },
      {
        status: 400
      }
    );
  }

  try {
    const accessContext = await getWorkspaceAccessContext(session?.user, body.workspaceId);
    const existingRecord = await getDashboardRecordById(body.type, body.id);

    // 历史 schema 的实体 ID 是全局键；删除前必须把目标重新绑定到已授权工作区，防止跨工作区 IDOR。
    if (!existingRecord || !recordBelongsToWorkspace(existingRecord, accessContext.currentWorkspace.id)) {
      return NextResponse.json({ error: "记录不存在或不属于当前工作区" }, { status: 404 });
    }

    if (isProjectMutationType(body.type)) {
      const authorization = await authorizeProjectMutation({
        user: session?.user,
        workspaceId: body.workspaceId,
        entityType: body.type,
        action: "delete",
        record: asActivityRecord(existingRecord)
      });

      if (!authorization.allowed) {
        return NextResponse.json({ error: authorization.reason || "当前成员无权删除该项目记录。" }, { status: 403 });
      }
    } else {
      const action = getDeleteAction(body.type);

      if (!canPerformAction(accessContext.permissions, action)) {
        return NextResponse.json(
          { error: getPermissionDeniedReason(accessContext.permissions, action) },
          { status: 403 }
        );
      }

      if (body.type === "bug") {
        const projectAccess = await authorizeProjectMemberAccess({
          user: session?.user,
          workspaceId: accessContext.currentWorkspace.id,
          record: asActivityRecord(existingRecord)
        });

        if (!projectAccess.allowed) {
          return NextResponse.json({ error: projectAccess.reason }, { status: 403 });
        }
      }
    }

    const result = await deleteDashboardRecord(body.type, body.id);

    // 项目本身删除后治理日志会随项目级联清理；其余记录保留删除前快照，确保动态里能看到真实对象名。
    if (existingRecord && isProjectActivityType(body.type) && body.type !== "project") {
      await recordProjectActivityForMutation({
        user: session?.user,
        workspaceId: body.workspaceId,
        entityType: body.type,
        action: "delete",
        record: asActivityRecord(existingRecord)
      });
    }

    // 删除业务记录后同样只投递后台清理任务；Qdrant point 和 source/chunk 清理由 worker 异步完成。
    await safelyEnqueueRecordCleanupJob({
      workspaceId: accessContext.currentWorkspace.id ?? body.workspaceId,
      type: body.type,
      id: body.id
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "删除记录失败"
      },
      {
        status: 502
      }
    );
  }
}
