"use client";

import "./index.less";
import { Alert, Avatar, Button, Drawer, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { BellOutlined, DeleteOutlined, PlusOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";
import { useState } from "react";
import type { ColumnsType } from "antd/es/table";
import type {
  DashboardMember,
  DashboardPermissions,
  FeishuPerson,
  MemberNotificationChannelProvider,
  MemberNotificationScene,
  MemberRole,
  MemberStatus
} from "@/types/dashboard";
import { TableView } from "@/components/project-management-platform/shared/page-shell";

const { Text } = Typography;

const roleOptions: Array<{ value: MemberRole; label: string; color: string }> = [
  { value: "owner", label: "所有者", color: "red" },
  { value: "admin", label: "管理员", color: "purple" },
  { value: "productAdmin", label: "产品管理员", color: "blue" },
  { value: "productMember", label: "产品成员", color: "cyan" },
  { value: "frontend", label: "前端", color: "geekblue" },
  { value: "backend", label: "后端", color: "green" },
  { value: "qa", label: "测试", color: "gold" },
  { value: "viewer", label: "只读成员", color: "default" }
];

const statusOptions: Array<{ value: MemberStatus; label: string }> = [
  { value: "active", label: "启用" },
  { value: "disabled", label: "禁用" }
];

const channelProviderOptions: Array<{ value: MemberNotificationChannelProvider; label: string; color: string; disabled?: boolean }> = [
  { value: "feishu", label: "飞书", color: "blue" },
  { value: "email", label: "邮箱", color: "cyan" },
  { value: "webhook", label: "Webhook", color: "purple" },
  { value: "telegram", label: "TG", color: "default", disabled: true }
];

const notificationSceneOptions: Array<{ value: MemberNotificationScene; label: string }> = [
  { value: "taskAssigned", label: "任务分配" },
  { value: "requirementChanged", label: "需求变更" },
  { value: "bugFlowChanged", label: "Bug 流转" }
];

function getRoleMeta(role: MemberRole) {
  return roleOptions.find((option) => option.value === role) ?? roleOptions.at(-1)!;
}

function getChannelProviderMeta(provider: MemberNotificationChannelProvider) {
  return channelProviderOptions.find((option) => option.value === provider) ?? channelProviderOptions[0];
}

function getMemberInitial(name?: string) {
  return (name?.trim() || "成").slice(0, 1);
}

function getPersonSearchText(person: FeishuPerson) {
  return [person.name, person.enName, person.email, person.openId, person.userId].filter(Boolean).join(" ");
}

function getChannelTargetSummary(member: DashboardMember, provider: MemberNotificationChannelProvider) {
  const channels = member.notification.channels.filter((channel) => channel.provider === provider);

  if (!channels.length) {
    return "";
  }

  const enabledCount = channels.filter((channel) => channel.enabled).length;

  return enabledCount ? `${enabledCount}/${channels.length} 启用` : "已关闭";
}

function createDefaultNotificationChannel(provider: MemberNotificationChannelProvider = "feishu") {
  return {
    id: "",
    provider,
    enabled: true,
    scenes: ["taskAssigned", "requirementChanged", "bugFlowChanged"] as MemberNotificationScene[],
    target: "",
    telegramChatId: ""
  };
}

function getMemberNotificationFormValues(member: DashboardMember) {
  return {
    channels: member.notification.channels.length
      ? member.notification.channels
      : member.notification.feishuOpenId
        ? [
          {
            ...createDefaultNotificationChannel("feishu"),
            enabled: member.notification.feishuEnabled,
            target: member.notification.feishuOpenId || "",
            feishuOpenId: member.notification.feishuOpenId || "",
            feishuUnionId: member.notification.feishuUnionId || "",
            feishuUserId: member.notification.feishuUserId || "",
            scenes: [
              member.notification.taskAssigned ? "taskAssigned" : "",
              member.notification.requirementChanged ? "requirementChanged" : "",
              "bugFlowChanged"
            ].filter((scene): scene is MemberNotificationScene =>
              scene === "taskAssigned" || scene === "requirementChanged" || scene === "bugFlowChanged"
            )
          }
        ]
        : []
  };
}

function MemberIdentityFields({
  form,
  people,
  peopleError,
  peopleLoading
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
}) {
  return (
    <>
      <Form.Item label="从飞书通讯录选择" name="feishuOpenId">
        <Select
          allowClear
          showSearch
          loading={peopleLoading}
          disabled={Boolean(peopleError) || !people.length}
          placeholder="可选，用于绑定飞书通知"
          optionFilterProp="searchText"
          options={people.map((person) => ({
            value: person.openId,
            label: `${person.name}${person.email ? ` · ${person.email}` : ""}`,
            searchText: getPersonSearchText(person),
            person
          }))}
          onChange={(value, option) => {
            const selectedOption = Array.isArray(option) ? option[0] : option;
            const person = (selectedOption as { person?: FeishuPerson } | undefined)?.person;

            form.setFieldsValue({
              feishuOpenId: value || "",
              feishuUnionId: person?.unionId ?? "",
              feishuUserId: person?.userId ?? "",
              name: person?.name ?? form.getFieldValue("name"),
              email: person?.email ?? form.getFieldValue("email"),
              avatarUrl: person?.avatarUrl ?? form.getFieldValue("avatarUrl"),
              feishuEnabled: Boolean(value)
            });
          }}
        />
      </Form.Item>
      {peopleError ? (
      <Alert
        className="pm-form-alert"
        type="warning"
        showIcon
        title="飞书通讯录不可用，仍可手动添加成员"
        description={peopleError}
      />
      ) : null}
      <Form.Item name="feishuUnionId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="feishuUserId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="avatarUrl" hidden>
        <Input />
      </Form.Item>
    </>
  );
}

function MemberFields({
  form,
  people,
  peopleError,
  peopleLoading
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
}) {
  return (
    <>
      <MemberIdentityFields form={form} people={people} peopleError={peopleError} peopleLoading={peopleLoading} />
      <Form.Item label="成员姓名" name="name" rules={[{ required: true, message: "请输入成员姓名" }]}>
        <Input placeholder="例如：林夏" />
      </Form.Item>
      <Form.Item label="邮箱" name="email">
        <Input placeholder="用于非飞书身份匹配或后续登录扩展" />
      </Form.Item>
      <Form.Item label="角色" name="role" rules={[{ required: true, message: "请选择角色" }]}>
        <Select options={roleOptions.map(({ value, label }) => ({ value, label }))} />
      </Form.Item>
      <Form.Item label="状态" name="status">
        <Select options={statusOptions} />
      </Form.Item>
      <Alert
        className="pm-form-alert"
        type="info"
        showIcon
        title="通知渠道在成员保存后单独配置"
        description="成员资料只决定身份、角色和状态。飞书、邮箱、Webhook 等通知渠道可在列表中的通知配置弹窗里维护。"
      />
    </>
  );
}

function NotificationChannelItem({
  field,
  form,
  people,
  peopleError,
  peopleLoading,
  remove
}: {
  field: { key: number; name: number };
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
  remove: (index: number) => void;
}) {
  const provider = Form.useWatch(["channels", field.name, "provider"], form) as MemberNotificationChannelProvider | undefined;
  const currentProvider = provider ?? "feishu";

  return (
    <div className="member-channel-item">
      <div className="member-channel-item-header">
        <Space size={8} wrap>
          <BellOutlined />
          <Text strong>{getChannelProviderMeta(currentProvider).label}渠道</Text>
          <Form.Item name={[field.name, "enabled"]} valuePropName="checked" noStyle>
            <Switch checkedChildren="启用" unCheckedChildren="关闭" />
          </Form.Item>
        </Space>
        <Tooltip title="删除渠道">
          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
        </Tooltip>
      </div>
      <Form.Item name={[field.name, "id"]} hidden>
        <Input />
      </Form.Item>
      <div className="member-channel-grid">
        <Form.Item label="渠道类型" name={[field.name, "provider"]} rules={[{ required: true, message: "请选择渠道类型" }]}>
          <Select
            options={channelProviderOptions.map(({ value, label, disabled }) => ({
              value,
              label: disabled ? `${label}（待接入）` : label,
              disabled
            }))}
            onChange={() => {
              const channels = [...((form.getFieldValue("channels") as Record<string, unknown>[]) ?? [])];

              channels[field.name] = {
                ...channels[field.name],
                target: "",
                feishuOpenId: "",
                feishuUnionId: "",
                feishuUserId: "",
                email: "",
                webhookUrl: "",
                telegramChatId: ""
              };
              form.setFieldsValue({ channels });
            }}
          />
        </Form.Item>
        <Form.Item label="通知场景" name={[field.name, "scenes"]} rules={[{ required: true, message: "请选择通知场景" }]}>
          <Select mode="multiple" options={notificationSceneOptions} placeholder="选择需要通知的场景" />
        </Form.Item>
      </div>
      {currentProvider === "feishu" ? (
        <>
          <Form.Item label="飞书账号" name={[field.name, "feishuOpenId"]} rules={[{ required: true, message: "请选择飞书账号" }]}>
            <Select
              allowClear
              showSearch
              loading={peopleLoading}
              disabled={Boolean(peopleError) || !people.length}
              placeholder="选择要通知的飞书账号"
              optionFilterProp="searchText"
              options={people.map((person) => ({
                value: person.openId,
                label: `${person.name}${person.email ? ` · ${person.email}` : ""}`,
                searchText: getPersonSearchText(person),
                person
              }))}
              onChange={(value, option) => {
                const selectedOption = Array.isArray(option) ? option[0] : option;
                const person = (selectedOption as { person?: FeishuPerson } | undefined)?.person;
                const channels = [...((form.getFieldValue("channels") as Record<string, unknown>[]) ?? [])];

                channels[field.name] = {
                  ...channels[field.name],
                  target: value || "",
                  feishuOpenId: value || "",
                  feishuUnionId: person?.unionId ?? "",
                  feishuUserId: person?.userId ?? ""
                };
                form.setFieldsValue({ channels });
              }}
            />
          </Form.Item>
          <Form.Item name={[field.name, "target"]} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={[field.name, "feishuUnionId"]} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={[field.name, "feishuUserId"]} hidden>
            <Input />
          </Form.Item>
          {peopleError ? (
            <Alert
              className="pm-form-alert"
              type="warning"
              showIcon
              title="飞书通讯录不可用"
              description={peopleError}
            />
          ) : null}
        </>
      ) : null}
      {currentProvider === "email" ? (
        <Form.Item
          label="邮箱地址"
          name={[field.name, "email"]}
          rules={[
            { required: true, message: "请输入邮箱地址" },
            { type: "email", message: "请输入有效邮箱" }
          ]}
        >
          <Input placeholder="例如：name@example.com" />
        </Form.Item>
      ) : null}
      {currentProvider === "webhook" ? (
        <Form.Item label="Webhook 地址" name={[field.name, "webhookUrl"]} rules={[{ required: true, message: "请输入 Webhook 地址" }]}>
          <Input placeholder="例如：https://hooks.example.com/xxx" />
        </Form.Item>
      ) : null}
      {currentProvider === "telegram" ? (
        <>
          <Alert
            className="pm-form-alert"
            type="info"
            showIcon
            title="TG 通知待接入"
            description="当前仅预留 TG 渠道配置位，发送器和账号绑定开通后再启用。"
          />
          <Form.Item name={[field.name, "telegramChatId"]} hidden>
            <Input />
          </Form.Item>
        </>
      ) : null}
    </div>
  );
}

export function MembersView({
  members,
  people,
  peopleError,
  peopleLoading,
  permissions,
  submitting,
  onCreateMember,
  onUpdateMember
}: {
  members: DashboardMember[];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
  permissions: DashboardPermissions;
  submitting: boolean;
  onCreateMember: (values: Record<string, unknown>) => void;
  onUpdateMember: (member: DashboardMember, values: Record<string, unknown>) => void;
}) {
  const [form] = Form.useForm<Record<string, unknown>>();
  const [notificationForm] = Form.useForm<Record<string, unknown>>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationMember, setNotificationMember] = useState<DashboardMember | null>(null);
  const canManageMembers = permissions.canManageMembers;
  const deniedReason = permissions.deniedReason ?? "只有所有者或管理员可以管理成员。";

  const columns: ColumnsType<DashboardMember> = [
    {
      title: "成员",
      dataIndex: "name",
      key: "name",
      render: (_, member) => (
        <Space>
          <Avatar src={member.avatarUrl}>{getMemberInitial(member.name)}</Avatar>
          <Space orientation="vertical" size={0}>
            <Text strong>{member.name}</Text>
            <Text type="secondary">{member.email || member.notification.feishuOpenId || "未绑定邮箱"}</Text>
          </Space>
        </Space>
      )
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      width: 210,
      render: (_, member) => {
        const roleMeta = getRoleMeta(member.role);

        return canManageMembers ? (
          <Select
            className="member-role-select"
            popupMatchSelectWidth={180}
            size="small"
            value={member.role}
            options={roleOptions.map(({ value, label }) => ({ value, label }))}
            onChange={(role) => onUpdateMember(member, { role })}
          />
        ) : (
          <Tag color={roleMeta.color}>{roleMeta.label}</Tag>
        );
      }
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (_, member) => (
        <Switch
          checked={member.status === "active"}
          checkedChildren="启用"
          disabled={!canManageMembers || member.role === "owner"}
          unCheckedChildren="禁用"
          onChange={(checked) => onUpdateMember(member, { status: checked ? "active" : "disabled" })}
        />
      )
    },
    {
      title: "通知渠道",
      key: "channels",
      width: 260,
      render: (_, member) => (
        <Space size={[8, 6]} wrap>
          {channelProviderOptions.map((provider) => {
            const summary = getChannelTargetSummary(member, provider.value);

            return summary ? (
              <Tag color={provider.color} key={provider.value}>
                {provider.label} · {summary}
              </Tag>
            ) : null;
          })}
          {!member.notification.channels.length ? <Tag>未配置</Tag> : null}
        </Space>
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      render: (_, member) => (
        <Tooltip title={canManageMembers ? "配置多渠道通知" : deniedReason}>
          <Button
            icon={<SettingOutlined />}
            disabled={!canManageMembers}
            onClick={() => {
              setNotificationMember(member);
              notificationForm.setFieldsValue(getMemberNotificationFormValues(member));
            }}
          >
            通知配置
          </Button>
        </Tooltip>
      )
    }
  ];

  return (
    <TableView
      title="成员管理"
      subtitle="站内成员角色决定需求管理权限，通知渠道在弹窗中统一配置。"
      icon={<TeamOutlined />}
      extra={
        canManageMembers ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                role: "productMember",
                status: "active",
                feishuEnabled: false,
                taskAssigned: true,
                requirementChanged: true,
                channels: []
              });
              setDrawerOpen(true);
            }}
          >
            添加成员
          </Button>
        ) : (
          <Tooltip title={deniedReason}>
            <span>
              <Button disabled icon={<PlusOutlined />}>
                添加成员
              </Button>
            </span>
          </Tooltip>
        )
      }
    >
      {!canManageMembers ? (
        <Alert className="pm-source-alert" type="info" showIcon title={deniedReason} />
      ) : null}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={members}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" /> }}
        scroll={{ x: 980 }}
      />
      <Modal
        title={notificationMember ? `通知配置 · ${notificationMember.name}` : "通知配置"}
        open={Boolean(notificationMember)}
        onCancel={() => setNotificationMember(null)}
        confirmLoading={submitting}
        okText="保存配置"
        cancelText="取消"
        onOk={() => notificationForm.submit()}
        width={720}
      >
        <Alert
          className="pm-form-alert"
          type="info"
          showIcon
          title="通知渠道与通知场景分开配置"
          description="当前先支持飞书机器人通知；邮箱、Webhook 和 TG 已作为渠道结构预留，后续接入发送器后可直接启用。"
        />
        <Form
          form={notificationForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => {
            if (!notificationMember) {
              return;
            }

            onUpdateMember(notificationMember, values);
            setNotificationMember(null);
          }}
        >
          <Form.List name="channels">
            {(fields, { add, remove }) => (
              <Space className="pm-wide" orientation="vertical" size={12}>
                {fields.length ? (
                  fields.map((field) => (
                    <NotificationChannelItem
                      field={field}
                      form={notificationForm}
                      key={field.key}
                      people={people}
                      peopleError={peopleError}
                      peopleLoading={peopleLoading}
                      remove={remove}
                    />
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知渠道" />
                )}
                <Space wrap>
                  <Button icon={<PlusOutlined />} onClick={() => add(createDefaultNotificationChannel("feishu"))}>
                    添加飞书渠道
                  </Button>
                  <Button onClick={() => add(createDefaultNotificationChannel("email"))}>添加邮箱渠道</Button>
                  <Button onClick={() => add(createDefaultNotificationChannel("webhook"))}>添加 Webhook</Button>
                  <Tooltip title="TG 通知发送器待接入，当前先置灰展示">
                    <span>
                      <Button disabled>添加 TG 渠道</Button>
                    </span>
                  </Tooltip>
                </Space>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
      <Drawer
        className="pm-record-drawer"
        title="添加成员"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        footer={
          <Space className="pm-drawer-actions" style={{ justifyContent: "flex-end" }}>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => {
            onCreateMember(values);
            setDrawerOpen(false);
          }}
        >
          <MemberFields form={form} people={people} peopleError={peopleError} peopleLoading={peopleLoading} />
        </Form>
      </Drawer>
    </TableView>
  );
}
