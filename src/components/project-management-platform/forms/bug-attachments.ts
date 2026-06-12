import { Upload } from "antd";
import type { ComponentProps } from "react";
import type { UploadFile } from "antd/es/upload/interface";
import { fetchWithAuthRedirect } from "@/components/project-management-platform/api";
import type { BugAttachment } from "@/types/dashboard";

export type BugAttachmentUploadFile = UploadFile & Partial<BugAttachment> & {
  response?: {
    attachment?: BugAttachment;
  };
};

export type UploadCustomRequestOptions = Parameters<NonNullable<ComponentProps<typeof Upload>["customRequest"]>>[0];

// 将已入库的复现材料转换为 Ant Design Upload 能识别的文件结构。
export function createBugAttachmentUploadFile(attachment: BugAttachment): BugAttachmentUploadFile {
  return {
    uid: attachment.id,
    id: attachment.id,
    key: attachment.key,
    name: attachment.name,
    status: "done",
    type: attachment.type,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: attachment.url,
    uploadedAt: attachment.uploadedAt
  };
}

// Upload 组件会混合本地状态和接口响应，这里只提取可持久化的附件字段。
function getBugAttachmentFromUploadFile(file: BugAttachmentUploadFile): BugAttachment | null {
  const attachment = file.response?.attachment;

  if (attachment) {
    return attachment;
  }

  if (!file.id || !file.key || !file.name || !file.url || !file.mimeType || !file.uploadedAt) {
    return null;
  }

  return {
    id: file.id,
    key: file.key,
    name: file.name,
    url: file.url,
    type: file.type === "video" ? "video" : "image",
    mimeType: file.mimeType,
    size: typeof file.size === "number" ? file.size : 0,
    uploadedAt: file.uploadedAt
  };
}

// 提交 Bug 表单时只保留上传成功的复现材料，避免保存半成品文件。
export function serializeBugAttachments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getBugAttachmentFromUploadFile(item as BugAttachmentUploadFile))
    .filter((item): item is BugAttachment => Boolean(item));
}

// 上传事件在新增和编辑场景形态不同，归一化后让表单校验只看 fileList。
export function normalizeBugAttachmentUploadEvent(event: BugAttachmentUploadFile[] | { fileList?: BugAttachmentUploadFile[] }) {
  const fileList = Array.isArray(event) ? event : event?.fileList ?? [];

  return fileList.map((file) => {
    const attachment = getBugAttachmentFromUploadFile(file);

    return {
      ...file,
      ...(attachment ? createBugAttachmentUploadFile(attachment) : {}),
      status: file.status,
      uid: file.uid
    };
  });
}

// 复现材料直接上传到后端附件接口，前端只负责文件类型校验和进度回填。
export async function uploadBugAttachment(options: UploadCustomRequestOptions) {
  const { file, onError, onProgress, onSuccess } = options;

  try {
    if (!(file instanceof File)) {
      throw new Error("请选择有效的图片或视频文件");
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      throw new Error("仅支持上传图片或视频材料");
    }

    onProgress?.({ percent: 20 });

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetchWithAuthRedirect("/api/bug-attachments", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json().catch(() => null)) as { attachment?: BugAttachment; error?: string } | null;

    if (!response.ok || !payload?.attachment) {
      throw new Error(payload?.error || "上传复现材料失败");
    }

    onProgress?.({ percent: 100 });
    onSuccess?.({ attachment: payload.attachment });
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error("上传复现材料失败"));
  }
}
