import type { DayPilot } from "@daypilot/daypilot-lite-react";
import dayjs from "dayjs";
import type { ProjectCalendarItem, ProjectCalendarItemType } from "@/components/project-management-platform/views/project-calendar-utils";
import {
  getProjectCalendarItemRange,
  isCalendarItemVisibleInMonth
} from "@/components/project-management-platform/views/project-calendar-utils";

const typeClassMap: Record<ProjectCalendarItemType, string> = {
  任务: "task",
  里程碑: "milestone",
  Bug: "bug",
  版本: "version"
};

const toneColors: Record<ProjectCalendarItem["riskTone"], { background: string; bar: string; border: string }> = {
  success: {
    background: "var(--scheduler-event-success-bg)",
    bar: "var(--scheduler-event-success-bar)",
    border: "var(--scheduler-event-success-border)"
  },
  processing: {
    background: "var(--scheduler-event-processing-bg)",
    bar: "var(--scheduler-event-processing-bar)",
    border: "var(--scheduler-event-processing-border)"
  },
  warning: {
    background: "var(--scheduler-event-warning-bg)",
    bar: "var(--scheduler-event-warning-bar)",
    border: "var(--scheduler-event-warning-border)"
  },
  danger: {
    background: "var(--scheduler-event-danger-bg)",
    bar: "var(--scheduler-event-danger-bar)",
    border: "var(--scheduler-event-danger-border)"
  }
};
const resizeHandleWidth = 14;
const taskResourcePrefix = "task:";
const versionResourcePrefix = "version:";
const taskRowHeight = 72;
const versionRowHeight = 54;

type ProjectSchedulerVersionGroup = {
  id: string;
  name: string;
  project: string;
  items: ProjectCalendarItem[];
};

function escapeHtml(value: string) {
  // DayPilot 的资源和事件支持 html 字段，统一转义可避免用户输入影响页面结构。
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getEventDateRange(item: ProjectCalendarItem, month: dayjs.Dayjs) {
  const { start, end } = getProjectCalendarItemRange(item);
  const monthStart = month.startOf("month");
  const monthEnd = month.endOf("month");
  const visibleStart = start.isBefore(monthStart, "day") ? monthStart : start;
  const visibleEnd = end.isAfter(monthEnd, "day") ? monthEnd : end;

  // Scheduler 拖拽时会保留事件完整跨度；跨月任务需裁成当前月可见段，避免拖动时把隐藏月份也展开到画布上。
  return {
    start: visibleStart.format("YYYY-MM-DD"),
    end: visibleEnd.add(1, "day").format("YYYY-MM-DD")
  };
}

function getRangeText(item: ProjectCalendarItem) {
  const { start, end } = getProjectCalendarItemRange(item);

  return start.isSame(end, "day") ? start.format("MM/DD") : `${start.format("MM/DD")} - ${end.format("MM/DD")}`;
}

function compareProjectSchedulerItems(left: ProjectCalendarItem, right: ProjectCalendarItem) {
  const leftRange = getProjectCalendarItemRange(left);
  const rightRange = getProjectCalendarItemRange(right);

  // 任务行按版本和标题稳定排序，拖拽改期后不因为日期变化导致行位跳动。
  return (
    (left.versionName || left.project).localeCompare(right.versionName || right.project, "zh-Hans-CN") ||
    left.title.localeCompare(right.title, "zh-Hans-CN") ||
    left.id.localeCompare(right.id, "zh-Hans-CN") ||
    leftRange.start.valueOf() - rightRange.start.valueOf() ||
    leftRange.end.valueOf() - rightRange.end.valueOf()
  );
}

function getTaskResourceId(item: ProjectCalendarItem) {
  return `${taskResourcePrefix}${item.id}`;
}

export function isProjectSchedulerTaskResource(resource: DayPilot.ResourceId, item: ProjectCalendarItem) {
  return String(resource) === getTaskResourceId(item);
}

function getVersionGroupId(item: ProjectCalendarItem) {
  return item.versionId || `unplanned-${item.versionName || item.project}`;
}

function createVersionGroups(items: ProjectCalendarItem[]) {
  const groups = items.reduce<Record<string, ProjectSchedulerVersionGroup>>((nextGroups, item) => {
    const id = getVersionGroupId(item);
    const current = nextGroups[id] ?? {
      id,
      name: item.versionName || "未规划",
      project: item.project || "跨项目",
      items: []
    };

    return {
      ...nextGroups,
      [id]: {
        ...current,
        items: [...current.items, item]
      }
    };
  }, {});

  return Object.values(groups)
    .map((group) => ({
      ...group,
      items: group.items.sort(compareProjectSchedulerItems)
    }))
    .sort((left, right) => {
      const leftFirst = getProjectCalendarItemRange(left.items[0]);
      const rightFirst = getProjectCalendarItemRange(right.items[0]);

      return (
        left.name.localeCompare(right.name, "zh-Hans-CN") ||
        left.project.localeCompare(right.project, "zh-Hans-CN") ||
        leftFirst.start.valueOf() - rightFirst.start.valueOf()
      );
    });
}

function getVersionResourceHtml(group: ProjectSchedulerVersionGroup) {
  const progress = Math.round(group.items.reduce((sum, item) => sum + item.progress, 0) / group.items.length);
  const riskCount = group.items.filter((item) => item.riskTone === "danger").length;

  // 版本分组行只承担目录作用，任务本身拆到下方固定行，避免左侧出现一大块空白。
  return `
    <div class="project-scheduler-resource-label project-scheduler-resource-version">
      <strong>${escapeHtml(group.name)}</strong>
      <span>${escapeHtml(group.project)}</span>
      <em>${progress}% · ${group.items.length} 项任务${riskCount ? ` · 风险 ${riskCount}` : ""}</em>
    </div>
  `;
}

function getTaskResourceHtml(item: ProjectCalendarItem) {
  const rangeText = getRangeText(item);

  // 任务标题放到左侧固定行，右侧时间条只保留拖拽排期职责。
  return `
    <div class="project-scheduler-resource-label project-scheduler-resource-task">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.owner || "未分配")} · ${escapeHtml(item.status)} · ${item.progress}%</span>
      <em>${escapeHtml(rangeText)}</em>
    </div>
  `;
}

function getEventHtml(item: ProjectCalendarItem) {
  const rangeText = getRangeText(item);

  // 时间条保持轻量，避免和左侧任务标题重复，拖拽时更像在调整时间跨度。
  return `
    <div class="project-scheduler-event-content">
      <div class="project-scheduler-event-time">
        <strong>${escapeHtml(rangeText)}</strong>
        <span>${escapeHtml(item.status)} · ${item.progress}%</span>
      </div>
    </div>
  `;
}

function getGroupProgress(items: ProjectCalendarItem[]) {
  const progress = Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length);

  return Number.isFinite(progress) ? progress : 0;
}

