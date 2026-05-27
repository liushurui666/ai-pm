"use client";

import "./index.less";
import { Button, Flex } from "antd";

// 抽屉底部动作统一收口，避免每个表单抽屉重复维护取消和保存按钮。
export function DrawerFooterActions({
  submitting,
  submitText,
  onClose,
  onSubmit
}: {
  submitting: boolean;
  submitText: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Flex className="pm-drawer-actions" justify="flex-end" gap={10}>
      <Button onClick={onClose}>取消</Button>
      <Button type="primary" loading={submitting} onClick={onSubmit}>
        {submitText}
      </Button>
    </Flex>
  );
}
