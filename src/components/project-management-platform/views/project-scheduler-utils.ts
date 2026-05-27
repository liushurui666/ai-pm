import type { DayPilot } from "@daypilot/daypilot-lite-react";
import dayjs from "dayjs";
import type { ProjectCalendarItem, ProjectCalendarItemType } from "@/components/project-management-platform/views/project-calendar-utils";
import { getProjectCalendarItemRange } from "@/components/project-management-platform/views/project-calendar-utils";

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

export type ProjectSchedulerTaskOrder = Record<string, string[]>;

export type ProjectSchedulerTaskOrderChange = {
  activeId: string;
  overId: string;
  owner: string;
  placement: "before" | "after";
};

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

function getEventDateRange(item: ProjectCalendarItem) {
  const { start, end } = getProjectCalendarItemRange(item);

  // 时间轴现在展示版本全量任务，事件条保留完整起止跨度，不再按月份裁剪。
  return {
    start: start.format("YYYY-MM-DD"),
    end: end.add(1, "day").format("YYYY-MM-DD")
  };
}

function getRangeText(item: ProjectCalendarItem) {
  const { start, end } = getProjectCalendarItemRange(item);

  return start.isSame(end, "day") ? start.format("MM/DD") : `${start.format("MM/DD")} - ${end.format("MM/DD")}`;
}

function compareProjectSchedulerItems(left: ProjectCalendarItem, right: ProjectCalendarItem) {
  const leftRange = getProjectCalendarItemRange(left);
  const rightRange = getProjectCalendarItemRange(right);

  // 默认顺序不再跟日期优先绑定，避免拖拽时间条后任务行自动跳位。
  return (
    (left.versionName || left.project).localeCompare(right.versionName || right.project, "zh-Hans-CN") ||
    left.title.localeCompare(right.title, "zh-Hans-CN") ||
    left.id.localeCompare(right.id, "zh-Hans-CN") ||
    leftRange.start.valueOf() - rightRange.start.valueOf() ||
    leftRange.end.valueOf() - rightRange.end.valueOf()
  );
}

function getOrderedProjectSchedulerItems(
  items: ProjectCalendarItem[],
  owner: string,
  taskOrderByOwner: ProjectSchedulerTaskOrder
) {
  const order = taskOrderByOwner[owner] ?? [];
  const orderIndex = new Map(order.map((id, index) => [id, index]));

  return [...items].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id);
    const rightIndex = orderIndex.get(right.id);

    if (typeof leftIndex === "number" && typeof rightIndex === "number") {
      return leftIndex - rightIndex;
    }

    if (typeof leftIndex === "number") {
      return -1;
    }

    if (typeof rightIndex === "number") {
      return 1;
    }

    return compareProjectSchedulerItems(left, right);
  });
}

function getTaskResourceId(item: ProjectCalendarItem) {
  return `${taskResourcePrefix}${item.id}`;
}

export function isProjectSchedulerTaskResource(resource: DayPilot.ResourceId, item: ProjectCalendarItem) {
  return String(resource) === getTaskResourceId(item);
}

function createOwnerGroups(items: ProjectCalendarItem[], taskOrderByOwner: ProjectSchedulerTaskOrder) {
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
      items: getOrderedProjectSchedulerItems(ownerGroup.items, ownerGroup.owner, taskOrderByOwner)
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
  const owner = item.owner || "未分配";

  // 任务标题放到左侧固定行，右侧时间条只保留拖拽排期职责。
  return `
    <div class="project-scheduler-resource-label project-scheduler-resource-stack project-scheduler-resource-task">
      <div class="project-scheduler-resource-body project-scheduler-resource-body-task">
        <span class="project-scheduler-hierarchy-rail project-scheduler-hierarchy-rail-task" aria-hidden="true"></span>
        <div class="project-scheduler-resource-panel project-scheduler-resource-panel-task" data-project-task-id="${escapeHtml(item.id)}" data-project-task-owner="${escapeHtml(owner)}">
          <span class="project-scheduler-task-node" aria-hidden="true"></span>
          <span class="project-scheduler-row-sort-handle" role="button" aria-label="上下拖动调整任务顺序" title="上下拖动调整任务顺序"></span>
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

function getSchedulerDateRange(items: ProjectCalendarItem[]) {
  const ranges = items.map((item) => getProjectCalendarItemRange(item));
  const fallbackStart = dayjs().startOf("month");

  if (!ranges.length) {
    return {
      days: fallbackStart.daysInMonth(),
      startDate: fallbackStart.format("YYYY-MM-DD")
    };
  }

  const start = ranges.reduce(
    (currentStart, range) => (range.start.isBefore(currentStart, "day") ? range.start : currentStart),
    ranges[0]?.start ?? fallbackStart
  );
  const end = ranges.reduce(
    (currentEnd, range) => (range.end.isAfter(currentEnd, "day") ? range.end : currentEnd),
    ranges[0]?.end ?? start
  );

  // DayPilot 的 days 是从 startDate 起算的天数，截止日业务上是包含当天的。
  return {
    days: Math.max(1, end.diff(start, "day") + 1),
    startDate: start.format("YYYY-MM-DD")
  };
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
  taskOrderByOwner: ProjectSchedulerTaskOrder = {}
) {
  const visibleItems = [...items].sort(compareProjectSchedulerItems);
  const scheduleRange = getSchedulerDateRange(visibleItems);
  const ownerGroups = createOwnerGroups(visibleItems, taskOrderByOwner);
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
    const range = getEventDateRange(item);

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
    days: scheduleRange.days,
    events,
    resources,
    startDate: scheduleRange.startDate,
    visibleItems
  };
}

export function applyProjectSchedulerTaskOrderChange({
  change,
  items,
  taskOrderByOwner
}: {
  change: ProjectSchedulerTaskOrderChange;
  items: ProjectCalendarItem[];
  taskOrderByOwner: ProjectSchedulerTaskOrder;
}) {
  const ownerItems = items.filter((item) => (item.owner || "未分配") === change.owner);
  const orderedIds = getOrderedProjectSchedulerItems(ownerItems, change.owner, taskOrderByOwner).map((item) => item.id);
  const activeIndex = orderedIds.indexOf(change.activeId);
  const overIndex = orderedIds.indexOf(change.overId);

  if (activeIndex < 0 || overIndex < 0 || change.activeId === change.overId) {
    return taskOrderByOwner;
  }

  const nextVisibleIds = [...orderedIds];
  const [activeId] = nextVisibleIds.splice(activeIndex, 1);

  if (!activeId) {
    return taskOrderByOwner;
  }

  const nextOverIndex = nextVisibleIds.indexOf(change.overId);
  const insertIndex = change.placement === "after" ? nextOverIndex + 1 : nextOverIndex;
  nextVisibleIds.splice(Math.max(insertIndex, 0), 0, activeId);

  const visibleIdSet = new Set(orderedIds);
  const hiddenOrderedIds = (taskOrderByOwner[change.owner] ?? []).filter((id) => !visibleIdSet.has(id));

  // 只重排当前版本范围里同一负责人的任务，其他负责人已有手动顺序继续保留。
  return {
    ...taskOrderByOwner,
    [change.owner]: [...nextVisibleIds, ...hiddenOrderedIds]
  };
}
