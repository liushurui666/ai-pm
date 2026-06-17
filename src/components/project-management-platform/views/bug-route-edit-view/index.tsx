"use client";

import { Button, Card, Empty, Form, Popconfirm, Space, Tag, Timeline, Tooltip, Typography } from "antd";
import { ArrowLeftOutlined, BugOutlined, DeleteOutlined, EditOutlined, PaperClipOutlined, SaveOutlined } from "@ant-design/icons";
import { useEffect } from "react";
import dayjs from "dayjs";
import type { BugReport, Project } from "@/types/dashboard";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { BugFields } from "@/components/project-management-platform/forms/form-fields";
import { getBugFormValues } from "@/components/project-management-platform/forms/form-utils";
import { hydrateOwnerFormValues } from "@/components/project-management-platform/forms/owner-select";
import type { BugAiFixFormValues } from "@/components/project-management-platform/forms/bug-ai-fix-drawer";
import { BugAiFixCard } from "@/components/project-management-platform/shared/bug-ai-fix-card";
import { PageTitle } from "@/components/project-management-platform/shared/page-shell";
import { bugFlowActionColor, bugFlowActionLabel, formatBugCreatedAt, getAttachmentLabel, getBugFlowDescription, getBugFlowRecords } from "@/components/project-management-platform/views/bugs-view";
import "./index.less";

const { Text } = Typography;

// 独立 Bug 编辑页把表单和流转记录放在同一屏，适合从列表跳转后深度处理。
export function BugRouteEditView({
  bug,
  canEditBugs,
  canEditBugsFully,
  canDeleteBugs,
  form,
  onBack,
  onDelete,
  onCreateAiFix,
  onSubmit,
  people,
  peopleError,
  peopleLoading,
  permissionDeniedReason,
  projects,
  submitting,
  versionOptions,
  workspaceId
}: {
  bug: BugReport | null;
  canEditBugs: boolean;
  canEditBugsFully: boolean;
  canDeleteBugs: boolean;
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  onBack: () => void;
  onDelete: (bug: BugReport) => void;
  onCreateAiFix: (bug: BugReport, values: BugAiFixFormValues) => Promise<void>;
  onSubmit: (bug: BugReport, values: Record<string, unknown>) => void;
  people: OwnerSelectableMember[];
  peopleError: string;
  peopleLoading: boolean;
  permissionDeniedReason: string;
  projects: Project[];
  submitting: boolean;
  versionOptions: RequirementVersionOption[];
  workspaceId: string;
}) {
  useEffect(() => {
    if (!bug) {
      form.resetFields();

      return;
    }

    form.resetFields();
    form.setFieldsValue(hydrateOwnerFormValues(getBugFormValues(bug), people));
  }, [bug, form, people]);

  if (!bug) {
    return (
      <Space orientation="vertical" size={18} className="pm-page-stack">
        <PageTitle
          icon={<BugOutlined />}
          title="编辑 Bug"
          subtitle="当前 Bug 不存在或已被删除。"
          extra={<Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回 Bug 管理</Button>}
        />
        <Card className="bug-edit-missing-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到这个 Bug" />
        </Card>
      </Space>
    );
  }

  const flowRecords = getBugFlowRecords(bug);

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack bug-route-page">
      <PageTitle
        icon={<BugOutlined />}
        title="编辑 Bug"
        subtitle={`创建时间 ${formatBugCreatedAt(bug.createdAt)} · 在当前页面修改 Bug 信息，并查看流转记录。`}
        extra={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
              返回列表
            </Button>
            {canDeleteBugs ? (
              <Popconfirm
                title="删除 Bug"
                description="删除后该 Bug 记录会从当前版本中移除。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => onDelete(bug)}
              >
                <Button danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            ) : (
              <Tooltip title={permissionDeniedReason}>
                <span>
                  <Button danger disabled icon={<DeleteOutlined />}>删除</Button>
                </span>
              </Tooltip>
            )}
          </Space>
        }
      />

      <div className="bug-edit-route-layout">
        <Card
          className="bug-edit-form-card"
          title={
            <Space>
              <EditOutlined />
              <span>编辑 Bug</span>
            </Space>
          }
          extra={
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={submitting}
              disabled={!canEditBugs}
              onClick={() => form.submit()}
            >
              保存
            </Button>
          }
        >
          <Form form={form} layout="vertical" onFinish={(values) => onSubmit(bug, values)} requiredMark={false}>
            <BugFields
              canEditBugs={canEditBugs}
              canEditBugsFully={canEditBugsFully}
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              versionOptions={versionOptions}
            />
          </Form>
        </Card>

        <Space orientation="vertical" size={16} className="bug-edit-side">
          <BugAiFixCard
            bug={bug}
            canCreate={canEditBugs}
            disabledReason={permissionDeniedReason}
            projects={projects}
            workspaceId={workspaceId}
            onCreate={onCreateAiFix}
          />

          <Card title="复现材料" className="bug-edit-side-card bug-edit-attachment-card">
            {bug.attachments?.length ? (
              <div className="bug-attachment-list">
                {bug.attachments.map((attachment) => (
                  <Button
                    href={attachment.url}
                    icon={<PaperClipOutlined />}
                    key={attachment.id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {attachment.name}
                    <Text type="secondary"> {getAttachmentLabel(attachment)}</Text>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="bug-empty-state">暂无复现材料</div>
            )}
          </Card>

          <Card title="流转记录" className="bug-edit-side-card bug-edit-flow-card">
            {flowRecords.length ? (
              <Timeline
                className="bug-flow-timeline"
                items={flowRecords.map((record) => ({
                  color: bugFlowActionColor[record.action],
                  content: (
                    <Space orientation="vertical" size={4}>
                      <Space size={8} wrap>
                        <Text strong>{bugFlowActionLabel[record.action]}</Text>
                        <Tag>{getBugFlowDescription(record)}</Tag>
                      </Space>
                      <Text type="secondary">{dayjs(record.at).format("YYYY-MM-DD HH:mm")}</Text>
                      <Text type="secondary">
                        {record.operator}
                        {record.note ? ` · ${record.note}` : ""}
                      </Text>
                    </Space>
                  )
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无流转记录" />
            )}
          </Card>
        </Space>
      </div>
    </Space>
  );
}
