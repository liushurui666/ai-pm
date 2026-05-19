import { getFeishuTenantAccessToken } from "@/lib/feishu-client";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

type FeishuApiPayload<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

type ParsedFeishuLink = {
  type: "docx" | "wiki" | "doc";
  token: string;
};

type WikiNodeData = {
  node?: {
    obj_token?: string;
    obj_type?: string;
    title?: string;
  };
};

type DocxRawContentData = {
  content?: string;
};

function parseFeishuDocumentLink(link: string): ParsedFeishuLink {
  let url: URL;

  try {
    url = new URL(link.trim());
  } catch {
    throw new Error("请输入完整的飞书文档链接");
  }

  const host = url.hostname.toLowerCase();

  if (!host.includes("feishu.cn") && !host.includes("larksuite.com")) {
    throw new Error("当前仅支持飞书/Lark 文档链接");
  }

  const [type, token] = url.pathname
    .split("/")
    .filter(Boolean)
    .map((item) => item.trim());

  if (!token) {
    throw new Error("没有从链接中识别到飞书文档 token");
  }

  if (type === "docx" || type === "wiki" || type === "doc") {
    return { type, token };
  }

  throw new Error("当前支持飞书新版文档 docx 和知识库 wiki 链接");
}

async function requestFeishu<T>(path: string) {
  const token = await getFeishuTenantAccessToken();
  const response = await fetch(`${FEISHU_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => null)) as FeishuApiPayload<T> | null;

  if (!response.ok || payload?.code !== 0) {
    throw new Error(payload?.msg || `飞书接口请求失败（${response.status}）`);
  }

  return payload.data;
}

async function resolveWikiNode(token: string) {
  const params = new URLSearchParams({
    token,
    obj_type: "wiki"
  });
  const data = await requestFeishu<WikiNodeData>(`/wiki/v2/spaces/get_node?${params.toString()}`);
  const node = data?.node;

  if (!node?.obj_token || !node.obj_type) {
    throw new Error("未能识别知识库节点对应的文档");
  }

  return {
    token: node.obj_token,
    type: node.obj_type,
    title: node.title ?? "飞书知识库文档"
  };
}

async function readDocxRawContent(documentId: string) {
  const data = await requestFeishu<DocxRawContentData>(
    `/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`
  );
  const content = data?.content?.trim();

  if (!content) {
    throw new Error("飞书文档没有返回可分析的正文内容");
  }

  return content;
}

export async function readFeishuDocumentFromLink(link: string) {
  const parsed = parseFeishuDocumentLink(link);

  if (parsed.type === "doc") {
    throw new Error("检测到旧版飞书文档，请先转为新版 docx 文档后再分析");
  }

  if (parsed.type === "wiki") {
    const node = await resolveWikiNode(parsed.token);

    if (node.type !== "docx") {
      throw new Error("当前知识库节点不是新版文档，暂无法直接分析");
    }

    return {
      title: node.title,
      content: await readDocxRawContent(node.token)
    };
  }

  return {
    title: "飞书需求文档",
    content: await readDocxRawContent(parsed.token)
  };
}
