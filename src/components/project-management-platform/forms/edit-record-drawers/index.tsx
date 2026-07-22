"use client";

import "./index.less";
import { Alert, Drawer, Form, Space } from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { BugReport, Project, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { BugFields, ProjectFields, RequirementFields, RequirementVersionFields, TaskFields } from "@/components/project-management-platform/forms/form-fields";
import type { TaskRequirementOption } from "@/components/project-management-platform/forms/task-fields";
import type { RequirementFieldAccess } from "@/components/project-management-platform/forms/requirement-fields";
import { DrawerFooterActions } from "@/components/project-management-platform/forms/drawer-footer-actions";

// 项目编辑抽屉只维护基础信息，里程碑由需求版本表单统一承载。
export function ProjectEditDrawer({
  form,
  project,
  submitting,
  people,
  peopleLoading,
  peopleError,
  canArchiveProject,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  project: Project | null;
  submitting: boolean;
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  canArchiveProject: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer pm-edit-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑项目</span>
        </Space>
      }
      open={Boolean(project)}
      onClose={onClose}
      size="large"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {project ? (
        <Form className="pm-record-form" form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <Alert
            type="info"
            showIcon
            message="负责人交接请在“成员与权限”页完成"
            description="交接流程会校验新负责人、记录交接原因，并保留完整项目动态。"
          />
          <ProjectFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            ownerRequired={false}
            showOwner={false}
            canArchiveProject={canArchiveProject}
            currentStatus={project.status}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

// 任务编辑抽屉复用任务字段；项目归属继续由版本隐藏同步，避免编辑时重新暴露项目选择。
export function TaskEditDrawer({
  form,
  task,
  submitting,
  versionOptions,
  requirementOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  task: Task | null;
  submitting: boolean;
  versionOptions: RequirementVersionOption[];
  requirementOptions: TaskRequirementOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer pm-edit-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑任务</span>
        </Space>
      }
      open={Boolean(task)}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {task ? (
        <Form className="pm-record-form" form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <TaskFields
            form={form}
            lockRelations
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            requirementOptions={requirementOptions}
            versionOptions={versionOptions}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

// Bug 编辑抽屉用于列表内轻量编辑，独立 Bug 路由会复用同一组字段。
export function BugEditDrawer({
  form,
  bug,
  submitting,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  bug: BugReport | null;
  submitting: boolean;
  versionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer pm-edit-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑 Bug</span>
        </Space>
      }
      open={Boolean(bug)}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {bug ? (
        <Form className="pm-record-form" form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <BugFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            versionOptions={versionOptions}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

// 需求编辑抽屉集中处理需求版本、链接和 AI 质量字段。
export function RequirementEditDrawer({
  form,
  requirement,
  submitting,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  fieldAccess,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  requirement: Requirement | null;
  submitting: boolean;
  versionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  fieldAccess: RequirementFieldAccess;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer pm-edit-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑需求</span>
        </Space>
      }
      open={Boolean(requirement)}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {requirement ? (
        <Form className="pm-record-form" form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <RequirementFields
            form={form}
            versionOptions={versionOptions}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            fieldAccess={fieldAccess}
            lockRelations
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

// 需求版本编辑抽屉只管理版本元数据，避免和需求明细职责混在一起。
export function RequirementVersionEditDrawer({
  form,
  version,
  submitting,
  people,
  peopleLoading,
  peopleError,
  projects,
  versionOptions,
  canManageDeliveryLabelCatalog,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  version: RequirementVersion | null;
  submitting: boolean;
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  projects: Project[];
  versionOptions: RequirementVersionOption[];
  canManageDeliveryLabelCatalog: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer pm-edit-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑版本</span>
        </Space>
      }
      open={Boolean(version)}
      onClose={onClose}
      size="large"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {version ? (
        <Form className="pm-record-form" form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <RequirementVersionFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            projects={projects}
            versionOptions={versionOptions}
            editingVersionId={version.id}
            canManageDeliveryLabelCatalog={canManageDeliveryLabelCatalog}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}
