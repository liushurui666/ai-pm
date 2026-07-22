import dayjs from "dayjs";
import mammoth from "mammoth";
import { NextRequest, NextResponse } from "next/server";
import { createDashboardRecord, getDashboardData } from "@/data/local-dashboard";
import { createAiDocumentTaskBreakdown, isAiAssistantConfigured } from "@/lib/ai/client";
import { createFallbackDocumentTaskBreakdown } from "@/lib/documents/breakdown";
import { isAuthServiceConfigured } from "@/lib/auth/client";
import { getSession } from "@/lib/auth/session";
import { authorizeProjectMutation } from "@/lib/project-management/access";
import { recordProjectActivityForMutation } from "@/lib/project-management/activity";
import type { DashboardMember, RequirementVersion } from "@/types/dashboard";
import type { DocumentAnalyzeResult, DocumentTaskBreakdown, DocumentTaskDraft } from "@/types/records";

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 30_000;

class DocumentAnalyzeInputError extends Error {}

function getFormText(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

async function extractDocumentText(file: File) {
  const extension = getExtension(file.name);

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error("文件过大，请上传 4MB 以内的文档。");
  }

  if (extension === "docx") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });

    return result.value.trim();
  }

  if (["txt", "md", "markdown", "csv", "json"].includes(extension) || file.type.startsWith("text/")) {
    return (await file.text()).trim();
  }

  throw new Error("暂支持 .docx、.txt、.md、.csv、.json 文档。");
}

function normalizeDueDate(value?: string) {
  if (value && dayjs(value).isValid()) {
    return dayjs(value).format("YYYY-MM-DD");
  }

  return dayjs().add(5, "day").format("YYYY-MM-DD");
}

function normalizeStartDate(value?: string, dueDate?: string) {
  const normalizedDueDate = normalizeDueDate(dueDate);

  if (value && dayjs(value).isValid()) {
    const normalizedStartDate = dayjs(value).format("YYYY-MM-DD");

    return dayjs(normalizedStartDate).isAfter(normalizedDueDate, "day")
      ? dayjs(normalizedDueDate).subtract(1, "day").format("YYYY-MM-DD")
      : normalizedStartDate;
  }

  return dayjs(normalizedDueDate).subtract(3, "day").format("YYYY-MM-DD");
}

function findMatchedOwner(ownerName: string, members: DashboardMember[]) {
  const keyword = ownerName.trim().toLowerCase();

  if (!keyword) {
    return null;
  }

  return members.find((member) =>
    [member.name, member.email, member.notification.feishuOpenId, member.notification.feishuUserId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === keyword || String(value).toLowerCase().includes(keyword))
  ) ?? null;
}

function getFallbackOwner(formData: FormData) {
  return {
    owner: getFormText(formData, "owner"),
    ownerMemberId: getFormText(formData, "ownerMemberId"),
    ownerOpenId: getFormText(formData, "ownerOpenId"),
    ownerUnionId: getFormText(formData, "ownerUnionId"),
    ownerUserId: getFormText(formData, "ownerUserId"),
    ownerEmail: getFormText(formData, "ownerEmail"),
    ownerAvatarUrl: getFormText(formData, "ownerAvatarUrl")
  };
}

function hasFallbackOwner(fallbackOwner: ReturnType<typeof getFallbackOwner>) {
  return Boolean(fallbackOwner.ownerMemberId || fallbackOwner.ownerOpenId || fallbackOwner.owner);
}

function normalizeFallbackOwnerForWorkspace(
  fallbackOwner: ReturnType<typeof getFallbackOwner>,
  members: DashboardMember[]
) {
  if (!fallbackOwner.ownerMemberId) {
    return fallbackOwner;
  }

  const member = members.find((item) => item.id === fallbackOwner.ownerMemberId);

  if (!member) {
    throw new DocumentAnalyzeInputError("默认负责人不存在或不属于当前工作区，请重新选择。");
  }

  return {
    owner: member.name,
    ownerMemberId: member.id,
    ownerOpenId: member.notification.feishuOpenId ?? "",
    ownerUnionId: member.notification.feishuUnionId ?? "",
    ownerUserId: member.notification.feishuUserId ?? "",
    ownerEmail: member.email ?? "",
    ownerAvatarUrl: member.avatarUrl ?? ""
  };
}

