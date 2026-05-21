"use client";

import { Button, Flex, Popconfirm, Progress, Space, Table, Tag, Timeline, Tooltip, Typography } from "antd";
import { CalendarOutlined, DeleteOutlined, EditOutlined, NodeIndexOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import { fallbackRequirementVersionId, milestoneColor } from "@/components/project-management-platform/constants";
import { TableView } from "@/components/project-management-platform/shared/page-shell";
import {
  getVersionOwnerNames,
  getVersionStats,
  requirementReadinessTip,
  requirementVersionColor
} from "@/components/project-management-platform/requirements/version-utils";
import { RequirementVersionChildren } from "@/components/project-management-platform/requirements/requirement-version-children";

const { Text } = Typography;

// 版本详情页负责单个版本的交付视角，主列表只保留路由和数据分发。
export function RequirementVersionDetail({
  bugs,
  canCreateRequirements,
  canDeleteRequirements,
  canEditRequirements,
  childVersions,
  columns,
  permissionDeniedReason,
  requirements,
  selectedVersion,
  tasks,
  onBack,
  onBreakdownVersion,
  onCreateRequirement,
  onCreateSubVersion,
  onDeleteVersion,
  onEditVersion,
  onSelectVersion
}: {
  bugs: BugReport[];
  canCreateRequirements: boolean;
  canDeleteRequirements: boolean;
  canEditRequirements: boolean;
  childVersions: RequirementVersion[];
  columns: ColumnsType<Requirement>;
  permissionDeniedReason: string;
  requirements: Requirement[];
  selectedVersion: RequirementVersion;
  tasks: Task[];
  onBack: () => void;
  onBreakdownVersion: (version: RequirementVersion) => void;
  onCreateRequirement: (version: RequirementVersion) => void;
  onCreateSubVersion: (version: RequirementVersion) => void;
  onDeleteVersion: (version: RequirementVersion) => void;
  onEditVersion: (version: RequirementVersion) => void;
  onSelectVersion: (id: string) => void;
}) {
  const stats = getVersionStats({ bugs, requirements, tasks, version: selectedVersion });
  const detailColumns = columns.filter((column) => column.key !== "versionName");

  return (
    <TableView
      title={selectedVersion.name}
      subtitle={selectedVersion.goal}
      icon={<NodeIndexOutlined />}
      extra={
        <Space wrap>
          <Button onClick={onBack}>返回版本</Button>
          {canEditRequirements ? (
            <Button icon={<EditOutlined />} onClick={() => onEditVersion(selectedVersion)}>
              编辑版本
            </Button>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button disabled icon={<EditOutlined />}>
                  编辑版本
                </Button>
              </span>
            </Tooltip>
          )}
          {selectedVersion.id !== fallbackRequirementVersionId ? (
            canDeleteRequirements ? (
              <Popconfirm
                title="删除版本"
                description="删除后，该版本下的需求、任务和 Bug 会迁移到未规划需求池，子版本会提升为一级版本。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => onDeleteVersion(selectedVersion)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除版本
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title={permissionDeniedReason}>
                <span>
                  <Button danger disabled icon={<DeleteOutlined />}>
                    删除版本
                  </Button>
                </span>
              </Tooltip>
            )
          ) : null}
          {canCreateRequirements ? (
            <Button icon={<PlusOutlined />} onClick={() => onCreateSubVersion(selectedVersion)}>
              添加子版本
            </Button>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button disabled icon={<PlusOutlined />}>
                  添加子版本
                </Button>
              </span>
            </Tooltip>
          )}
          {canCreateRequirements ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => onCreateRequirement(selectedVersion)}>
              绑定需求
            </Button>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button type="primary" disabled icon={<PlusOutlined />}>
                  绑定需求
                </Button>
              </span>
            </Tooltip>
          )}
          {canCreateRequirements ? (
            <Button icon={<PlusOutlined />} onClick={() => onBreakdownVersion(selectedVersion)}>
              拆任务
            </Button>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button disabled icon={<PlusOutlined />}>
                  拆任务
                </Button>
              </span>
            </Tooltip>
          )}
        </Space>
      }
    >
      <VersionSummary version={selectedVersion} stats={stats} />
      <RequirementVersionChildren
        childVersions={childVersions}
        emptyText="该版本下暂无子版本"
        onSelectVersion={onSelectVersion}
      />
      <VersionMilestoneTimeline version={selectedVersion} stats={stats} />
      <Table
        className="requirement-detail-table"
        rowKey="id"
        columns={detailColumns}
        dataSource={stats.scopedRequirements}
        pagination={false}
        scroll={{ x: 1040 }}
        locale={{ emptyText: "该版本暂无需求，点击右上角绑定需求" }}
      />
    </TableView>
  );
}

