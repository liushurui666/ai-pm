import { NextRequest, NextResponse } from "next/server";
import {
  createAiRequirementAnalysis,
  createFallbackRequirementAnalysis,
  isAiAssistantConfigured
} from "@/lib/ai-client";
import { isFeishuAuthConfigured } from "@/lib/feishu-auth";
import { readFeishuDocumentFromLink } from "@/lib/requirements/feishu-document";
import { getSession } from "@/lib/session";

const MAX_REQUIREMENT_TEXT_LENGTH = 30_000;

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (isFeishuAuthConfigured() && !session) {
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
    documentLink?: string;
    title?: string;
    versionName?: string;
  } | null;
  const documentLink = body?.documentLink?.trim();

  if (!documentLink) {
    return NextResponse.json(
      {
        error: "请先填写飞书需求文档链接"
      },
      {
        status: 400
      }
    );
  }

  try {
    const document = await readFeishuDocumentFromLink(documentLink);
    const documentText = document.content.slice(0, MAX_REQUIREMENT_TEXT_LENGTH);

    if (documentText.length < 20) {
      return NextResponse.json(
        {
          error: "飞书文档内容过少，无法分析需求"
        },
        {
          status: 400
        }
      );
    }

    if (!isAiAssistantConfigured()) {
      return NextResponse.json(
        createFallbackRequirementAnalysis({
          documentTitle: document.title,
          documentText,
          warning: "AI_API_KEY 未配置，已使用本地规则生成需求体检。"
        })
      );
    }

    try {
      return NextResponse.json(
        await createAiRequirementAnalysis({
          documentText,
          documentTitle: document.title,
          requirementTitle: body?.title,
          versionName: body?.versionName
        })
      );
    } catch (error) {
      return NextResponse.json(
        createFallbackRequirementAnalysis({
          documentTitle: document.title,
          documentText,
          warning: `AI 模型调用失败，已使用本地规则生成需求体检：${error instanceof Error ? error.message : "未知错误"}`
        })
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取飞书需求文档失败";
    const isUserInputError =
      message.includes("请输入") ||
      message.includes("仅支持") ||
      message.includes("没有从链接") ||
      message.includes("旧版") ||
      message.includes("不是新版");

    return NextResponse.json(
      {
        error: message
      },
      {
        status: isUserInputError ? 400 : 502
      }
    );
  }
}
