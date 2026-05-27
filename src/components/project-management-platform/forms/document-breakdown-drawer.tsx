"use client";

import { Alert, Drawer, Form, Space, Upload } from "antd";
import { InboxOutlined, UploadOutlined } from "@ant-design/icons";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { getUploadFileList } from "@/components/project-management-platform/forms/form-utils";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";
import { VersionOnlyField } from "@/components/project-management-platform/forms/form-fields";
import { DrawerFooterActions } from "@/components/project-management-platform/forms/drawer-footer-actions";

// 文档拆解抽屉以版本为主上下文，确保 AI 任务拆解直接落到选定版本。
export function DocumentBreakdownDrawer({
  form,
  open,
  submitting,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  open: boolean;
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
          <UploadOutlined />
          <span>按版本拆任务</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="AI 拆解并入库"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
        <Alert
          className="pm-form-alert"
          type="info"
          showIcon
          title="上传后会按目标版本生成任务"
          description="系统会读取文档内容，围绕你选择的版本拆解前端、后端、测试任务，并保存到任务看板。AI 识别到的负责人会优先匹配平台成员，未匹配时使用默认负责人。"
        />
        <VersionOnlyField
          form={form}
          versionOptions={versionOptions}
          versionLabel="目标版本"
          versionMessage="请选择文档拆解的目标版本"
        />
        <OwnerSelect
          form={form}
          people={people}
          loading={peopleLoading}
          error={peopleError}
          required={false}
          label="默认负责人"
        />
        <Form.Item
          label="文档"
          name="fileList"
          valuePropName="fileList"
          getValueFromEvent={getUploadFileList}
          rules={[{ required: true, message: "请上传文档" }]}
        >
          <Upload.Dragger
            accept=".docx,.txt,.md,.markdown,.csv,.json"
            beforeUpload={() => false}
            maxCount={1}
            multiple={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文档到这里</p>
            <p className="ant-upload-hint">支持 DOCX、Markdown、TXT、CSV、JSON，单个文件不超过 4MB。</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Drawer>
  );
}
