import crypto from "node:crypto";
import type { BugAttachment } from "@/types/dashboard";

const DEFAULT_BUCKET = "ai-1350977987";
const DEFAULT_REGION = "ap-guangzhou";
const DEFAULT_DOMAIN = "ai-1350977987.cos.ap-guangzhou.myqcloud.com";
const DEFAULT_PREFIX = "bug-materials";
const DEFAULT_MAX_FILE_SIZE = 200 * 1024 * 1024;

type CosEnv = Record<string, string | undefined>;

export type BugAttachmentCosConfig = {
  bucket: string;
  domain: string;
  maxFileSize: number;
  prefix: string;
  region: string;
  secretId?: string;
  secretKey?: string;
};

export type CreateBugAttachmentOptions = {
  config?: BugAttachmentCosConfig;
  fetchImpl?: typeof fetch;
  now?: Date;
  randomUUID?: () => string;
};

export class BugAttachmentUploadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BugAttachmentUploadError";
    this.status = status;
  }
}

function sha1(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function hmacSha1(key: string, value: string) {
  return crypto.createHmac("sha1", key).update(value).digest("hex");
}

function encodeCosPart(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function createCosAuthorization({
  headers,
  objectKey,
  secretId,
  secretKey
}: {
  headers: Record<string, string>;
  objectKey: string;
  secretId: string;
  secretKey: string;
}) {
  const startTime = Math.floor(Date.now() / 1000);
  const endTime = startTime + 600;
  const keyTime = `${startTime};${endTime}`;
  const headerEntries = Object.entries(headers)
    .map(([key, value]) => [encodeCosPart(key.toLowerCase()), encodeCosPart(value.trim())] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const headerList = headerEntries.map(([key]) => key).join(";");
  const httpHeaders = headerEntries.map(([key, value]) => `${key}=${value}`).join("&");
  const httpString = `put\n/${objectKey}\n\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signKey = hmacSha1(secretKey, keyTime);
  const signature = hmacSha1(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
    `q-signature=${signature}`
  ].join("&");
}

export function getBugAttachmentType(mimeType: string): BugAttachment["type"] | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return null;
}

export function getBugAttachmentExtension(file: File) {
  const fromName = file.name.split(".").pop()?.trim().toLowerCase();

  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) {
    return fromName;
  }

  const [, subtype] = file.type.split("/");

  return subtype?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
}

export function sanitizeBugAttachmentFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "bug-material";
}

export function getBugAttachmentCosConfig(env: CosEnv = process.env) {
  const bucket = env.TENCENT_COS_BUCKET || DEFAULT_BUCKET;
  const region = env.TENCENT_COS_REGION || DEFAULT_REGION;
  const fallbackDomain = bucket === DEFAULT_BUCKET && region === DEFAULT_REGION ? DEFAULT_DOMAIN : `${bucket}.cos.${region}.myqcloud.com`;
  const maxFileSize = Number(env.BUG_ATTACHMENT_MAX_BYTES || DEFAULT_MAX_FILE_SIZE);

  return {
    bucket,
    domain: env.TENCENT_COS_DOMAIN || fallbackDomain,
    maxFileSize: Number.isFinite(maxFileSize) ? maxFileSize : DEFAULT_MAX_FILE_SIZE,
    prefix: (env.TENCENT_COS_BUG_PREFIX || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ""),
    region,
    secretId: env.TENCENT_COS_SECRET_ID,
    secretKey: env.TENCENT_COS_SECRET_KEY
  };
}

export function assertBugAttachmentCosConfig(config: BugAttachmentCosConfig) {
  if (!config.secretId || !config.secretKey) {
    throw new BugAttachmentUploadError(
      "腾讯云 COS 密钥未配置，请在 .env.local 中设置 TENCENT_COS_SECRET_ID 和 TENCENT_COS_SECRET_KEY。",
      500
    );
  }
}

function formatBugAttachmentMaxFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${Math.round(size / 1024 / 1024)}MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)}KB`;
  }

  return `${size}B`;
}

export function assertBugAttachmentFile(file: File, config: BugAttachmentCosConfig) {
  const attachmentType = getBugAttachmentType(file.type);

  if (!attachmentType) {
    throw new BugAttachmentUploadError("仅支持上传图片或视频材料", 400);
  }

  if (file.size > config.maxFileSize) {
    // 生产默认是 200MB，但测试/灰度环境可能把上限调到 KB/B 级别；
    // 文案按实际单位展示，避免出现“不能超过 0MB”这种让用户困惑的边界提示。
    throw new BugAttachmentUploadError(`文件不能超过 ${formatBugAttachmentMaxFileSize(config.maxFileSize)}`, 400);
  }

  return attachmentType;
}

export async function createBugAttachmentFromFile(file: File, options: CreateBugAttachmentOptions = {}) {
  const config = options.config ?? getBugAttachmentCosConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const randomUUID = options.randomUUID ?? crypto.randomUUID;

  // 上传校验必须在读取文件内容和请求 COS 之前完成；这样类型/大小/密钥错误能快速返回可读信息，
  // 也避免无效请求把大文件读进内存或打到外部对象存储。
  assertBugAttachmentCosConfig(config);
  const attachmentType = assertBugAttachmentFile(file, config);
  const extension = getBugAttachmentExtension(file);
  const datePath = now.toISOString().slice(0, 10);
  const objectKey = `${config.prefix}/${datePath}/${randomUUID()}-${sanitizeBugAttachmentFileName(file.name)}.${extension}`;
  const uploadUrl = `https://${config.domain}/${objectKey}`;
  const body = Buffer.from(await file.arrayBuffer());
  const signedHeaders = {
    "content-type": file.type,
    host: config.domain,
    "x-cos-acl": "public-read"
  };
  const authorization = createCosAuthorization({
    headers: signedHeaders,
    objectKey,
    secretId: config.secretId!,
    secretKey: config.secretKey!
  });
  const response = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": file.type,
      "x-cos-acl": "public-read"
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    throw new BugAttachmentUploadError(
      detail ? `上传到腾讯云 COS 失败：${detail.slice(0, 300)}` : "上传到腾讯云 COS 失败",
      502
    );
  }

  const attachment: BugAttachment = {
    id: randomUUID(),
    key: objectKey,
    name: file.name,
    url: uploadUrl,
    type: attachmentType,
    mimeType: file.type,
    size: file.size,
    uploadedAt: now.toISOString()
  };

  return attachment;
}
