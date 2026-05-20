"use client";

import { Button, Col, DatePicker, Flex, Form, Input, InputNumber, Row, Select, Space, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { MilestoneOwnerSelect, OwnerSelect } from "@/components/project-management-platform/forms/owner-select";

const { Text } = Typography;

// 项目表单字段聚合项目基础信息和里程碑，保持抽屉只负责提交与展示。
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
      <Form.List name="milestones">
        {(fields, { add, remove }) => (
          <div className="project-milestone-form">
            <Flex justify="space-between" align="center" className="project-milestone-form-header">
              <Text strong>项目里程碑</Text>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({
                    title: "",
                    status: "未开始",
                    dueDate: dayjs().add(7, "day"),
                    owner: form.getFieldValue("owner") || "",
                    ownerMemberId: form.getFieldValue("ownerMemberId") || "",
                    ownerOpenId: form.getFieldValue("ownerOpenId") || "",
                    ownerUnionId: form.getFieldValue("ownerUnionId") || "",
                    ownerUserId: form.getFieldValue("ownerUserId") || "",
                    ownerEmail: form.getFieldValue("ownerEmail") || "",
                    ownerAvatarUrl: form.getFieldValue("ownerAvatarUrl") || "",
                    note: ""
                  })
                }
              >
                添加里程碑
              </Button>
            </Flex>
            <Space orientation="vertical" size={12} className="pm-wide">
              {fields.map(({ key, name, ...restField }, index) => (
                <div className="project-milestone-form-item" key={key}>
                  <Flex justify="space-between" align="center">
                    <Text type="secondary">里程碑 {index + 1}</Text>
                    <Tooltip title="删除里程碑">
                      <Button
                        danger
                        size="small"
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                        disabled={fields.length <= 1}
                      />
                    </Tooltip>
                  </Flex>
                  <Form.Item {...restField} name={[name, "id"]} hidden>
                    <Input />
                  </Form.Item>
                  <div className="project-milestone-form-grid">
                    <Form.Item
                      {...restField}
                      label="标题"
                      name={[name, "title"]}
                      rules={[{ required: true, message: "请输入里程碑标题" }]}
                    >
                      <Input placeholder="例如：需求评审完成" />
                    </Form.Item>
                    <Form.Item {...restField} label="状态" name={[name, "status"]}>
                      <Select options={["未开始", "进行中", "已完成", "延期"].map((value) => ({ value, label: value }))} />
                    </Form.Item>
                    <Form.Item {...restField} label="日期" name={[name, "dueDate"]}>
                      <DatePicker className="pm-form-control" />
                    </Form.Item>
                    <MilestoneOwnerSelect
                      form={form}
                      name={name}
                      people={people}
                      peopleError={peopleError}
                      peopleLoading={peopleLoading}
                      restField={restField}
                    />
                  </div>
                  <Form.Item {...restField} label="说明" name={[name, "note"]} className="project-milestone-note">
                    <Input.TextArea rows={2} placeholder="交付范围、检查点或风险说明" />
                  </Form.Item>
                </div>
              ))}
            </Space>
          </div>
        )}
      </Form.List>
    </>
  );
}
