"use client";

import { Badge, Flex, Progress, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import type { ProjectCalendarItem } from "@/components/project-management-platform/views/project-calendar-utils";
import { getCalendarDays, groupCalendarItemsByDate } from "@/components/project-management-platform/views/project-calendar-utils";

const { Text } = Typography;

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function getItemToneClass(item: ProjectCalendarItem) {
  return `project-calendar-person project-calendar-person-${item.riskTone}`;
}

function getCalendarItemLabel(item: ProjectCalendarItem) {
  return `${item.owner} · ${item.type} · ${item.progress}%`;
}

// 大日历单元格以“人”为第一视觉层级，方便项目经理扫到每个人当天的交付状态。
export function ProjectProgressCalendar({
  items,
  month
}: {
  items: ProjectCalendarItem[];
  month: dayjs.Dayjs;
}) {
  const groupedItems = groupCalendarItemsByDate(items);
  const days = getCalendarDays(month);

  return (
    <div className="project-calendar-shell">
      <div className="project-calendar-weekdays">
        {weekdayLabels.map((weekday) => (
          <div key={weekday}>周{weekday}</div>
        ))}
      </div>
      <div className="project-calendar-grid">
        {days.map((day) => {
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
    </div>
  );
}
