import dayjs from "dayjs";
import type { ProjectCalendarItem } from "@/components/project-management-platform/views/project-calendar-utils";
import { getCalendarDays } from "@/components/project-management-platform/views/project-calendar-utils";

const maxVisibleRangeLanes = 3;

export type ProjectCalendarRangeSegment = {
  key: string;
  item: ProjectCalendarItem;
  startColumn: number;
  endColumn: number;
  lane: number;
};

export type ProjectCalendarWeek = {
  days: dayjs.Dayjs[];
  hiddenRangeCount: number;
  rangeSegments: ProjectCalendarRangeSegment[];
};

function getNormalizedRange(item: ProjectCalendarItem) {
  const start = dayjs(item.startDate || item.date).startOf("day");
  const end = dayjs(item.endDate || item.date).startOf("day");

  return end.isBefore(start) ? { start: end, end: start } : { start, end };
}

export function isRangeCalendarItem(item: ProjectCalendarItem) {
  const { start, end } = getNormalizedRange(item);

  return item.type === "任务" && end.isAfter(start, "day");
}

export function isCalendarItemVisibleInMonth(item: ProjectCalendarItem, month: dayjs.Dayjs) {
  const { start, end } = getNormalizedRange(item);
  const monthStart = month.startOf("month");
  const monthEnd = month.endOf("month");

  return start.isSame(month, "month") || end.isSame(month, "month") || (start.isBefore(monthStart) && end.isAfter(monthEnd));
}

function getRawSegmentsForWeek(items: ProjectCalendarItem[], days: dayjs.Dayjs[]) {
  const weekStart = days[0].startOf("day");
  const weekEnd = days[6].startOf("day");

  return items
    .filter(isRangeCalendarItem)
    .map((item) => {
      const { start, end } = getNormalizedRange(item);

      if (end.isBefore(weekStart, "day") || start.isAfter(weekEnd, "day")) {
        return null;
      }

      const visibleStart = start.isBefore(weekStart, "day") ? weekStart : start;
      const visibleEnd = end.isAfter(weekEnd, "day") ? weekEnd : end;
      const startColumn = visibleStart.diff(weekStart, "day") + 1;
      const endColumn = visibleEnd.diff(weekStart, "day") + 2;

      return {
        item,
        startColumn,
        endColumn
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (!left || !right) {
        return 0;
      }

      return left.startColumn - right.startColumn || right.endColumn - left.endColumn;
    }) as Array<Omit<ProjectCalendarRangeSegment, "key" | "lane">>;
}

// 横跨任务按周切段并分配泳道，避免多条任务重叠时互相遮挡。
function createRangeSegmentsForWeek(items: ProjectCalendarItem[], days: dayjs.Dayjs[]) {
  const rawSegments = getRawSegmentsForWeek(items, days);
  const laneEnds: number[] = [];
  let hiddenRangeCount = 0;
  const rangeSegments: ProjectCalendarRangeSegment[] = [];

  for (const segment of rawSegments) {
    const reusableLane = laneEnds.findIndex((endColumn) => endColumn <= segment.startColumn);
    const lane = reusableLane >= 0 ? reusableLane : laneEnds.length;

    laneEnds[lane] = segment.endColumn;

    if (lane >= maxVisibleRangeLanes) {
      hiddenRangeCount += 1;

      continue;
    }

    rangeSegments.push({
      ...segment,
      lane,
      key: `${segment.item.type}-${segment.item.id}-${days[0].format("YYYY-MM-DD")}`
    });
  }

  return { hiddenRangeCount, rangeSegments };
}

export function getCalendarWeeks(month: dayjs.Dayjs, items: ProjectCalendarItem[]): ProjectCalendarWeek[] {
  const days = getCalendarDays(month);

  return Array.from({ length: 6 }, (_, index) => {
    const weekDays = days.slice(index * 7, index * 7 + 7);
    const rangeResult = createRangeSegmentsForWeek(items, weekDays);

    return {
      days: weekDays,
      ...rangeResult
    };
  });
}
