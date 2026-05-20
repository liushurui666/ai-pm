"use client";

import { Button, Space, Tag } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { Requirement } from "@/types/dashboard";
import { getSafeExternalUrl } from "@/components/project-management-platform/forms/form-utils";

// 需求资料链接只渲染安全 URL，同时用标签提示缺失的关键资料。
export function RequirementLinkActions({ requirement }: { requirement: Requirement }) {
  const uiHref = getSafeExternalUrl(requirement.uiLink);
  const documentHref = getSafeExternalUrl(requirement.documentLink);
  const links = [
    { key: "ui", label: "UI", href: uiHref },
    { key: "document", label: "需求文档", href: documentHref }
  ].filter((link) => Boolean(link.href));
  const missingItems = [
    !uiHref ? { key: "ui-missing", label: "缺 UI" } : null,
    !documentHref ? { key: "document-missing", label: "缺文档" } : null
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <Space className="requirement-link-actions" size={[8, 4]} wrap>
      {links.map((link) => (
        <Button
          key={link.key}
          type="link"
          size="small"
          icon={<LinkOutlined />}
          href={link.href}
          target="_blank"
          rel="noreferrer"
        >
          {link.label}
        </Button>
      ))}
      {missingItems.map((item) => (
        <Tag key={item.key} color="warning">
          {item.label}
        </Tag>
      ))}
    </Space>
  );
}
