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
  success: { background: "#ecfdf3", bar: "#16a34a", border: "#86efac" },
  processing: { background: "#eff6ff", bar: "#2563eb", border: "#bfdbfe" },
  warning: { background: "#fffbeb", bar: "#d97706", border: "#fde68a" },
  danger: { background: "#fef2f2", bar: "#dc2626", border: "#fecaca" }
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

function getEventDateRange(item: ProjectCalendarItem) {
  const { start, end } = getProjectCalendarItemRange(item);

  // Scheduler 的结束日期按排期条右边界处理，所以单日事项需要向后补一天才有可见宽度。
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

  // 同一负责人下按起止时间稳定排序，避免拖拽刷新后 DayPilot 重新排线时出现跳行错乱。
  return (
    left.owner.localeCompare(right.owner, "zh-Hans-CN") ||
    leftRange.start.valueOf() - rightRange.start.valueOf() ||
    leftRange.end.valueOf() - rightRange.end.valueOf() ||
    left.title.localeCompare(right.title, "zh-Hans-CN")
  );
}

function getResourceHtml(owner: string, items: ProjectCalendarItem[]) {
  const versions = Array.from(new Set(items.map((item) => item.versionName || item.project))).slice(0, 2);
  const progress = Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length);
  const riskCount = items.filter((item) => item.riskTone === "danger").length;

  // 资源行用紧凑信息密度展示负责人、版本范围和风险，保留 Scheduler 主画布空间。
  return `
    <div class="project-scheduler-resource-label">
      <strong>${escapeHtml(owner)}</strong>
      <span>${escapeHtml(versions.join(" / ") || "暂无版本")}</span>
      <em>${progress}% · ${items.length} 项${riskCount ? ` · 风险 ${riskCount}` : ""}</em>
    </div>
  `;
}

function getEventHtml(item: ProjectCalendarItem) {
  // 事件条里的信息按“类型、标题、项目/状态/进度”分层，横向压缩时也能读到重点。
  return `
    <div class="project-scheduler-event-content">
      <div class="project-scheduler-event-main">
        <span class="project-scheduler-event-type">${escapeHtml(item.type)}</span>
        <strong>${escapeHtml(item.title)}</strong>
      </div>
      <div class="project-scheduler-event-meta">
        <span>${escapeHtml(item.versionName || item.project)}</span>
        <span>${escapeHtml(item.status)}</span>
        <span>${item.progress}%</span>
      </div>
    </div>
  `;
}

// Scheduler 需要资源行和事件条；这里统一把项目日历条目适配成 DayPilot 可消费的数据。
export function createProjectSchedulerModel(items: ProjectCalendarItem[], month: dayjs.Dayjs) {
  const visibleItems = items.filter((item) => isCalendarItemVisibleInMonth(item, month)).sort(compareProjectSchedulerItems);
  const groupedByOwner = visibleItems.reduce<Record<string, ProjectCalendarItem[]>>((groups, item) => {
    const owner = item.owner || "未分配";

    groups[owner] = [...(groups[owner] ?? []), item];

    return groups;
  }, {});

  const resources: DayPilot.ResourceData[] = Object.entries(groupedByOwner)
    .map(([owner, ownerItems]) => ({
      id: owner,
      name: owner,
      html: getResourceHtml(owner, ownerItems),
      toolTip: `${owner}｜${ownerItems.length} 项事项`,
      tags: {
        riskCount: ownerItems.filter((item) => item.riskTone === "danger").length,
        progress: Math.round(ownerItems.reduce((sum, item) => sum + item.progress, 0) / ownerItems.length)
      }
    }))
    // 负责人行固定按名称展示，避免拖拽改期触发风险状态变化后整行顺序跳动。
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));

  const events: DayPilot.EventData[] = visibleItems.map((item) => {
    const colors = toneColors[item.riskTone];
    const range = getEventDateRange(item);

    return {
      ...range,
      id: `${item.type}-${item.id}`,
      resource: item.owner || "未分配",
      text: `${item.type} · ${item.title}`,
      html: getEventHtml(item),
      toolTip: `${item.type === "任务" ? "拖拽改期，点击编辑" : "点击编辑"}｜${item.title}｜${item.versionName || item.project}｜${getRangeText(item)}｜${item.status}｜${item.progress}%`,
      backColor: colors.background,
      barColor: colors.bar,
      borderColor: colors.border,
      cssClass: `project-scheduler-event project-scheduler-event-${item.riskTone} project-scheduler-event-${typeClassMap[item.type]}`,
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
