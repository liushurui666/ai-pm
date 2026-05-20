import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { getSession } from "@/lib/session";
import type { BugAttachment } from "@/types/dashboard";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "ai-1350977987";
const DEFAULT_REGION = "ap-guangzhou";
const DEFAULT_DOMAIN = "ai-1350977987.cos.ap-guangzhou.myqcloud.com";
const DEFAULT_PREFIX = "bug-materials";
const DEFAULT_MAX_FILE_SIZE = 200 * 1024 * 1024;

function sha1(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function hmacSha1(key: string, value: string) {
  return crypto.createHmac("sha1", key).update(value).digest("hex");
}

function encodeCosPart(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function createCosAuthorization({
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

function getFileType(mimeType: string): BugAttachment["type"] | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return null;
}

function getExtension(file: File) {
  const fromName = file.name.split(".").pop()?.trim().toLowerCase();

  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) {
    return fromName;
  }

  const [, subtype] = file.type.split("/");

  return subtype?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "bug-material";
}

function getCosConfig() {
  const secretId = process.env.TENCENT_COS_SECRET_ID;
  const secretKey = process.env.TENCENT_COS_SECRET_KEY;
  const bucket = process.env.TENCENT_COS_BUCKET || DEFAULT_BUCKET;
  const region = process.env.TENCENT_COS_REGION || DEFAULT_REGION;
  const fallbackDomain = bucket === DEFAULT_BUCKET && region === DEFAULT_REGION ? DEFAULT_DOMAIN : `${bucket}.cos.${region}.myqcloud.com`;
  const domain = process.env.TENCENT_COS_DOMAIN || fallbackDomain;
  const prefix = process.env.TENCENT_COS_BUG_PREFIX || DEFAULT_PREFIX;
  const maxFileSize = Number(process.env.BUG_ATTACHMENT_MAX_BYTES || DEFAULT_MAX_FILE_SIZE);

  return {
    bucket,
    domain,
    maxFileSize: Number.isFinite(maxFileSize) ? maxFileSize : DEFAULT_MAX_FILE_SIZE,
    prefix: prefix.replace(/^\/+|\/+$/g, ""),
    region,
    secretId,
    secretKey
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isFeishuAuthConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const config = getCosConfig();

  if (!config.secretId || !config.secretKey) {
    return NextResponse.json(
      {
        error: "腾讯云 COS 密钥未配置，请在 .env.local 中设置 TENCENT_COS_SECRET_ID 和 TENCENT_COS_SECRET_KEY。"
      },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传图片或视频文件" }, { status: 400 });
  }

  const attachmentType = getFileType(file.type);

  if (!attachmentType) {
    return NextResponse.json({ error: "仅支持上传图片或视频材料" }, { status: 400 });
  }

  if (file.size > config.maxFileSize) {
    return NextResponse.json({ error: `文件不能超过 ${Math.round(config.maxFileSize / 1024 / 1024)}MB` }, { status: 400 });
  }

  const extension = getExtension(file);
  const datePath = new Date().toISOString().slice(0, 10);
  const objectKey = `${config.prefix}/${datePath}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}.${extension}`;
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
    secretId: config.secretId,
    secretKey: config.secretKey
  });
  const response = await fetch(uploadUrl, {
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

    return NextResponse.json(
      {
        error: detail ? `上传到腾讯云 COS 失败：${detail.slice(0, 300)}` : "上传到腾讯云 COS 失败"
      },
      { status: 502 }
    );
  }

  const attachment: BugAttachment = {
    id: crypto.randomUUID(),
    key: objectKey,
    name: file.name,
    url: uploadUrl,
    type: attachmentType,
    mimeType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString()
  };

  return NextResponse.json({ attachment });
}
