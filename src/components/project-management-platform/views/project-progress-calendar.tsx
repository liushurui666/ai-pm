"use client";

import { Empty } from "antd";
import { DayPilotScheduler } from "@daypilot/daypilot-lite-react";
import type { DayPilot } from "@daypilot/daypilot-lite-react";
import dayjs from "dayjs";
import { useEffect, useRef } from "react";
import type {
  ProjectCalendarItem,
  ProjectCalendarScheduleChange
} from "@/components/project-management-platform/views/project-calendar-utils";
import type { ResizePreviewSource } from "@/components/project-management-platform/views/project-scheduler-preview-utils";
import {
  clearResizePreviewSource,
  getResizePreviewSource,
  syncDraggingEventPreview,
  syncResizingEventPreview
} from "@/components/project-management-platform/views/project-scheduler-preview-utils";
import {
  createProjectSchedulerModel,
  isProjectSchedulerTaskResource,
  type ProjectSchedulerTaskOrder,
  type ProjectSchedulerTaskOrderChange
} from "@/components/project-management-platform/views/project-scheduler-utils";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const dragClickSuppressMs = 1200;
const dragMoveThreshold = 6;

type RowSortDragState = {
  activeId: string;
  moved: boolean;
  owner: string;
  overId: string | null;
  placement: ProjectSchedulerTaskOrderChange["placement"];
  sourcePanel: HTMLElement;
  startY: number;
};
type RowSortPointerEvent = PointerEvent | MouseEvent;

function formatHeaderDate(value: string) {
  return dayjs(value).format("YYYY-MM-DD");
}

function getScheduleChange(start: DayPilot.Date, end: DayPilot.Date, owner: string): ProjectCalendarScheduleChange {
  const startDate = dayjs(start.toString()).startOf("day");
  const exclusiveEndDate = dayjs(end.toString()).subtract(1, "day").startOf("day");
  const safeEndDate = exclusiveEndDate.isBefore(startDate) ? startDate : exclusiveEndDate;

  // Scheduler 的结束时间是右边界独占值，这里转回业务里可编辑的截止日期。
  return {
    startDate: startDate.format("YYYY-MM-DD"),
    endDate: safeEndDate.format("YYYY-MM-DD"),
    owner
  };
}

