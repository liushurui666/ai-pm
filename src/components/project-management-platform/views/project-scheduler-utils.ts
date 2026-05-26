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
const ownerResourcePrefix = "owner:";
const taskRowHeight = 58;
const ownerRowHeight = 54;

export type ProjectSchedulerTaskSort = "startAsc" | "endAsc" | "priorityDesc" | "progressAsc" | "default";

const defaultTaskSort: ProjectSchedulerTaskSort = "startAsc";
const priorityWeight: Record<string, number> = { 高: 3, 中: 2, 低: 1 };

type ProjectSchedulerOwnerGroup = {
  owner: string;
  avatarUrl?: string;
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

function getOwnerAvatarHtml(group: ProjectSchedulerOwnerGroup) {
  const ownerInitial = Array.from(group.owner.trim())[0] ?? "?";

  // 负责人行用头像节点做视觉锚点，比单纯文字更容易扫出人员维度。
  if (group.avatarUrl) {
    return `<img class="project-scheduler-owner-avatar" src="${escapeHtml(group.avatarUrl)}" alt="${escapeHtml(group.owner)}" />`;
  }

  return `<span class="project-scheduler-owner-avatar project-scheduler-owner-avatar-fallback">${escapeHtml(ownerInitial)}</span>`;
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

function compareStableTaskFields(left: ProjectCalendarItem, right: ProjectCalendarItem) {
  return (
    (left.versionName || left.project).localeCompare(right.versionName || right.project, "zh-Hans-CN") ||
    left.title.localeCompare(right.title, "zh-Hans-CN") ||
    left.id.localeCompare(right.id, "zh-Hans-CN")
  );
}

function compareProjectSchedulerItems(
  left: ProjectCalendarItem,
  right: ProjectCalendarItem,
  taskSort: ProjectSchedulerTaskSort = defaultTaskSort
) {
  const leftRange = getProjectCalendarItemRange(left);
  const rightRange = getProjectCalendarItemRange(right);
  const leftStart = leftRange.start.valueOf();
  const rightStart = rightRange.start.valueOf();
  const leftEnd = leftRange.end.valueOf();
  const rightEnd = rightRange.end.valueOf();
  const stableCompare = compareStableTaskFields(left, right);

  // 项目视图的任务行排序只影响同一负责人的上下顺序，右侧任务条仍只负责日期拖拽。
  if (taskSort === "startAsc") {
    return leftStart - rightStart || leftEnd - rightEnd || stableCompare;
  }

  if (taskSort === "endAsc") {
    return leftEnd - rightEnd || leftStart - rightStart || stableCompare;
  }

  if (taskSort === "priorityDesc") {
    return (
      (priorityWeight[right.priority ?? ""] ?? 0) - (priorityWeight[left.priority ?? ""] ?? 0) ||
      leftEnd - rightEnd ||
      stableCompare
    );
  }

  if (taskSort === "progressAsc") {
    return left.progress - right.progress || leftEnd - rightEnd || stableCompare;
  }

  return stableCompare || leftStart - rightStart || leftEnd - rightEnd;
}

function getTaskResourceId(item: ProjectCalendarItem) {
  return `${taskResourcePrefix}${item.id}`;
}

export function isProjectSchedulerTaskResource(resource: DayPilot.ResourceId, item: ProjectCalendarItem) {
  return String(resource) === getTaskResourceId(item);
}

function createOwnerGroups(items: ProjectCalendarItem[], taskSort: ProjectSchedulerTaskSort) {
  const groups = items.reduce<Record<string, ProjectSchedulerOwnerGroup>>((nextGroups, item) => {
    const owner = item.owner || "未分配";
    const ownerGroup = nextGroups[owner] ?? {
      owner,
      avatarUrl: item.ownerAvatarUrl,
      items: []
    };
    const nextOwnerGroup = {
      ...ownerGroup,
      avatarUrl: ownerGroup.avatarUrl || item.ownerAvatarUrl,
      items: [...ownerGroup.items, item]
    };

    return {
      ...nextGroups,
      [owner]: nextOwnerGroup
    };
  }, {});

  return Object.values(groups)
    .map((ownerGroup) => ({
      ...ownerGroup,
      items: [...ownerGroup.items].sort((left, right) => compareProjectSchedulerItems(left, right, taskSort))
    }))
    .sort((left, right) => {
      const leftFirstItem = left.items[0];
      const rightFirstItem = right.items[0];
      const leftFirstStart = leftFirstItem ? getProjectCalendarItemRange(leftFirstItem).start.valueOf() : 0;
      const rightFirstStart = rightFirstItem ? getProjectCalendarItemRange(rightFirstItem).start.valueOf() : 0;

      return (
        left.owner.localeCompare(right.owner, "zh-Hans-CN") ||
        leftFirstStart - rightFirstStart
      );
    });
}

function getOwnerResourceHtml(group: ProjectSchedulerOwnerGroup) {
  const progress = getGroupProgress(group.items);
  const doneCount = group.items.filter((item) => item.progress >= 100).length;
  const riskCount = group.items.filter((item) => item.riskTone === "danger").length;

  // 版本已上移到筛选器，负责人行成为排期表唯一分组层，减少左侧层级噪音。
  return `
    <div class="project-scheduler-resource-label project-scheduler-resource-stack project-scheduler-resource-owner">
      <div class="project-scheduler-resource-body project-scheduler-resource-body-owner">
        <span class="project-scheduler-hierarchy-rail project-scheduler-hierarchy-rail-owner" aria-hidden="true"></span>
        <div class="project-scheduler-resource-panel project-scheduler-resource-panel-owner">
          ${getOwnerAvatarHtml(group)}
          <div class="project-scheduler-resource-owner-copy">
            <div class="project-scheduler-resource-heading">
              <strong>${escapeHtml(group.owner)}</strong>
            </div>
            <span class="project-scheduler-resource-subtitle">${group.items.length} 项任务 · 完成 ${doneCount}</span>
          </div>
          <em>${progress}%${riskCount ? ` · 风险 ${riskCount}` : ""}</em>
        </div>
      </div>
    </div>
  `;
}

function getTaskResourceHtml(item: ProjectCalendarItem) {
  const rangeText = getRangeText(item);

  // 任务标题放到左侧固定行，右侧时间条只保留拖拽排期职责。
  return `
    <div class="project-scheduler-resource-label project-scheduler-resource-stack project-scheduler-resource-task">
      <div class="project-scheduler-resource-body project-scheduler-resource-body-task">
        <span class="project-scheduler-hierarchy-rail project-scheduler-hierarchy-rail-task" aria-hidden="true"></span>
        <div class="project-scheduler-resource-panel project-scheduler-resource-panel-task">
          <span class="project-scheduler-task-node" aria-hidden="true"></span>
          <div class="project-scheduler-resource-task-copy">
            <div class="project-scheduler-resource-heading">
              <strong>${escapeHtml(item.title)}</strong>
            </div>
            <span class="project-scheduler-resource-subtitle">${escapeHtml(item.status)} · ${item.progress}% · ${escapeHtml(rangeText)}</span>
          </div>
        </div>
      </div>
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
export function createProjectSchedulerModel(
  items: ProjectCalendarItem[],
  month: dayjs.Dayjs,
  taskSort: ProjectSchedulerTaskSort = defaultTaskSort
) {
  const visibleItems = items
    .filter((item) => isCalendarItemVisibleInMonth(item, month))
    .sort((left, right) => compareProjectSchedulerItems(left, right, taskSort));
  const ownerGroups = createOwnerGroups(visibleItems, taskSort);
  const resources: DayPilot.ResourceData[] = ownerGroups.flatMap((ownerGroup) => [
    {
      id: `${ownerResourcePrefix}${ownerGroup.owner}`,
      name: ownerGroup.owner,
      cssClass: "project-scheduler-row-owner",
      height: ownerRowHeight,
      html: getOwnerResourceHtml(ownerGroup),
      toolTip: `${ownerGroup.owner}｜${ownerGroup.items.length} 项任务`,
      tags: {
        owner: ownerGroup.owner,
        progress: getGroupProgress(ownerGroup.items),
        riskCount: ownerGroup.items.filter((item) => item.riskTone === "danger").length,
        type: "owner"
      }
    },
    ...ownerGroup.items.map((item) => ({
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