function VersionSummary({
  version,
  stats
}: {
  version: RequirementVersion;
  stats: ReturnType<typeof getVersionStats>;
}) {
  const owners = getVersionOwnerNames(version);

  return (
    <div className="requirement-version-summary">
      <div className="requirement-version-summary-item">
        <Text type="secondary">版本归属项目</Text>
        <Text strong>{version.project}</Text>
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">上级版本</Text>
        <Text strong>{version.parentVersionName || "一级版本"}</Text>
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">版本状态</Text>
        <Tag color={requirementVersionColor[version.status]}>{version.status}</Tag>
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">版本周期</Text>
        <Text strong>{version.startDate} - {version.releaseDate}</Text>
      </div>
      <div className="requirement-version-summary-item requirement-version-owner-summary">
        <Text type="secondary">角色负责人</Text>
        {owners.length ? (
          <Space wrap size={[4, 4]}>
            {owners.map((owner) => (
              <Tag key={owner.label}>{owner.label}：{owner.value}</Tag>
            ))}
          </Space>
        ) : (
          <Text strong>未配置</Text>
        )}
      </div>
      <div className="requirement-version-summary-item">
        <Tooltip title={requirementReadinessTip}>
          <Text type="secondary">需求就绪</Text>
        </Tooltip>
        <Progress percent={stats.progress} size="small" />
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">总数 / 评审中 / 高优</Text>
        <Text strong>
          {stats.scopedRequirements.length} / {stats.reviewCount} / {stats.highPriorityCount}
        </Text>
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">研发任务 / Bug</Text>
        <Text strong>
          {stats.scopedTasks.length} / {stats.scopedBugs.length}
        </Text>
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">里程碑</Text>
        <Text strong>
          {stats.finishedMilestoneCount} / {stats.milestones.length}
        </Text>
      </div>
    </div>
  );
}

// 版本详情页直接展示创建版本时录入的里程碑，让版本成为真实交付检查点。
function VersionMilestoneTimeline({
  version,
  stats
}: {
  version: RequirementVersion;
  stats: ReturnType<typeof getVersionStats>;
}) {
  const milestones = [...stats.milestones].sort(
    (left, right) => dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf()
  );

  if (!milestones.length) {
    return null;
  }

  return (
    <div className="requirement-version-milestones">
      <Flex justify="space-between" align="center" className="requirement-version-milestones-header">
        <Space>
          <CalendarOutlined />
          <Text strong>版本里程碑</Text>
        </Space>
        <Tag>{version.name}</Tag>
      </Flex>
      <Timeline
        items={milestones.map((milestone) => ({
          color: milestoneColor[milestone.status] === "default" ? "gray" : milestoneColor[milestone.status],
          content: (
            <Space orientation="vertical" size={4}>
              <Space wrap>
                <Text strong>{milestone.title}</Text>
                <Tag color={milestoneColor[milestone.status]}>{milestone.status}</Tag>
                <Tag icon={<CalendarOutlined />}>{milestone.dueDate}</Tag>
                {milestone.owner ? <Tag>{milestone.owner}</Tag> : null}
              </Space>
              <Text type="secondary">{milestone.note}</Text>
            </Space>
          )
        }))}
      />
    </div>
  );
}
