"use client";

import "./index.less";
import { Progress, Statistic, Tag, Typography } from "antd";
import { CalendarOutlined, CheckCircleOutlined, UserOutlined, WarningOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import type {
  ProjectCalendarItem,
  ProjectCalendarScheduleChange
} from "@/components/project-management-platform/views/project-calendar-utils";
import {
  createProjectCalendarItems,
  createProjectDelaySummary,
  getVersionDateRange
} from "@/components/project-management-platform/views/project-calendar-utils";
import { ProjectDelaySummary } from "@/components/project-management-platform/views/project-delay-summary";
import { ProjectProgressCalendar } from "@/components/project-management-platform/views/project-progress-calendar";
import {
  applyProjectSchedulerTaskOrderChange,
  type ProjectSchedulerTaskOrder,
  type ProjectSchedulerTaskOrderChange
} from "@/components/project-management-platform/views/project-scheduler-utils";
import type {
  ProjectManagementTask,
  ProjectManagementVersion
} from "@/components/project-management-platform/views/projects-view/types";

const { Text, Title } = Typography;
const projectTaskOrderStorageKey = "ai-pm.project-scheduler-task-order.v1";

function getStoredProjectTaskOrder(): ProjectSchedulerTaskOrder {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(projectTaskOrderStorageKey);

    return storedValue ? JSON.parse(storedValue) as ProjectSchedulerTaskOrder : {};
  } catch {
    // 本地偏好损坏不应阻塞排期页，直接回退到默认排序。
    return {};
  }
}

export function ProjectSchedule({
  canEditTask,
  tasks,
  version,
  versions,
  onOpenCalendarItem,
  onRescheduleCalendarItem
}: {
  canEditTask?: (task: ProjectManagementTask) => boolean;
  tasks: ProjectManagementTask[];
  version: ProjectManagementVersion;
  versions: ProjectManagementVersion[];
  onOpenCalendarItem: (item: ProjectCalendarItem) => void;
  onRescheduleCalendarItem: (item: ProjectCalendarItem, change: ProjectCalendarScheduleChange) => Promise<boolean>;
}) {
  const [taskOrderByOwner, setTaskOrderByOwner] = useState<ProjectSchedulerTaskOrder>(getStoredProjectTaskOrder);
  const calendarItems = useMemo(
    () => createProjectCalendarItems({ canEditTask, selectedVersionId: version.id, tasks, versions }),
    [canEditTask, tasks, version.id, versions]
  );
  const delaySummary = useMemo(
    () => createProjectDelaySummary({ items: calendarItems, selectedVersionId: version.id, versions }),
    [calendarItems, version.id, versions]
  );
  const versionRange = getVersionDateRange(versions, version.id);
  const completedCount = calendarItems.filter((item) => item.progress >= 100).length;
  const editableCount = calendarItems.filter((item) => item.editable).length;
  const averageProgress = calendarItems.length
    ? Math.round(calendarItems.reduce((sum, item) => sum + item.progress, 0) / calendarItems.length)
    : 0;

  useEffect(() => {
    // 手动排序只是当前用户的排期视图偏好，不与服务端任务顺序混用。
    window.localStorage.setItem(projectTaskOrderStorageKey, JSON.stringify(taskOrderByOwner));
  }, [taskOrderByOwner]);

  function handleTaskOrderChange(change: ProjectSchedulerTaskOrderChange) {
    setTaskOrderByOwner((currentOrder) => applyProjectSchedulerTaskOrderChange({
      change,
      items: calendarItems,
      taskOrderByOwner: currentOrder
    }));
  }

  return (
    <div className="project-schedule">
      <section className="project-schedule-summary">
        <span>
          <Tag icon={<CalendarOutlined />}>{versionRange || "暂无日期范围"}</Tag>
          <Title level={5}>{version.name} 交付排期</Title>
          <Text type="secondary">
            {editableCount
              ? `可调整 ${editableCount} 项有权限任务；只读任务会锁定拖拽、缩放与编辑。`
              : "当前范围仅可查看，任务拖拽、缩放与编辑均已锁定。"}
          </Text>
          <Tag color={editableCount ? "processing" : "default"}>{editableCount ? `${editableCount} 项可编辑` : "只读排期"}</Tag>
          <Progress percent={averageProgress} showInfo={false} />
        </span>
        <div>
          <Statistic title="版本任务" value={calendarItems.length} prefix={<CalendarOutlined />} />
          <Statistic title="平均进度" value={averageProgress} suffix="%" prefix={<UserOutlined />} />
          <Statistic title="已完成" value={completedCount} prefix={<CheckCircleOutlined />} />
          <Statistic title="需延期" value={delaySummary.total} prefix={<WarningOutlined />} />
        </div>
      </section>
      <ProjectDelaySummary summary={delaySummary} />
      <ProjectProgressCalendar
        items={calendarItems}
        onOpenItem={onOpenCalendarItem}
        onRescheduleItem={onRescheduleCalendarItem}
        onTaskOrderChange={handleTaskOrderChange}
        taskOrderByOwner={taskOrderByOwner}
      />
    </div>
  );
}
