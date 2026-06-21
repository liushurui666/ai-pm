export type EmailNotificationSettings = {
  apiKey: string;
  from: string;
  replyTo?: string;
};

// 邮箱发送配置统一从这里读取，worker 和未来的健康检查都复用同一套必填项，避免不同入口漏配后表现不一致。
export function getEmailNotificationSettings(): EmailNotificationSettings {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() || "",
    from: process.env.EMAIL_FROM?.trim() || "",
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined
  };
}

export function assertEmailNotificationConfigured(settings = getEmailNotificationSettings()) {
  if (!settings.apiKey) {
    throw new Error("邮箱通知未配置 RESEND_API_KEY。");
  }

  if (!settings.from) {
    throw new Error("邮箱通知未配置 EMAIL_FROM。");
  }
}
