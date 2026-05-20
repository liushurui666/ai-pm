"use client";

import { Button, Empty, Flex, Popconfirm, Progress, Space, Table, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, NodeIndexOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import { PageTitle, TableView } from "@/components/project-management-platform/shared/page-shell";

const { Text, Paragraph } = Typography;

const fallbackRequirementVersionId = "rv-backlog";

const requirementVersionColor: Record<RequirementVersion["status"], string> = {
  规划中: "blue",
  进行中: "cyan",
  已发布: "green",
  已归档: "default"
};
const requirementReadinessTip = "按该版本下「待上线 / 已上线」需求占总需求数计算，用于快速判断版本就绪度。";

export function RequirementsView({
  bugs,
  canCreateRequirements,
  canDeleteRequirements,
  canEditRequirements,
  columns,
  permissionDeniedReason,
  requirements,
  selectedVersionId,
  tasks,
  versions,
  onBack,
  onCreateRequirement,
  onCreateVersion,
  onDeleteVersion,
  onEditVersion,
  onSelectVersion
}: {
  bugs: BugReport[];
  canCreateRequirements: boolean;
  canDeleteRequirements: boolean;
  canEditRequirements: boolean;
  columns: ColumnsType<Requirement>;
  permissionDeniedReason: string;
  requirements: Requirement[];
  selectedVersionId: string | null;
  tasks: Task[];
  versions: RequirementVersion[];
  onBack: () => void;
  onCreateRequirement: (version: RequirementVersion) => void;
  onCreateVersion: () => void;
  onDeleteVersion: (version: RequirementVersion) => void;
  onEditVersion: (version: RequirementVersion) => void;
  onSelectVersion: (id: string) => void;
}) {
  const selectedVersion = selectedVersionId ? versions.find((version) => version.id === selectedVersionId) : null;

  if (selectedVersion) {
    return (
      <RequirementVersionDetail
        bugs={bugs}
        canCreateRequirements={canCreateRequirements}
        canDeleteRequirements={canDeleteRequirements}
        canEditRequirements={canEditRequirements}
        columns={columns}
        permissionDeniedReason={permissionDeniedReason}
        requirements={requirements}
        selectedVersion={selectedVersion}
        tasks={tasks}
        onBack={onBack}
        onCreateRequirement={onCreateRequirement}
        onDeleteVersion={onDeleteVersion}
        onEditVersion={onEditVersion}
      />
    );
  }

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<NodeIndexOutlined />}
        title="需求版本"
        subtitle="给产品同学维护版本范围、需求优先级、验收标准和上线状态。"
        extra={
          canCreateRequirements ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateVersion}>
              新建版本
            </Button>
          ) : (
            <Tooltip title={permissionDeniedReason}>
              <span>
                <Button type="primary" disabled icon={<PlusOutlined />}>
                  新建版本
                </Button>
              </span>
            </Tooltip>
          )
        }
      />
      {versions.length ? (
        <div className="requirement-version-grid">
          {versions.map((version) => (
            <RequirementVersionCard
              bugs={bugs}
              canDeleteRequirements={canDeleteRequirements}
              canEditRequirements={canEditRequirements}
              permissionDeniedReason={permissionDeniedReason}
              key={version.id}
              requirements={requirements}
              tasks={tasks}
              version={version}
              onDeleteVersion={onDeleteVersion}
              onEditVersion={onEditVersion}
              onSelectVersion={onSelectVersion}
            />
          ))}
        </div>
      ) : (
        <div className="requirement-version-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无需求版本，先新建一个版本来收纳需求" />
        </div>
      )}
    </Space>
  );
}

