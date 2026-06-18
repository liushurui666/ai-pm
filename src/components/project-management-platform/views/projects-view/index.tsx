"use client";

import "./index.less";
import { Button, Select, Space, Statistic, Tag, Typography } from "antd";
import { CalendarOutlined, FolderOpenOutlined, PlusOutlined, UserOutlined, WarningOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import type { Project, RequirementVersion, Task } from "@/types/dashboard";
import type { RequirementVersionOption } from "@/components/project-management-platform/types";
import { TableView } from "@/components/project-management-platform/shared/page-shell";
import {
  allProjectCalendarVersionsValue,
  createProjectDelaySummary,
  createProjectCalendarItems,
  getVersionDateRange,
  getVersionScopeProjects,
  type ProjectCalendarItem,
  type ProjectCalendarScheduleChange
} from "@/components/project-management-platform/views/project-calendar-utils";
import { ProjectDelaySummary } from "@/components/project-management-platform/views/project-delay-summary";
import { ProjectProgressCalendar } from "@/components/project-management-platform/views/project-progress-calendar";
import {
  applyProjectSchedulerTaskOrderChange,
  type ProjectSchedulerTaskOrder,
  type ProjectSchedulerTaskOrderChange
} from "@/components/project-management-platform/views/project-scheduler-utils";

const { Text } = Typography;
const projectTaskOrderStorageKey = "ai-pm.project-scheduler-task-order.v1";

function getStoredProjectTaskOrder(): ProjectSchedulerTaskOrder {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(projectTaskOrderStorageKey);

    return storedValue ? JSON.parse(storedValue) as ProjectSchedulerTaskOrder : {};
  } catch {
    return {};
  }
}

// 项目视图把版本收进筛选器，主排期表只保留负责人和任务两层，尽量释放时间轴宽度。
export function ProjectsView({
  projects,
  tasks,
  versionFilter,
  versionOptions,
  versions,
  onCreateVersion,
  onEditVersion,
  onOpenCalendarItem,
  onRescheduleCalendarItem,
  onVersionFilterChange
}: {
  projects: Project[];
  tasks: Task[];
  versionFilter: string;
  versionOptions: RequirementVersionOption[];
  versions: RequirementVersion[];
  onCreateVersion: () => void;
  onEditVersion: (version: RequirementVersion) => void;
  onOpenCalendarItem: (item: ProjectCalendarItem) => void;
  onRescheduleCalendarItem: (item: ProjectCalendarItem, change: ProjectCalendarScheduleChange) => Promise<boolean>;
  onVersionFilterChange: (value: string) => void;
}) {
  const selectedVersionId = versions.some((version) => version.id === versionFilter) ? versionFilter : allProjectCalendarVersionsValue;
  const selectedVersion = selectedVersionId === allProjectCalendarVersionsValue
    ? null
    : versions.find((version) => version.id === selectedVersionId) ?? null;
  const scopeProjectNames = getVersionScopeProjects(versions, selectedVersion?.id);
  const projectCount = selectedVersion ? scopeProjectNames.length : projects.length;
  const [taskOrderByOwner, setTaskOrderByOwner] = useState<ProjectSchedulerTaskOrder>(getStoredProjectTaskOrder);
  const calendarItems = useMemo(
    () =>
      createProjectCalendarItems({
        selectedVersionId: selectedVersion?.id,
        tasks,
        versions
      }),
    [selectedVersion?.id, tasks, versions]
  );
  const delaySummary = useMemo(
    () =>
      createProjectDelaySummary({
        items: calendarItems,
        selectedVersionId: selectedVersion?.id,
        versions
      }),
    [calendarItems, selectedVersion?.id, versions]
  );
  const versionRange = getVersionDateRange(versions, selectedVersion?.id);
  const versionTaskTotal = calendarItems.length;
  const doneCount = calendarItems.filter((item) => item.progress >= 100).length;
  const avgProgress = calendarItems.length
    ? Math.round(calendarItems.reduce((sum, item) => sum + item.progress, 0) / calendarItems.length)
    : 0;

  useEffect(() => {
    // 手动排序属于排期视图偏好，先保存在浏览器本地，避免刷新后马上丢失。
    window.localStorage.setItem(projectTaskOrderStorageKey, JSON.stringify(taskOrderByOwner));
  }, [taskOrderByOwner]);

  function handleTaskOrderChange(change: ProjectSchedulerTaskOrderChange) {
    setTaskOrderByOwner((currentOrder) =>
      applyProjectSchedulerTaskOrderChange({
        change,
        items: calendarItems,
        taskOrderByOwner: currentOrder
      })
    );
  }

  return (
    <TableView
      title="项目视图"
      subtitle="按版本查看任务节奏、人员排期、任务跨度和交付风险。"
      icon={<FolderOpenOutlined />}
      extra={
        <Space wrap className="project-calendar-toolbar">
          <div className="project-calendar-filter-field">
            <Text type="secondary">版本</Text>
            <Select
              className="project-calendar-project-select"
              value={selectedVersionId}
              onChange={onVersionFilterChange}
              placeholder="选择版本"
              showSearch
              optionFilterProp="label"
              aria-label="版本筛选"
              options={[
                { value: allProjectCalendarVersionsValue, label: "全部版本" },
                ...versionOptions.map((version) => ({
                  value: version.value,
                  label: version.label
                }))
              ]}
            />
          </div>
          {selectedVersion ? (
            <Button onClick={() => onEditVersion(selectedVersion)}>
              编辑版本
            </Button>
          ) : null}
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateVersion}>
            新建版本
          </Button>
        </Space>
      }
    >
      {/* 项目页顶部只承担当前筛选范围和交付信号摘要，不再使用大 hero，避免挤压真正的排期日历。 */}
      <div className="project-calendar-summary">
        <div className="project-calendar-summary-copy">
          <Space size={10} wrap>
            <Tag icon={<CalendarOutlined />}>全量任务</Tag>
            {versionRange ? <Tag>{versionRange}</Tag> : null}
            <Tag>{projectCount} 个关联项目</Tag>
          </Space>
          <h3>{selectedVersion ? selectedVersion.name : "全版本交付排期"}</h3>
          <Text type="secondary">
            当前筛选范围会同步影响延期汇总和排期表，方便项目经理直接判断任务跨度、负责人负载和版本风险。
          </Text>
        </div>
        <div className="project-calendar-summary-stats">
          <Statistic
            title={selectedVersion ? "版本任务" : "任务总数"}
            value={versionTaskTotal}
            prefix={<CalendarOutlined />}
          />
          <Statistic title="平均进度" value={avgProgress} suffix="%" prefix={<UserOutlined />} />
          <Statistic title="已完成" value={doneCount} />
          <Statistic title="需延期" value={delaySummary.total} prefix={<WarningOutlined />} />
        </div>
      </div>
      <ProjectDelaySummary summary={delaySummary} />
      <div className="project-calendar-layout">
        <ProjectProgressCalendar
          items={calendarItems}
          onOpenItem={onOpenCalendarItem}
          onRescheduleItem={onRescheduleCalendarItem}
          onTaskOrderChange={handleTaskOrderChange}
          taskOrderByOwner={taskOrderByOwner}
        />
      </div>
    </TableView>
  );
}
