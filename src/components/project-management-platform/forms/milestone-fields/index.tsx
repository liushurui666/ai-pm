"use client";

import "./index.less";
import { Button, DatePicker, Flex, Form, Input, Select, Space, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ProjectDeliveryLabel, ProjectMilestone, ProjectMilestoneStatus } from "@/types/dashboard";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { MilestoneOwnerSelect } from "@/components/project-management-platform/forms/owner-select";

const { Text } = Typography;

const milestoneStatuses: ProjectMilestoneStatus[] = ["未开始", "进行中", "已完成", "延期"];

function MilestoneLabelSelect({
  form,
  labelCatalog,
  name,
  restField
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  labelCatalog: ProjectDeliveryLabel[];
  name: number;
  restField: { fieldKey?: number };
}) {
  const labelId = Form.useWatch(["milestones", name, "labelId"], form) as string | undefined;
  const typeSnapshot = Form.useWatch(["milestones", name, "type"], form) as string | undefined;
  const milestones = (Form.useWatch("milestones", form) as ProjectMilestone[] | undefined) ?? [];
  const selectedByOtherRows = new Set(
    milestones.flatMap((milestone, index) => index !== name && milestone?.labelId ? [milestone.labelId] : [])
  );
  const activeLabels = labelCatalog.filter((label) => label.active && !label.deleted);
  const selectedLabel = labelCatalog.find((label) => label.id === labelId);
  const selectedLabelState = selectedLabel?.deleted ? "已删除" : selectedLabel && !selectedLabel.active ? "已停用" : !selectedLabel ? "已删除" : "";
  const options: Array<{ value: string; label: string; disabled?: boolean }> = activeLabels
    .map((label) => ({
      value: label.id,
      label: label.name,
      disabled: selectedByOtherRows.has(label.id)
    }));

  if (labelId && (!selectedLabel?.active || selectedLabel.deleted)) {
    // 停用或历史上已删除的标签仅作为当前值展示，不进入新选项集。
    options.push({
      value: labelId,
      label: `${typeSnapshot || selectedLabel?.name || "历史标签"}（${selectedLabelState}）`,
      disabled: true
    });
  }

  return (
    <div className="milestone-label-field">
      <Form.Item
        {...restField}
        label="节点类型"
        name={[name, "labelId"]}
        rules={activeLabels.length ? [{ required: true, message: "请选择当前项目/版本的交付节点标签" }] : undefined}
      >
        <Select
          placeholder={activeLabels.length ? "选择已启用标签" : "当前项目/版本暂无已启用标签"}
          options={options}
          disabled={!activeLabels.length && !labelId}
          onChange={(nextLabelId) => {
            const nextLabel = labelCatalog.find((label) => label.id === nextLabelId);

            // type 是历史快照，仅在用户主动重选时更新；目录改名不会静默改写旧节点。
            form.setFieldValue(["milestones", name, "type"], nextLabel?.name || typeSnapshot);
          }}
        />
      </Form.Item>
      <Form.Item {...restField} name={[name, "type"]} hidden>
        <Input />
      </Form.Item>
      {typeSnapshot && (selectedLabelState || !selectedLabel || selectedLabel.name !== typeSnapshot) ? (
        <Text type="secondary" className="milestone-label-snapshot">
          历史快照：{typeSnapshot}{selectedLabelState ? ` · ${selectedLabelState}` : ""}
        </Text>
      ) : null}
    </div>
  );
}

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
  labelCatalog,
  people,
  peopleError,
  peopleLoading,
  title = "里程碑"
}: {
  addText?: string;
  defaultDueDateField?: string;
  defaultNote?: string;
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  labelCatalog: ProjectDeliveryLabel[];
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
  title?: string;
}) {
  const milestones = (Form.useWatch("milestones", form) as ProjectMilestone[] | undefined) ?? [];
  const selectedLabelIds = new Set(milestones.map((milestone) => milestone?.labelId).filter(Boolean));
  const nextAvailableLabel = labelCatalog.find((label) => label.active && !label.deleted && !selectedLabelIds.has(label.id));

  return (
    <Form.List name="milestones">
      {(fields, { add, remove }) => (
        <div className="milestone-form">
          <Flex justify="space-between" align="center" className="milestone-form-header">
            <Text strong>{title}</Text>
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={!nextAvailableLabel}
              onClick={() =>
                {
                  const defaultLabel = nextAvailableLabel;

                  add({
                    title: "",
                    labelId: defaultLabel?.id,
                    type: defaultLabel?.name,
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
                  });
                }
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
                  <MilestoneLabelSelect
                    form={form}
                    labelCatalog={labelCatalog}
                    name={name}
                    restField={restField}
                  />
                  <Form.Item {...restField} label="日期" name={[name, "dueDate"]}>
                    <DatePicker className="pm-form-control" />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    label="实际完成"
                    name={[name, "actualCompletedDate"]}
                    extra="未完成时保持为空。"
                  >
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
