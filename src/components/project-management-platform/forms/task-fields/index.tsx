"use client";

import "./index.less";
import { Col, DatePicker, Form, Input, InputNumber, Row, Select } from "antd";
import dayjs from "dayjs";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { taskStages } from "@/components/project-management-platform/constants";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";
import { VersionOnlyField } from "@/components/project-management-platform/forms/version-fields";
import { taskPriorityOptions } from "@/lib/tasks/priority";

export type TaskRequirementOption = {
  value: string;
  label: string;
  projectId?: string;
  versionId?: string;
  versionName?: string;
  project?: string;
};

// 任务字段承接手动创建和编辑；任务的项目归属由所选版本反推，避免用户再手动选择项目造成版本与项目不一致。
export function TaskFields({
  form,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  requirementOptions = [],
  lockRelations = false
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  requirementOptions?: TaskRequirementOption[];
  lockRelations?: boolean;
}) {
  const selectedRequirementId = Form.useWatch("requirementId", form);

  return (
    <>
      <Form.Item label="任务标题" name="title" rules={[{ required: true, message: "请输入任务标题" }]}>
        <Input placeholder="例如：补齐权限过滤测试" />
      </Form.Item>
      <Form.Item label="任务描述" name="description">
        <Input.TextArea rows={4} placeholder="说明交付内容、依赖、边界与完成标准" />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="阶段" name="stage">
            <Select options={taskStages.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="优先级" name="priority">
            <Select options={taskPriorityOptions.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        label="所属需求"
        name="requirementId"
        extra={lockRelations ? "已有任务不支持改绑需求或版本。" : "选择需求后会同步其版本与项目上下文。"}
      >
        <Select
          allowClear
          showSearch
          disabled={lockRelations}
          optionFilterProp="label"
          placeholder={requirementOptions.length ? "选择需求" : "当前暂无可选需求"}
          options={requirementOptions}
          onChange={(requirementId) => {
            const requirement = requirementOptions.find((option) => option.value === requirementId);

            form.setFieldsValue({
              requirementId: requirement?.value,
              requirementTitle: requirement?.label ?? "",
              ...(requirement?.versionId ? {
                versionId: requirement.versionId,
                versionName: requirement.versionName,
                project: requirement.project,
                projectId: requirement.projectId
              } : {})
            });
          }}
        />
      </Form.Item>
      <Form.Item name="requirementTitle" hidden><Input /></Form.Item>
      <Form.Item name="projectId" hidden><Input /></Form.Item>
      <VersionOnlyField
        form={form}
        versionOptions={versionOptions}
        disabled={lockRelations || Boolean(selectedRequirementId)}
        versionLabel={selectedRequirementId ? "关联版本（跟随需求）" : "关联版本"}
      />
      <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} />
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="开始时间" name="startDate">
            <DatePicker className="pm-form-control" showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label="截止时间"
            name="dueDate"
            dependencies={["startDate"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("startDate");

                  if (!value || !startDate || !dayjs(value).isBefore(dayjs(startDate), "minute")) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error("截止时间不能早于开始时间"));
                }
              })
            ]}
          >
            <DatePicker className="pm-form-control" showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col xs={24} sm={8}>
          <Form.Item label="任务类型" name="taskType">
            <Select options={["功能任务", "技术任务", "缺陷修复", "研究", "协调"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          {/* one2all 的故事点是离散估算值；UI 和校验同时锁定整数，避免输入框看似整数但粘贴小数后仍被提交。 */}
          <Form.Item
            label="故事点"
            name="storyPoints"
            rules={[{
              validator: (_, value) => value === undefined || value === null || Number.isInteger(value)
                ? Promise.resolve()
                : Promise.reject(new Error("故事点必须为整数"))
            }]}
          >
            <InputNumber className="pm-form-control" min={0} max={100} precision={0} step={1} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item label="预估工时（分钟）" name="estimatedMinutes">
            <InputNumber className="pm-form-control" min={0} max={60000} step={30} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="AI 提示" name="aiHint">
        <Input.TextArea rows={4} placeholder="可填写 AI 需要提醒的风险、依赖或建议" />
      </Form.Item>
    </>
  );
}
