import { getFeishuTenantAccessToken } from "@/lib/feishu-client";

type FeishuMessageResponse = {
  code: number;
  msg?: string;
  message?: string;
};

export async function sendFeishuBotText(openId: string, text: string) {
  return sendFeishuBotMessage(openId, "text", {
    text
  });
}

function getAppUrl(view?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3003";
  const url = new URL("/", baseUrl);

  if (view) {
    url.searchParams.set("view", view);
  }

  return url.toString();
}

async function sendFeishuBotMessage(openId: string, msgType: "text" | "interactive", content: object) {
  const accessToken = await getFeishuTenantAccessToken();
  const url = new URL("https://open.feishu.cn/open-apis/im/v1/messages");
  url.searchParams.set("receive_id_type", "open_id");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      receive_id: openId,
      msg_type: msgType,
      content: JSON.stringify(content)
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuMessageResponse;

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || payload.message || "飞书机器人消息发送失败");
  }
}

export async function sendFeishuBotTaskCard({
  openId,
  text,
  title,
  view
}: {
  openId: string;
  text: string;
  title: string;
  view?: string;
}) {
  return sendFeishuBotMessage(openId, "interactive", {
    config: {
      wide_screen_mode: true
    },
    header: {
      title: {
        tag: "plain_text",
        content: title
      },
      template: "blue"
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: text
        }
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: {
              tag: "plain_text",
              content: "打开 AI PM"
            },
            type: "primary",
            url: getAppUrl(view)
          }
        ]
      }
    ]
  });
}
