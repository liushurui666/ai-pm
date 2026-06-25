import { NextRequest, NextResponse } from "next/server";
import { isAuthServiceConfigured } from "@/lib/auth/unified-auth";
import { getSession } from "@/lib/auth/session";
import { BugAttachmentUploadError, createBugAttachmentFromFile } from "@/lib/bug-attachments/cos";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isAuthServiceConfigured() && !session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传图片或视频文件" }, { status: 400 });
    }

    // 路由只负责登录态、FormData 解析和 HTTP 状态码转换；COS 签名、文件校验和上传细节沉到 lib，
    // 方便脚本用 mock fetch 覆盖成功/失败分支，而不会在每次全链路冒烟时往 COS 写入垃圾对象。
    const attachment = await createBugAttachmentFromFile(file);

    return NextResponse.json({ attachment });
  } catch (error) {
    if (error instanceof BugAttachmentUploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "上传复现材料失败" }, { status: 500 });
  }
}
