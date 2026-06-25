"use client";

import "./index.less";
import { Alert, Avatar, Button, Drawer, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { BellOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { useState, type ReactElement } from "react";
import type { ColumnsType } from "antd/es/table";
import type {
  DashboardMember,
  DashboardPermissions,
  FeishuPerson,
  MemberIdentityProvider,
  MemberNotificationChannelProvider,
  MemberNotificationScene,
  MemberRole,
  MemberStatus
} from "@/types/dashboard";
import { DrawerFooterActions } from "@/components/project-management-platform/forms/drawer-footer-actions";
import { TableView } from "@/components/project-management-platform/shared/page-shell";

const { Text } = Typography;

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

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
  { value: "webhook", label: "Webhook", color: "purple", disabled: true },
  { value: "telegram", label: "TG", color: "default", disabled: true }
];

const notificationSceneOptions: Array<{ value: MemberNotificationScene; label: string }> = [
  { value: "taskAssigned", label: "任务分配" },
  { value: "requirementChanged", label: "需求变更" },
  { value: "bugFlowChanged", label: "Bug 流转" }
];

const registrationChannelOptions: Array<{ value: MemberIdentityProvider; label: string; color: string }> = [
  { value: "github", label: "GitHub", color: "default" },
  { value: "google", label: "Google", color: "blue" },
  { value: "feishu", label: "飞书", color: "cyan" },
  { value: "email", label: "邮箱/手动", color: "gold" }
];

function getRoleMeta(role: MemberRole) {
  return roleOptions.find((option) => option.value === role) ?? roleOptions.at(-1)!;
}

function getChannelProviderMeta(provider: MemberNotificationChannelProvider) {
  return channelProviderOptions.find((option) => option.value === provider) ?? channelProviderOptions[0];
}

function getRegistrationChannelMeta(provider: MemberIdentityProvider) {
  return registrationChannelOptions.find((option) => option.value === provider) ?? registrationChannelOptions.at(-1)!;
}

function getMemberInitial(name?: string) {
  return (name?.trim() || "成").slice(0, 1);
}

function getPersonSearchText(person: FeishuPerson) {
  return [person.name, person.enName, person.email, person.openId, person.userId].filter(Boolean).join(" ");
}

// 飞书联系人下拉会先加载完整授权范围，再由 Select 本地搜索过滤；
// 这里把“已加载人数”和“搜索无匹配”直接展示出来，避免用户把过滤结果误判为通讯录只同步了一两个人。
function getFeishuPeopleNotFoundContent(people: FeishuPerson[], peopleLoading: boolean) {
  if (peopleLoading) {
    return "正在加载通讯录";
  }

  return people.length ? "当前搜索没有匹配联系人" : "通讯录未返回联系人";
}

function renderFeishuPeoplePopup(
  menu: ReactElement,
  people: FeishuPerson[],
  peopleLoading: boolean,
  onReloadPeople: () => void
) {
  return (
    <div className="member-feishu-select-popup">
      {menu}
      <div className="member-feishu-select-summary">
        <Text type="secondary">
          {peopleLoading
            ? "正在同步飞书通讯录..."
            : people.length
              ? `已加载 ${people.length} 位联系人，输入内容会在这些联系人内过滤`
              : "未加载到飞书联系人，可先手动填写成员信息"}
        </Text>
        <Button
          icon={<ReloadOutlined />}
          loading={peopleLoading}
          size="small"
          type="text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReloadPeople}
        >
          刷新
        </Button>
      </div>
    </div>
  );
}

function formatMemberLastActiveAt(value?: string) {
  if (!value) {
    return {
      absolute: "",
      text: "从未登录"
    };
  }

  const activeAt = dayjs(value);

  if (!activeAt.isValid()) {
    return {
      absolute: "",
      text: "从未登录"
    };
  }

  const now = dayjs();
  const diffMinutes = now.diff(activeAt, "minute");
  const absolute = activeAt.format("YYYY-MM-DD HH:mm");

  // 最近活跃是 5 分钟节流写入，不是实时在线心跳；一分钟内统一展示“刚刚”，
  // 既避免用户误读成秒级在线状态，也让成员管理表格保持紧凑。
  if (diffMinutes < 1) {
    return {
      absolute,
      text: "刚刚"
    };
  }

  return {
    absolute,
    text: diffMinutes < 24 * 60 ? activeAt.fromNow() : absolute
  };
}

function getChannelTargetSummary(member: DashboardMember, provider: MemberNotificationChannelProvider) {
  const channels = member.notification.channels.filter((channel) => channel.provider === provider);
  const providerMeta = getChannelProviderMeta(provider);

  if (!channels.length) {
    return "";
  }

  if (providerMeta.disabled) {
    // Webhook/TG 目前只保留配置数据，不应在列表里展示成“已启用发送”，避免测试时误判通知链路已经接通。
    return "待接入";
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

// 成员身份字段只负责把飞书通讯录身份同步到表单隐藏字段，避免通知绑定和站内登录身份在不同入口各自拼接。
function MemberIdentityFields({
  form,
  people,
  peopleError,
  peopleLoading,
  peopleWarning,
  onReloadPeople
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
  peopleWarning: string;
  onReloadPeople: () => void;
}) {
  return (
    <>
      <Form.Item label="从飞书通讯录选择" name="feishuOpenId">
        <Select
          allowClear
          showSearch
          loading={peopleLoading}
          disabled={Boolean(peopleError) || !people.length}
          notFoundContent={getFeishuPeopleNotFoundContent(people, peopleLoading)}
          placeholder="可选，用于绑定飞书通知"
          optionFilterProp="searchText"
          popupRender={(menu) => renderFeishuPeoplePopup(menu, people, peopleLoading, onReloadPeople)}
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
      {!peopleError && peopleWarning ? (
        <Alert
          className="pm-form-alert"
          type="warning"
          showIcon
          title="飞书通讯录只返回了部分成员"
          description={peopleWarning}
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

// 添加成员抽屉保留最少身份字段，通知渠道改到保存后的配置弹窗，避免首次建成员时被多渠道配置打断。
function MemberFields({
  form,
  people,
  peopleError,
  peopleLoading,
  peopleWarning,
  onReloadPeople
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
  peopleWarning: string;
  onReloadPeople: () => void;
}) {
  return (
    <>
      <MemberIdentityFields
        form={form}
        people={people}
        peopleError={peopleError}
        peopleLoading={peopleLoading}
        peopleWarning={peopleWarning}
        onReloadPeople={onReloadPeople}
      />
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

// 单个通知渠道同时承载类型切换、场景选择和目标账号；类型切换时必须清空旧目标，防止邮箱/Webhook 误复用飞书 openId。
function NotificationChannelItem({
  field,
  form,
  people,
  peopleError,
  peopleLoading,
  peopleWarning,
  onReloadPeople,
  remove
}: {
  field: { key: number; name: number };
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
  peopleWarning: string;
  onReloadPeople: () => void;
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
              notFoundContent={getFeishuPeopleNotFoundContent(people, peopleLoading)}
              placeholder="选择要通知的飞书账号"
              optionFilterProp="searchText"
              popupRender={(menu) => renderFeishuPeoplePopup(menu, people, peopleLoading, onReloadPeople)}
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
          {!peopleError && peopleWarning ? (
            <Alert
              className="pm-form-alert"
              type="warning"
              showIcon
              title="飞书通讯录只返回了部分成员"
              description={peopleWarning}
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

// 成员管理页是工作区权限和通知配置的后台入口，表格保持高密度，新增/配置动作收敛到弹层。
export function MembersView({
  members,
  people,
  peopleError,
  peopleLoading,
  peopleWarning,
  permissions,
  submitting,
  onCreateMember,
  onReloadPeople,
  onUpdateMember
}: {
  members: DashboardMember[];
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
  peopleWarning: string;
  permissions: DashboardPermissions;
  submitting: boolean;
  onCreateMember: (values: Record<string, unknown>) => void;
  onReloadPeople: () => void;
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
        <Space className="member-person-cell">
          <Avatar src={member.avatarUrl}>{getMemberInitial(member.name)}</Avatar>
          <Space className="member-person-copy" orientation="vertical" size={0}>
            <Text strong>{member.name}</Text>
            <Text type="secondary">{member.email || member.notification.feishuOpenId || "未绑定邮箱"}</Text>
          </Space>
        </Space>
      )
    },
    {
      title: "注册渠道",
      dataIndex: "registrationChannel",
      key: "registrationChannel",
      width: 130,
      render: (_, member) => {
        const channelMeta = getRegistrationChannelMeta(member.registrationChannel);

        // 注册渠道展示成员当前已确认的主登录 provider，和飞书通知渠道是两件事；
        // 同邮箱多身份归并后仍要显示 Google/GitHub 等真实 OAuth 来源，避免把通知能力误当成登录来源。
        return <Tag color={channelMeta.color}>{channelMeta.label}</Tag>;
      }
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
      title: "最近活跃",
      dataIndex: "lastActiveAt",
      key: "lastActiveAt",
      width: 150,
      render: (_, member) => {
        const lastActive = formatMemberLastActiveAt(member.lastActiveAt);

        return (
          <Tooltip title={lastActive.absolute || "该成员还没有登录或访问记录"}>
            <Text className="member-last-active" type="secondary">
              {lastActive.text}
            </Text>
          </Tooltip>
        );
      }
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
              // 添加成员依赖最新飞书通讯录。旧会话可能已经缓存过“部分返回”的联系人，
              // 打开配置弹窗时强制刷新一次，避免用户只能在过期的少量联系人里选择。
              onReloadPeople();
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
              // 新建成员前主动刷新通讯录，保证下拉优先拿当前飞书授权范围，而不是沿用历史缓存。
              onReloadPeople();
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
        className="member-management-table"
        rowKey="id"
        columns={columns}
        dataSource={members}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" /> }}
        scroll={{ x: 1260 }}
      />
      <Modal
        className="member-notification-modal"
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
          description="当前实际发送支持飞书机器人和邮箱；Webhook 和 TG 仅保留数据结构，待接入发送器后再开放新增。"
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
                      peopleWarning={peopleWarning}
                      onReloadPeople={onReloadPeople}
                      remove={remove}
                    />
                  ))
                ) : (
                  <Empty className="member-channel-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知渠道" />
                )}
                <Space className="member-channel-actions" wrap>
                  <Button icon={<PlusOutlined />} onClick={() => add(createDefaultNotificationChannel("feishu"))}>
                    添加飞书渠道
                  </Button>
                  <Button
                    onClick={() =>
                      add({
                        ...createDefaultNotificationChannel("email"),
                        email: notificationMember?.email || "",
                        target: notificationMember?.email || ""
                      })
                    }
                  >
                    添加邮箱渠道
                  </Button>
                  <Tooltip title="Webhook 发送器待接入，当前不会触发回调">
                    <span>
                      <Button disabled>添加 Webhook</Button>
                    </span>
                  </Tooltip>
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
          <DrawerFooterActions
            submitting={submitting}
            submitText="保存"
            onClose={() => setDrawerOpen(false)}
            onSubmit={() => form.submit()}
          />
        }
      >
        <Form
          className="pm-record-form"
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => {
            onCreateMember(values);
            setDrawerOpen(false);
          }}
        >
          <MemberFields
            form={form}
            people={people}
            peopleError={peopleError}
            peopleLoading={peopleLoading}
            peopleWarning={peopleWarning}
            onReloadPeople={onReloadPeople}
          />
        </Form>
      </Drawer>
    </TableView>
  );
}
