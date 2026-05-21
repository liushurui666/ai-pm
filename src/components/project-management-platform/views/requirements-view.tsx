"use client";

import { Button, Empty, Space, Tooltip } from "antd";
import { NodeIndexOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import { PageTitle } from "@/components/project-management-platform/shared/page-shell";
import { RequirementVersionCard } from "@/components/project-management-platform/requirements/requirement-version-card";
import { RequirementVersionDetail } from "@/components/project-management-platform/requirements/requirement-version-detail";
import {
  getChildRequirementVersions,
  getRootRequirementVersions
} from "@/components/project-management-platform/requirements/version-utils";

// 需求管理主视图只负责版本树入口，版本详情和卡片已拆到独立组件。
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
  onCreateSubVersion,
  onBreakdownVersion,
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
  onCreateSubVersion: (version: RequirementVersion) => void;
  onBreakdownVersion: (version: RequirementVersion) => void;
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
        childVersions={getChildRequirementVersions(versions, selectedVersion.id)}
        columns={columns}
        permissionDeniedReason={permissionDeniedReason}
        requirements={requirements}
        selectedVersion={selectedVersion}
        tasks={tasks}
        onBack={onBack}
        onBreakdownVersion={onBreakdownVersion}
        onCreateRequirement={onCreateRequirement}
        onCreateSubVersion={onCreateSubVersion}
        onDeleteVersion={onDeleteVersion}
        onEditVersion={onEditVersion}
        onSelectVersion={onSelectVersion}
      />
    );
  }

  const rootVersions = getRootRequirementVersions(versions);

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<NodeIndexOutlined />}
        title="需求版本"
        subtitle="给产品同学维护版本范围、子版本、角色负责人、需求优先级和上线状态。"
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
      {rootVersions.length ? (
        <div className="requirement-version-grid">
          {rootVersions.map((version) => (
            <RequirementVersionCard
              bugs={bugs}
              canCreateRequirements={canCreateRequirements}
              canDeleteRequirements={canDeleteRequirements}
              canEditRequirements={canEditRequirements}
              childVersions={getChildRequirementVersions(versions, version.id)}
              permissionDeniedReason={permissionDeniedReason}
              key={version.id}
              requirements={requirements}
              tasks={tasks}
              version={version}
              onBreakdownVersion={onBreakdownVersion}
              onCreateSubVersion={onCreateSubVersion}
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
