"use client";

import { Button, DatePicker, Select, Space, Statistic, Tag, Typography } from "antd";
import { CalendarOutlined, FolderOpenOutlined, PlusOutlined, UserOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { Project, RequirementVersion, Risk, Task } from "@/types/dashboard";
import type { RequirementVersionOption } from "@/components/project-management-platform/types";
import { TableView } from "@/components/project-management-platform/shared/page-shell";
import {
  allProjectCalendarVersionsValue,
  createProjectDelaySummary,
  createPersonProgress,
  createProjectCalendarItems,
  createProjectRiskHints,
  getProjectCalendarFallbackMonth,
  getVersionDateRange,
  getVersionScopeProjects,
  isCalendarItemVisibleInMonth,
  type ProjectCalendarItem,
  type ProjectCalendarScheduleChange
} from "@/components/project-management-platform/views/project-calendar-utils";
import { ProjectDelaySummary } from "@/components/project-management-platform/views/project-delay-summary";
import { ProjectProgressCalendar } from "@/components/project-management-platform/views/project-progress-calendar";
import { ProjectProgressPanel } from "@/components/project-management-platform/views/project-progress-panel";

const { Text } = Typography;

// 项目视图以版本为交付维度，把每个人的任务排期放回日期上下文里看。
export function ProjectsView({
  projects,
  risks,
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
  risks: Risk[];
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
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs());
  const [manualCalendarMonthKey, setManualCalendarMonthKey] = useState("");
  const calendarItems = useMemo(
    () =>
      createProjectCalendarItems({
        selectedVersionId: selectedVersion?.id,
        tasks,
        versions
      }),
    [selectedVersion?.id, tasks, versions]
  );
  const calendarAutoMonthKey = useMemo(
    () =>
      [
        selectedVersion?.id ?? allProjectCalendarVersionsValue,
        ...calendarItems.map((item) => `${item.id}:${item.startDate}:${item.endDate}`)
      ].join("|"),
    [calendarItems, selectedVersion?.id]
  );
  const displayedCalendarMonth = useMemo(() => {
    if (!calendarItems.length || manualCalendarMonthKey === calendarAutoMonthKey) {
      return calendarMonth;
    }

    if (calendarItems.some((item) => isCalendarItemVisibleInMonth(item, calendarMonth))) {
      return calendarMonth;
    }

    return getProjectCalendarFallbackMonth(calendarItems, calendarMonth);
  }, [calendarAutoMonthKey, calendarItems, calendarMonth, manualCalendarMonthKey]);
  const monthItems = useMemo(
    () => calendarItems.filter((item) => isCalendarItemVisibleInMonth(item, displayedCalendarMonth)),
    [calendarItems, displayedCalendarMonth]
  );
  const peopleProgress = useMemo(() => createPersonProgress(monthItems), [monthItems]);
  const delaySummary = useMemo(
    () =>
      createProjectDelaySummary({
        items: calendarItems,
        selectedVersionId: selectedVersion?.id,
        versions
      }),
    [calendarItems, selectedVersion?.id, versions]
  );
  const riskHints = useMemo(
    () => createProjectRiskHints(risks, versions, selectedVersion?.id),
    [risks, selectedVersion?.id, versions]
  );
  const versionRange = getVersionDateRange(versions, selectedVersion?.id);
  const doneCount = monthItems.filter((item) => item.progress >= 100).length;
  const avgProgress = monthItems.length
    ? Math.round(monthItems.reduce((sum, item) => sum + item.progress, 0) / monthItems.length)
    : 0;

  return (
    <TableView
      title="项目视图"
      subtitle="按版本查看任务节奏、人员排期、任务跨度和交付风险。"
      icon={<FolderOpenOutlined />}
      extra={
        <Space wrap className="project-calendar-toolbar">
          <Select
            className="project-calendar-project-select"
            value={selectedVersionId}
            onChange={onVersionFilterChange}
            placeholder="选择版本"
            showSearch
            optionFilterProp="label"
            options={[
              { value: allProjectCalendarVersionsValue, label: "全部版本" },
              ...versionOptions.map((version) => ({
                value: version.value,
                label: version.label
              }))
            ]}
          />
          <DatePicker
            picker="month"
            value={displayedCalendarMonth}
            onChange={(value) => {
              setCalendarMonth(value ?? dayjs());
              setManualCalendarMonthKey(calendarAutoMonthKey);
            }}
            allowClear={false}
          />
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
      <div className="project-calendar-hero">
        <div className="project-calendar-hero-copy">
          <Space size={10} wrap>
            <Tag icon={<CalendarOutlined />}>{displayedCalendarMonth.format("YYYY 年 MM 月")}</Tag>
            {versionRange ? <Tag>{versionRange}</Tag> : null}
            <Tag>{projectCount} 个关联项目</Tag>
          </Space>
          <h3>{selectedVersion ? selectedVersion.name : "全版本交付日历"}</h3>
          <Text type="secondary">
            左侧按负责人分行，右侧仅展示当前版本范围内的任务横条；Bug、里程碑和版本节点不进入交付日历。
          </Text>
        </div>
        <div className="project-calendar-hero-stats">
          <Statistic title="本月任务" value={monthItems.length} prefix={<CalendarOutlined />} />
          <Statistic title="平均进度" value={avgProgress} suffix="%" prefix={<UserOutlined />} />
          <Statistic title="已完成" value={doneCount} />
          <Statistic title="需延期" value={delaySummary.total} prefix={<WarningOutlined />} />
        </div>
      </div>
      <ProjectDelaySummary summary={delaySummary} />
      <div className="project-calendar-layout">
        <ProjectProgressCalendar
          items={calendarItems}
          month={displayedCalendarMonth}
          onOpenItem={onOpenCalendarItem}
          onRescheduleItem={onRescheduleCalendarItem}
        />
        <ProjectProgressPanel people={peopleProgress} risks={riskHints} />
      </div>
    </TableView>
  );
}
