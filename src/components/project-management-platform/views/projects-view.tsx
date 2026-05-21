"use client";

import { Button, DatePicker, Select, Space, Statistic, Tag, Typography } from "antd";
import { CalendarOutlined, FolderOpenOutlined, PlusOutlined, UserOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { Project, Risk, Task } from "@/types/dashboard";
import { TableView } from "@/components/project-management-platform/shared/page-shell";
import {
  createPersonProgress,
  createProjectCalendarItems,
  createProjectRiskHints,
  getProjectDateRange,
  isCalendarItemVisibleInMonth,
  type ProjectCalendarItem,
  type ProjectCalendarScheduleChange
} from "@/components/project-management-platform/views/project-calendar-utils";
import { ProjectProgressCalendar } from "@/components/project-management-platform/views/project-progress-calendar";
import { ProjectProgressPanel } from "@/components/project-management-platform/views/project-progress-panel";

const { Text } = Typography;

// 项目视图以大日历作为主画布，把每个人的交付进度放回日期上下文里看。
export function ProjectsView({
  projects,
  projectFilter,
  risks,
  tasks,
  onFilterChange,
  onCreate,
  onEdit,
  onOpenCalendarItem,
  onRescheduleCalendarItem
}: {
  projects: Project[];
  projectFilter: string;
  risks: Risk[];
  tasks: Task[];
  onFilterChange: (value: string) => void;
  onCreate: () => void;
  onEdit: (project: Project) => void;
  onOpenCalendarItem: (item: ProjectCalendarItem) => void;
  onRescheduleCalendarItem: (item: ProjectCalendarItem, change: ProjectCalendarScheduleChange) => Promise<boolean>;
}) {
  const projectNames = projects.map((project) => project.name);
  const selectedProject = projectNames.includes(projectFilter) ? projectFilter : "全部";
  const selectedProjectRecord = projects.find((project) => project.name === selectedProject);
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs());
  const calendarItems = useMemo(
    () => createProjectCalendarItems({ selectedProject, tasks }),
    [selectedProject, tasks]
  );
  const monthItems = useMemo(
    () => calendarItems.filter((item) => isCalendarItemVisibleInMonth(item, calendarMonth)),
    [calendarItems, calendarMonth]
  );
  const peopleProgress = useMemo(() => createPersonProgress(monthItems), [monthItems]);
  const riskHints = useMemo(() => createProjectRiskHints(risks, selectedProject), [risks, selectedProject]);
  const projectRange = getProjectDateRange(projects, selectedProject);
  const doneCount = monthItems.filter((item) => item.progress >= 100).length;
  const riskCount = monthItems.filter((item) => item.riskTone === "danger").length;
  const avgProgress = monthItems.length
    ? Math.round(monthItems.reduce((sum, item) => sum + item.progress, 0) / monthItems.length)
    : 0;

  return (
    <TableView
      title="项目视图"
      subtitle="用人员排期时间轴查看项目任务节奏、任务跨度和交付风险。"
      icon={<FolderOpenOutlined />}
      extra={
        <Space wrap className="project-calendar-toolbar">
          <Select
            className="project-calendar-project-select"
            value={selectedProject}
            onChange={onFilterChange}
            options={[
              { value: "全部", label: "全部项目" },
              ...projectNames.map((project) => ({ value: project, label: project }))
            ]}
          />
          <DatePicker
            picker="month"
            value={calendarMonth}
            onChange={(value) => setCalendarMonth(value ?? dayjs())}
            allowClear={false}
          />
          {selectedProjectRecord ? (
            <Button onClick={() => onEdit(selectedProjectRecord)}>
              编辑项目
            </Button>
          ) : null}
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建项目
          </Button>
        </Space>
      }
    >
      <div className="project-calendar-hero">
        <div className="project-calendar-hero-copy">
          <Space size={10} wrap>
            <Tag icon={<CalendarOutlined />}>{calendarMonth.format("YYYY 年 MM 月")}</Tag>
            {projectRange ? <Tag>{projectRange}</Tag> : null}
          </Space>
          <h3>{selectedProject === "全部" ? "全项目交付日历" : selectedProject}</h3>
          <Text type="secondary">
            左侧按负责人分行，右侧仅展示任务横条；Bug、里程碑和版本节点不进入交付日历。
          </Text>
        </div>
        <div className="project-calendar-hero-stats">
          <Statistic title="本月任务" value={monthItems.length} prefix={<CalendarOutlined />} />
          <Statistic title="平均进度" value={avgProgress} suffix="%" prefix={<UserOutlined />} />
          <Statistic title="已完成" value={doneCount} />
          <Statistic title="风险关注" value={riskCount} prefix={<WarningOutlined />} />
        </div>
      </div>
      <div className="project-calendar-layout">
        <ProjectProgressCalendar
          items={calendarItems}
          month={calendarMonth}
          onOpenItem={onOpenCalendarItem}
          onRescheduleItem={onRescheduleCalendarItem}
        />
        <ProjectProgressPanel people={peopleProgress} risks={riskHints} />
      </div>
    </TableView>
  );
}
