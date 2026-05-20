"use client";

import { Col, Form, Input, InputNumber, Row, Select } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { RequirementAiLinkAnalyzer } from "@/components/project-management-platform/requirements/requirement-ai-link-analyzer";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";
import { validateExternalUrl } from "@/components/project-management-platform/forms/form-utils";
import { RequirementVersionSelectField } from "@/components/project-management-platform/forms/version-fields";
import { requirementStatusOptions } from "@/lib/requirements/requirement-quality";

// 需求字段整合版本、负责人、链接分析和 AI 补全结果，保证需求质量数据一起提交。
export function RequirementFields({
  form,
  versionOptions,
  people,
  peopleLoading,
  peopleError
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
}) {
  return (
    <>
      <Form.Item label="需求标题" name="title" rules={[{ required: true, message: "请输入需求标题" }]}>
        <Input placeholder="例如：会议纪要自动转任务" />
      </Form.Item>
      <RequirementVersionSelectField
        form={form}
        versionOptions={versionOptions}
        versionLabel="需求版本"
        versionMessage="请选择需求版本"
      />
      <OwnerSelect
        form={form}
        people={people}
        loading={peopleLoading}
        error={peopleError}
        label="需求负责人"
      />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="优先级" name="priority">
            <Select options={["P0", "P1", "P2"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="状态" name="status">
            <Select options={requirementStatusOptions.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="UI 设计链接" name="uiLink" rules={[{ validator: validateExternalUrl }]}>
            <Input prefix={<LinkOutlined />} placeholder="例如：https://www.figma.com/design/..." />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="需求文档链接" name="documentLink" rules={[{ validator: validateExternalUrl }]}>
            <Input prefix={<LinkOutlined />} placeholder="例如：https://xxx.feishu.cn/docx/..." />
          </Form.Item>
        </Col>
      </Row>
      <RequirementAiLinkAnalyzer form={form} />
      <Form.Item label="验收标准" name="acceptance">
        <Input.TextArea rows={4} placeholder="可量化的验收条件和边界场景" />
      </Form.Item>
      <Form.Item name="aiSummary" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiRisks" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiMissingItems" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiFrontendNotes" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiBackendNotes" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiTestingNotes" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiCompletenessScore" hidden>
        <InputNumber />
      </Form.Item>
    </>
  );
}
