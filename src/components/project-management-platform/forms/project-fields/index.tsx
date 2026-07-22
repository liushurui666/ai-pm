"use client";

import "./index.less";
import { Col, DatePicker, Form, Input, InputNumber, Row, Select } from "antd";
import dayjs from "dayjs";
import type { Project } from "@/types/dashboard";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";

// 项目表单管理项目集基础信息；交付节点仍由具体项目/版本承载。
export function ProjectFields({
  form,
  people,
  peopleLoading,
  peopleError,
  ownerRequired = true,
  showOwner = true,
  canArchiveProject = true,
  currentStatus
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  ownerRequired?: boolean;
  showOwner?: boolean;
  canArchiveProject?: boolean;
  currentStatus?: Project["status"];
}) {
  const archiveTransitionLocked = !canArchiveProject && currentStatus === "已归档";

  return (
    <>
      <Form.Item label="项目名称" name="name" rules={[{ required: true, message: "请输入项目名称" }]}>
        <Input placeholder="例如：智能项目驾驶舱二期" />
      </Form.Item>
      <Form.Item
        label="项目编码"
        name="code"
        rules={[{ max: 40, message: "项目编码最多 40 个字符" }]}
        extra="用于列表和搜索的稳定短编码，建议使用大写字母和数字。"
      >
        <Input placeholder="例如：AIPM-CORE" />
      </Form.Item>
      {showOwner ? (
        <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} required={ownerRequired} />
      ) : null}
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="状态" name="status">
            <Select
              disabled={archiveTransitionLocked}
              options={["进行中", "已完成", "暂停", "已归档"].map((value) => ({
                value,
                label: value,
                disabled: !canArchiveProject && value === "已归档"
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="风险级别" name="riskLevel">
            <Select options={["低", "中", "高"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="计划开始" name="startDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label="计划结束"
            name="dueDate"
            dependencies={["startDate"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("startDate");

                  if (!value || !startDate || !dayjs(value).isBefore(dayjs(startDate), "day")) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error("计划结束日期不能早于开始日期"));
                }
              })
            ]}
          >
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="进度（自动）" name="progress">
            <InputNumber className="pm-form-control" min={0} max={100} suffix="%" disabled />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="健康度（自动）" name="health">
            <InputNumber className="pm-form-control" min={0} max={100} disabled />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="团队人数" name="team">
            <InputNumber className="pm-form-control" min={1} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
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
