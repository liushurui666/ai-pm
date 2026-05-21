"use client";

import { Alert, Form, Input, Select, Typography } from "antd";
import type { ProjectMilestone } from "@/types/dashboard";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { ownerRoleLabels } from "@/components/project-management-platform/constants";
import { normalizeIdentity } from "@/components/project-management-platform/identity";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";

const { Text } = Typography;

// 负责人选项展示角色和飞书绑定状态，方便创建记录时直接选平台成员。
function OwnerOption({ member }: { member: OwnerSelectableMember }) {
  const secondary = [
    ownerRoleLabels[member.role],
    member.email || (member.feishuOpenId ? "已绑定飞书" : "未绑定飞书")
  ].filter(Boolean).join(" · ");

  return (
    <OwnerInline
      name={member.name}
      avatarUrl={member.avatarUrl}
      secondary={secondary}
    />
  );
}

// 搜索文本覆盖姓名、角色和飞书 ID，降低同名成员带来的选择成本。
function getMemberSearchText(member: OwnerSelectableMember) {
  return [
    member.name,
    ownerRoleLabels[member.role],
    member.email,
    member.feishuOpenId,
    member.feishuUnionId,
    member.feishuUserId
  ].filter(Boolean).join(" ");
}

// Select options 统一在这里生成，保证普通负责人和里程碑负责人体验一致。
function getOwnerSelectOptions(people: OwnerSelectableMember[]) {
  return people.map((member) => ({
    value: member.id,
    displayName: member.name,
    label: <OwnerOption member={member} />,
    searchText: getMemberSearchText(member)
  }));
}

// Ant Design 的 option 里保留 searchText，用轻量包含匹配支持多字段搜索。
function filterOwnerOption(input: string, option?: { searchText?: string }) {
  return (option?.searchText ?? "").toLowerCase().includes(input.trim().toLowerCase());
}

// 选择成员后同步写入负责人姓名、头像和各类飞书身份字段，便于通知接口使用。
export function createOwnerFormFieldsFromMember(member: OwnerSelectableMember) {
  return {
    ownerMemberId: member.id,
    ownerOpenId: member.feishuOpenId ?? "",
    ownerUnionId: member.feishuUnionId ?? "",
    ownerUserId: member.feishuUserId ?? "",
    ownerEmail: member.email ?? "",
    ownerAvatarUrl: member.avatarUrl ?? "",
    owner: member.name
  };
}

// 表单值可能为空或非字符串，先收窄类型再进入身份匹配。
function getOwnerValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

