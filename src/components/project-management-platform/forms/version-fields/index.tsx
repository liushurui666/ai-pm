"use client";

import "./index.less";
import { Col, DatePicker, Form, Input, InputNumber, Row, Select } from "antd";
import { useEffect, useMemo } from "react";
import dayjs from "dayjs";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import type { Project } from "@/types/dashboard";
import { MilestoneFields } from "@/components/project-management-platform/forms/milestone-fields";
import { DeliveryLabelCatalogFields } from "@/components/project-management-platform/forms/delivery-label-catalog-fields";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";
import { VersionOwnerFields } from "@/components/project-management-platform/forms/version-owner-fields";
import { VersionParentField } from "@/components/project-management-platform/forms/version-parent-field";
import { normalizeProjectDeliveryLabelCatalog } from "@/data/project-delivery-labels";

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

    if (selectedVersion.project !== "跨项目") {
      nextValues.project = selectedVersion.project;
      nextValues.projectId = selectedVersion.projectId;
    } else if (syncCrossProject && !form.getFieldValue("project")) {
      // 跨项目版本允许任务沿用所选需求的具体项目；只有表单尚无上下文时才回退为“跨项目”。
      nextValues.project = selectedVersion.project;
      nextValues.projectId = undefined;
    }

    form.setFieldsValue(nextValues);
  }, [form, selectedVersionId, syncCrossProject, versionOptions]);
}

// 同时展示版本与项目字段，仅保留给仍需显式选择项目的兼容表单；任务/Bug 应使用 VersionOnlyField 由版本反推项目。
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
          <Form.Item name="projectId" hidden>
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
      <Form.Item name="projectId" hidden>
        <Input />
      </Form.Item>
    </>
  );
}

// 需求专用版本选择字段，文案更贴近产品同学的使用语境。
export function RequirementVersionSelectField({
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
  useSyncProjectWithVersion(form, versionOptions);

  return (
    <>
      <Form.Item label={versionLabel} name="versionId" rules={[{ required: true, message: versionMessage }]}>
        <Select
          showSearch
          disabled={disabled}
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
      <Form.Item name="projectId" hidden>
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
  projects,
  versionOptions,
  editingVersionId,
  canManageDeliveryLabelCatalog = true
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
  projects: Project[];
  versionOptions: RequirementVersionOption[];
  editingVersionId?: string;
  canManageDeliveryLabelCatalog?: boolean;
}) {
  const rawLabelCatalog = Form.useWatch("deliveryLabelCatalog", form);
  const milestones = Form.useWatch("milestones", form) as Array<{ labelId?: string }> | undefined;
  const labelCatalog = useMemo(
    () => normalizeProjectDeliveryLabelCatalog(rawLabelCatalog),
    [rawLabelCatalog]
  );
  const labelUsageCounts = useMemo(() => (milestones ?? []).reduce<Record<string, number>>((counts, milestone) => {
    if (milestone?.labelId) {
      counts[milestone.labelId] = (counts[milestone.labelId] ?? 0) + 1;
    }

    return counts;
  }, {}), [milestones]);
  return (
    <>
      <Form.Item label="版本名称" name="name" rules={[{ required: true, message: "请输入版本名称" }]}>
        <Input placeholder="例如：1.5 协同提效版本" />
      </Form.Item>
      <Form.Item label="归属项目" name="projectId" rules={[{ required: true, message: "请选择归属项目" }]}>
        <Select
          disabled={Boolean(editingVersionId)}
          showSearch
          optionFilterProp="label"
          placeholder="选择项目"
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
          onChange={(nextProjectId) => {
            const nextProject = projects.find((project) => project.id === nextProjectId);

            form.setFieldValue("project", nextProject?.name ?? "");
          }}
        />
      </Form.Item>
      <Form.Item name="project" hidden>
        <Input />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="单元类型" name="type">
            <Select options={["项目", "版本"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="风险级别" name="riskLevel">
            <Select options={["低", "中", "高"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="项目/版本状态" name="status">
        <Select options={["规划中", "需求梳理", "开发中", "验收中", "进行中", "已发布", "已归档"].map((value) => ({ value, label: value }))} />
      </Form.Item>
      <VersionParentField form={form} versionOptions={versionOptions} editingVersionId={editingVersionId} />
      <OwnerSelect
        form={form}
        people={people}
        loading={peopleLoading}
        error={peopleError}
        label="交付总负责人"
        required={false}
      />
      <VersionOwnerFields
        form={form}
        people={people}
        peopleError={peopleError}
        peopleLoading={peopleLoading}
      />
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="计划开始" name="startDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label="计划完成"
            name="releaseDate"
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
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label="实际开始" name="actualStartDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label="实际完成"
            name="actualCompletedDate"
            dependencies={["actualStartDate"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const actualStartDate = getFieldValue("actualStartDate");

                  if (!value || !actualStartDate || !dayjs(value).isBefore(dayjs(actualStartDate), "day")) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error("实际完成日期不能早于实际开始日期"));
                }
              })
            ]}
          >
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="进度（自动）" name="progress">
        <InputNumber className="pm-form-control" min={0} max={100} suffix="%" disabled />
      </Form.Item>
      <Form.Item label="版本目标" name="goal">
        <Input.TextArea rows={4} placeholder="这个版本要解决的问题、交付范围和验收口径" />
      </Form.Item>
      <DeliveryLabelCatalogFields
        disabled={!canManageDeliveryLabelCatalog}
        form={form}
        usageCounts={labelUsageCounts}
      />
      <MilestoneFields
        addText="添加版本里程碑"
        defaultDueDateField="releaseDate"
        defaultNote="记录版本交付检查点、提测或上线前置条件。"
        form={form}
        labelCatalog={labelCatalog}
        people={people}
        peopleError={peopleError}
        peopleLoading={peopleLoading}
        title="版本里程碑"
      />
    </>
  );
}
