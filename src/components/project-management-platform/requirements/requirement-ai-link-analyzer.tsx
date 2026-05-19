"use client";

import { Alert, App, Button, Card, Progress, Space, Tag, Typography } from "antd";
import type { FormInstance } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { useState } from "react";
import type { RequirementAnalyzeResult } from "@/types/records";

const { Text, Paragraph } = Typography;

function getFieldText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function renderTags(items: string[], color: string) {
  if (!items.length) {
    return <Tag color="green">暂未发现明显缺口</Tag>;
  }

  return items.slice(0, 4).map((item) => (
    <Tag color={color} key={item}>
      {item}
    </Tag>
  ));
}

export function RequirementAiLinkAnalyzer({ form }: { form: FormInstance<Record<string, unknown>> }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<RequirementAnalyzeResult | null>(null);

  async function analyzeRequirementLink() {
    setLoading(true);

    try {
      await form.validateFields(["documentLink"]);
      const documentLink = getFieldText(form.getFieldValue("documentLink"));

      if (!documentLink) {
        message.warning("请先填写飞书需求文档链接");

        return;
      }

      const response = await fetch("/api/requirements/analyze-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentLink,
          title: getFieldText(form.getFieldValue("title")),
          versionName: getFieldText(form.getFieldValue("versionName"))
        })
      });
      const payload = (await response.json()) as RequirementAnalyzeResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error || "分析飞书需求文档失败" : "分析飞书需求文档失败");
      }

      const analysisPayload = payload as RequirementAnalyzeResult;

      setAnalysis(analysisPayload);
      form.setFieldsValue({
        title: getFieldText(form.getFieldValue("title")) || analysisPayload.title,
        priority: analysisPayload.suggestedPriority,
        status: analysisPayload.suggestedStatus,
        acceptance: analysisPayload.acceptance,
        aiSummary: analysisPayload.summary,
        aiRisks: JSON.stringify(analysisPayload.risks),
        aiMissingItems: JSON.stringify(analysisPayload.missingItems),
        aiFrontendNotes: JSON.stringify(analysisPayload.frontendNotes),
        aiBackendNotes: JSON.stringify(analysisPayload.backendNotes),
        aiTestingNotes: JSON.stringify(analysisPayload.testingNotes),
        aiCompletenessScore: analysisPayload.completenessScore
      });
      message.success(analysisPayload.message);

      if (analysisPayload.warning) {
        message.warning(analysisPayload.warning);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "分析飞书需求文档失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="requirement-ai-card" size="small">
      <Space className="requirement-ai-card-head" align="start" wrap>
        <div>
          <Text strong>AI 需求体检</Text>
          <Paragraph type="secondary">
            填入飞书新版文档或知识库链接后，系统会读取正文并生成摘要、验收标准、缺失项和研发测试关注点。
          </Paragraph>
        </div>
        <Button type="primary" icon={<RobotOutlined />} loading={loading} onClick={analyzeRequirementLink}>
          读取飞书文档并分析
        </Button>
      </Space>

      {analysis ? (
        <div className="requirement-ai-result">
          {analysis.warning ? <Alert type="warning" showIcon message={analysis.warning} /> : null}
          <div className="requirement-ai-score">
            <Progress
              percent={analysis.completenessScore}
              size="small"
              status={analysis.completenessScore >= 80 ? "success" : "active"}
            />
            <Text type="secondary">{analysis.documentTitle}</Text>
          </div>
          <Paragraph>{analysis.summary}</Paragraph>
          <Space size={[6, 6]} wrap>
            <Tag color="blue">{analysis.suggestedPriority}</Tag>
            <Tag color="cyan">{analysis.suggestedStatus}</Tag>
            {renderTags(analysis.missingItems, "orange")}
          </Space>
        </div>
      ) : null}
    </Card>
  );
}