// 项目进度日历使用 Scheduler 表达排期，让跨天任务天然横穿日期轴。
export function ProjectProgressCalendar({
  items,
  month,
  onOpenItem,
  onRescheduleItem,
  onTaskOrderChange,
  taskOrderByOwner
}: {
  items: ProjectCalendarItem[];
  month: dayjs.Dayjs;
  onOpenItem: (item: ProjectCalendarItem) => void;
  onRescheduleItem: (item: ProjectCalendarItem, change: ProjectCalendarScheduleChange) => Promise<boolean>;
  onTaskOrderChange: (change: ProjectSchedulerTaskOrderChange) => void;
  taskOrderByOwner: ProjectSchedulerTaskOrder;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, lastEndedAt: 0 });
  const pointerDragRef = useRef({ active: false, moved: false, startX: 0, startY: 0 });
  const rowSortDragRef = useRef<RowSortDragState | null>(null);
  const onTaskOrderChangeRef = useRef(onTaskOrderChange);
  const resizePreviewRef = useRef<ResizePreviewSource | null>(null);
  const schedulerModel = createProjectSchedulerModel(items, month, taskOrderByOwner);

  useEffect(() => {
    onTaskOrderChangeRef.current = onTaskOrderChange;
  }, [onTaskOrderChange]);

  function markDragEnded() {
    dragStateRef.current.active = false;
    dragStateRef.current.lastEndedAt = Date.now();
  }

  useEffect(() => {
    const schedulerShell = shellRef.current;

    if (!schedulerShell) {
      return undefined;
    }

    const shellElement: HTMLDivElement = schedulerShell;

    function isTaskEvent(target: EventTarget | null) {
      return target instanceof HTMLElement && Boolean(target.closest(".project-scheduler-event-task"));
    }

    function handlePointerDown(event: PointerEvent) {
      if (!isTaskEvent(event.target)) {
        return;
      }

      clearResizePreviewSource(resizePreviewRef.current);
      resizePreviewRef.current = getResizePreviewSource(event.target);
      pointerDragRef.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY
      };
    }

    let syncFrame = 0;

    function syncDragState() {
      const hasDraggingPreview = syncDraggingEventPreview(schedulerRoot) || syncResizingEventPreview(schedulerRoot, resizePreviewRef.current);

      if (hasDraggingPreview) {
        dragStateRef.current.active = true;
        return;
      }

      if (resizePreviewRef.current && pointerDragRef.current.active) {
        return;
      }

      // DayPilot 松手后会移除拖拽 DOM，借这个瞬间屏蔽紧随其后的 click，避免误开编辑抽屉。
      if (dragStateRef.current.active) {
        markDragEnded();
      }
    }

    function scheduleSyncDragState() {
      if (syncFrame) {
        return;
      }

      // DayPilot 拉伸时会连续改 shadow 宽度，预览同步按帧执行，避免 MutationObserver 高频重排卡住页面。
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        syncDragState();

        if (pointerDragRef.current.active && pointerDragRef.current.moved) {
          scheduleSyncDragState();
        }
      });
    }

    function handlePointerMove(event: PointerEvent) {
      const pointerState = pointerDragRef.current;

      if (!pointerState.active) {
        return;
      }

      if (pointerState.moved) {
        scheduleSyncDragState();
        return;
      }

      const movedEnough = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY) > dragMoveThreshold;

      if (movedEnough) {
        // click 和 drag 是两条独立链路，提前记录真实拖动，避免 DayPilot 松手后补发 click 打开抽屉。
        pointerDragRef.current.moved = true;
        dragStateRef.current.active = true;
        scheduleSyncDragState();
      }
    }

    function handlePointerEnd() {
      if (syncFrame) {
        window.cancelAnimationFrame(syncFrame);
        syncFrame = 0;
      }

      if (pointerDragRef.current.moved) {
        markDragEnded();
      }

      clearResizePreviewSource(resizePreviewRef.current);
      resizePreviewRef.current = null;
      pointerDragRef.current = { active: false, moved: false, startX: 0, startY: 0 };
    }

    const schedulerRoot = shellElement;

    syncDragState();

    const observer = new MutationObserver(() => {
      scheduleSyncDragState();
    });

    observer.observe(schedulerRoot, {
      childList: true,
      subtree: true
    });
    shellElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      if (syncFrame) {
        window.cancelAnimationFrame(syncFrame);
      }

      observer.disconnect();
      shellElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  useEffect(() => {
    const schedulerShell = shellRef.current;

    if (!schedulerShell) {
      return undefined;
    }

    const shellElement: HTMLDivElement = schedulerShell;

    function getTaskPanel(target: EventTarget | null) {
      return target instanceof HTMLElement
        ? target.closest<HTMLElement>(".project-scheduler-resource-panel-task")
        : null;
    }

    function clearDropTarget() {
      shellElement
        .querySelectorAll(".project-scheduler-row-drop-before, .project-scheduler-row-drop-after")
        .forEach((node) => {
          node.classList.remove("project-scheduler-row-drop-before", "project-scheduler-row-drop-after");
        });
    }

    function resetRowSortDrag() {
      const state = rowSortDragRef.current;

      clearDropTarget();
      state?.sourcePanel.classList.remove("project-scheduler-row-sort-active");
      shellElement.classList.remove("project-scheduler-row-sorting");
      rowSortDragRef.current = null;
    }

    function findPanelAtPointer(event: RowSortPointerEvent) {
      return document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest?.(".project-scheduler-resource-panel-task") ?? null)
        .find((element): element is HTMLElement => element instanceof HTMLElement) ?? null;
    }

    function updateDropTarget(event: RowSortPointerEvent) {
      const state = rowSortDragRef.current;

      if (!state) {
        return;
      }

      const targetPanel = findPanelAtPointer(event);
      const targetId = targetPanel?.dataset.projectTaskId;
      const targetOwner = targetPanel?.dataset.projectTaskOwner;

      clearDropTarget();

      if (!targetPanel || !targetId || !targetOwner || targetId === state.activeId || targetOwner !== state.owner) {
        state.overId = null;
        return;
      }

      const targetRect = targetPanel.getBoundingClientRect();
      const placement: ProjectSchedulerTaskOrderChange["placement"] =
        event.clientY > targetRect.top + targetRect.height / 2 ? "after" : "before";

      targetPanel.classList.add(placement === "after" ? "project-scheduler-row-drop-after" : "project-scheduler-row-drop-before");
      state.overId = targetId;
      state.placement = placement;
    }

    function handlePointerDown(event: RowSortPointerEvent) {
      if (rowSortDragRef.current) {
        return;
      }

      const handle = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>(".project-scheduler-row-sort-handle")
        : null;

      if (!handle) {
        return;
      }

      const sourcePanel = getTaskPanel(handle);
      const activeId = sourcePanel?.dataset.projectTaskId;
      const owner = sourcePanel?.dataset.projectTaskOwner;

      if (!sourcePanel || !activeId || !owner) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      rowSortDragRef.current = {
        activeId,
        moved: false,
        owner,
        overId: null,
        placement: "before",
        sourcePanel,
        startY: event.clientY
      };
      sourcePanel.classList.add("project-scheduler-row-sort-active");
      shellElement.classList.add("project-scheduler-row-sorting");
    }

    function handlePointerMove(event: RowSortPointerEvent) {
      const state = rowSortDragRef.current;

      if (!state) {
        return;
      }

      event.preventDefault();

      if (!state.moved && Math.abs(event.clientY - state.startY) > dragMoveThreshold) {
        // 手动排序只监听竖向移动，避免轻点手柄时误触发排序。
        state.moved = true;
      }

      if (state.moved) {
        updateDropTarget(event);
      }
    }

    function handlePointerEnd() {
      const state = rowSortDragRef.current;

      if (state?.moved && state.overId) {
        onTaskOrderChangeRef.current({
          activeId: state.activeId,
          overId: state.overId,
          owner: state.owner,
          placement: state.placement
        });
      }

      resetRowSortDrag();
    }

    shellElement.addEventListener("pointerdown", handlePointerDown);
    shellElement.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("mouseup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      resetRowSortDrag();
      shellElement.removeEventListener("pointerdown", handlePointerDown);
      shellElement.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("mouseup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  function handleScheduleUpdate(args: DayPilot.SchedulerEventMoveArgs | DayPilot.SchedulerEventResizeArgs) {
    const item = args.e.data.tags as ProjectCalendarItem | undefined;

    if (!item) {
      args.preventDefault();
      return;
    }

    if ("newResource" in args && !isProjectSchedulerTaskResource(args.newResource, item)) {
      args.preventDefault();
      return;
    }

    args.async = true;
    markDragEnded();

    void onRescheduleItem(item, getScheduleChange(args.newStart, args.newEnd, item.owner || "未分配"))
      .then((saved) => {
        if (!saved) {
          args.preventDefault();
        }

        args.loaded();
      })
      .catch(() => {
        args.preventDefault();
        args.loaded();
      });
  }

  if (!schedulerModel.visibleItems.length) {
    return (
      <div className="project-scheduler-empty">
        <Empty description="当前月份暂无任务排期" />
      </div>
    );
  }

  return (
    <div className="project-scheduler-shell" ref={shellRef}>
      <DayPilotScheduler
        startDate={schedulerModel.startDate}
        days={schedulerModel.days}
        scale="Day"
        timeHeaders={[
          { groupBy: "Month" },
          { groupBy: "Day" }
        ]}
        resources={schedulerModel.resources}
        events={schedulerModel.events}
        cellWidth={96}
        rowHeaderWidth={360}
        eventHeight={52}
        durationBarHeight={4}
        heightSpec="Auto"
        eventBorderRadius={8}
        eventMoveHandling="Update"
        eventResizeHandling="Update"
        eventResizeMargin={0}
        eventDeleteHandling="Disabled"
        eventClickHandling="Enabled"
        eventTextWrappingEnabled
        floatingEvents={false}
        floatingTimeHeaders={false}
        rowMarginTop={6}
        rowMarginBottom={6}
        theme="scheduler_default"
        onEventMove={handleScheduleUpdate}
        onEventResize={handleScheduleUpdate}
        onEventClick={(args) => {
          if (dragStateRef.current.active || Date.now() - dragStateRef.current.lastEndedAt < dragClickSuppressMs) {
            args.preventDefault();
            return;
          }

          const item = args.e.data.tags as ProjectCalendarItem | undefined;

          if (item) {
            onOpenItem(item);
          }
        }}
        onBeforeCellRender={(args) => {
          const date = formatHeaderDate(args.cell.start.toString());

          // 今天和周末用格子底色标出来，帮助项目经理快速定位当前节奏。
          if (dayjs(date).isSame(dayjs(), "day")) {
            args.cell.properties.cssClass = "project-scheduler-cell-today";
          } else if ([0, 6].includes(dayjs(date).day())) {
            args.cell.properties.cssClass = "project-scheduler-cell-weekend";
          }
        }}
        onBeforeTimeHeaderRender={(args) => {
          const date = dayjs(formatHeaderDate(args.header.start.toString()));

          if (args.header.level === 0) {
            args.header.text = date.format("YYYY 年 M 月");
            return;
          }

          args.header.html = `
            <div class="project-scheduler-day-header">
              <strong>${date.format("D")}</strong>
              <span>周${weekdayLabels[date.day()]}</span>
            </div>
          `;
        }}
      />
    </div>
  );
}