function resolveTaskOwner(task: DocumentTaskDraft, members: DashboardMember[], fallbackOwner: ReturnType<typeof getFallbackOwner>) {
  if (hasFallbackOwner(fallbackOwner)) {
    return fallbackOwner;
  }

  const matchedOwner = findMatchedOwner(task.owner ?? "", members);

  if (matchedOwner) {
    return {
      owner: matchedOwner.name,
      ownerMemberId: matchedOwner.id,
      ownerOpenId: matchedOwner.notification.feishuOpenId ?? "",
      ownerUnionId: matchedOwner.notification.feishuUnionId ?? "",
      ownerUserId: matchedOwner.notification.feishuUserId ?? "",
      ownerEmail: matchedOwner.email ?? "",
      ownerAvatarUrl: matchedOwner.avatarUrl ?? ""
    };
  }

  return {
    owner: task.owner ?? "未分配",
    ownerMemberId: "",
    ownerOpenId: "",
    ownerUnionId: "",
    ownerUserId: "",
    ownerEmail: "",
    ownerAvatarUrl: ""
  };
}

function resolveBreakdownVersion({
  formProjectName,
  versionId,
  versions,
  workspaceId
}: {
  formProjectName: string;
  versionId: string;
  versions: RequirementVersion[];
  workspaceId: string;
}) {
  const targetVersion = versions.find((version) => version.id === versionId && (version.workspaceId || "ws-default") === workspaceId);

  if (!targetVersion) {
    throw new DocumentAnalyzeInputError("目标版本不存在或不属于当前工作区，请刷新后重新选择版本。");
  }

  // 入库时以服务端解析出来的版本为准，避免子版本入口的隐藏字段同步慢一步导致任务落到父版本或未规划版本。
  return {
    ownerMemberId: targetVersion.ownerMemberId,
    projectId: targetVersion.projectId,
    projectName: targetVersion.project || formProjectName || "跨项目",
    versionId: targetVersion.id,
    versionName: targetVersion.name
  };
}

async function createBreakdown({
  documentText,
  fileName,
  projectName,
  versionName,
  members
}: {
  documentText: string;
  fileName: string;
  projectName: string;
  versionName: string;
  members: DashboardMember[];
}) {
  if (!isAiAssistantConfigured()) {
    return {
      source: "fallback" as const,
      breakdown: createFallbackDocumentTaskBreakdown({ documentText, fileName }),
      warning: "AI_API_KEY 未配置，已使用本地规则拆解。"
    };
  }

  try {
    return {
      source: "ai" as const,
      breakdown: await createAiDocumentTaskBreakdown({
        documentText,
        fileName,
        projectName,
        versionName,
        peopleNames: members.map((member) => member.name)
      })
    };
  } catch (error) {
    return {
      source: "fallback" as const,
      breakdown: createFallbackDocumentTaskBreakdown({ documentText, fileName }),
      warning: `AI 模型调用失败，已使用本地规则拆解：${error instanceof Error ? error.message : "未知错误"}`
    };
  }
}

