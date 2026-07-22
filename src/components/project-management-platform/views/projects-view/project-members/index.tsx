"use client";

import "./index.less";
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SwapOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import type { DashboardMember, ProjectFunctionalRoleAssignment } from "@/types/dashboard";
import type {
  ProjectAccessLevel,
  ProjectEffectivePermission,
  ProjectFunctionalRole,
  ProjectManagementProject,
  ProjectOwnerTransferInput,
  ProjectPermission,
  ProjectPermissionInput
} from "@/components/project-management-platform/views/projects-view/types";

const { Text, Title } = Typography;

const accessLevelLabels: Record<ProjectAccessLevel, string> = {
  admin: "子管理员",
  member: "项目成员",
  commenter: "可评论",
  viewer: "仅查看"
};

const functionalRoleLabels: Record<ProjectFunctionalRole, string> = {
  delivery_manager: "交付经理",
  product_owner: "产品负责人",
  design_owner: "设计负责人",
  developer: "开发",
  tester: "测试",
  quality_owner: "质量负责人",
  ops_release: "运维发布",
  business_acceptor: "业务验收人",
  stakeholder: "项目关系人"
};

type PermissionFormValue = {
  memberId?: string;
  memberIds?: string[];
  accessLevel: ProjectAccessLevel;
  functionalRoles: ProjectFunctionalRoleAssignment[];
};

type PermissionRow = {
  key: string;
  member?: DashboardMember;
  permission?: ProjectPermission;
  isOwner: boolean;
};

function createFallbackEffectivePermission(permission: ProjectPermission): ProjectEffectivePermission {
  return {
    grants: [
      accessLevelLabels[permission.accessLevel],
      ...permission.functionalRoles.map((item) => functionalRoleLabels[item.roleKey])
    ],
    sources: permission.functionalRoles.map((item) =>
      item.sourceLabel || (item.sourceType === "manual" ? "项目权限手工配置" : "由业务责任自动授予")
    ),
    restrictions: permission.accessLevel === "viewer"
      ? ["不可编辑或评论"]
      : permission.accessLevel === "commenter"
        ? ["不可编辑项目数据"]
        : []
  };
}

