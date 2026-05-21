"use client";

import { Empty } from "antd";
import { DayPilotScheduler } from "@daypilot/daypilot-lite-react";
import dayjs from "dayjs";
import type { ProjectCalendarItem } from "@/components/project-management-platform/views/project-calendar-utils";
import { createProjectSchedulerModel } from "@/components/project-management-platform/views/project-scheduler-utils";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function formatHeaderDate(value: string) {
  return dayjs(value).format("YYYY-MM-DD");
}

// 项目进度日历使用 Scheduler 表达排期，让跨天任务天然横穿日期轴。
export function ProjectProgressCalendar({
  items,
  month
}: {
  items: ProjectCalendarItem[];
  month: dayjs.Dayjs;
}) {
  const schedulerModel = createProjectSchedulerModel(items, month);

  if (!schedulerModel.visibleItems.length) {
    return (
      <div className="project-scheduler-empty">
        <Empty description="当前月份暂无项目排期" />
      </div>
    );
  }

  return (
    <div className="project-scheduler-shell">
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
        cellWidth={88}
        rowHeaderWidth={180}
        eventHeight={56}
        durationBarHeight={4}
        height={680}
        heightSpec="Max"
        eventBorderRadius={8}
        eventMoveHandling="Disabled"
        eventResizeHandling="Disabled"
        eventDeleteHandling="Disabled"
        eventClickHandling="Enabled"
        eventTextWrappingEnabled={false}
        floatingEvents={false}
        floatingTimeHeaders={false}
        rowMarginTop={8}
        rowMarginBottom={8}
        theme="scheduler_default"
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
