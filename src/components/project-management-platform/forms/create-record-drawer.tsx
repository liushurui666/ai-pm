"use client";

import { Drawer, Form } from "antd";
import type { DashboardEntityType } from "@/types/records";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { entityLabels } from "@/components/project-management-platform/constants";
import { BugFields, DocumentFields, ProjectFields, RequirementFields, RequirementVersionFields, RiskFields, TaskFields } from "@/components/project-management-platform/forms/form-fields";
import { DrawerFooterActions } from "@/components/project-management-platform/forms/drawer-footer-actions";

// 新建记录抽屉根据实体类型切换字段组件，主容器只传入提交回调。
export function CreateRecordDrawer({
  form,
  open,
  type,
  submitting,
  projectOptions,
  requirementVersionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  open: boolean;
  type: DashboardEntityType | null;
  submitting: boolean;
  projectOptions: string[];
  requirementVersionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const label = type ? entityLabels[type] : "";

  return (
    <Drawer
      className="pm-record-drawer"
      title={type ? `新建${label}` : "新建"}
      open={open}
      onClose={onClose}
      size={type === "project" || type === "requirementVersion" ? "large" : "default"}
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {type ? (
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          {type === "project" ? (
            <ProjectFields form={form} people={people} peopleLoading={peopleLoading} peopleError={peopleError} />
          ) : null}
          {type === "task" ? (
            <TaskFields
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              projectOptions={projectOptions}
              versionOptions={requirementVersionOptions}
            />
          ) : null}
          {type === "bug" ? (
            <BugFields
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              versionOptions={requirementVersionOptions}
            />
          ) : null}
          {type === "risk" ? (
            <RiskFields
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              projectOptions={projectOptions}
            />
          ) : null}
          {type === "requirementVersion" ? (
            <RequirementVersionFields
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              projectOptions={projectOptions}
              versionOptions={requirementVersionOptions}
            />
          ) : null}
          {type === "requirement" ? (
            <RequirementFields
              form={form}
              versionOptions={requirementVersionOptions}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
            />
          ) : null}
          {type === "document" ? <DocumentFields /> : null}
        </Form>
      ) : null}
    </Drawer>
  );
}
