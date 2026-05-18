import { getFeishuTenantAccessToken } from "@/lib/feishu-client";

type FeishuMessageResponse = {
  code: number;
  msg?: string;
  message?: string;
};

export async function sendFeishuBotText(openId: string, text: string) {
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
      msg_type: "text",
      content: JSON.stringify({
        text
      })
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as FeishuMessageResponse;

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || payload.message || "飞书机器人消息发送失败");
  }
}
