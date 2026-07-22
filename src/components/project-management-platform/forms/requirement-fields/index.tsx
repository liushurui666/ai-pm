"use client";

import "./index.less";
import { Col, DatePicker, Form, Input, InputNumber, Row, Select } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { RequirementAiLinkAnalyzer } from "@/components/project-management-platform/requirements/requirement-ai-link-analyzer";
import { createOwnerFormFieldsFromMember, OwnerSelect } from "@/components/project-management-platform/forms/owner-select";
import { validateExternalUrl } from "@/components/project-management-platform/forms/form-utils";
import { RequirementVersionSelectField } from "@/components/project-management-platform/forms/version-fields";
import { requirementStatusOptions } from "@/lib/requirements/requirement-quality";

export type RequirementFieldAccess = {
  design: boolean;
  governance: boolean;
  product: boolean;
};

// 需求字段整合版本、负责人、链接分析和 AI 补全结果，保证需求质量数据一起提交。
export function RequirementFields({
  form,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  fieldAccess = { design: true, governance: true, product: true },
  lockRelations = false
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  fieldAccess?: RequirementFieldAccess;
  lockRelations?: boolean;
}) {
  return (
    <>
      <Form.Item label="需求标题" name="title" rules={[{ required: true, message: "请输入需求标题" }]}>
        <Input disabled={!fieldAccess.product} placeholder="例如：会议纪要自动转任务" />
      </Form.Item>
      <Form.Item label="需求描述" name="description">
        <Input.TextArea disabled={!fieldAccess.product} rows={4} placeholder="说明业务背景、目标用户、范围与不做事项" />
      </Form.Item>
      {lockRelations ? (
        ["versionId", "versionName", "project", "projectId"].map((name) => (
          <Form.Item name={name} hidden key={name}><Input /></Form.Item>
        ))
      ) : (
        <RequirementVersionSelectField
          form={form}
          versionOptions={versionOptions}
          disabled={!fieldAccess.governance}
          versionLabel="需求版本"
          versionMessage="请选择需求版本"
        />
      )}
      <OwnerSelect
        form={form}
        people={people}
        loading={peopleLoading}
        error={peopleError}
        disabled={!fieldAccess.product}
        label="产品负责人"
      />
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="设计负责人" name="designOwnerMemberId">
            <Select
              allowClear
              showSearch
              loading={peopleLoading}
              disabled={!fieldAccess.design || Boolean(peopleError) || !people.length}
              optionFilterProp="label"
              placeholder="从平台成员中选择"
              options={people.map((member) => ({
                value: member.id,
                label: `${member.name}${member.email ? ` · ${member.email}` : ""}`
              }))}
              onChange={(memberId) => {
                const selectedMember = people.find((member) => member.id === memberId);
                const ownerFields = selectedMember ? createOwnerFormFieldsFromMember(selectedMember) : undefined;

                form.setFieldsValue({
                  designOwnerMemberId: selectedMember?.id ?? "",
                  designOwner: selectedMember?.name ?? "",
                  designOwnerOpenId: ownerFields?.ownerOpenId ?? "",
                  designOwnerUnionId: ownerFields?.ownerUnionId ?? "",
                  designOwnerUserId: ownerFields?.ownerUserId ?? "",
                  designOwnerEmail: ownerFields?.ownerEmail ?? "",
                  designOwnerAvatarUrl: ownerFields?.ownerAvatarUrl ?? ""
                });
              }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="开发负责人" name="developerMemberIds">
            <Select
              mode="multiple"
              allowClear
              showSearch
              loading={peopleLoading}
              disabled={!fieldAccess.governance || Boolean(peopleError) || !people.length}
              optionFilterProp="label"
              placeholder="可多选平台成员"
              options={people.map((member) => ({
                value: member.id,
                label: `${member.name}${member.email ? ` · ${member.email}` : ""}`
              }))}
            />
          </Form.Item>
        </Col>
      </Row>
      {["designOwner", "designOwnerOpenId", "designOwnerUnionId", "designOwnerUserId", "designOwnerEmail", "designOwnerAvatarUrl"].map((name) => (
        <Form.Item name={name} hidden key={name}><Input /></Form.Item>
      ))}
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="优先级" name="priority">
            <Select
              disabled={!fieldAccess.product}
              options={[
                { value: "紧急", label: "紧急" },
                { value: "高", label: "高" },
                { value: "普通", label: "普通" },
                { value: "低", label: "低" },
                { value: "P0", label: "P0（兼容）" },
                { value: "P1", label: "P1（兼容）" },
                { value: "P2", label: "P2（兼容）" }
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="状态" name="status">
            <Select disabled={!fieldAccess.governance} options={requirementStatusOptions.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="计划开始" name="startDate">
            <DatePicker className="pm-form-control" disabled={!fieldAccess.governance} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label="计划完成"
            name="dueDate"
            dependencies={["startDate"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("startDate");

                  if (!value || !startDate || !dayjs(value).isBefore(dayjs(startDate), "day")) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error("计划完成日期不能早于开始日期"));
                }
              })
            ]}
          >
            <DatePicker className="pm-form-control" disabled={!fieldAccess.governance} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="UI 设计链接" name="uiLink" rules={[{ validator: validateExternalUrl }]}>
            <Input disabled={!fieldAccess.design} prefix={<LinkOutlined />} placeholder="例如：https://www.figma.com/design/..." />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="需求文档链接" name="documentLink" rules={[{ validator: validateExternalUrl }]}>
            <Input disabled={!fieldAccess.product} prefix={<LinkOutlined />} placeholder="例如：https://xxx.feishu.cn/docx/..." />
          </Form.Item>
        </Col>
      </Row>
      <RequirementAiLinkAnalyzer
        form={form}
        disabled={!fieldAccess.product}
        canUpdateStatus={fieldAccess.governance}
      />
      <Form.Item label="验收标准" name="acceptance">
        <Input.TextArea disabled={!fieldAccess.product} rows={4} placeholder="可量化的验收条件和边界场景" />
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
