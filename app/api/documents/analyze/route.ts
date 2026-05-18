import dayjs from "dayjs";
import mammoth from "mammoth";
import { NextRequest, NextResponse } from "next/server";
import { createDashboardRecord } from "@/data/local-dashboard";
import { createAiDocumentTaskBreakdown, isAiAssistantConfigured } from "@/lib/ai-client";
import { createFallbackDocumentTaskBreakdown } from "@/lib/document-breakdown";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { listFeishuPeople } from "@/lib/feishu-users";
import { getSession } from "@/lib/session";
import type { FeishuPerson } from "@/types/dashboard";
import type { DocumentAnalyzeResult, DocumentTaskBreakdown, DocumentTaskDraft } from "@/types/records";

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 30_000;

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

function findMatchedOwner(ownerName: string, people: FeishuPerson[]) {
  const keyword = ownerName.trim().toLowerCase();

  if (!keyword) {
    return null;
  }

  return people.find((person) =>
    [person.name, person.enName, person.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === keyword || String(value).toLowerCase().includes(keyword))
  ) ?? null;
}

function getFallbackOwner(formData: FormData) {
  return {
    owner: getFormText(formData, "owner"),
    ownerOpenId: getFormText(formData, "ownerOpenId"),
    ownerUnionId: getFormText(formData, "ownerUnionId"),
    ownerUserId: getFormText(formData, "ownerUserId"),
    ownerEmail: getFormText(formData, "ownerEmail")
  };
}

function resolveTaskOwner(task: DocumentTaskDraft, people: FeishuPerson[], fallbackOwner: ReturnType<typeof getFallbackOwner>) {
  const matchedOwner = findMatchedOwner(task.owner ?? "", people);

  if (matchedOwner) {
    return {
      owner: matchedOwner.name,
      ownerOpenId: matchedOwner.openId,
      ownerUnionId: matchedOwner.unionId ?? "",
      ownerUserId: matchedOwner.userId ?? "",
      ownerEmail: matchedOwner.email ?? ""
    };
  }

  return fallbackOwner.ownerOpenId || fallbackOwner.owner
    ? fallbackOwner
    : {
        owner: task.owner ?? "未分配",
        ownerOpenId: "",
        ownerUnionId: "",
        ownerUserId: "",
        ownerEmail: ""
      };
}

async function createBreakdown({
  documentText,
  fileName,
  projectName,
  people
}: {
  documentText: string;
  fileName: string;
  projectName: string;
  people: FeishuPerson[];
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
        peopleNames: people.map((person) => person.name)
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
        priority: "中" as const,
        dueDate: dayjs().add(3, "day").format("YYYY-MM-DD"),
        aiHint: "文档中没有识别到明确前端待办，请确认页面、组件、表单、权限可见性和异常状态。"
      },
      {
        title: "【后端】确认文档涉及的接口数据与权限规则",
        priority: "中" as const,
        dueDate: dayjs().add(4, "day").format("YYYY-MM-DD"),
        aiHint: "文档中没有识别到明确后端待办，请确认接口、数据模型、鉴权、持久化和消息通知边界。"
      },
      {
        title: "【测试】确认文档涉及的测试用例与回归范围",
        priority: "中" as const,
        dueDate: dayjs().add(5, "day").format("YYYY-MM-DD"),
        aiHint: "文档中没有识别到明确测试待办，请补齐主流程、异常、权限边界和端到端验收用例。"
      }
    ]
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const configured = isFeishuAuthConfigured();

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
  const projectName = getFormText(formData, "project");

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

  if (!projectName) {
    return NextResponse.json(
      {
        error: "请选择文档所属项目"
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

    const people = configured ? await listFeishuPeople().catch(() => []) : [];
    const fallbackOwner = getFallbackOwner(formData);
    const { source, breakdown: rawBreakdown, warning } = await createBreakdown({
      documentText,
      fileName: file.name,
      projectName,
      people
    });
    const breakdown = ensureUsefulBreakdown(rawBreakdown);
    const documentResult = await createDashboardRecord("document", {
      title: breakdown.documentTitle,
      type: breakdown.documentType,
      updatedAt: dayjs().format("YYYY-MM-DD HH:mm"),
      aiSummary: breakdown.summary
    });
    const tasks = [];

    for (const task of breakdown.tasks) {
      const owner = resolveTaskOwner(task, people, fallbackOwner);
      const taskResult = await createDashboardRecord("task", {
        title: task.title,
        stage: "待处理",
        owner: owner.owner,
        ownerOpenId: owner.ownerOpenId,
        ownerUnionId: owner.ownerUnionId,
        ownerUserId: owner.ownerUserId,
        ownerEmail: owner.ownerEmail,
        project: projectName,
        priority: task.priority,
        dueDate: normalizeDueDate(task.dueDate),
        aiHint: task.aiHint
      });

      tasks.push(taskResult.record);
    }

    return NextResponse.json({
      document: documentResult.record,
      tasks,
      source,
      extractedChars: documentText.length,
      message: `已从文档拆解 ${tasks.length} 个任务，并保存到任务看板。`,
      warning
    } satisfies DocumentAnalyzeResult);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "文档拆解失败"
      },
      {
        status: 502
      }
    );
  }
}
