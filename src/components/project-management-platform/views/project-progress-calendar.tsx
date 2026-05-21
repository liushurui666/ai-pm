"use client";

import { Badge, Flex, Progress, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import type { CSSProperties } from "react";
import type { ProjectCalendarItem } from "@/components/project-management-platform/views/project-calendar-utils";
import { groupCalendarItemsByDate } from "@/components/project-management-platform/views/project-calendar-utils";
import {
  getCalendarWeeks,
  isRangeCalendarItem,
  type ProjectCalendarRangeSegment
} from "@/components/project-management-platform/views/project-calendar-range-utils";

const { Text } = Typography;

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function getItemToneClass(item: ProjectCalendarItem) {
  return `project-calendar-person project-calendar-person-${item.riskTone}`;
}

function getCalendarItemLabel(item: ProjectCalendarItem) {
  return `${item.owner} · ${item.type} · ${item.progress}%`;
}

function getRangeSpanClass(segment: ProjectCalendarRangeSegment) {
  return `project-calendar-task-span project-calendar-task-span-${segment.item.riskTone}`;
}

function getRangeSpanStyle(segment: ProjectCalendarRangeSegment) {
  return {
    gridColumn: `${segment.startColumn} / ${segment.endColumn}`,
    gridRow: `${segment.lane + 1}`,
    "--span-progress": `${segment.item.progress}%`
  } as CSSProperties;
}

function RangeTaskSpan({ segment }: { segment: ProjectCalendarRangeSegment }) {
  const { item } = segment;

  return (
    <Tooltip title={`${item.title}｜${item.project}｜${item.startDate} 至 ${item.endDate}｜${item.status}`}>
      <div className={getRangeSpanClass(segment)} style={getRangeSpanStyle(segment)}>
        <span className="project-calendar-task-span-fill" />
        <span className="project-calendar-task-span-label">
          {item.owner} · {item.title}
        </span>
        <span className="project-calendar-task-span-percent">{item.progress}%</span>
      </div>
    </Tooltip>
  );
}

// 大日历单元格以“人”为第一视觉层级；跨天任务用周内横条呈现，避免每天重复堆一块。
export function ProjectProgressCalendar({
  items,
  month
}: {
  items: ProjectCalendarItem[];
  month: dayjs.Dayjs;
}) {
  const singleDayItems = items.filter((item) => !isRangeCalendarItem(item));
  const groupedItems = groupCalendarItemsByDate(singleDayItems);
  const weeks = getCalendarWeeks(month, items);

  return (
    <div className="project-calendar-shell">
      <div className="project-calendar-weekdays">
        {weekdayLabels.map((weekday) => (
          <div key={weekday}>周{weekday}</div>
        ))}
      </div>
      <div className="project-calendar-grid">
        {weeks.map((week) => (
          <div className="project-calendar-week-row" key={week.days[0].format("YYYY-MM-DD")}>
            <div className="project-calendar-week-days">
              {week.days.map((day) => {
                const dateKey = day.format("YYYY-MM-DD");
                const dayItems = groupedItems[dateKey] ?? [];
                const visibleItems = dayItems.slice(0, 2);
                const isCurrentMonth = day.isSame(month, "month");
                const isToday = day.isSame(dayjs(), "day");

                return (
                  <div
                    className={[
                      "project-calendar-day",
                      isCurrentMonth ? "" : "project-calendar-day-muted",
                      isToday ? "project-calendar-day-today" : ""
                    ].filter(Boolean).join(" ")}
                    key={dateKey}
                  >
                    <Flex justify="space-between" align="center" className="project-calendar-day-head">
                      <Space size={6}>
                        <Text strong>{day.date()}</Text>
                        {isToday ? <Badge color="#2563eb" text="今天" /> : null}
                      </Space>
                      {dayItems.length ? <Tag>{dayItems.length} 项</Tag> : null}
                    </Flex>
                    <Space direction="vertical" size={8} className="project-calendar-day-people">
                      {visibleItems.map((item) => (
                        <Tooltip
                          key={`${item.type}-${item.id}`}
                          title={`${item.title}｜${item.project}｜${item.status}`}
                        >
                          <div className={getItemToneClass(item)}>
                            <Flex align="center" justify="space-between" gap={8}>
                              <span className="project-calendar-person-name">{getCalendarItemLabel(item)}</span>
                              <Tag>{item.type}</Tag>
                            </Flex>
                            <Progress percent={item.progress} showInfo={false} size="small" />
                          </div>
                        </Tooltip>
                      ))}
                      {dayItems.length > visibleItems.length ? (
                        <Text type="secondary" className="project-calendar-more">
                          +{dayItems.length - visibleItems.length} 条进度
                        </Text>
                      ) : null}
                    </Space>
                  </div>
                );
              })}
            </div>
            <div className="project-calendar-week-spans">
              {week.rangeSegments.map((segment) => (
                <RangeTaskSpan key={segment.key} segment={segment} />
              ))}
              {week.hiddenRangeCount ? (
                <Text type="secondary" className="project-calendar-span-more">
                  +{week.hiddenRangeCount} 条跨天任务
                </Text>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
