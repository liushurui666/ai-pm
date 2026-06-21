import { Resend } from "resend";
import { assertEmailNotificationConfigured, getEmailNotificationSettings } from "@/lib/notifications/email/settings";
import { renderDashboardNotificationEmail } from "@/lib/notifications/email/template";

let resendClient: Resend | undefined;

function getResendClient(apiKey: string) {
  if (!resendClient) {
    // worker 会长时间运行，Resend client 复用同一个实例即可，避免每个 job 都重新初始化发送器。
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

export async function sendDashboardNotificationEmail(input: {
  to: string;
  title: string;
  text: string;
  view?: string;
  idempotencyKey: string;
}) {
  const settings = getEmailNotificationSettings();
  assertEmailNotificationConfigured(settings);

  const email = renderDashboardNotificationEmail({
    title: input.title,
    text: input.text,
    view: input.view
  });
  const { data, error } = await getResendClient(settings.apiKey).emails.send({
    from: settings.from,
    to: [input.to],
    subject: input.title,
    html: email.html,
    text: email.text,
    replyTo: settings.replyTo
  }, {
    // Resend 幂等键能覆盖 BullMQ/MySQL worker 重试场景，避免同一个后台 job 被重复投递成多封邮件。
    idempotencyKey: input.idempotencyKey.slice(0, 256)
  });

  if (error) {
    throw new Error(error.message || "Resend 邮箱通知发送失败。");
  }

  return data;
}
