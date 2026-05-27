"use client";

import { Form, Input, Select } from "antd";
import { useEffect, useMemo } from "react";
import type { RequirementVersionOption } from "@/components/project-management-platform/types";

function getSelectableParentVersionOptions(
  versionOptions: RequirementVersionOption[],
  editingVersionId?: string
) {
  if (!editingVersionId) {
    return versionOptions;
  }

  const blockedIds = new Set([editingVersionId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const option of versionOptions) {
      if (option.parentVersionId && blockedIds.has(option.parentVersionId) && !blockedIds.has(option.value)) {
        blockedIds.add(option.value);
        changed = true;
      }
    }
  }

  return versionOptions.filter((option) => !blockedIds.has(option.value));
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
      form.setFieldsValue({ parentVersionName: "", project: "跨项目" });

      return;
    }

    if (!selectedParentVersion) {
      return;
    }

    form.setFieldsValue({
      parentVersionName: selectedParentVersion.versionName,
      project: selectedParentVersion.project
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
  const parentVersionOptions = useMemo(
    () => getSelectableParentVersionOptions(versionOptions, editingVersionId),
    [editingVersionId, versionOptions]
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
