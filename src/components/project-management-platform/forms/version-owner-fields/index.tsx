"use client";

import "./index.less";
import { Col, Form, Input, Row, Select } from "antd";
import type { SelectProps } from "antd";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { ownerRoleLabels } from "@/components/project-management-platform/constants";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";

type VersionOwnerPrefix = "product" | "ui" | "dev";

const versionOwnerRoles: Array<{
  prefix: VersionOwnerPrefix;
  label: string;
  placeholder: string;
}> = [
  { prefix: "product", label: "产品负责人", placeholder: "选择产品负责人" },
  { prefix: "ui", label: "UI 负责人", placeholder: "选择 UI 负责人" },
  { prefix: "dev", label: "开发负责人", placeholder: "选择开发负责人" }
];

function getVersionOwnerField(prefix: VersionOwnerPrefix, suffix: string) {
  return `${prefix}Owner${suffix}`;
}

function createVersionOwnerOptions(people: OwnerSelectableMember[]): SelectProps["options"] {
  return people.map((member) => ({
    value: member.id,
    label: <OwnerInline name={member.name} avatarUrl={member.avatarUrl} />,
    searchText: [member.name, member.email, ownerRoleLabels[member.role]].filter(Boolean).join(" "),
    title: `${member.name} · ${ownerRoleLabels[member.role]}`
  }));
}

// 版本角色负责人需要各自保存飞书身份，后续通知或报表可以按角色精确追踪。
function syncVersionOwnerToForm(
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0],
  prefix: VersionOwnerPrefix,
  member?: OwnerSelectableMember
) {
  form.setFieldsValue({
    [getVersionOwnerField(prefix, "")]: member?.name ?? "",
    [getVersionOwnerField(prefix, "MemberId")]: member?.id ?? "",
    [getVersionOwnerField(prefix, "OpenId")]: member?.feishuOpenId ?? "",
    [getVersionOwnerField(prefix, "UnionId")]: member?.feishuUnionId ?? "",
    [getVersionOwnerField(prefix, "UserId")]: member?.feishuUserId ?? "",
    [getVersionOwnerField(prefix, "Email")]: member?.email ?? "",
    [getVersionOwnerField(prefix, "AvatarUrl")]: member?.avatarUrl ?? ""
  });
}

function VersionOwnerSelect({
  form,
  people,
  peopleError,
  peopleLoading,
  prefix,
  label,
  placeholder
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
  prefix: VersionOwnerPrefix;
  label: string;
  placeholder: string;
}) {
  const options = createVersionOwnerOptions(people);

  return (
    <>
      <Form.Item label={label} name={getVersionOwnerField(prefix, "MemberId")}>
        <Select
          allowClear
          showSearch
          loading={peopleLoading}
          optionFilterProp="searchText"
          optionLabelProp="title"
          placeholder={placeholder}
          notFoundContent={peopleError || "暂无可选成员"}
          options={options}
          onChange={(memberId) => {
            const member = people.find((item) => item.id === memberId);

            syncVersionOwnerToForm(form, prefix, member);
          }}
          onClear={() => syncVersionOwnerToForm(form, prefix)}
        />
      </Form.Item>
      <Form.Item name={getVersionOwnerField(prefix, "")} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={getVersionOwnerField(prefix, "OpenId")} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={getVersionOwnerField(prefix, "UnionId")} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={getVersionOwnerField(prefix, "UserId")} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={getVersionOwnerField(prefix, "Email")} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={getVersionOwnerField(prefix, "AvatarUrl")} hidden>
        <Input />
      </Form.Item>
    </>
  );
}

// 三类负责人放在同一个响应式网格里，保持版本表单的扫描效率。
export function VersionOwnerFields({
  form,
  people,
  peopleError,
  peopleLoading
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
}) {
  return (
    <Row gutter={12}>
      {versionOwnerRoles.map((role) => (
        <Col key={role.prefix} xs={24} md={8}>
          <VersionOwnerSelect
            form={form}
            people={people}
            peopleError={peopleError}
            peopleLoading={peopleLoading}
            prefix={role.prefix}
            label={role.label}
            placeholder={role.placeholder}
          />
        </Col>
      ))}
    </Row>
  );
}