export function ProjectMembers({
  currentMemberId,
  members,
  permissions,
  project,
  requirements,
  versions,
  onLoadEffectivePermission,
  onRemoveProjectPermission,
  onSaveProjectPermission,
  onTransferProjectOwner
}: {
  currentMemberId?: string;
  members: DashboardMember[];
  permissions: ProjectPermission[];
  project: ProjectManagementProject;
  requirements: Array<{ id: string; title: string }>;
  versions: Array<{ id: string; name: string }>;
  onLoadEffectivePermission?: (permission: ProjectPermission) => Promise<ProjectEffectivePermission | void>;
  onRemoveProjectPermission?: (permission: ProjectPermission) => Promise<boolean | void>;
  onSaveProjectPermission?: (input: ProjectPermissionInput) => Promise<boolean | void>;
  onTransferProjectOwner?: (input: ProjectOwnerTransferInput) => Promise<boolean | void>;
}) {
  const [permissionForm] = Form.useForm<PermissionFormValue>();
  const [transferForm] = Form.useForm<ProjectOwnerTransferInput>();
  const [editingPermission, setEditingPermission] = useState<ProjectPermission>();
  const [permissionDrawerOpen, setPermissionDrawerOpen] = useState(false);
  const [transferDrawerOpen, setTransferDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [effectivePermission, setEffectivePermission] = useState<ProjectEffectivePermission>();
  const [effectiveMember, setEffectiveMember] = useState<DashboardMember>();
  const watchedFunctionalRoles = Form.useWatch("functionalRoles", permissionForm) ?? [];
  const hasAutomaticRoles = watchedFunctionalRoles.some((role) => role.sourceType !== "manual");
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const projectPermissions = permissions.filter((permission) => permission.projectId === project.id);
  const ownerMember = project.ownerMemberId ? memberById.get(project.ownerMemberId) : undefined;
  const rows: PermissionRow[] = [
    {
      key: `owner-${project.id}`,
      member: ownerMember,
      isOwner: true
    },
    ...projectPermissions
      .filter((permission) => permission.memberId !== project.ownerMemberId)
      .map((permission) => ({
        key: permission.id,
        member: memberById.get(permission.memberId),
        permission,
        isOwner: false
      }))
  ];

  function openCreatePermission() {
    setEditingPermission(undefined);
    permissionForm.setFieldsValue({
      memberId: undefined,
      memberIds: [],
      accessLevel: "member",
      functionalRoles: [{ roleKey: "developer", scopeType: "project", sourceType: "manual" }]
    });
    setPermissionDrawerOpen(true);
  }

  function openEditPermission(permission: ProjectPermission) {
    setEditingPermission(permission);
    permissionForm.setFieldsValue({
      memberId: permission.memberId,
      memberIds: undefined,
      accessLevel: permission.accessLevel,
      functionalRoles: permission.functionalRoles.length
        ? permission.functionalRoles
        : [{ roleKey: "developer", scopeType: "project", sourceType: "manual" }]
    });
    setPermissionDrawerOpen(true);
  }

  async function savePermission() {
    if (!onSaveProjectPermission) {
      return;
    }

    const values = await permissionForm.validateFields();

    if (hasAutomaticRoles && ["commenter", "viewer"].includes(values.accessLevel)) {
      message.error("当前成员仍承担自动业务责任，不能降级为评论或只读。");

      return;
    }

    setSaving(true);

    try {
      const saved = await onSaveProjectPermission({
        projectId: project.id,
        permissionId: editingPermission?.id,
        memberId: editingPermission ? values.memberId : undefined,
        memberIds: editingPermission ? undefined : values.memberIds,
        accessLevel: values.accessLevel,
        functionalRoles: ["commenter", "viewer"].includes(values.accessLevel) ? [] : values.functionalRoles
      });

      if (saved !== false) {
        message.success(editingPermission ? "成员权限已更新" : "项目成员已添加");
        setPermissionDrawerOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function removePermission(permission: ProjectPermission) {
    if (!onRemoveProjectPermission) {
      return;
    }

    const removed = await onRemoveProjectPermission(permission);

    if (removed !== false) {
      message.success("项目成员已移除");
    }
  }

  async function openEffectivePermission(permission: ProjectPermission, member?: DashboardMember) {
    // 服务端会脱敏他人详情，前端仍做防御检查，避免旧快照或键盘调用打开无意义的限制弹层。
    if (permission.capabilities?.canViewEffectivePermission === false) {
      return;
    }

    setEffectiveMember(member);
    setEffectivePermission(permission.effectivePermission ?? createFallbackEffectivePermission(permission));

    if (!onLoadEffectivePermission) {
      return;
    }

    setEffectiveLoading(true);
    try {
      const loaded = await onLoadEffectivePermission(permission);

      if (loaded) {
        setEffectivePermission(loaded);
      }
    } finally {
      setEffectiveLoading(false);
    }
  }

  async function transferOwner() {
    if (!onTransferProjectOwner) {
      return;
    }

    const values = await transferForm.validateFields();
    setSaving(true);

    try {
      const transferred = await onTransferProjectOwner({ ...values, projectId: project.id });

      if (transferred !== false) {
        message.success("项目负责人已交接");
        setTransferDrawerOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<PermissionRow> = [
    {
      title: "成员",
      key: "member",
      width: 190,
      render: (_, row) => (
        <Space>
          <Avatar src={row.member?.avatarUrl || (row.isOwner ? project.ownerAvatarUrl : undefined)} icon={<UserOutlined />} />
          <span className="project-member-identity">
            <strong>{row.member?.name || (row.isOwner ? project.owner : "未匹配成员")}</strong>
            <Text type="secondary">{row.member?.id === currentMemberId ? "当前成员" : row.member?.email || "暂无邮箱"}</Text>
          </span>
        </Space>
      )
    },
    {
      title: "访问级别",
      width: 120,
      render: (_, row) => <Tag color={row.isOwner ? "purple" : undefined}>{row.isOwner ? "项目负责人" : accessLevelLabels[row.permission?.accessLevel ?? "viewer"]}</Tag>
    },
    {
      title: "职能角色",
      width: 260,
      render: (_, row) => row.isOwner ? <Tag>交付经理</Tag> : (
        row.permission?.functionalRoles.length
          ? row.permission.functionalRoles.map((role, index) => (
              <Tag key={`${role.roleKey}-${role.scopeType}-${role.scopeId ?? index}`}>
                {functionalRoleLabels[role.roleKey]}
              </Tag>
            ))
          : <Text type="secondary">无职能角色</Text>
      )
    },
    {
      title: "作用范围",
      width: 190,
      render: (_, row) => row.isOwner ? "整个项目" : (
        row.permission?.functionalRoles.length
          ? Array.from(new Set(row.permission.functionalRoles.map((role) => {
              const scopeType = String(role.scopeType);

              if (scopeType === "project") return "整个项目";
              if (scopeType === "requirement") {
                return role.sourceLabel || requirements.find((item) => item.id === role.scopeId)?.title || "指定需求";
              }
              if (scopeType === "plan_unit") {
                return role.sourceLabel || versions.find((item) => item.id === role.scopeId)?.name || "指定项目或版本";
              }

              return role.sourceLabel || "指定范围";
            }))).join("、")
          : "仅访问级别"
      )
    },
    {
      title: "当前责任",
      width: 180,
      render: (_, row) => row.isOwner ? "项目交付与成员治理" : (
        row.permission?.functionalRoles
          .filter((role) => role.sourceType !== "manual")
          .map((role) => role.sourceLabel)
          .filter(Boolean)
          .join("、") || "--"
      )
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 132,
      render: (_, row) => row.isOwner ? (
        onTransferProjectOwner ? <Button type="link" icon={<SwapOutlined />} onClick={() => {
          transferForm.setFieldsValue({
            projectId: project.id,
            newOwnerMemberId: "",
            keepPreviousOwnerAsAdmin: true,
            reason: ""
          });
          setTransferDrawerOpen(true);
        }}>交接</Button> : null
      ) : row.permission ? (
        <Space size={2}>
          {row.permission.capabilities?.canViewEffectivePermission !== false ? (
            <Tooltip title="查看有效权限">
              <Button type="text" icon={<EyeOutlined />} onClick={() => void openEffectivePermission(row.permission!, row.member)} />
            </Tooltip>
          ) : null}
          {onSaveProjectPermission && row.permission.capabilities?.canEdit !== false ? (
            <Tooltip title="编辑">
              <Button type="text" icon={<EditOutlined />} onClick={() => openEditPermission(row.permission!)} />
            </Tooltip>
          ) : null}
          {onRemoveProjectPermission && row.permission.capabilities?.canRemove !== false ? (
            <Popconfirm title="移除项目成员？" description="自动责任角色可能仍保留。" onConfirm={() => void removePermission(row.permission!)}>
              <Button danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          ) : null}
        </Space>
      ) : null
    }
  ];

  // derived:* 行只是需求责任派生出的只读展示，不代表已存在显式项目权限；管理员仍应能从“添加成员”
  // 为该成员创建正式权限行，把临时责任升级为稳定的项目成员身份。
  const existingMemberIds = new Set(
    projectPermissions
      .filter((permission) => !permission.id.startsWith("derived:"))
      .map((permission) => permission.memberId)
  );
  const memberOptions = members
    .filter((member) => member.status === "active")
    .map((member) => ({
      value: member.id,
      label: `${member.name}${member.email ? ` · ${member.email}` : ""}`,
      disabled: !editingPermission && (existingMemberIds.has(member.id) || member.id === project.ownerMemberId)
    }));

  return (
    <div className="project-members">
      <div className="project-members-header">
        <span><Title level={5}>成员与权限</Title><Text type="secondary">访问级别决定基础操作，职能角色叠加项目、版本或需求范围内的责任。</Text></span>
        {onSaveProjectPermission ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreatePermission}>添加成员</Button> : null}
      </div>
      <Table<PermissionRow>
        rowKey="key"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: <Empty description="暂无项目成员" /> }}
      />

      <Drawer
        size="large"
        open={permissionDrawerOpen}
        title={editingPermission ? "编辑成员权限" : "添加项目成员"}
        onClose={() => setPermissionDrawerOpen(false)}
        extra={<Button type="primary" loading={saving} onClick={() => void savePermission()}>保存</Button>}
      >
        <Form form={permissionForm} layout="vertical">
          {editingPermission ? (
            <Form.Item label="成员" name="memberId" rules={[{ required: true, message: "请选择项目成员" }]}>
              <Select showSearch disabled optionFilterProp="label" options={memberOptions} />
            </Form.Item>
          ) : (
            <Form.Item
              label="成员"
              name="memberIds"
              rules={[{ required: true, type: "array", min: 1, message: "请至少选择一名项目成员" }]}
              extra="可一次选择多人，并应用相同访问级别与手工职能角色。"
            >
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                options={memberOptions}
                placeholder="从已启用且未加入项目的成员中选择"
              />
            </Form.Item>
          )}
          <Form.Item label="访问级别" name="accessLevel" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(accessLevelLabels) as ProjectAccessLevel[]).map((value) => ({
                value,
                label: accessLevelLabels[value],
                disabled: hasAutomaticRoles && ["commenter", "viewer"].includes(value)
              }))}
              onChange={(value: ProjectAccessLevel) => {
                if (["commenter", "viewer"].includes(value)) {
                  permissionForm.setFieldValue("functionalRoles", []);
                }
              }}
            />
          </Form.Item>
          {hasAutomaticRoles ? (
            <Alert
              showIcon
              type="info"
              title="已有自动业务责任"
              description="请先在对应版本或需求中交接负责人，再将成员降级为评论或只读。"
            />
          ) : null}
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.accessLevel !== current.accessLevel}>
            {({ getFieldValue }) => ["commenter", "viewer"].includes(getFieldValue("accessLevel")) ? (
              <Alert showIcon type="info" title="评论者和查看者不授予额外职能角色。" />
            ) : (
              <Form.List name="functionalRoles">
                {(fields, { add, remove }) => (
                  <div className="project-member-role-editor">
                    <div className="project-member-role-editor-header">
                      <Text strong>职能角色与范围</Text>
                      <Button size="small" icon={<PlusOutlined />} onClick={() => add({ roleKey: "developer", scopeType: "project", sourceType: "manual" })}>添加角色</Button>
                    </div>
                    {fields.map(({ key, name, ...restField }) => {
                      const automatic = permissionForm.getFieldValue(["functionalRoles", name, "sourceType"]) !== "manual";

                      return (
                        <div className="project-member-role-row" key={key}>
                          <Form.Item {...restField} label="角色" name={[name, "roleKey"]} rules={[{ required: true }]}>
                            <Select disabled={automatic} options={(Object.keys(functionalRoleLabels) as ProjectFunctionalRole[]).map((value) => ({ value, label: functionalRoleLabels[value] }))} />
                          </Form.Item>
                          <Form.Item {...restField} label="范围" name={[name, "scopeType"]} rules={[{ required: true }]}>
                            <Select
                              disabled={automatic}
                              options={[
                                { value: "project", label: "整个项目" },
                                { value: "plan_unit", label: "指定项目或版本" },
                                { value: "requirement", label: "指定需求" }
                              ]}
                            />
                          </Form.Item>
                          <Form.Item noStyle shouldUpdate>
                            {() => {
                              const scopeType = permissionForm.getFieldValue(["functionalRoles", name, "scopeType"]);

                              if (scopeType === "requirement") {
                                return (
                                  <Form.Item {...restField} label="需求" name={[name, "scopeId"]} rules={[{ required: true, message: "请选择需求" }]}>
                                    <Select disabled={automatic} showSearch optionFilterProp="label" options={requirements.map((requirement) => ({ value: requirement.id, label: requirement.title }))} />
                                  </Form.Item>
                                );
                              }

                              if (scopeType === "plan_unit") {
                                return (
                                  <Form.Item {...restField} label="项目或版本" name={[name, "scopeId"]} rules={[{ required: true, message: "请选择项目或版本" }]}>
                                    <Select disabled={automatic} showSearch optionFilterProp="label" options={versions.map((version) => ({ value: version.id, label: version.name }))} />
                                  </Form.Item>
                                );
                              }

                              return null;
                            }}
                          </Form.Item>
                          {automatic ? <Tag color="processing">自动责任</Tag> : <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(name)} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Form.List>
            )}
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        size="default"
        open={transferDrawerOpen}
        title="交接项目负责人"
        onClose={() => setTransferDrawerOpen(false)}
        extra={<Button type="primary" loading={saving} onClick={() => void transferOwner()}>确认交接</Button>}
      >
        <Alert showIcon type="warning" title={`当前负责人：${project.owner || "未分配"}`} description="交接后新负责人将获得项目管理、成员管理和归档权限。" />
        <Form form={transferForm} layout="vertical" className="project-owner-transfer-form">
          <Form.Item label="新负责人" name="newOwnerMemberId" rules={[{ required: true, message: "请选择新负责人" }]}>
            <Select showSearch optionFilterProp="label" options={memberOptions.filter((option) => option.value !== project.ownerMemberId).map((option) => ({ ...option, disabled: false }))} />
          </Form.Item>
          <Form.Item name="keepPreviousOwnerAsAdmin" valuePropName="checked">
            <Checkbox>保留原负责人为子管理员</Checkbox>
          </Form.Item>
          <Form.Item label="交接原因" name="reason" rules={[{ required: true, message: "请填写交接原因" }]}>
            <Input.TextArea rows={4} maxLength={300} showCount placeholder="记录负责人变更背景，便于后续审计。" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        open={Boolean(effectivePermission)}
        title={`${effectiveMember?.name || "项目成员"}的有效权限`}
        confirmLoading={effectiveLoading}
        footer={<Button onClick={() => setEffectivePermission(undefined)}>关闭</Button>}
        onCancel={() => setEffectivePermission(undefined)}
      >
        <div className="project-effective-permission">
          <section><Text strong>有效授权</Text><Space wrap>{effectivePermission?.grants?.map((grant) => <Tag color="processing" key={grant}>{grant}</Tag>) || <Text type="secondary">暂无</Text>}</Space></section>
          <section><Text strong>权限来源</Text>{effectivePermission?.sources?.map((source) => <Text key={source}>{source}</Text>) || <Text type="secondary">暂无</Text>}</section>
          <section><Text strong>限制</Text>{effectivePermission?.restrictions?.length ? effectivePermission.restrictions.map((restriction) => <Text key={restriction}>{restriction}</Text>) : <Text type="secondary">暂无额外限制</Text>}</section>
        </div>
      </Modal>
    </div>
  );
}
