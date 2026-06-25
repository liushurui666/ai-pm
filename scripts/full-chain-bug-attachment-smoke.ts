import { config as loadEnv } from "dotenv";
import {
  BugAttachmentUploadError,
  assertBugAttachmentCosConfig,
  assertBugAttachmentFile,
  createBugAttachmentFromFile,
  getBugAttachmentCosConfig,
  getBugAttachmentExtension,
  getBugAttachmentType,
  sanitizeBugAttachmentFileName
} from "@/lib/bug-attachments/cos";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

type FetchCall = {
  bodySize: number;
  contentType: string | null;
  method: string;
  url: string;
  xCosAcl: string | null;
};

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectUploadError(action: () => Promise<unknown> | unknown, status: number, messagePart: string) {
  try {
    await action();
  } catch (error) {
    assertSmoke(error instanceof BugAttachmentUploadError, "应抛出 BugAttachmentUploadError");
    assertSmoke(error.status === status, `错误状态码应为 ${status}`);
    assertSmoke(error.message.includes(messagePart), `错误信息应包含：${messagePart}`);
    return {
      message: error.message,
      status: error.status
    };
  }

  throw new Error(`预期抛出 ${status} 错误，但流程成功了`);
}

function createTestFile(content: string, name: string, type: string) {
  return new File([content], name, {
    type
  });
}

function createMockFetch(status = 200, body = "") {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const requestBody = init?.body;
    const bodySize = requestBody instanceof Buffer
      ? requestBody.length
      : requestBody instanceof Uint8Array
        ? requestBody.byteLength
        : typeof requestBody === "string"
          ? Buffer.byteLength(requestBody)
          : 0;

    calls.push({
      bodySize,
      contentType: headers.get("content-type"),
      method: init?.method ?? "GET",
      url: String(input),
      xCosAcl: headers.get("x-cos-acl")
    });

    return new Response(body, {
      status
    });
  };

  return {
    calls,
    fetchImpl
  };
}

async function verifyConfigAndValidation() {
  const configured = getBugAttachmentCosConfig();
  const defaulted = getBugAttachmentCosConfig({
    TENCENT_COS_SECRET_ID: "secret-id",
    TENCENT_COS_SECRET_KEY: "secret-key",
    TENCENT_COS_BUCKET: "bucket-a",
    TENCENT_COS_REGION: "ap-shanghai",
    TENCENT_COS_BUG_PREFIX: "/qa-bugs/",
    BUG_ATTACHMENT_MAX_BYTES: "not-a-number"
  });
  const validImage = createTestFile("png-bytes", "复现 截图!.png", "image/png");
  const validVideo = createTestFile("video-bytes", "record.webm", "video/webm");
  const textFile = createTestFile("plain", "note.txt", "text/plain");
  const oversizeFile = createTestFile("123456", "large.png", "image/png");

  assertSmoke(configured.maxFileSize > 0, "默认附件大小上限必须为正数");
  assertSmoke(defaulted.domain === "bucket-a.cos.ap-shanghai.myqcloud.com", "自定义 bucket/region 应推导默认 COS 域名");
  assertSmoke(defaulted.prefix === "qa-bugs", "COS prefix 应去掉首尾斜杠");
  assertSmoke(defaulted.maxFileSize > 100 * 1024 * 1024, "非法 BUG_ATTACHMENT_MAX_BYTES 应回退默认 200MB");
  assertSmoke(getBugAttachmentType(validImage.type) === "image", "image/* 应识别为图片附件");
  assertSmoke(getBugAttachmentType(validVideo.type) === "video", "video/* 应识别为视频附件");
  assertSmoke(getBugAttachmentType(textFile.type) === null, "text/plain 不应被识别为可上传附件");
  assertSmoke(getBugAttachmentExtension(validImage) === "png", "应优先从文件名读取扩展名");
  assertSmoke(sanitizeBugAttachmentFileName("复现 截图!.png") === "bug-material", "纯中文/符号文件名应有稳定 fallback");
  assertSmoke(assertBugAttachmentFile(validVideo, defaulted) === "video", "视频文件应通过校验");

  const missingSecret = expectUploadError(() => {
    assertBugAttachmentCosConfig({
      ...defaulted,
      secretId: "",
      secretKey: ""
    });
  }, 500, "TENCENT_COS_SECRET_ID");
  const unsupportedType = expectUploadError(() => {
    assertBugAttachmentFile(textFile, defaulted);
  }, 400, "仅支持上传图片或视频材料");
  const oversize = expectUploadError(() => {
    assertBugAttachmentFile(oversizeFile, {
      ...defaulted,
      maxFileSize: 4
    });
  }, 400, "文件不能超过");

  return {
    configured: {
      hasSecretId: Boolean(configured.secretId),
      hasSecretKey: Boolean(configured.secretKey),
      maxFileSize: configured.maxFileSize
    },
    defaulted: {
      domain: defaulted.domain,
      prefix: defaulted.prefix
    },
    errors: {
      missingSecret: await missingSecret,
      oversize: await oversize,
      unsupportedType: await unsupportedType
    }
  };
}

