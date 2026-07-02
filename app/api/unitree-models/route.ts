import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { findUnitreeModel, unitreeModelCatalog } from "@/lib/unitree-models/catalog";

export const runtime = "nodejs";

const defaultModelDirectory = "/Users/liushurui/Desktop/unitree_model_glb";

function getModelDirectory() {
  return process.env.UNITREE_GLB_DIR || defaultModelDirectory;
}

export async function GET(request: NextRequest) {
  const modelKey = request.nextUrl.searchParams.get("model");

  // 没有指定模型时返回轻量目录，便于独立预览页在不读取二进制文件的情况下渲染选择器。
  if (!modelKey) {
    return NextResponse.json({
      directory: getModelDirectory(),
      models: unitreeModelCatalog,
    });
  }

  const model = findUnitreeModel(modelKey);

  if (!model) {
    return NextResponse.json({ error: "未知的 Unitree 模型" }, { status: 404 });
  }

  const modelDirectory = getModelDirectory();
  const filePath = `${modelDirectory.replace(/\/$/, "")}/${model.fileName}`;

  try {
    const fileStat = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath));

    // GLB 文件只从白名单目录和白名单文件名读取，避免 query 参数被用来访问任意本地文件。
    return new Response(stream as ReadableStream, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(fileStat.size),
        "Content-Type": "model/gltf-binary",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "没有找到本地 GLB 文件",
        expectedPath: filePath,
      },
      { status: 404 }
    );
  }
}