function ensureUsefulBreakdown(breakdown: DocumentTaskBreakdown) {
  if (breakdown.tasks.length) {
    return breakdown;
  }

  return {
    ...breakdown,
    tasks: [
      {
        title: "【前端】确认文档涉及的页面范围与交互验收",
        priority: "普通" as const,
        dueDate: dayjs().add(3, "day").format("YYYY-MM-DD"),
        aiHint: "文档中没有识别到明确前端待办，请确认页面、组件、表单、权限可见性和异常状态。"
      },
      {
        title: "【后端】确认文档涉及的接口数据与权限规则",
        priority: "普通" as const,
        dueDate: dayjs().add(4, "day").format("YYYY-MM-DD"),
        aiHint: "文档中没有识别到明确后端待办，请确认接口、数据模型、鉴权、持久化和消息通知边界。"
      },
      {
        title: "【测试】确认文档涉及的测试用例与回归范围",
        priority: "普通" as const,
        dueDate: dayjs().add(5, "day").format("YYYY-MM-DD"),
        aiHint: "文档中没有识别到明确测试待办，请补齐主流程、异常、权限边界和端到端验收用例。"
      }
    ]
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const configured = isAuthServiceConfigured();

  if (configured && !session) {
    return NextResponse.json(
      {
        error: "未登录"
      },
      {
        status: 401
      }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const workspaceId = getFormText(formData, "workspaceId");
  const formProjectName = getFormText(formData, "project");
  const versionId = getFormText(formData, "versionId");

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: "请上传需要拆解的文档"
      },
      {
        status: 400
      }
    );
  }

  if (!versionId) {
    return NextResponse.json(
      {
        error: "请选择文档拆解的目标版本"
      },
      {
        status: 400
      }
    );
  }

  try {
    const documentText = (await extractDocumentText(file)).slice(0, MAX_TEXT_LENGTH);

    if (documentText.length < 20) {
      return NextResponse.json(
        {
          error: "文档内容过少，无法拆解任务"
        },
        {
          status: 400
        }
      );
    }

    const dashboardData = await getDashboardData(session?.user, workspaceId || undefined);
    const members = dashboardData.members.filter((member) => member.status === "active");
    const fallbackOwner = normalizeFallbackOwnerForWorkspace(getFallbackOwner(formData), members);
    const targetVersion = resolveBreakdownVersion({
      formProjectName,
      versionId,
      versions: dashboardData.requirementVersions,
      workspaceId: dashboardData.meta?.currentWorkspace?.id ?? (workspaceId || "ws-default")
    });
    const resolvedWorkspaceId = dashboardData.meta?.currentWorkspace?.id ?? (workspaceId || "ws-default");
    const breakdownAuthorization = await authorizeProjectMutation({
      user: session?.user,
      workspaceId: resolvedWorkspaceId,
      projectId: targetVersion.projectId,
      projectName: targetVersion.projectName,
      entityType: "requirementVersion",
      action: "update",
      record: {
        id: targetVersion.versionId,
        ownerMemberId: targetVersion.ownerMemberId,
        projectId: targetVersion.projectId,
        project: targetVersion.projectName,
        workspaceId: resolvedWorkspaceId
      }
    });

    // 文档拆解是版本级动作：复用 canUpdateVersion 口径，让版本 owner/delivery_manager 可拆解，
    // 但不能用缺少 requirementId 的普通 task:create 误拒；后续任务仍锁定该服务端版本作用域。
    if (!breakdownAuthorization.allowed) {
      return NextResponse.json(
        { error: breakdownAuthorization.reason || "当前成员无权在目标项目中拆解任务。" },
        { status: 403 }
      );
    }

    const { source, breakdown: rawBreakdown, warning } = await createBreakdown({
      documentText,
      fileName: file.name,
      projectName: targetVersion.projectName,
      versionName: targetVersion.versionName,
      members
    });
    const breakdown = ensureUsefulBreakdown(rawBreakdown);
    const documentResult = await createDashboardRecord(
      "document",
      {
        title: breakdown.documentTitle,
        type: breakdown.documentType,
        updatedAt: dayjs().format("YYYY-MM-DD HH:mm"),
        aiSummary: breakdown.summary
      },
      resolvedWorkspaceId
    );
    const tasks = [];

    for (const task of breakdown.tasks) {
      const owner = resolveTaskOwner(task, members, fallbackOwner);
      const taskResult = await createDashboardRecord(
        "task",
        {
          title: task.title,
          stage: "待处理",
          owner: owner.owner,
          ownerMemberId: owner.ownerMemberId,
          ownerOpenId: owner.ownerOpenId,
          ownerUnionId: owner.ownerUnionId,
          ownerUserId: owner.ownerUserId,
          ownerEmail: owner.ownerEmail,
          ownerAvatarUrl: owner.ownerAvatarUrl,
          project: targetVersion.projectName,
          projectId: targetVersion.projectId,
          versionId: targetVersion.versionId,
          versionName: targetVersion.versionName,
          priority: task.priority,
          startDate: normalizeStartDate(task.startDate, task.dueDate),
          dueDate: normalizeDueDate(task.dueDate),
          aiHint: task.aiHint
        },
        resolvedWorkspaceId
      );

      tasks.push(taskResult.record);
      await recordProjectActivityForMutation({
        user: session?.user,
        workspaceId: resolvedWorkspaceId,
        projectId: targetVersion.projectId,
        projectName: targetVersion.projectName,
        entityType: "task",
        action: "create",
        record: taskResult.record as unknown as Record<string, unknown>,
        detail: `通过文档「${breakdown.documentTitle}」拆解创建任务。`
      });
    }

    return NextResponse.json({
      document: documentResult.record,
      tasks,
      source,
      extractedChars: documentText.length,
      message: `已围绕「${targetVersion.versionName}」拆解 ${tasks.length} 个任务，并保存到任务看板。`,
      warning
    } satisfies DocumentAnalyzeResult);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "文档拆解失败"
      },
      {
        status: error instanceof DocumentAnalyzeInputError ? 400 : 502
      }
    );
  }
}
