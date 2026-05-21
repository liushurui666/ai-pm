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
import { createProjectSchedulerModel } from "@/components/project-management-platform/views/project-scheduler-utils";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

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

function syncDraggingEventPreview(root: HTMLElement) {
  const source = root.querySelector<HTMLElement>(".scheduler_default_event_moving_source");
  const sourceInner = source?.querySelector<HTMLElement>(".scheduler_default_event_inner");
  const shadow = root.querySelector<HTMLElement>(".scheduler_default_shadow");
  const shadowInner = shadow?.querySelector<HTMLElement>(".scheduler_default_shadow_inner");

  if (!source || !sourceInner || !shadow || !shadowInner) {
    return;
  }

  const sourceKey = source.getAttribute("title") ?? sourceInner.textContent ?? "";

  if (shadowInner.dataset.projectDragSource === sourceKey) {
    return;
  }

  // DayPilot 的 shadow 只负责定位，视觉内容复用原卡片，拖动时才像“拿起这个任务条”。
  shadow.classList.add("project-scheduler-drag-card");
  shadowInner.classList.add("project-scheduler-drag-card-inner");
  shadowInner.dataset.projectDragSource = sourceKey;
  shadowInner.innerHTML = sourceInner.innerHTML;
  shadowInner.setAttribute("style", sourceInner.getAttribute("style") ?? "");
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
  const schedulerModel = createProjectSchedulerModel(items, month);

  useEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return undefined;
    }

    syncDraggingEventPreview(shell);

    const observer = new MutationObserver(() => {
      syncDraggingEventPreview(shell);
    });

    observer.observe(shell, {
      attributes: true,
      childList: true,
      subtree: true
    });

    return () => {
      observer.disconnect();
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
        <Empty description="当前月份暂无项目排期" />
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
