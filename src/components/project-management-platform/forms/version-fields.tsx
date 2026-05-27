"use client";

import { Col, DatePicker, Form, Input, Row, Select } from "antd";
import { useEffect } from "react";
import dayjs from "dayjs";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { MilestoneFields } from "@/components/project-management-platform/forms/milestone-fields";
import { VersionOwnerFields } from "@/components/project-management-platform/forms/version-owner-fields";
import { VersionParentField } from "@/components/project-management-platform/forms/version-parent-field";

// 复用站内项目名称，避免任务、风险和版本表单各自维护一套项目选项。
export function ProjectOptionSelect({
  projectOptions,
  value,
  onChange
}: {
  projectOptions: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      optionFilterProp="label"
      placeholder="选择站内已有项目"
      notFoundContent="请先新建项目"
      options={projectOptions.map((project) => ({
        value: project,
        label: project
      }))}
    />
  );
}

// 根据所选需求版本同步版本名和项目，减少用户重复录入造成的数据不一致。
function useSyncProjectWithVersion(
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0],
  versionOptions: RequirementVersionOption[],
  syncCrossProject = false
) {
  const selectedVersionId = Form.useWatch("versionId", form) as string | undefined;

  useEffect(() => {
    const selectedVersion = versionOptions.find((version) => version.value === selectedVersionId);

    if (!selectedVersion) {
      return;
    }

    const nextValues: Record<string, unknown> = {
      versionName: selectedVersion.versionName
    };

    if (syncCrossProject || selectedVersion.project !== "跨项目") {
      nextValues.project = selectedVersion.project;
    }

    form.setFieldsValue(nextValues);
  }, [form, selectedVersionId, syncCrossProject, versionOptions]);
}

// 同时展示版本与项目字段，适用于任务和文档拆解这类需要落到项目范围的记录。
export function VersionProjectFields({
  form,
  projectOptions,
  versionOptions,
  versionLabel = "关联版本",
  versionMessage = "请选择关联版本"
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  versionLabel?: string;
  versionMessage?: string;
}) {
  useSyncProjectWithVersion(form, versionOptions);

  return (
    <>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label={versionLabel} name="versionId" rules={[{ required: true, message: versionMessage }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择版本"
              notFoundContent="请先在需求管理中新建版本"
              options={versionOptions}
            />
          </Form.Item>
          <Form.Item name="versionName" hidden>
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="版本归属项目" name="project" rules={[{ required: true, message: "请选择版本归属项目" }]}>
            <ProjectOptionSelect projectOptions={projectOptions} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

// 仅选择版本并隐藏项目字段，适用于 Bug 等项目由版本反推的记录。
export function VersionOnlyField({
  form,
  versionOptions,
  disabled = false,
  versionLabel = "关联版本",
  versionMessage = "请选择关联版本"
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
  disabled?: boolean;
  versionLabel?: string;
  versionMessage?: string;
}) {
  useSyncProjectWithVersion(form, versionOptions, true);

  return (
    <>
      <Form.Item label={versionLabel} name="versionId" rules={[{ required: true, message: versionMessage }]}>
        <Select
          showSearch
          optionFilterProp="label"
          disabled={disabled}
          placeholder="选择版本"
          notFoundContent="请先在需求管理中新建版本"
          options={versionOptions}
        />
      </Form.Item>
      <Form.Item name="versionName" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="project" hidden>
        <Input />
      </Form.Item>
    </>
  );
}

// 需求专用版本选择字段，文案更贴近产品同学的使用语境。
export function RequirementVersionSelectField({
  form,
  versionOptions,
  versionLabel = "关联版本",
  versionMessage = "请选择关联版本"
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
  versionLabel?: string;
  versionMessage?: string;
}) {
  useSyncProjectWithVersion(form, versionOptions);

  return (
    <>
      <Form.Item label={versionLabel} name="versionId" rules={[{ required: true, message: versionMessage }]}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="选择版本"
          notFoundContent="请先新建版本"
          options={versionOptions}
        />
      </Form.Item>
      <Form.Item name="versionName" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="project" hidden>
        <Input />
      </Form.Item>
    </>
  );
}

// 需求版本表单承载真实交付范围，里程碑跟版本一起创建，避免再散落到项目管理里。
export function RequirementVersionFields({
  form,
  people,
  peopleError,
  peopleLoading,
  versionOptions,
  editingVersionId
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
  versionOptions: RequirementVersionOption[];
  editingVersionId?: string;
}) {
  return (
    <>
      <Form.Item label="版本名称" name="name" rules={[{ required: true, message: "请输入版本名称" }]}>
        <Input placeholder="例如：1.5 协同提效版本" />
      </Form.Item>
      <Form.Item name="project" hidden>
        <Input />
      </Form.Item>
      <Form.Item label="版本状态" name="status">
        <Select options={["规划中", "进行中", "已发布", "已归档"].map((value) => ({ value, label: value }))} />
      </Form.Item>
      <VersionParentField form={form} versionOptions={versionOptions} editingVersionId={editingVersionId} />
      <VersionOwnerFields
        form={form}
        people={people}
        peopleError={peopleError}
        peopleLoading={peopleLoading}
      />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="开始日期" name="startDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="发布日期"
            name="releaseDate"
            dependencies={["startDate"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("startDate");

                  if (!value || !startDate || !dayjs(value).isBefore(dayjs(startDate), "day")) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error("发布日期不能早于开始日期"));
                }
              })
            ]}
          >
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="版本目标" name="goal">
        <Input.TextArea rows={4} placeholder="这个版本要解决的问题、交付范围和验收口径" />
      </Form.Item>
      <MilestoneFields
        addText="添加版本里程碑"
        defaultDueDateField="releaseDate"
        defaultNote="记录版本交付检查点、提测或上线前置条件。"
        form={form}
        people={people}
        peopleError={peopleError}
        peopleLoading={peopleLoading}
        title="版本里程碑"
      />
    </>
  );
}
