"use client";

import { Alert, Button, Card, Flex, Space, Tag, Tooltip, Typography } from "antd";
import { CalendarOutlined, EditOutlined } from "@ant-design/icons";
import { useMemo } from "react";
import dayjs from "dayjs";
import type { Task, TaskStage } from "@/types/dashboard";
import type { RequirementVersionOption } from "@/components/project-management-platform/types";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";

const { Text } = Typography;

const taskStages: TaskStage[] = ["待处理", "进行中", "评审中", "已完成"];
const priorityColor: Record<Task["priority"], string> = {
  高: "red",
  中: "gold",
  低: "green"
};

function sortTasksForDelivery(left: Task, right: Task) {
  const stageDelta = taskStages.indexOf(left.stage) - taskStages.indexOf(right.stage);

  if (stageDelta !== 0) {
    return stageDelta;
  }

  return dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf();
}

// 版本任务看板只关心“一个版本下有哪些交付任务”，让任务拆解结果不再散在项目维度里。
export function VersionTaskBoard({
  onlyMine,
  tasks,
  versionOptions,
  onEdit
}: {
  onlyMine: boolean;
  tasks: Task[];
  versionOptions: RequirementVersionOption[];
  onEdit: (task: Task) => void;
}) {
  const versionGroups = useMemo(() => {
    const versionOrder = new Map(versionOptions.map((version, index) => [version.value, index]));
    const groups = new Map<string, { project: string; tasks: Task[]; versionId: string; versionName: string }>();

    for (const task of tasks) {
      const versionId = task.versionId || "unplanned";
      const versionOption = versionOptions.find((version) => version.value === versionId);
      const current = groups.get(versionId) ?? {
        project: task.project || versionOption?.project || "未关联项目",
        tasks: [],
        versionId,
        versionName: task.versionName || versionOption?.versionName || "未规划"
      };

      groups.set(versionId, {
        ...current,
        tasks: [...current.tasks, task]
      });
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        tasks: [...group.tasks].sort(sortTasksForDelivery)
      }))
      .sort((left, right) => {
        const leftOrder = versionOrder.get(left.versionId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = versionOrder.get(right.versionId) ?? Number.MAX_SAFE_INTEGER;

        return leftOrder - rightOrder || right.tasks.length - left.tasks.length;
      });
  }, [tasks, versionOptions]);

  return (
    <div className="version-task-grid">
      {versionGroups.length ? (
        versionGroups.map((group) => {
          const unfinishedCount = group.tasks.filter((task) => task.stage !== "已完成").length;
          const overdueCount = group.tasks.filter(
            (task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(dayjs().startOf("day"))
          ).length;

          return (
            <Card
              className="version-task-column"
              key={group.versionId}
              title={
                <Space orientation="vertical" size={2}>
                  <Text strong>{group.versionName}</Text>
                  <Text type="secondary">{group.project}</Text>
                </Space>
              }
              extra={
                <Space size={6}>
                  <Tag color={unfinishedCount ? "blue" : "green"}>{unfinishedCount} 未完成</Tag>
                  {overdueCount ? <Tag color="red">{overdueCount} 延期</Tag> : null}
                </Space>
              }
            >
              <Space orientation="vertical" size={12} className="pm-wide">
                {group.tasks.map((task) => {
                  const taskOverdue = task.stage !== "已完成" && dayjs(task.dueDate).isBefore(dayjs().startOf("day"));

                  return (
                    <div className="task-card" key={task.id}>
                      <Flex justify="space-between" align="start" gap={12}>
                        <Text strong>{task.title}</Text>
                        <Space size={4}>
                          <Tag color={priorityColor[task.priority]}>{task.priority}</Tag>
                          <Tooltip title="编辑任务">
                            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(task)} />
                          </Tooltip>
                        </Space>
                      </Flex>
                      <Space wrap size={[6, 6]} className="task-meta-tags">
                        <Tag>{task.stage}</Tag>
                        <Tag icon={<CalendarOutlined />}>{task.dueDate}</Tag>
                        <OwnerInline name={task.owner} avatarUrl={task.ownerAvatarUrl} />
                      </Space>
                      <Alert
                        className="task-ai-hint"
                        type={taskOverdue || task.priority === "高" ? "warning" : "info"}
                        showIcon
                        message={task.aiHint}
                      />
                    </div>
                  );
                })}
              </Space>
            </Card>
          );
        })
      ) : (
        <Card className="pm-wide">
          <Alert
            type="info"
            showIcon
            message={onlyMine ? "暂无分配给你的版本任务" : "暂无任务，进入需求版本上传文档后会自动生成"}
          />
        </Card>
      )}
    </div>
  );
}

export { priorityColor, sortTasksForDelivery };
