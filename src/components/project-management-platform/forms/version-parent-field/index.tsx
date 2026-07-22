"use client";

import "./index.less";
import { Form, Input, Select } from "antd";
import { useEffect, useMemo } from "react";
import type { RequirementVersionOption } from "@/components/project-management-platform/types";

function getSelectableParentVersionOptions(
  versionOptions: RequirementVersionOption[],
  editingVersionId?: string,
  projectId?: string
) {
  const sameProjectOptions = projectId
    ? versionOptions.filter((option) => option.projectId === projectId)
    : versionOptions;

  if (!editingVersionId) {
    return sameProjectOptions;
  }

  const blockedIds = new Set([editingVersionId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const option of sameProjectOptions) {
      if (option.parentVersionId && blockedIds.has(option.parentVersionId) && !blockedIds.has(option.value)) {
        blockedIds.add(option.value);
        changed = true;
      }
    }
  }

  return sameProjectOptions.filter((option) => !blockedIds.has(option.value));
}

// 选择父版本后同步父版本名称，并默认沿用父版本项目，减少子版本归属错配。
function useSyncParentVersion(
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0],
  parentVersionOptions: RequirementVersionOption[]
) {
  const selectedParentVersionId = Form.useWatch("parentVersionId", form) as string | undefined;

  useEffect(() => {
    const selectedParentVersion = parentVersionOptions.find((version) => version.value === selectedParentVersionId);

    if (!selectedParentVersionId) {
      form.setFieldValue("parentVersionName", "");

      return;
    }

    if (!selectedParentVersion) {
      // 切换归属项目后不能保留其它项目的父版本。
      form.setFieldsValue({ parentVersionId: undefined, parentVersionName: "" });

      return;
    }

    form.setFieldsValue({
      parentVersionName: selectedParentVersion.versionName,
      project: selectedParentVersion.project,
      projectId: selectedParentVersion.projectId
    });
  }, [form, parentVersionOptions, selectedParentVersionId]);
}

// 父版本字段独立维护过滤和同步逻辑，避免版本表单继续承担层级规则。
export function VersionParentField({
  editingVersionId,
  form,
  versionOptions
}: {
  editingVersionId?: string;
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
}) {
  const projectId = Form.useWatch("projectId", form) as string | undefined;
  const parentVersionOptions = useMemo(
    () => getSelectableParentVersionOptions(versionOptions, editingVersionId, projectId),
    [editingVersionId, projectId, versionOptions]
  );

  useSyncParentVersion(form, parentVersionOptions);

  return (
    <>
      <Form.Item label="上级版本" name="parentVersionId">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="不选择则作为一级版本"
          notFoundContent="暂无可选父版本"
          options={parentVersionOptions}
        />
      </Form.Item>
      <Form.Item name="parentVersionName" hidden>
        <Input />
      </Form.Item>
    </>
  );
}
