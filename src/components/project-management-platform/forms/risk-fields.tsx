"use client";

import { Col, Form, Input, Row, Select } from "antd";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";
import { ProjectOptionSelect } from "@/components/project-management-platform/forms/version-fields";

// 风险字段绑定项目和负责人，保留给底层风险数据维护和报表上下文使用。
export function RiskFields({
  form,
  projectOptions,
  people,
  peopleLoading,
  peopleError
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  projectOptions: string[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
}) {
  return (
    <>
      <Form.Item label="风险标题" name="title" rules={[{ required: true, message: "请输入风险标题" }]}>
        <Input placeholder="例如：需求范围未冻结" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="风险等级" name="level">
            <Select options={["高", "中", "低"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} />
        </Col>
      </Row>
      <Form.Item label="关联项目" name="project" rules={[{ required: true, message: "请选择关联项目" }]}>
        <ProjectOptionSelect projectOptions={projectOptions} />
      </Form.Item>
      <Form.Item label="应对措施" name="mitigation">
        <Input.TextArea rows={4} placeholder="处理策略、责任人和检查时间" />
      </Form.Item>
    </>
  );
}
