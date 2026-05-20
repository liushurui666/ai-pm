
"use client";

import { Button, Drawer, Form, Input, Space } from "antd";

type WorkspaceDrawerProps = {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<boolean>;
};

// 工作区抽屉封装创建表单，主容器只关心创建成功后的切换流程。
export function WorkspaceDrawer({ form, onClose, onSubmit, open, submitting }: WorkspaceDrawerProps) {
  return (
    <Drawer
      className="pm-record-drawer"
      title="新建工作区"
      open={open}
      onClose={onClose}
      footer={
        <Space className="pm-drawer-actions" style={{ justifyContent: "flex-end" }}>
          <Button onClick={onClose}>取消</Button>
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
        onFinish={async (values) => {
          const created = await onSubmit(values);

          if (created) {
            form.resetFields();
            onClose();
          }
        }}
      >
        <Form.Item label="工作区名称" name="name" rules={[{ required: true, message: "请输入工作区名称" }]}>
          <Input placeholder="例如：增长产品线" />
        </Form.Item>
        <Form.Item label="说明" name="description">
          <Input.TextArea placeholder="用于区分团队、产品线或业务域" autoSize={{ minRows: 3, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