// 身份比较统一走 normalizeIdentity，兼容邮箱大小写和空值。
function isSameOwnerIdentity(left: unknown, right?: string) {
  const normalizedLeft = normalizeIdentity(getOwnerValue(left));
  const normalizedRight = normalizeIdentity(right);

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

// 编辑历史记录时优先用成员 ID 匹配，缺失时再退回飞书身份或姓名。
function findOwnerSelectableMember(values: Record<string, unknown>, people: OwnerSelectableMember[]) {
  const ownerMemberId = getOwnerValue(values.ownerMemberId);
  const ownerName = normalizeIdentity(getOwnerValue(values.owner));

  return people.find((member) => {
    if (ownerMemberId && member.id === ownerMemberId) {
      return true;
    }

    return (
      isSameOwnerIdentity(values.ownerOpenId, member.feishuOpenId) ||
      isSameOwnerIdentity(values.ownerUnionId, member.feishuUnionId) ||
      isSameOwnerIdentity(values.ownerUserId, member.feishuUserId) ||
      isSameOwnerIdentity(values.ownerEmail, member.email) ||
      Boolean(ownerName && ownerName === normalizeIdentity(member.name))
    );
  });
}

// 抽屉打开前补齐负责人隐藏字段，确保旧数据也能继续触发成员通知。
export function hydrateOwnerFormValues<T extends Record<string, unknown>>(values: T, people: OwnerSelectableMember[]): T {
  const matchedMember = findOwnerSelectableMember(values, people);
  const nextValues: Record<string, unknown> = matchedMember
    ? {
        ...values,
        ...createOwnerFormFieldsFromMember(matchedMember)
      }
    : { ...values };

  if (Array.isArray(nextValues.milestones)) {
    nextValues.milestones = nextValues.milestones.map((milestone) =>
      milestone && typeof milestone === "object"
        ? hydrateOwnerFormValues(milestone as Record<string, unknown>, people)
        : milestone
    );
  }

  return nextValues as T;
}

// 通用负责人选择器封装隐藏身份字段，业务表单只需要声明是否必填。
export function OwnerSelect({
  form,
  people,
  loading,
  error,
  disabled = false,
  required = true,
  label = "负责人"
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: OwnerSelectableMember[];
  loading: boolean;
  error: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
}) {
  return (
    <>
      <Form.Item
        label={label}
        name="ownerMemberId"
        rules={required ? [{ required: true, message: "请选择平台成员" }] : undefined}
      >
        <Select
          showSearch
          loading={loading}
          disabled={disabled || Boolean(error) || !people.length}
          placeholder={required ? "从平台成员选择负责人" : "可选，未匹配负责人时使用"}
          optionFilterProp="displayName"
          optionLabelProp="displayName"
          filterOption={(input, option) => filterOwnerOption(input, option as { searchText?: string })}
          options={getOwnerSelectOptions(people)}
          onChange={(value) => {
            const selectedMember = people.find((member) => member.id === value);

            form.setFieldsValue(selectedMember ? createOwnerFormFieldsFromMember(selectedMember) : {});
          }}
        />
      </Form.Item>
      <Form.Item name="owner" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerOpenId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerUnionId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerUserId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerEmail" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerAvatarUrl" hidden>
        <Input />
      </Form.Item>
      {error ? (
        <Alert
          className="pm-form-alert"
          type="warning"
          showIcon
          title="暂无可选平台成员"
          description={error}
        />
      ) : !people.length && !loading ? (
        <Alert
          className="pm-form-alert"
          type="warning"
          showIcon
          title="暂无可选平台成员"
          description="请先在成员管理中添加并启用成员，再配置负责人。"
        />
      ) : (
        <Text className="pm-form-note" type="secondary">
          负责人来自平台成员；如该成员绑定了飞书且开启通知，创建或变更时会尝试机器人提醒。
        </Text>
      )}
    </>
  );
}

// 里程碑负责人写在 Form.List 内，需要手动同步对应下标的隐藏身份字段。
export function MilestoneOwnerSelect({
  form,
  name,
  people,
  peopleError,
  peopleLoading,
  restField
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  name: number;
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
  restField: Record<string, unknown>;
}) {
  return (
    <>
      <Form.Item
        {...restField}
        label="负责人"
        name={[name, "ownerMemberId"]}
        extra="可选；需要通知到人时再选择平台成员。"
      >
        <Select
          showSearch
          loading={peopleLoading}
          disabled={Boolean(peopleError) || !people.length}
          placeholder="从平台成员选择"
          optionFilterProp="displayName"
          optionLabelProp="displayName"
          filterOption={(input, option) => filterOwnerOption(input, option as { searchText?: string })}
          options={getOwnerSelectOptions(people)}
          onChange={(value) => {
            const selectedMember = people.find((member) => member.id === value);
            const milestones = [...((form.getFieldValue("milestones") as ProjectMilestone[]) ?? [])];

            milestones[name] = {
              ...milestones[name],
              ...(selectedMember ? createOwnerFormFieldsFromMember(selectedMember) : {})
            };
            form.setFieldsValue({
              milestones
            });
          }}
        />
      </Form.Item>
      <Form.Item {...restField} name={[name, "owner"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerOpenId"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerUnionId"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerUserId"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerEmail"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerAvatarUrl"]} hidden>
        <Input />
      </Form.Item>
    </>
  );
}