async function verifyMockUploadSuccess() {
  const mock = createMockFetch(200);
  const file = createTestFile("fake-png", "qa-screen.png", "image/png");
  const attachment = await createBugAttachmentFromFile(file, {
    config: {
      bucket: "bucket-a",
      domain: "bucket-a.cos.ap-guangzhou.myqcloud.com",
      maxFileSize: 1024,
      prefix: "qa-bug-materials",
      region: "ap-guangzhou",
      secretId: "secret-id",
      secretKey: "secret-key"
    },
    fetchImpl: mock.fetchImpl,
    now: new Date("2026-06-25T02:00:00.000Z"),
    randomUUID: (() => {
      const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];

      return () => ids.shift() ?? "00000000-0000-4000-8000-000000000099";
    })()
  });
  const [call] = mock.calls;

  assertSmoke(mock.calls.length === 1, "成功上传应只请求一次 COS");
  assertSmoke(call.method === "PUT", "COS 上传必须使用 PUT");
  assertSmoke(call.contentType === "image/png", "COS 上传应保留文件 MIME");
  assertSmoke(call.xCosAcl === "public-read", "Bug 复现材料应使用 public-read 便于详情页预览");
  assertSmoke(call.bodySize === file.size, "COS 上传 body 大小应等于原文件大小");
  assertSmoke(attachment.type === "image", "返回附件类型应为 image");
  assertSmoke(attachment.name === "qa-screen.png", "返回附件应保留原始文件名");
  assertSmoke(attachment.mimeType === "image/png", "返回附件应保留 MIME");
  assertSmoke(attachment.size === file.size, "返回附件应保留文件大小");
  assertSmoke(attachment.uploadedAt === "2026-06-25T02:00:00.000Z", "返回附件时间应使用上传时间");
  assertSmoke(
    attachment.key === "qa-bug-materials/2026-06-25/00000000-0000-4000-8000-000000000001-qa-screen.png",
    "对象 key 应包含 prefix/date/uuid/安全文件名"
  );
  assertSmoke(call.url === attachment.url, "COS 请求 URL 应等于返回附件 URL");

  return {
    attachment,
    request: call
  };
}

async function verifyMockUploadFailure() {
  const mock = createMockFetch(403, "SignatureDoesNotMatch");
  const file = createTestFile("fake-png", "qa-screen.png", "image/png");
  const failure = await expectUploadError(() =>
    createBugAttachmentFromFile(file, {
      config: {
        bucket: "bucket-a",
        domain: "bucket-a.cos.ap-guangzhou.myqcloud.com",
        maxFileSize: 1024,
        prefix: "qa-bug-materials",
        region: "ap-guangzhou",
        secretId: "secret-id",
        secretKey: "secret-key"
      },
      fetchImpl: mock.fetchImpl
    }), 502, "上传到腾讯云 COS 失败");

  assertSmoke(mock.calls.length === 1, "COS 失败也应只请求一次");

  return {
    failure,
    request: mock.calls[0]
  };
}

async function main() {
  const validation = await verifyConfigAndValidation();
  const success = await verifyMockUploadSuccess();
  const failure = await verifyMockUploadFailure();

  console.log(JSON.stringify({
    ok: true,
    validation,
    mockCos: {
      failure,
      success
    }
  }, null, 2));
}

main().catch((error) => {
  console.error("[full-chain-bug-attachment-smoke] failed", error);
  process.exitCode = 1;
});
