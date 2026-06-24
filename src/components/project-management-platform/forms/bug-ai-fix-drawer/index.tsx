"use client";

import { Alert, Descriptions, Drawer, Form, Input, Select, Space, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { fetchWithAuthRedirect } from "@/components/project-management-platform/api";
import { DrawerFooterActions } from "@/components/project-management-platform/forms/drawer-footer-actions";
import type { BugReport, Project, ProjectRepository } from "@/types/dashboard";
import "./index.less";

const { Text } = Typography;

export type BugAiFixFormValues = {
  baseBranch: string;
  repositoryId: string;
};

type ProjectRepositoriesResponse = {
  error?: string;
  repositories?: ProjectRepository[];
};

function getRepositoryProjectLabel(repository: ProjectRepository, projects: Project[]) {
  if (!repository.projectId) {
    return "通用仓库";
  }

  return projects.find((project) => project.id === repository.projectId)?.name ?? "项目仓库";
}

function findDefaultRepository(repositories: ProjectRepository[], bug: BugReport, projects: Project[]) {
  const bugProject = projects.find((project) => project.name === bug.project);

  // 和服务端 findRepositoryForBug 保持同一优先级：先按 Bug 项目匹配，再使用工作区通用仓库，最后退到最新配置。
  return (
    (bugProject ? repositories.find((repository) => repository.projectId === bugProject.id) : undefined) ??
    repositories.find((repository) => !repository.projectId) ??
    repositories[0]
  );
}

function formatTextList(values: string[], fallback: string) {
  return values.length ? values.join("、") : fallback;
}

// AI 修复确认抽屉既要阻止误触，也要让操作者在多个仓库或临时分支场景下明确选择目标。
export function BugAiFixDrawer({
  bug,
  loading,
  onClose,
  onConfirm,
  open,
  projects,
  workspaceId
}: {
  bug: BugReport;
  loading: boolean;
  onClose: () => void;
  onConfirm: (values: BugAiFixFormValues) => Promise<void>;
  open: boolean;
  projects: Project[];
  workspaceId: string;
}) {
  const [form] = Form.useForm<BugAiFixFormValues>();
  const [repositories, setRepositories] = useState<ProjectRepository[]>([]);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState("");
  const selectedRepositoryId = Form.useWatch("repositoryId", form);
  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.id === selectedRepositoryId),
    [repositories, selectedRepositoryId]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    let canceled = false;

    async function loadRepositories() {
      setRepositoryLoading(true);
      setRepositoryError("");
      setRepositories([]);
      form.resetFields(["repositoryId", "baseBranch"]);

      try {
        const url = new URL("/api/project-repositories", window.location.origin);

        if (workspaceId) {
          url.searchParams.set("workspaceId", workspaceId);
        }

        // 仓库配置直接决定 Worker clone 和 push 的目标，打开抽屉时实时读取，避免使用过期的前端缓存。
        const response = await fetchWithAuthRedirect(url.toString(), {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal
        });
        const payload = (await response.json()) as ProjectRepositoriesResponse;

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "读取项目仓库失败");
        }

        const nextRepositories = payload.repositories ?? [];
        const defaultRepository = findDefaultRepository(nextRepositories, bug, projects);

        if (canceled) {
          return;
        }

        setRepositories(nextRepositories);
        form.setFieldsValue({
          repositoryId: defaultRepository?.id,
          baseBranch: defaultRepository?.defaultBranch ?? "main"
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (canceled) {
          return;
        }

        setRepositories([]);
        setRepositoryError(error instanceof Error ? error.message : "读取项目仓库失败");
        form.resetFields(["repositoryId", "baseBranch"]);
      } finally {
        if (!canceled) {
          setRepositoryLoading(false);
        }
      }
    }

    void loadRepositories();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [bug, form, open, projects, workspaceId]);

  function handleRepositoryChange(repositoryId: string) {
    const repository = repositories.find((item) => item.id === repositoryId);

    // 切换仓库时同步仓库默认分支，用户随后仍可把分支改成 release/hotfix 等临时分支。
    form.setFieldsValue({
      repositoryId,
      baseBranch: repository?.defaultBranch ?? "main"
    });
  }

  return (
    <Drawer
      className="pm-record-drawer pm-bug-ai-fix-drawer"
      title={
        <Space>
          <BranchesOutlined />
          <span>确认 AI 修复任务</span>
        </Space>
      }
      open={open}
      // Ant Design 6 已废弃 Drawer 的 width prop；AI 修复确认表单内容较少，使用默认抽屉宽度即可保持紧凑并避免运行时 warning。
      size="default"
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Text type="secondary">不会自动合并</Text>
        </Space>
      }
      footer={
        <DrawerFooterActions
          submitDisabled={repositoryLoading || !repositories.length}
          submitting={loading}
          submitText="确认创建任务"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      <Form className="pm-record-form" form={form} layout="vertical" onFinish={(values) => onConfirm(values)}>
        <Form.Item label="目标 Bug">
          <Input value={bug.title} readOnly />
        </Form.Item>
        <Form.Item
          label="目标仓库"
          name="repositoryId"
          rules={[{ required: true, message: "请选择 AI 修复要操作的代码仓库" }]}
        >
          <Select
            loading={repositoryLoading}
            disabled={loading || repositoryLoading}
            placeholder="选择目标代码仓库"
            onChange={handleRepositoryChange}
            options={repositories.map((repository) => ({
              label: `${repository.repoFullName} · ${getRepositoryProjectLabel(repository, projects)}`,
              value: repository.id
            }))}
          />
        </Form.Item>
        <Form.Item
          label="基准分支"
          name="baseBranch"
          normalize={(value) => (typeof value === "string" ? value.trim() : value)}
          rules={[
            { required: true, message: "请输入 AI 修复要 checkout 的基准分支" },
            {
              pattern: /^[^\s~^:?*\[\\]+$/,
              message: "分支名不能包含空格或 Git 不支持的特殊字符"
            }
          ]}
        >
          <Input disabled={loading || !selectedRepository} placeholder="例如 main、develop、release/1.0" />
        </Form.Item>
        {repositoryError ? <Alert type="error" showIcon message={repositoryError} /> : null}
        {!repositoryError && !repositoryLoading && !repositories.length ? (
          <Alert type="warning" showIcon message="当前工作区暂无可用仓库配置，无法创建 AI 修复任务。" />
        ) : null}
        {selectedRepository ? (
          <Descriptions size="small" column={1} className="bug-ai-fix-drawer-summary">
            <Descriptions.Item label="允许修改">
              {formatTextList(selectedRepository.allowedPaths, "未配置目录白名单，仍会执行安全黑名单校验")}
            </Descriptions.Item>
            <Descriptions.Item label="禁止修改">
              {formatTextList(selectedRepository.blockedPaths, "密钥、CI 权限、部署和基础设施文件")}
            </Descriptions.Item>
            <Descriptions.Item label="校验命令">
              {[selectedRepository.lintCommand, selectedRepository.testCommand, selectedRepository.buildCommand]
                .filter(Boolean)
                .join(" / ") || "未配置额外校验命令"}
            </Descriptions.Item>
            <Descriptions.Item label="Reviewer">
              {formatTextList(selectedRepository.defaultReviewers, "未配置默认 Reviewer")}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
        <Alert
          type="info"
          showIcon
          message="AI 会直接改代码、提交修复分支并创建 MR/PR，但不会自动合并。"
        />
      </Form>
    </Drawer>
  );
}
