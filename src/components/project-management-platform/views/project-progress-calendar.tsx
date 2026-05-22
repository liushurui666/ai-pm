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
import { createProjectSchedulerModel } from "@/components/project-management-platform/views/project-scheduler-utils";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const dragClickSuppressMs = 1200;
const dragMoveThreshold = 6;

function formatHeaderDate(value: string) {
  return dayjs(value).format("YYYY-MM-DD");
}

function getScheduleChange(start: DayPilot.Date, end: DayPilot.Date, resource: DayPilot.ResourceId): ProjectCalendarScheduleChange {
  const startDate = dayjs(start.toString()).startOf("day");
  const exclusiveEndDate = dayjs(end.toString()).subtract(1, "day").startOf("day");
  const safeEndDate = exclusiveEndDate.isBefore(startDate) ? startDate : exclusiveEndDate;

  // Scheduler 的结束时间是右边界独占值，这里转回业务里可编辑的截止日期。
  return {
    startDate: startDate.format("YYYY-MM-DD"),
    endDate: safeEndDate.format("YYYY-MM-DD"),
    owner: String(resource)
  };
}

// 项目进度日历使用 Scheduler 表达排期，让跨天任务天然横穿日期轴。
export function ProjectProgressCalendar({
  items,
  month,
  onOpenItem,
  onRescheduleItem
}: {
  items: ProjectCalendarItem[];
  month: dayjs.Dayjs;
  onOpenItem: (item: ProjectCalendarItem) => void;
  onRescheduleItem: (item: ProjectCalendarItem, change: ProjectCalendarScheduleChange) => Promise<boolean>;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, lastEndedAt: 0 });
  const pointerDragRef = useRef({ active: false, moved: false, startX: 0, startY: 0 });
  const resizePreviewRef = useRef<ResizePreviewSource | null>(null);
  const schedulerModel = createProjectSchedulerModel(items, month);

  function markDragEnded() {
    dragStateRef.current.active = false;
    dragStateRef.current.lastEndedAt = Date.now();
  }

  useEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return undefined;
    }

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

    function handlePointerMove(event: PointerEvent) {
      const pointerState = pointerDragRef.current;

      if (!pointerState.active || pointerState.moved) {
        return;
      }

      const movedEnough = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY) > dragMoveThreshold;

      if (movedEnough) {
        // click 和 drag 是两条独立链路，提前记录真实拖动，避免 DayPilot 松手后补发 click 打开抽屉。
        pointerDragRef.current.moved = true;
        dragStateRef.current.active = true;
        syncDragState();
      }
    }

    function handlePointerEnd() {
      if (pointerDragRef.current.moved) {
        markDragEnded();
      }

      clearResizePreviewSource(resizePreviewRef.current);
      resizePreviewRef.current = null;
      pointerDragRef.current = { active: false, moved: false, startX: 0, startY: 0 };
    }

    const schedulerRoot = shell;

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

    syncDragState();

    const observer = new MutationObserver(() => {
      syncDragState();
    });

    observer.observe(schedulerRoot, {
      attributes: true,
      childList: true,
      subtree: true
    });
    shell.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      observer.disconnect();
      shell.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  function handleScheduleUpdate(args: DayPilot.SchedulerEventMoveArgs | DayPilot.SchedulerEventResizeArgs) {
    const item = args.e.data.tags as ProjectCalendarItem | undefined;
    const newResource = "newResource" in args ? args.newResource : args.e.data.resource ?? item?.owner ?? "未分配";

    if (!item) {
      args.preventDefault();
      return;
    }

    args.async = true;
    markDragEnded();

    void onRescheduleItem(item, getScheduleChange(args.newStart, args.newEnd, newResource))
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
        cellWidth={118}
        rowHeaderWidth={210}
        eventHeight={94}
        durationBarHeight={4}
        height={760}
        heightSpec="Max"
        eventBorderRadius={8}
        eventMoveHandling="Update"
        eventResizeHandling="Update"
        eventResizeMargin={0}
        eventDeleteHandling="Disabled"
        eventClickHandling="Enabled"
        eventTextWrappingEnabled
        floatingEvents={false}
        floatingTimeHeaders={false}
        rowMarginTop={8}
        rowMarginBottom={8}
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
