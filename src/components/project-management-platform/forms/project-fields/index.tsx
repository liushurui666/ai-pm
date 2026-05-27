"use client";

import "./index.less";
import { Col, DatePicker, Form, Input, InputNumber, Row, Select } from "antd";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";

// 项目表单只维护项目基础信息；交付里程碑已经转移到需求版本中管理。
export function ProjectFields({
  form,
  people,
  peopleLoading,
  peopleError,
  ownerRequired = true
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  ownerRequired?: boolean;
}) {
  return (
    <>
      <Form.Item label="项目名称" name="name" rules={[{ required: true, message: "请输入项目名称" }]}>
        <Input placeholder="例如：智能项目驾驶舱二期" />
      </Form.Item>
      <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} required={ownerRequired} />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="状态" name="status">
            <Select options={["进行中", "有风险", "已完成", "暂停"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="截止日期" name="dueDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="进度（自动）" name="progress">
            <InputNumber className="pm-form-control" min={0} max={100} suffix="%" disabled />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="健康度（自动）" name="health">
            <InputNumber className="pm-form-control" min={0} max={100} disabled />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="团队人数" name="team">
            <InputNumber className="pm-form-control" min={1} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="风险数（自动）" name="riskCount">
            <InputNumber className="pm-form-control" min={0} disabled />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="摘要" name="summary">
        <Input.TextArea rows={4} placeholder="项目当前进展、目标或风险说明" />
      </Form.Item>
    </>
  );
}