function getEventResizeAreas(item: ProjectCalendarItem): DayPilot.AreaData[] {
  if (item.type !== "任务") {
    return [];
  }

  // 主体区域只负责拖动改期，只有左右两侧手柄才允许拉伸开始/结束日期。
  return [
    {
      action: "ResizeStart",
      bottom: 4,
      cssClass: "project-scheduler-resize-handle project-scheduler-resize-handle-start",
      cursor: "w-resize",
      left: 0,
      toolTip: "拖动调整开始日期",
      top: 4,
      visibility: "Visible",
      width: resizeHandleWidth
    },
    {
      action: "ResizeEnd",
      bottom: 4,
      cssClass: "project-scheduler-resize-handle project-scheduler-resize-handle-end",
      cursor: "e-resize",
      right: 0,
      toolTip: "拖动调整截止日期",
      top: 4,
      visibility: "Visible",
      width: resizeHandleWidth
    }
  ];
}

// Scheduler 需要资源行和事件条；这里统一把项目日历条目适配成 DayPilot 可消费的数据。
export function createProjectSchedulerModel(items: ProjectCalendarItem[], month: dayjs.Dayjs) {
  const visibleItems = items.filter((item) => isCalendarItemVisibleInMonth(item, month)).sort(compareProjectSchedulerItems);
  const versionGroups = createVersionGroups(visibleItems);
  const resources: DayPilot.ResourceData[] = versionGroups.flatMap((group) => [
    {
      id: `${versionResourcePrefix}${group.id}`,
      name: group.name,
      cssClass: "project-scheduler-row-version",
      height: versionRowHeight,
      html: getVersionResourceHtml(group),
      toolTip: `${group.name}｜${group.items.length} 项任务`,
      tags: {
        progress: getGroupProgress(group.items),
        riskCount: group.items.filter((item) => item.riskTone === "danger").length,
        type: "version"
      }
    },
    ...group.items.map((item) => ({
      id: getTaskResourceId(item),
      name: item.title,
      cssClass: "project-scheduler-row-task",
      height: taskRowHeight,
      html: getTaskResourceHtml(item),
      toolTip: `${item.title}｜${item.owner || "未分配"}｜${item.status}｜${getRangeText(item)}`,
      tags: {
        itemId: item.id,
        progress: item.progress,
        riskTone: item.riskTone,
        type: "task"
      }
    }))
  ]);

  const events: DayPilot.EventData[] = visibleItems.map((item) => {
    const colors = toneColors[item.riskTone];
    const range = getEventDateRange(item, month);

    return {
      ...range,
      id: `${item.type}-${item.id}`,
      resource: getTaskResourceId(item),
      text: `${item.type} · ${item.title}`,
      html: getEventHtml(item),
      toolTip: `拖拽改期，点击编辑｜${item.title}｜${item.versionName || item.project}｜${getRangeText(item)}｜${item.status}｜${item.progress}%`,
      backColor: colors.background,
      barColor: colors.bar,
      borderColor: colors.border,
      cssClass: `project-scheduler-event project-scheduler-event-${item.riskTone} project-scheduler-event-${typeClassMap[item.type]}`,
      areas: getEventResizeAreas(item),
      tags: item
    };
  });

  return {
    days: month.daysInMonth(),
    events,
    resources,
    startDate: month.startOf("month").format("YYYY-MM-DD"),
    visibleItems
  };
}
