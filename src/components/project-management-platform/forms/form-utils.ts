import dayjs from "dayjs";
import type { UploadFile } from "antd/es/upload/interface";
import type { BugReport, DashboardMember, Project, Requirement, RequirementVersion, Task, FeishuUser } from "@/types/dashboard";
import type { DashboardEntityType } from "@/types/records";
import { createBugAttachmentUploadFile, serializeBugAttachments } from "@/components/project-management-platform/forms/bug-attachments";

// 新建记录的默认值集中维护，避免每个抽屉入口各自拼装日期和状态。
export function getCreateInitialValues(type: DashboardEntityType, currentUser?: FeishuUser) {
  if (type === "project") {
    return {
      status: "进行中",
      progress: 0,
      health: 80,
      dueDate: dayjs().add(14, "day"),
      team: 1,
      riskCount: 0,
      milestones: [
        {
          title: "项目启动",
          status: "进行中",
          dueDate: dayjs(),
          owner: "",
          note: "确认项目目标、范围和负责人。"
        },
        {
          title: "阶段验收",
          status: "未开始",
          dueDate: dayjs().add(14, "day"),
          owner: "",
          note: "检查交付物、风险和上线准备。"
        }
      ]
    };
  }

  if (type === "task") {
    return {
      stage: "待处理",
      priority: "中",
      startDate: dayjs(),
      dueDate: dayjs().add(7, "day")
    };
  }

  if (type === "bug") {
    return {
      status: "新建",
      severity: "一般",
      reporter: currentUser?.name ?? ""
    };
  }

  if (type === "risk") {
    return {
      level: "中"
    };
  }

  if (type === "requirement") {
    return {
      priority: "P1",
      status: "待评审"
    };
  }

  if (type === "requirementVersion") {
    return {
      status: "规划中",
      startDate: dayjs(),
      releaseDate: dayjs().add(30, "day")
    };
  }

  return {
    type: "PRD",
    updatedAt: dayjs()
  };
}

// 编辑项目时把后端日期字符串恢复为日期对象，保证 DatePicker 正常回显。
export function getProjectFormValues(project: Project) {
  return {
    ...project,
    dueDate: dayjs(project.dueDate),
    milestones: project.milestones.map((milestone) => ({
      ...milestone,
      dueDate: dayjs(milestone.dueDate)
    }))
  };
}

// 任务编辑复用表单字段，因此进入抽屉前统一转换日期类型。
export function getTaskFormValues(task: Task) {
  return {
    ...task,
    startDate: dayjs(task.startDate),
    dueDate: dayjs(task.dueDate)
  };
}

// Bug 附件需要转换为 Upload 文件列表，否则编辑页无法展示已上传材料。
export function getBugFormValues(bug: BugReport) {
  return {
    ...bug,
    attachments: bug.attachments?.map(createBugAttachmentUploadFile) ?? []
  };
}

// 需求版本周期字段回填给 DatePicker，避免表单里混用字符串和日期对象。
export function getRequirementVersionFormValues(version: RequirementVersion) {
  return {
    ...version,
    startDate: dayjs(version.startDate),
    releaseDate: dayjs(version.releaseDate)
  };
}

// AI 分析结果以数组入库但以隐藏字段提交，编辑时序列化成字符串保持兼容。
export function getRequirementFormValues(requirement: Requirement) {
  return {
    ...requirement,
    aiRisks: JSON.stringify(requirement.aiRisks ?? []),
    aiMissingItems: JSON.stringify(requirement.aiMissingItems ?? []),
    aiFrontendNotes: JSON.stringify(requirement.aiFrontendNotes ?? []),
    aiBackendNotes: JSON.stringify(requirement.aiBackendNotes ?? []),
    aiTestingNotes: JSON.stringify(requirement.aiTestingNotes ?? [])
  };
}

// 外部链接只允许 http/https，避免把 javascript 等不安全协议渲染为可点击链接。
export function getSafeExternalUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

// 表单层校验和展示层过滤共用同一套 URL 规则。
export function validateExternalUrl(_: unknown, value?: string) {
  if (!value?.trim() || getSafeExternalUrl(value)) {
    return Promise.resolve();
  }

  return Promise.reject(new Error("请输入 http 或 https 开头的完整链接"));
}

// 提交前递归清洗表单值，重点处理 dayjs 对象和 Upload 文件列表。
function serializeCreateValue(value: unknown, key = ""): unknown {
  if (dayjs.isDayjs(value)) {
    return value.format(key === "updatedAt" ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD");
  }

  if (key === "attachments") {
    return serializeBugAttachments(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeCreateValue(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        serializeCreateValue(childValue, childKey)
      ])
    );
  }

  return value;
}

// 记录创建和更新都走同一套序列化，保证 PATCH/POST 数据形态一致。
export function serializeCreateValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, serializeCreateValue(value, key)])
  );
}

// 成员更新接口要求展开通知字段，这里把展示模型转换为表单提交模型。
export function getMemberFormValues(member: DashboardMember) {
  return {
    workspaceId: member.workspaceId,
    name: member.name,
    email: member.email,
    avatarUrl: member.avatarUrl,
    role: member.role,
    status: member.status,
    feishuEnabled: member.notification.feishuEnabled,
    feishuOpenId: member.notification.feishuOpenId,
    feishuUnionId: member.notification.feishuUnionId,
    feishuUserId: member.notification.feishuUserId,
    taskAssigned: member.notification.taskAssigned,
    requirementChanged: member.notification.requirementChanged,
    channels: member.notification.channels
  };
}

// Upload 事件包装较深，抽屉表单只关心最终 fileList。
export function getUploadFileList(event: unknown) {
  if (Array.isArray(event)) {
    return event;
  }

  return (event as { fileList?: UploadFile[] })?.fileList;
}

// 文档拆解只接受单文件上传，提交前取出原始 File 对象交给 FormData。
export function getSelectedUploadFile(value: unknown) {
  const fileList = Array.isArray(value) ? (value as UploadFile[]) : [];
  const file = fileList[0]?.originFileObj;

  return file instanceof File ? file : null;
}
