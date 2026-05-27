"use client";

import "./index.less";
import { Button, DatePicker, Flex, Form, Input, Select, Space, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ProjectMilestoneStatus } from "@/types/dashboard";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { MilestoneOwnerSelect } from "@/components/project-management-platform/forms/owner-select";

const { Text } = Typography;

const milestoneStatuses: ProjectMilestoneStatus[] = ["未开始", "进行中", "已完成", "延期"];

function getDefaultMilestoneDate(
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0],
  fieldName?: string
) {
  const value = fieldName ? form.getFieldValue(fieldName) : undefined;

  if (dayjs.isDayjs(value)) {
    return value;
  }

  return value ? dayjs(String(value)) : dayjs().add(7, "day");
}

// 版本里程碑和历史项目里程碑共用同一套字段，避免负责人、日期和状态结构漂移。
export function MilestoneFields({
  addText = "添加里程碑",
  defaultDueDateField,
  defaultNote = "",
  form,
  people,
  peopleError,
  peopleLoading,
  title = "里程碑"
}: {
  addText?: string;
  defaultDueDateField?: string;
  defaultNote?: string;
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
  title?: string;
}) {
  return (
    <Form.List name="milestones">
      {(fields, { add, remove }) => (
        <div className="milestone-form">
          <Flex justify="space-between" align="center" className="milestone-form-header">
            <Text strong>{title}</Text>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() =>
                add({
                  title: "",
                  status: "未开始",
                  dueDate: getDefaultMilestoneDate(form, defaultDueDateField),
                  owner: form.getFieldValue("owner") || "",
                  ownerMemberId: form.getFieldValue("ownerMemberId") || "",
                  ownerOpenId: form.getFieldValue("ownerOpenId") || "",
                  ownerUnionId: form.getFieldValue("ownerUnionId") || "",
                  ownerUserId: form.getFieldValue("ownerUserId") || "",
                  ownerEmail: form.getFieldValue("ownerEmail") || "",
                  ownerAvatarUrl: form.getFieldValue("ownerAvatarUrl") || "",
                  note: defaultNote
                })
              }
            >
              {addText}
            </Button>
          </Flex>
          <Space orientation="vertical" size={12} className="pm-wide">
            {fields.map(({ key, name, ...restField }, index) => (
              <div className="milestone-form-item" key={key}>
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
                <div className="milestone-form-grid">
                  <Form.Item
                    {...restField}
                    label="标题"
                    name={[name, "title"]}
                    rules={[{ required: true, message: "请输入里程碑标题" }]}
                  >
                    <Input placeholder="例如：需求评审完成" />
                  </Form.Item>
                  <Form.Item {...restField} label="状态" name={[name, "status"]}>
                    <Select options={milestoneStatuses.map((value) => ({ value, label: value }))} />
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
                <Form.Item {...restField} label="说明" name={[name, "note"]} className="milestone-note">
                  <Input.TextArea rows={2} placeholder="交付范围、检查点或风险说明" />
                </Form.Item>
              </div>
            ))}
          </Space>
        </div>
      )}
    </Form.List>
  );
}
