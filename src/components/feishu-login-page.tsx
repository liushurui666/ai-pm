"use client";

import { Alert, Button, Card, ConfigProvider, Space, Tag, Typography, theme } from "antd";
import { LoginOutlined, ThunderboltOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title, Text, Paragraph } = Typography;

const errorMessageMap: Record<string, string> = {
  missing_feishu_config: "飞书登录尚未配置，请先补充 FEISHU_APP_ID 和 FEISHU_APP_SECRET。",
  invalid_state: "登录状态校验失败，请重新发起飞书登录。"
};

export function FeishuLoginPage({ configured, error }: { configured: boolean; error?: string }) {
  const errorMessage = error ? errorMessageMap[error] ?? error : "";

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#2563eb",
          borderRadius: 8
        }
      }}
    >
      <main className="login-shell">
        <section className="login-hero">
          <div className="login-brand-mark">
            <ThunderboltOutlined />
          </div>
          <Tag color="blue">AI 项目管理平台</Tag>
          <Title>用飞书账号安全登录</Title>
          <Paragraph>
            登录后系统会根据你的飞书身份读取已授权的项目数据源，并在项目驾驶舱中展示真实项目、任务和风险。
          </Paragraph>
        </section>

        <Card className="login-card">
          <Space orientation="vertical" size={18} className="pm-wide">
            <div>
              <Title level={3}>飞书登录</Title>
              <Text type="secondary">请使用企业内部应用的 App ID、App Secret 和回调地址完成配置。</Text>
            </div>

            {errorMessage ? <Alert type="error" showIcon title={errorMessage} /> : null}

            {!configured ? (
              <Alert
                type="warning"
                showIcon
                title="当前缺少飞书登录配置，已允许本地演示模式继续访问。"
              />
            ) : null}

            <Button
              type="primary"
              size="large"
              icon={<LoginOutlined />}
              href={configured ? "/api/auth/feishu/start" : undefined}
              disabled={!configured}
              block
            >
              使用飞书登录
            </Button>

            {!configured ? (
              <Link href="/">
                <Button size="large" block>
                  进入本地演示数据
                </Button>
              </Link>
            ) : null}
          </Space>
        </Card>
      </main>
    </ConfigProvider>
  );
}
