"use client";

import { Button, Drawer, Empty, Input, Space, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { DashboardData } from "@/types/dashboard";
import type { SearchResult } from "@/components/project-management-platform/types";
import { OwnerAvatar } from "@/components/project-management-platform/shared/owner-inline";

const { Text } = Typography;

// 全局搜索跨项目、任务、Bug、文档、风险和需求，统一限制结果数量保护抽屉性能。
export function createSearchResults(data: DashboardData, query: string): SearchResult[] {
  const keyword = query.trim().toLowerCase();

  if (!keyword) {
    return [];
  }

  const matches = (values: Array<string | undefined>) =>
    values.filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));

  const projectResults = data.projects
    .filter((project) => matches([project.name, project.owner, project.summary, project.status]))
    .map((project) => ({
      entity: "project" as const,
      id: project.id,
      title: project.name,
      description: project.summary,
      meta: `项目 · ${project.status} · 健康度 ${project.health}`,
      owner: project.owner,
      ownerAvatarUrl: project.ownerAvatarUrl,
      type: "项目",
      view: "projects" as const
    }));
  const taskResults = data.tasks
    .filter((task) => matches([task.title, task.owner, task.project, task.versionName, task.stage, task.aiHint]))
    .map((task) => ({
      entity: "task" as const,
      id: task.id,
      title: task.title,
      description: task.aiHint,
      meta: `任务 · ${task.versionName ?? "未规划"} · ${task.stage} · ${task.dueDate}`,
      owner: task.owner,
      ownerAvatarUrl: task.ownerAvatarUrl,
      type: "任务",
      view: "tasks" as const
    }));
  const bugResults = data.bugs
    .filter((bug) => matches([
      bug.title,
      bug.owner,
      bug.reporter,
      bug.project,
      bug.versionName,
      bug.reproduction,
      bug.actual,
      ...(bug.attachments?.map((attachment) => attachment.name) ?? [])
    ]))
    .map((bug) => ({
      entity: "bug" as const,
      id: bug.id,
      title: bug.title,
      description: bug.reproduction,
      meta: `Bug · ${bug.versionName ?? "未规划"} · ${bug.status} · ${bug.severity}`,
      owner: bug.owner,
      ownerAvatarUrl: bug.ownerAvatarUrl,
      type: "Bug",
      view: "bugs" as const
    }));
  const documentResults = data.documents
    .filter((document) => matches([document.title, document.type, document.aiSummary]))
    .map((document) => ({
      entity: "document" as const,
      id: document.id,
      title: document.title,
      description: document.aiSummary,
      meta: `文档 · ${document.type} · ${document.updatedAt}`,
      type: "文档",
      view: "docs" as const
    }));
  const riskResults = data.risks
    .filter((risk) => matches([risk.title, risk.owner, risk.project, risk.mitigation, risk.level]))
    .map((risk) => ({
      entity: "risk" as const,
      id: risk.id,
      title: risk.title,
      description: risk.mitigation,
      meta: `风险 · ${risk.level} · ${risk.project}`,
      owner: risk.owner,
      ownerAvatarUrl: risk.ownerAvatarUrl,
      type: "风险",
      view: "risks" as const
    }));
  const versionResults = data.requirementVersions
    .filter((version) => matches([version.name, version.project, version.status, version.goal]))
    .map((version) => ({
      entity: "requirementVersion" as const,
      id: version.id,
      title: version.name,
      description: version.goal,
      meta: `需求版本 · ${version.status} · ${version.releaseDate}`,
      type: "需求版本",
      view: "requirements" as const
    }));
  const requirementResults = data.requirements
    .filter((requirement) =>
      matches([
        requirement.title,
        requirement.owner,
        requirement.project,
        requirement.versionName,
        requirement.acceptance,
        requirement.status,
        requirement.uiLink,
        requirement.documentLink
      ])
    )
    .map((requirement) => ({
      entity: "requirement" as const,
      id: requirement.id,
      title: requirement.title,
      description: requirement.acceptance,
      meta: `需求 · ${requirement.versionName ?? "未规划"} · ${requirement.status}`,
      owner: requirement.owner,
      ownerAvatarUrl: requirement.ownerAvatarUrl,
      type: "需求",
      view: "requirements" as const
    }));

  return [
    ...projectResults,
    ...taskResults,
    ...bugResults,
    ...documentResults,
    ...riskResults,
    ...versionResults,
    ...requirementResults
  ].slice(0, 30);
}

// 搜索抽屉只展示结果和关键词输入，具体打开逻辑由主容器按实体类型处理。
export function SearchDrawer({
  onClose,
  onOpenResult,
  onQueryChange,
  open,
  query,
  results
}: {
  onClose: () => void;
  onOpenResult: (result: SearchResult) => void;
  onQueryChange: (query: string) => void;
  open: boolean;
  query: string;
  results: SearchResult[];
}) {
  return (
    <Drawer
      title={
        <Space>
          <SearchOutlined />
          <span>全局搜索</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size="default"
    >
      <Space orientation="vertical" size={16} className="pm-wide">
        <Input.Search
          allowClear
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索项目、任务、Bug、文档、风险"
        />
        {results.length ? (
          <div className="search-results-list">
            {results.map((result) => (
              <div className="search-result-item" key={`${result.entity}-${result.id}`}>
                <div className="search-result-main">
                  {result.owner ? <OwnerAvatar name={result.owner} avatarUrl={result.ownerAvatarUrl} /> : null}
                  <Space orientation="vertical" size={4} className="search-result-content">
                    <Space wrap>
                      <Tag>{result.type}</Tag>
                      <Text strong>{result.title}</Text>
                    </Space>
                    <Text type="secondary">{result.meta}</Text>
                    <Text type="secondary" ellipsis className="search-result-description">
                      {result.description}
                    </Text>
                  </Space>
                </div>
                <Button type="link" className="search-result-action" onClick={() => onOpenResult(result)}>
                  打开
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim() ? "没有匹配结果" : "输入关键词开始搜索"} />
        )}
      </Space>
    </Drawer>
  );
}
