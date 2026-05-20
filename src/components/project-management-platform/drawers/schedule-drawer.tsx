"use client";

import { Drawer, Empty, Flex, Segmented, Space, Switch, Tag, Timeline, Tooltip, Typography } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import type { DashboardData, FeishuUser } from "@/types/dashboard";
import type { ScheduleItem } from "@/components/project-management-platform/types";
import { milestoneColor, weekdayLabels } from "@/components/project-management-platform/constants";
import { isMyOwnerRecord } from "@/components/project-management-platform/identity";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";

const { Text } = Typography;

// 日程由里程碑、任务和 Bug 聚合而来，抽屉只消费统一的时间线模型。
export function createScheduleItems(data: DashboardData): ScheduleItem[] {
  const projectByName = new Map(data.projects.map((project) => [project.name, project]));
  const milestoneItems = data.requirementVersions.flatMap((version) => {
    const project = projectByName.get(version.project);

    // 里程碑跟随需求版本，日程中仍补充项目负责人作为兜底责任人。
    return version.milestones.map((milestone) => ({
      id: `${version.id}-${milestone.id}`,
      type: "里程碑" as const,
      title: `${version.name} · ${milestone.title}`,
      project: version.project,
      date: milestone.dueDate,
      owner: milestone.owner || project?.owner || "未分配",
      ownerAvatarUrl: milestone.ownerAvatarUrl || project?.ownerAvatarUrl,
      ownerEmail: milestone.ownerEmail || project?.ownerEmail,
      ownerMemberId: milestone.ownerMemberId || project?.ownerMemberId,
      ownerOpenId: milestone.ownerOpenId || project?.ownerOpenId,
      ownerUnionId: milestone.ownerUnionId || project?.ownerUnionId,
      ownerUserId: milestone.ownerUserId || project?.ownerUserId,
      status: milestone.status,
      color: milestoneColor[milestone.status] === "default" ? "gray" : milestoneColor[milestone.status]
    }));
  });
  const taskItems = data.tasks.map((task) => ({
    id: task.id,
    type: "任务" as const,
    title: task.title,
    project: task.project,
    date: task.dueDate,
    owner: task.owner,
    ownerAvatarUrl: task.ownerAvatarUrl,
    ownerEmail: task.ownerEmail,
    ownerMemberId: task.ownerMemberId,
    ownerOpenId: task.ownerOpenId,
    ownerUnionId: task.ownerUnionId,
    ownerUserId: task.ownerUserId,
    status: task.stage,
    color: task.stage === "已完成" ? "green" : task.stage === "评审中" ? "purple" : task.stage === "进行中" ? "blue" : "gray"
  }));
  const bugItems = data.bugs.map((bug) => ({
    id: bug.id,
    type: "Bug" as const,
    title: bug.title,
    project: bug.project,
    date: bug.createdAt,
    owner: bug.owner || bug.reporter,
    ownerAvatarUrl: bug.ownerAvatarUrl,
    ownerEmail: bug.ownerEmail,
    ownerMemberId: bug.ownerMemberId,
    ownerOpenId: bug.ownerOpenId,
    ownerUnionId: bug.ownerUnionId,
    ownerUserId: bug.ownerUserId,
    status: bug.status,
    color: bug.status === "已关闭" ? "green" : bug.severity === "阻塞" || bug.severity === "严重" ? "red" : "gold"
  }));

  return [...milestoneItems, ...taskItems, ...bugItems].sort(
    (left, right) => dayjs(left.date).valueOf() - dayjs(right.date).valueOf()
  );
}

// 日期分组旁补充中文星期，帮助用户快速扫近期安排。
function getWeekdayLabel(date: string) {
  return weekdayLabels[dayjs(date).day()] ?? "";
}

// 日程抽屉内置类型筛选和“只看我的”，不把临时筛选状态泄漏给主容器。
export function ScheduleDrawer({
  currentUser,
  data,
  open,
  onClose
}: {
  currentUser?: FeishuUser;
  data: DashboardData;
  open: boolean;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<ScheduleItem["type"] | "全部">("全部");
  const [onlyMine, setOnlyMine] = useState(true);
  const scheduleItems = useMemo(() => createScheduleItems(data), [data]);
  const scopedItems = useMemo(
    () => (onlyMine && currentUser ? scheduleItems.filter((item) => isMyOwnerRecord(item, currentUser)) : scheduleItems),
    [currentUser, onlyMine, scheduleItems]
  );
  const visibleItems = useMemo(
    () => (filter === "全部" ? scopedItems : scopedItems.filter((item) => item.type === filter)),
    [filter, scopedItems]
  );
  const groups = useMemo(() => {
    const groupMap = new Map<string, ScheduleItem[]>();

    for (const item of visibleItems) {
      const date = dayjs(item.date).format("YYYY-MM-DD");
      groupMap.set(date, [...(groupMap.get(date) ?? []), item]);
    }

    return Array.from(groupMap.entries()).map(([date, items]) => ({
      date,
      items
    }));
  }, [visibleItems]);

  return (
    <Drawer
      title={
        <Space>
          <CalendarOutlined />
          <span>项目日程</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size="large"
      extra={
        <Space wrap>
          <Tooltip title={currentUser ? `当前登录：${currentUser.name}` : "未获取到登录用户"}>
            <Space className="task-mine-filter">
              <Text type="secondary">只看我的</Text>
              <Switch checked={onlyMine} disabled={!currentUser} onChange={setOnlyMine} />
            </Space>
          </Tooltip>
          <Segmented
            value={filter}
            onChange={(value) => setFilter(value as ScheduleItem["type"] | "全部")}
            options={["全部", "里程碑", "任务", "Bug"]}
          />
        </Space>
      }
    >
      {groups.length ? (
        <Space orientation="vertical" size={16} className="pm-wide schedule-list">
          {groups.map((group) => (
            <div className="schedule-day-group" key={group.date}>
              <Flex justify="space-between" align="center" className="schedule-day-header">
                <Space>
                  <Text strong>{group.date}</Text>
                  <Text type="secondary">{getWeekdayLabel(group.date)}</Text>
                </Space>
                <Tag>{group.items.length} 项</Tag>
              </Flex>
              <Timeline
                items={group.items.map((item) => ({
                  color: item.color,
                  content: (
                    <Space orientation="vertical" size={4} className="pm-wide">
                      <Space wrap>
                        <Tag color={item.type === "Bug" ? "red" : item.type === "任务" ? "blue" : "cyan"}>
                          {item.type}
                        </Tag>
                        <Text strong>{item.title}</Text>
                        <Tag color={item.color}>{item.status}</Tag>
                      </Space>
                      <OwnerInline
                        name={item.owner}
                        avatarUrl={item.ownerAvatarUrl}
                        secondary={item.project}
                      />
                    </Space>
                  )
                }))}
              />
            </div>
          ))}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={onlyMine ? "暂无与你相关的日程" : "暂无日程"}
        />
      )}
    </Drawer>
  );
}
