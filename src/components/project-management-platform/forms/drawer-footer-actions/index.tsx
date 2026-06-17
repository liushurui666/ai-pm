"use client";

import "./index.less";
import { Button, Flex } from "antd";

// 抽屉底部动作统一收口，禁用态也放在这里处理，避免高风险操作绕过仓库/权限未就绪保护。
export function DrawerFooterActions({
  submitDisabled = false,
  submitting,
  submitText,
  onClose,
  onSubmit
}: {
  submitDisabled?: boolean;
  submitting: boolean;
  submitText: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Flex className="pm-drawer-actions" justify="flex-end" gap={10}>
      <Button onClick={onClose}>取消</Button>
      <Button type="primary" loading={submitting} disabled={submitDisabled} onClick={onSubmit}>
        {submitText}
      </Button>
    </Flex>
  );
}
