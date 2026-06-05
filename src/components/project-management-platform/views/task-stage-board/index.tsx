"use client";

import "./index.less";
import { Badge, Button, Card, Flex, Progress, Space, Tag, Tooltip, Typography } from "antd";
import { CalendarOutlined, EditOutlined, HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners
} from "@dnd-kit/core";
import dayjs from "dayjs";
import { memo, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Task, TaskStage } from "@/types/dashboard";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import { priorityColor, taskStages } from "@/components/project-management-platform/constants";
import { sortTasksForDelivery } from "@/components/project-management-platform/views/version-task-board";

const { Text } = Typography;
const initialVisibleTaskCount = 18;
const visibleTaskStep = 18;
const dragActivationDistance = 1;

const stageToneClass: Record<TaskStage, string> = {
  待处理: "task-stage-column-pending",
  进行中: "task-stage-column-progress",
  评审中: "task-stage-column-review",
  已完成: "task-stage-column-done"
};

function getTaskOverdue(task: Task) {
  return task.stage !== "已完成" && dayjs(task.dueDate).isBefore(dayjs().startOf("day"));
}

function getColumnPercent(tasks: Task[]) {
  if (!tasks.length) {
    return 0;
  }

  return Math.round((tasks.filter((task) => task.stage === "已完成").length / tasks.length) * 100);
}

function getStageFromDropId(id: string) {
  const stage = id.replace(/^stage:/, "") as TaskStage;

  return taskStages.includes(stage) ? stage : null;
}

function getVisibleCountKey(stage: TaskStage, tasks: Task[]) {
  return `${stage}:${tasks.map((task) => task.id).join("|")}`;
}

// 阶段列同时是空列投放区，避免某个阶段没有任务时无法拖入。
function TaskStageColumn({
  children,
  draggingTask,
  hiddenCount,
  onShowMore,
  stage,
  tasks
}: {
  children: ReactNode;
  draggingTask: boolean;
  hiddenCount: number;
  onShowMore: () => void;
  stage: TaskStage;
  tasks: Task[];
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `stage:${stage}` });
  const overdueCount = tasks.filter(getTaskOverdue).length;
  const donePercent = getColumnPercent(tasks);
  const emptyText = draggingTask ? (isOver ? `松手移入${stage}` : "可拖入此阶段") : "暂无任务";

  return (
    <div ref={setNodeRef} className="task-stage-column-shell">
      <Card
        className={`task-stage-column ${stageToneClass[stage]}${isOver ? " task-stage-column-over" : ""}`}
        title={
          <Flex justify="space-between" align="center" gap={8}>
            <Space size={8}>
              <span className="task-stage-dot" />
              <Text strong>{stage}</Text>
            </Space>
            <Badge count={tasks.length} color="var(--brand)" />
          </Flex>
        }
        extra={overdueCount ? <Tag color="red">{overdueCount} 延期</Tag> : null}
      >
        <div className="task-stage-progress-bar">
          <Progress percent={donePercent} size="small" showInfo={false} />
        </div>
        <div className="task-stage-list">
          {children}
          {hiddenCount > 0 ? (
            <Button className="task-stage-show-more" size="small" block onClick={onShowMore}>
              展开 {Math.min(hiddenCount, visibleTaskStep)} 项，剩余 {hiddenCount}
            </Button>
          ) : null}
          {!tasks.length ? (
            <div className={`task-stage-empty${draggingTask ? " task-stage-empty-active" : ""}`}>
              <Text type="secondary">{emptyText}</Text>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function TaskStageCard({
  dragAttributes,
  dragListeners,
  dragging,
  onEdit,
  setDragHandleRef,
  task
}: {
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  dragging?: boolean;
  onEdit: (task: Task) => void;
  setDragHandleRef?: (element: HTMLElement | null) => void;
  task: Task;
}) {
  const taskOverdue = getTaskOverdue(task);

  return (
    <div className={`task-stage-card${dragging ? " task-stage-card-dragging" : ""}`}>
      <Flex justify="space-between" align="start" gap={10}>
        <Space size={8} align="start" className="task-stage-card-title">
          <span
            ref={setDragHandleRef}
            className="task-stage-card-handle"
            {...dragAttributes}
            {...dragListeners}
          >
            <HolderOutlined />
          </span>
          <Text strong>{task.title}</Text>
        </Space>
        <Tooltip title="编辑任务">
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(task)} />
        </Tooltip>
      </Flex>
      <Space wrap size={[6, 6]} className="task-meta-tags">
        <Tag color={priorityColor[task.priority]}>{task.priority}</Tag>
        {task.versionName ? <Tag color="blue">{task.versionName}</Tag> : <Tag>未规划</Tag>}
        <Tag icon={<CalendarOutlined />} color={taskOverdue ? "red" : undefined}>
          {task.dueDate}
        </Tag>
      </Space>
      <Flex justify="space-between" align="center" gap={8} className="task-stage-card-footer">
        <OwnerInline name={task.owner} avatarUrl={task.ownerAvatarUrl} />
        <Text type="secondary">{task.project}</Text>
      </Flex>
      <Text type="secondary" className="task-stage-ai-hint">
        {task.aiHint}
      </Text>
    </div>
  );
}

// 每张卡片只注册为轻量 Draggable，不再注册 Sortable。
// 当前产品只需要把任务从一个阶段拖到另一个阶段，列内排序没有实际业务入口；
// 如果继续使用 Sortable，dnd-kit 会在拖动过程中持续测量同列卡片位置，数据量一大就会明显卡顿。
const DraggableTaskCard = memo(function DraggableTaskCard({
  onEdit,
  task
}: {
  onEdit: (task: Task) => void;
  task: Task;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef
  } = useDraggable({
    data: {
      stage: task.stage,
      type: "task"
    },
    id: task.id
  });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "task-stage-draggable task-stage-draggable-active" : "task-stage-draggable"}
    >
      <TaskStageCard
        dragAttributes={attributes}
        dragListeners={listeners}
        dragging={isDragging}
        setDragHandleRef={setActivatorNodeRef}
        task={task}
        onEdit={onEdit}
      />
    </div>
  );
});

