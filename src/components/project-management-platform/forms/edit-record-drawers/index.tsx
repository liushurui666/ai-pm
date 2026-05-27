"use client";

import "./index.less";
import { Drawer, Form, Space } from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { BugReport, Project, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { BugFields, ProjectFields, RequirementFields, RequirementVersionFields, TaskFields } from "@/components/project-management-platform/forms/form-fields";
import { DrawerFooterActions } from "@/components/project-management-platform/forms/drawer-footer-actions";

// 项目编辑抽屉只维护基础信息，里程碑由需求版本表单统一承载。
export function ProjectEditDrawer({
  form,
  project,
  submitting,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  project: Project | null;
  submitting: boolean;
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
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
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <ProjectFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            ownerRequired={false}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

// 任务编辑抽屉复用任务字段，确保手动任务和文档拆解任务保持一致。
export function TaskEditDrawer({
  form,
  task,
  submitting,
  projectOptions,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  task: Task | null;
  submitting: boolean;
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
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
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <TaskFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            projectOptions={projectOptions}
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
      className="pm-record-drawer"
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
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
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
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
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
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <RequirementFields
            form={form}
            versionOptions={versionOptions}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
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
  versionOptions,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  version: RequirementVersion | null;
  submitting: boolean;
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  versionOptions: RequirementVersionOption[];
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
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
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <RequirementVersionFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            versionOptions={versionOptions}
            editingVersionId={version.id}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}