function getVersionStats({
  bugs,
  requirements,
  tasks,
  version
}: {
  bugs: BugReport[];
  requirements: Requirement[];
  tasks: Task[];
  version: RequirementVersion;
}) {
  const scopedRequirements = requirements.filter((requirement) => requirement.versionId === version.id);
  const scopedTasks = tasks.filter((task) => task.versionId === version.id);
  const scopedBugs = bugs.filter((bug) => bug.versionId === version.id);
  const readyCount = scopedRequirements.filter(
    (requirement) => requirement.status === "待上线" || requirement.status === "已上线"
  ).length;
  const reviewCount = scopedRequirements.filter((requirement) => requirement.status === "评审中").length;
  const highPriorityCount = scopedRequirements.filter((requirement) => requirement.priority !== "P2").length;
  const progress = version.status === "已发布"
    ? 100
    : scopedRequirements.length
      ? Math.round((readyCount / scopedRequirements.length) * 100)
      : 0;

  return {
    scopedBugs,
    scopedRequirements,
    scopedTasks,
    reviewCount,
    highPriorityCount,
    progress
  };
}

function RequirementVersionDetail({
  bugs,
  canCreateRequirements,
  canDeleteRequirements,
  canEditRequirements,
  columns,
  permissionDeniedReason,
  requirements,
  selectedVersion,
  tasks,
  onBack,
  onCreateRequirement,
  onDeleteVersion,
  onEditVersion
}: {
  bugs: BugReport[];
  canCreateRequirements: boolean;
  canDeleteRequirements: boolean;
  canEditRequirements: boolean;
  columns: ColumnsType<Requirement>;
  permissionDeniedReason: string;
  requirements: Requirement[];
  selectedVersion: RequirementVersion;
  tasks: Task[];
  onBack: () => void;
  onCreateRequirement: (version: RequirementVersion) => void;
  onDeleteVersion: (version: RequirementVersion) => void;
  onEditVersion: (version: RequirementVersion) => void;
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
                description="删除后，该版本下的需求、任务和 Bug 会迁移到未规划需求池。"
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
        </Space>
      }
    >
      <VersionSummary version={selectedVersion} stats={stats} />
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
  return (
    <div className="requirement-version-summary">
      <div className="requirement-version-summary-item">
        <Text type="secondary">版本归属项目</Text>
        <Text strong>{version.project}</Text>
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">版本状态</Text>
        <Tag color={requirementVersionColor[version.status]}>{version.status}</Tag>
      </div>
      <div className="requirement-version-summary-item">
        <Text type="secondary">版本周期</Text>
        <Text strong>{version.startDate} - {version.releaseDate}</Text>
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
    </div>
  );
}

function RequirementVersionCard({
  bugs,
  canDeleteRequirements,
  canEditRequirements,
  permissionDeniedReason,
  requirements,
  tasks,
  version,
  onDeleteVersion,
  onEditVersion,
  onSelectVersion
}: {
  bugs: BugReport[];
  canDeleteRequirements: boolean;
  canEditRequirements: boolean;
  permissionDeniedReason: string;
  requirements: Requirement[];
  tasks: Task[];
  version: RequirementVersion;
  onDeleteVersion: (version: RequirementVersion) => void;
  onEditVersion: (version: RequirementVersion) => void;
  onSelectVersion: (id: string) => void;
}) {
  const stats = getVersionStats({ bugs, requirements, tasks, version });

  return (
    <div className="requirement-version-card">
      <Flex align="flex-start" justify="space-between" gap={12}>
        <Space orientation="vertical" size={4}>
          <Text strong>{version.name}</Text>
          <Text type="secondary">{version.project}</Text>
        </Space>
        <Tag color={requirementVersionColor[version.status]}>{version.status}</Tag>
      </Flex>
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
          <Text type="secondary">任务/Bug</Text>
          <Text strong>{stats.scopedTasks.length}/{stats.scopedBugs.length}</Text>
        </div>
      </div>
      <Button block onClick={() => onSelectVersion(version.id)}>
        进入版本
      </Button>
      <div className="requirement-version-actions">
        {canEditRequirements ? (
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
          canDeleteRequirements ? (
            <Popconfirm
              title="删除版本"
              description="删除后，该版本下的需求、任务和 Bug 会迁移到未规划需求池。"
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
