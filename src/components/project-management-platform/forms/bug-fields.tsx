"use client";

import { Col, Form, Input, Row, Select, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { normalizeBugAttachmentUploadEvent, uploadBugAttachment, type BugAttachmentUploadFile } from "@/components/project-management-platform/forms/bug-attachments";
import { OwnerSelect } from "@/components/project-management-platform/forms/owner-select";
import { VersionOnlyField } from "@/components/project-management-platform/forms/version-fields";

// Bug 字段按权限控制可编辑范围，让普通编辑和完整编辑共用一个组件。
export function BugFields({
  canEditBugs = true,
  canEditBugsFully = true,
  form,
  versionOptions,
  people,
  peopleLoading,
  peopleError
}: {
  canEditBugs?: boolean;
  canEditBugsFully?: boolean;
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
  people: OwnerSelectableMember[];
  peopleLoading: boolean;
  peopleError: string;
}) {
  const canEditStatusAndOwner = canEditBugs || canEditBugsFully;

  return (
    <>
      <Form.Item label="Bug 标题" name="title" rules={[{ required: true, message: "请输入 Bug 标题" }]}>
        <Input disabled={!canEditBugsFully} placeholder="例如：上传文档后任务负责人未自动关联飞书" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="严重程度" name="severity">
            <Select
              disabled={!canEditBugsFully}
              options={["阻塞", "严重", "一般", "轻微"].map((value) => ({ value, label: value }))}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="状态" name="status">
            <Select
              disabled={!canEditStatusAndOwner}
              options={["新建", "定位中", "修复中", "待验证", "已关闭"].map((value) => ({ value, label: value }))}
            />
          </Form.Item>
        </Col>
      </Row>
      <VersionOnlyField disabled={!canEditBugsFully} form={form} versionOptions={versionOptions} />
      <Form.Item
        label="提交人"
        name="reporter"
        rules={[{ required: true, message: "请输入提交人" }]}
      >
        <Input disabled={!canEditBugsFully} placeholder="填写提 Bug 的人" />
      </Form.Item>
      <OwnerSelect
        disabled={!canEditStatusAndOwner}
        form={form}
        people={people}
        loading={peopleLoading}
        error={peopleError}
        label="修复负责人"
      />
      <Form.Item label="环境" name="environment" rules={[{ required: true, message: "请输入复现环境" }]}>
        <Input disabled={!canEditBugsFully} placeholder="例如：Chrome 124 / macOS / 测试环境" />
      </Form.Item>
      <Form.Item label="复现步骤" name="reproduction" rules={[{ required: true, message: "请输入复现步骤" }]}>
        <Input.TextArea disabled={!canEditBugsFully} rows={4} placeholder="按 1、2、3 写清楚如何稳定复现" />
      </Form.Item>
      <Form.Item
        label="复现材料"
        name="attachments"
        valuePropName="fileList"
        getValueFromEvent={normalizeBugAttachmentUploadEvent}
        rules={[
          {
            validator(_, fileList: BugAttachmentUploadFile[] = []) {
              if (fileList.some((file) => file.status === "uploading")) {
                return Promise.reject(new Error("复现材料仍在上传，请稍后保存"));
              }

              if (fileList.some((file) => file.status === "error")) {
                return Promise.reject(new Error("请删除上传失败的材料后再保存"));
              }

              return Promise.resolve();
            }
          }
        ]}
      >
        <Upload.Dragger
          accept="image/*,video/*"
          customRequest={uploadBugAttachment}
          disabled={!canEditBugsFully}
          maxCount={8}
          multiple
          onPreview={(file) => {
            if (file.url) {
              window.open(file.url, "_blank", "noopener,noreferrer");
            }
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">上传复现截图或视频</p>
          <p className="ant-upload-hint">支持图片、视频，文件会保存到腾讯云 COS。</p>
        </Upload.Dragger>
      </Form.Item>
      <Form.Item label="预期结果" name="expected">
        <Input.TextArea disabled={!canEditBugsFully} rows={3} placeholder="系统应该出现什么结果" />
      </Form.Item>
      <Form.Item label="实际结果" name="actual" rules={[{ required: true, message: "请输入实际结果" }]}>
        <Input.TextArea disabled={!canEditBugsFully} rows={3} placeholder="实际看到的问题、报错或异常表现" />
      </Form.Item>
    </>
  );
}
