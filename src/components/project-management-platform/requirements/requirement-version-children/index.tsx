"use client";

import "./index.less";
import { Empty, Flex, Space, Tag, Typography } from "antd";
import { NodeIndexOutlined } from "@ant-design/icons";
import type { RequirementVersion } from "@/types/dashboard";
import { requirementVersionColor } from "@/components/project-management-platform/requirements/version-utils";

const { Text } = Typography;

// 子版本列表只负责展示层级关系，创建和进入详情仍由父级页面统一处理。
export function RequirementVersionChildren({
  childVersions,
  emptyText,
  onSelectVersion
}: {
  childVersions: RequirementVersion[];
  emptyText?: string;
  onSelectVersion: (id: string) => void;
}) {
  if (!childVersions.length) {
    return emptyText ? (
      <div className="requirement-version-children-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      </div>
    ) : null;
  }

  return (
    <div className="requirement-version-children">
      <Flex align="center" justify="space-between" className="requirement-version-children-header">
        <Space>
          <NodeIndexOutlined />
          <Text strong>子版本</Text>
        </Space>
        <Tag>{childVersions.length} 个</Tag>
      </Flex>
      <Space orientation="vertical" size={8} className="requirement-version-children-list">
        {childVersions.map((version) => (
          <button
            className="requirement-version-child-row"
            key={version.id}
            type="button"
            onClick={() => onSelectVersion(version.id)}
          >
            <span>
              <Text strong>{version.name}</Text>
              <Text type="secondary">{version.project}</Text>
            </span>
            <Tag color={requirementVersionColor[version.status]}>{version.status}</Tag>
          </button>
        ))}
      </Space>
    </div>
  );
}