// dnd-kit 阶段看板只负责阶段流转，业务更新交给父容器复用现有记录接口。
export function TaskStageBoard({
  onlyMine,
  onEdit,
  onStageChange,
  tasks
}: {
  onlyMine: boolean;
  onEdit: (task: Task) => void;
  onStageChange: (task: Task, stage: TaskStage) => Promise<boolean>;
  tasks: Task[];
}) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const lastOverStageRef = useRef<TaskStage | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: dragActivationDistance
      }
    })
  );
  const tasksByStage = useMemo(() => {
    const groups = taskStages.reduce<Record<TaskStage, Task[]>>((currentGroups, stage) => {
      currentGroups[stage] = [];

      return currentGroups;
    }, {} as Record<TaskStage, Task[]>);

    // 任务看板可能一次展示完整版本范围，单次遍历分桶能避免每个阶段重复 filter 全量任务。
    for (const task of tasks) {
      groups[task.stage].push(task);
    }

    for (const stage of taskStages) {
      groups[stage].sort(sortTasksForDelivery);
    }

    return groups;
  }, [tasks]);
  const visibleCountKeys = useMemo(
    () =>
      taskStages.reduce<Record<TaskStage, string>>((keys, stage) => {
        keys[stage] = getVisibleCountKey(stage, tasksByStage[stage]);

        return keys;
      }, {} as Record<TaskStage, string>),
    [tasksByStage]
  );
  const [visibleCounts, setVisibleCounts] = useState<Partial<Record<TaskStage, { count: number; key: string }>>>({});
  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? null : null;

  function getVisibleCount(stage: TaskStage) {
    const stageTasks = tasksByStage[stage];
    const stored = visibleCounts[stage];

    // 任务列表经过版本、负责人筛选或阶段变更后，旧的可见数量可能对应另一批任务；这里用 id 列表签名重置，
    // 保证用户切换筛选条件时每列回到轻量首屏，避免一次性重新挂载大量卡片拖慢拖拽。
    if (!stored || stored.key !== visibleCountKeys[stage]) {
      return Math.min(initialVisibleTaskCount, stageTasks.length);
    }

    return Math.min(stored.count, stageTasks.length);
  }

  function handleShowMore(stage: TaskStage) {
    const currentCount = getVisibleCount(stage);

    setVisibleCounts((current) => ({
      ...current,
      [stage]: {
        count: Math.min(currentCount + visibleTaskStep, tasksByStage[stage].length),
        key: visibleCountKeys[stage]
      }
    }));
  }

  function handleDragStart(event: DragStartEvent) {
    lastOverStageRef.current = null;
    setActiveTaskId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : "";
    const overStage = getStageFromDropId(overId);

    // 用户拖动中已经看到“松手移入某阶段”时，松手瞬间 event.over 偶尔会为空；
    // 记录最后一次命中的阶段，保证视觉反馈和实际保存结果一致。
    if (overStage) {
      lastOverStageRef.current = overStage;
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);

    const task = tasks.find((item) => item.id === event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    // 任务看板现在只允许跨阶段投放，不做列内排序；目标只认阶段列，
    // 避免每张任务卡都成为碰撞/排序目标导致拖拽时频繁测量和重排。
    const targetStage = getStageFromDropId(overId) ?? lastOverStageRef.current;

    lastOverStageRef.current = null;

    if (!task || !targetStage || task.stage === targetStage) {
      return;
    }

    await onStageChange(task, targetStage);
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        lastOverStageRef.current = null;
        setActiveTaskId(null);
      }}
    >
      <div className="task-stage-board">
        {taskStages.map((stage) => {
          const visibleCount = getVisibleCount(stage);
          const visibleTasks = tasksByStage[stage].slice(0, visibleCount);
          const hiddenCount = Math.max(0, tasksByStage[stage].length - visibleCount);

          return (
            <TaskStageColumn
              key={stage}
              draggingTask={Boolean(activeTask)}
              hiddenCount={hiddenCount}
              onShowMore={() => handleShowMore(stage)}
              stage={stage}
              tasks={tasksByStage[stage]}
            >
              {visibleTasks.map((task) => (
                <DraggableTaskCard key={task.id} task={task} onEdit={onEdit} />
              ))}
            </TaskStageColumn>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="task-stage-drag-overlay">
            <TaskStageCard task={activeTask} onEdit={onEdit} dragging />
          </div>
        ) : null}
      </DragOverlay>
      {!tasks.length ? (
        <Card className="pm-wide">
          <Text type="secondary">{onlyMine ? "暂无分配给你的任务" : "暂无任务，上传文档后会自动生成"}</Text>
        </Card>
      ) : null}
    </DndContext>
  );
}
