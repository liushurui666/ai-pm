"use client";

import "./index.less";
import { Button, Flex, Popconfirm, Progress, Space, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import { fallbackRequirementVersionId } from "@/components/project-management-platform/constants";
import {
  getVersionOwnerNames,
  getVersionStats,
  requirementReadinessTip,
  requirementVersionColor
} from "@/components/project-management-platform/requirements/version-utils";
import { RequirementVersionChildren } from "@/components/project-management-platform/requirements/requirement-version-children";

const { Text, Paragraph } = Typography;

// 版本卡片聚合范围、负责人、子版本和操作入口，避免需求主视图继续变胖。
export function RequirementVersionCard({
  bugs,
  canBreakdownVersion,
  canCreateSubVersion,
  canDeleteVersion,
  canEditVersion,
  childVersions,
  permissionDeniedReason,
  requirements,
  tasks,
  version,
  onBreakdownVersion,
  onCreateSubVersion,
  onDeleteVersion,
  onEditVersion,
  onSelectVersion
}: {
  bugs: BugReport[];
  canBreakdownVersion: boolean;
  canCreateSubVersion: boolean;
  canDeleteVersion: boolean;
  canEditVersion: boolean;
  childVersions: RequirementVersion[];
  permissionDeniedReason: string;
  requirements: Requirement[];
  tasks: Task[];
  version: RequirementVersion;
  onBreakdownVersion: (version: RequirementVersion) => void;
  onCreateSubVersion: (version: RequirementVersion) => void;
  onDeleteVersion: (version: RequirementVersion) => void;
  onEditVersion: (version: RequirementVersion) => void;
  onSelectVersion: (id: string) => void;
}) {
  const stats = getVersionStats({ bugs, requirements, tasks, version });
  const owners = getVersionOwnerNames(version);

  return (
    <div className="requirement-version-card">
      <Flex className="requirement-version-card-head" align="flex-start" justify="space-between" gap={12}>
        <Space className="requirement-version-title-block" orientation="vertical" size={4}>
          <Text className="requirement-version-name" strong>{version.name}</Text>
          <Text className="requirement-version-project" type="secondary">{version.project}</Text>
          {version.parentVersionName ? <Tag>上级：{version.parentVersionName}</Tag> : null}
        </Space>
        <Tag className="requirement-version-status-tag" color={requirementVersionColor[version.status]}>
          {version.status}
        </Tag>
      </Flex>
      {owners.length ? (
        <Space wrap size={[6, 6]}>
          {owners.map((owner) => (
            <Tag key={owner.label}>{owner.label}：{owner.value}</Tag>
          ))}
        </Space>
      ) : null}
      <Paragraph className="requirement-version-goal" type="secondary">
        {version.goal}
      </Paragraph>
      <div className="requirement-version-progress">
        <Flex justify="space-between" align="center">
          <Tooltip title={requirementReadinessTip}>
            <Text type="secondary">需求就绪</Text>
          </Tooltip>
          <Text strong>{stats.progress}%</Text>
        </Flex>
        <Progress percent={stats.progress} size="small" showInfo={false} />
      </div>
      <div className="requirement-version-meta">
        <div>
          <Text type="secondary">需求数</Text>
          <Text strong>{stats.scopedRequirements.length}</Text>
        </div>
        <div>
          <Text type="secondary">评审中</Text>
          <Text strong>{stats.reviewCount}</Text>
        </div>
        <div>
          <Text type="secondary">高优先级</Text>
          <Text strong>{stats.highPriorityCount}</Text>
        </div>
        <div>
          <Text type="secondary">里程碑</Text>
          <Text strong>{stats.finishedMilestoneCount}/{stats.milestones.length}</Text>
        </div>
        <div>
          <Text type="secondary">任务/Bug</Text>
          <Text strong>{stats.scopedTasks.length}/{stats.scopedBugs.length}</Text>
        </div>
      </div>
      <RequirementVersionChildren childVersions={childVersions} onSelectVersion={onSelectVersion} />
      {/* 进入版本是版本卡片里的主路径，视觉层级高于编辑/删除等维护操作。 */}
      <Button block className="requirement-version-enter-button" type="primary" onClick={() => onSelectVersion(version.id)}>
        进入版本
      </Button>
      <div className="requirement-version-actions">
        {canCreateSubVersion ? (
          <Button icon={<PlusOutlined />} onClick={() => onCreateSubVersion(version)}>
            子版本
          </Button>
        ) : null}
        {canBreakdownVersion ? (
          <Button icon={<PlusOutlined />} onClick={() => onBreakdownVersion(version)}>
            拆任务
          </Button>
        ) : null}
        {canEditVersion ? (
          <Button icon={<EditOutlined />} onClick={() => onEditVersion(version)}>
            编辑
          </Button>
        ) : (
          <Tooltip title={permissionDeniedReason}>
            <span>
              <Button disabled icon={<EditOutlined />}>
                编辑
              </Button>
            </span>
          </Tooltip>
        )}
        {version.id !== fallbackRequirementVersionId ? (
          canDeleteVersion ? (
            <Popconfirm
              title="删除版本"
              description="删除后，关联需求、任务和 Bug 仅会迁移到项目内可唯一确定的兜底版本；无法唯一定位时将拒绝删除，子版本会提升一级。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDeleteVersion(version)}
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button danger disabled icon={<DeleteOutlined />}>
                  删除
                </Button>
              </span>
            </Tooltip>
          )
        ) : null}
      </div>
    </div>
  );
}
