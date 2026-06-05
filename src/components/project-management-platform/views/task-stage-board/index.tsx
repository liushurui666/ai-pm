"use client";

import "./index.less";
import { Badge, Button, Card, Flex, Progress, Space, Tag, Tooltip, Typography } from "antd";
import { CalendarOutlined, EditOutlined, HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  DragOverlay,
  MeasuringFrequency,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  defaultAnimateLayoutChanges,
  useSortable,
  type AnimateLayoutChanges,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import dayjs from "dayjs";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Task, TaskStage } from "@/types/dashboard";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import { priorityColor, taskStages } from "@/components/project-management-platform/constants";
import { sortTasksForDelivery } from "@/components/project-management-platform/views/version-task-board";

const { Text } = Typography;
const initialVisibleTaskCount = 18;
const visibleTaskStep = 18;
const dragActivationDistance = 1;
const stageDropPrefix = "stage:";
const taskStageOrderStorageKey = "ai-pm.task-stage-board-order.v1";
const sortableTransition = {
  duration: 120,
  easing: "cubic-bezier(0.2, 0, 0, 1)"
};
const taskStageMeasuring = {
  droppable: {
    frequency: MeasuringFrequency.Optimized,
    strategy: MeasuringStrategy.WhileDragging
  }
};
const disabledResizeObserverConfig = {
  disabled: true
};

const stageToneClass: Record<TaskStage, string> = {
  待处理: "task-stage-column-pending",
  进行中: "task-stage-column-progress",
  评审中: "task-stage-column-review",
  已完成: "task-stage-column-done"
};

type StageTaskGroups = Record<TaskStage, Task[]>;

type DragStagePreview = {
  overId: string | null;
  stage: TaskStage;
  taskId: string;
};

const animateTaskLayoutChanges: AnimateLayoutChanges = (args) => {
  // 只有拖拽排序相关的位移需要动画，其余列表刷新不做过渡，避免筛选/翻页时产生额外布局动画。
  return args.isSorting || args.wasDragging ? defaultAnimateLayoutChanges(args) : false;
};

const taskStageCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);

  if (collisions.length <= 1) {
    return collisions;
  }

  const activeId = String(args.active.id);
  const availableCollisions = collisions.filter((collision) => String(collision.id) !== activeId);

  if (!availableCollisions.length) {
    return collisions;
  }

  // 同一位置经常同时命中“任务卡片”和“阶段列”；优先返回任务卡片，Sortable 才能立刻计算同列让位顺序。
  return availableCollisions.sort((left, right) => {
    const leftIsStage = isStageDropId(String(left.id));
    const rightIsStage = isStageDropId(String(right.id));

    if (leftIsStage === rightIsStage) {
      return 0;
    }

    return leftIsStage ? 1 : -1;
  });
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
  if (!isStageDropId(id)) {
    return null;
  }

  const stage = id.slice(stageDropPrefix.length) as TaskStage;

  return taskStages.includes(stage) ? stage : null;
}

function getStageDropId(stage: TaskStage) {
  return `${stageDropPrefix}${stage}`;
}

function isStageDropId(id: string) {
  return id.startsWith(stageDropPrefix);
}

function getVisibleCountKey(stage: TaskStage, tasks: Task[]) {
  // 可见数量只应该跟“这批任务是谁”有关，不能跟手动排序后的顺序有关；
  // 否则用户展开更多后再拖动排序，会因为 id 顺序变化把可见数量重置回首屏。
  return `${stage}:${tasks.map((task) => task.id).sort().join("|")}`;
}

function getStoredStageOrder() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(taskStageOrderStorageKey);

    return storedValue ? JSON.parse(storedValue) as Partial<Record<TaskStage, string[]>> : {};
  } catch {
    return {};
  }
}

function getOrderedStageTasks(
  tasks: Task[],
  stage: TaskStage,
  taskOrderByStage: Partial<Record<TaskStage, string[]>>
) {
  const order = taskOrderByStage[stage] ?? [];
  const orderIndex = new Map(order.map((id, index) => [id, index]));

  return [...tasks].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id);
    const rightIndex = orderIndex.get(right.id);

    if (typeof leftIndex === "number" && typeof rightIndex === "number") {
      return leftIndex - rightIndex;
    }

    if (typeof leftIndex === "number") {
      return -1;
    }

    if (typeof rightIndex === "number") {
      return 1;
    }

    return sortTasksForDelivery(left, right);
  });
}

function resolveVisibleCount({
  stageTasks,
  storedVisibleCount,
  visibleCountKey
}: {
  stageTasks: Task[];
  storedVisibleCount?: { count: number; key: string };
  visibleCountKey: string;
}) {
  // 可见数量和阶段真实任务集绑定，拖拽预览只是临时视觉状态；这样跨阶段拖动不会把“展开更多”的状态错误写到别的任务集。
  if (!storedVisibleCount || storedVisibleCount.key !== visibleCountKey) {
    return Math.min(initialVisibleTaskCount, stageTasks.length);
  }

  return Math.min(storedVisibleCount.count, stageTasks.length);
}

function getNextStageOrder({
  activeId,
  overId,
  stage,
  taskOrderByStage,
  tasks
}: {
  activeId: string;
  overId: string;
  stage: TaskStage;
  taskOrderByStage: Partial<Record<TaskStage, string[]>>;
  tasks: Task[];
}) {
  const orderedIds = getOrderedStageTasks(tasks, stage, taskOrderByStage).map((task) => task.id);
  const activeIndex = orderedIds.indexOf(activeId);
  const overIndex = orderedIds.indexOf(overId);

  if (activeIndex < 0 || overIndex < 0 || activeId === overId) {
    return taskOrderByStage;
  }

  const nextVisibleIds = arrayMove(orderedIds, activeIndex, overIndex);
  const visibleIdSet = new Set(orderedIds);
  const hiddenOrderedIds = (taskOrderByStage[stage] ?? []).filter((id) => !visibleIdSet.has(id));

  // 任务顺序目前是看板体验偏好，后端没有 order 字段；先保存在本地，避免同阶段排序刷新后马上丢失。
  return {
    ...taskOrderByStage,
    [stage]: [...nextVisibleIds, ...hiddenOrderedIds]
  };
}

function getPreviewInsertIndex<T extends { id: string }>({
  fallbackVisibleCount,
  overId,
  tasks
}: {
  fallbackVisibleCount: number;
  overId: string | null;
  tasks: T[];
}) {
  const overIndex = overId ? tasks.findIndex((task) => task.id === overId) : -1;

  // 拖到具体卡片时按卡片位置插入；只命中阶段列时放到当前可见列表末尾，避免插到隐藏任务后面导致用户看不到预览卡。
  return overIndex >= 0 ? overIndex : Math.min(fallbackVisibleCount, tasks.length);
}

function getPreviewStageGroups({
  activeTask,
  preview,
  tasksByStage,
  visibleCountByStage
}: {
  activeTask: Task;
  preview: DragStagePreview | null;
  tasksByStage: StageTaskGroups;
  visibleCountByStage: Record<TaskStage, number>;
}) {
  if (!preview || preview.stage === activeTask.stage) {
    return tasksByStage;
  }

  const previewGroups = taskStages.reduce<StageTaskGroups>((groups, stage) => {
    groups[stage] = tasksByStage[stage].filter((task) => task.id !== activeTask.id);

    return groups;
  }, {} as StageTaskGroups);
  const targetTasks = previewGroups[preview.stage];
  const insertIndex = getPreviewInsertIndex({
    fallbackVisibleCount: visibleCountByStage[preview.stage],
    overId: preview.overId,
    tasks: targetTasks
  });

  // 跨阶段拖动时把 active 任务临时改成目标阶段，让目标列的 SortableContext 能包含 active id 并立即产生让位动画。
  previewGroups[preview.stage] = [
    ...targetTasks.slice(0, insertIndex),
    { ...activeTask, stage: preview.stage },
    ...targetTasks.slice(insertIndex)
  ];

  return previewGroups;
}

function getNextCrossStageOrder({
  activeId,
  overId,
  sourceStage,
  targetStage,
  taskOrderByStage,
  tasksByStage,
  visibleCount
}: {
  activeId: string;
  overId: string | null;
  sourceStage: TaskStage;
  targetStage: TaskStage;
  taskOrderByStage: Partial<Record<TaskStage, string[]>>;
  tasksByStage: StageTaskGroups;
  visibleCount: number;
}) {
  const sourceIds = getOrderedStageTasks(tasksByStage[sourceStage], sourceStage, taskOrderByStage)
    .map((task) => task.id)
    .filter((id) => id !== activeId);
  const targetIds = getOrderedStageTasks(tasksByStage[targetStage], targetStage, taskOrderByStage)
    .map((task) => task.id)
    .filter((id) => id !== activeId);
  const insertIndex = getPreviewInsertIndex({
    fallbackVisibleCount: visibleCount,
    overId,
    tasks: targetIds.map((id) => ({ id }))
  });

  // 后端目前没有独立 order 字段，跨阶段拖动松手后也要写本地顺序；否则任务状态已变更，但刷新后仍会被默认排序打回去。
  return {
    ...taskOrderByStage,
    [sourceStage]: sourceIds,
    [targetStage]: [...targetIds.slice(0, insertIndex), activeId, ...targetIds.slice(insertIndex)]
  };
}

// 阶段列同时是空列投放区，避免某个阶段没有任务时无法拖入。
function TaskStageColumn({
  children,
  draggingTask,
  hiddenCount,
  itemIds,
  onShowMore,
  stage,
  tasks
}: {
  children: ReactNode;
  draggingTask: boolean;
  hiddenCount: number;
  itemIds: string[];
  onShowMore: () => void;
  stage: TaskStage;
  tasks: Task[];
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: getStageDropId(stage),
    resizeObserverConfig: disabledResizeObserverConfig
  });
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
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
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
        </SortableContext>
      </Card>
    </div>
  );
}

const TaskStageCard = memo(function TaskStageCard({
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
      <Flex justify="space-between" align="start" gap={8} className="task-stage-card-head">
        <div className="task-stage-card-title">
          <span
            ref={setDragHandleRef}
            className="task-stage-card-handle"
            {...dragAttributes}
            {...dragListeners}
          >
            <HolderOutlined />
          </span>
          <Text strong>{task.title}</Text>
        </div>
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
}, areTaskStageCardPropsEqual);

function areTaskStageCardPropsEqual(
  previous: {
    dragAttributes?: DraggableAttributes;
    dragListeners?: DraggableSyntheticListeners;
    dragging?: boolean;
    onEdit: (task: Task) => void;
    setDragHandleRef?: (element: HTMLElement | null) => void;
    task: Task;
  },
  next: {
    dragAttributes?: DraggableAttributes;
    dragListeners?: DraggableSyntheticListeners;
    dragging?: boolean;
    onEdit: (task: Task) => void;
    setDragHandleRef?: (element: HTMLElement | null) => void;
    task: Task;
  }
) {
  return (
    previous.task === next.task &&
    previous.dragging === next.dragging &&
    previous.onEdit === next.onEdit &&
    previous.setDragHandleRef === next.setDragHandleRef &&
    previous.dragAttributes === next.dragAttributes &&
    previous.dragListeners === next.dragListeners
  );
}

// 同阶段拖拽现在需要“让位”动画，所以卡片重新接入 Sortable；
// 但 SortableContext 只包当前可见任务，避免全量版本任务都参与测量导致拖动卡顿。
const SortableTaskCard = memo(function SortableTaskCard({
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
    setNodeRef,
    transform,
    transition
  } = useSortable({
    animateLayoutChanges: animateTaskLayoutChanges,
    data: {
      stage: task.stage,
      type: "task"
    },
    id: task.id,
    resizeObserverConfig: disabledResizeObserverConfig,
    transition: sortableTransition
  });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "task-stage-draggable task-stage-draggable-active" : "task-stage-draggable"}
      style={{
        transform: transform ? `${CSS.Transform.toString(transform)} translateZ(0)` : undefined,
        transition
      }}
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
  const [dragStagePreview, setDragStagePreview] = useState<DragStagePreview | null>(null);
  const [taskOrderByStage, setTaskOrderByStage] = useState<Partial<Record<TaskStage, string[]>>>(getStoredStageOrder);
  const lastOverStageRef = useRef<TaskStage | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: dragActivationDistance
      }
    })
  );
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
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
      groups[stage] = getOrderedStageTasks(groups[stage], stage, taskOrderByStage);
    }

    return groups;
  }, [taskOrderByStage, tasks]);
  const visibleCountKeys = useMemo(
    () =>
      taskStages.reduce<Record<TaskStage, string>>((keys, stage) => {
        keys[stage] = getVisibleCountKey(stage, tasksByStage[stage]);

        return keys;
      }, {} as Record<TaskStage, string>),
    [tasksByStage]
  );
  const [visibleCounts, setVisibleCounts] = useState<Partial<Record<TaskStage, { count: number; key: string }>>>({});
  const activeTask = activeTaskId ? taskById.get(activeTaskId) ?? null : null;
  const visibleCountByStage = useMemo(
    () =>
      taskStages.reduce<Record<TaskStage, number>>((counts, stage) => {
        counts[stage] = resolveVisibleCount({
          stageTasks: tasksByStage[stage],
          storedVisibleCount: visibleCounts[stage],
          visibleCountKey: visibleCountKeys[stage]
        });

        return counts;
      }, {} as Record<TaskStage, number>),
    [tasksByStage, visibleCounts, visibleCountKeys]
  );
  const visibleTasksByStage = useMemo(
    () => {
      if (!activeTask) {
        return tasksByStage;
      }

      return getPreviewStageGroups({
        activeTask,
        preview: dragStagePreview,
        tasksByStage,
        visibleCountByStage
      });
    },
    [activeTask, dragStagePreview, tasksByStage, visibleCountByStage]
  );

  useEffect(() => {
    // 同阶段排序是本地看板偏好，后端暂未设计任务 order 字段；保存到 localStorage 让刷新后仍保持 PM 手动排好的顺序。
    window.localStorage.setItem(taskStageOrderStorageKey, JSON.stringify(taskOrderByStage));
  }, [taskOrderByStage]);

  function handleShowMore(stage: TaskStage) {
    const currentCount = visibleCountByStage[stage];

    setVisibleCounts((current) => ({
      ...current,
      [stage]: {
        count: Math.min(currentCount + visibleTaskStep, tasksByStage[stage].length),
        key: visibleCountKeys[stage]
      }
    }));
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    lastOverStageRef.current = null;
    setDragStagePreview(null);
    setActiveTaskId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const activeId = String(event.active.id);
    const activeTaskItem = taskById.get(activeId);
    const overId = event.over?.id ? String(event.over.id) : "";
    const overTask = taskById.get(overId);
    const overStage = getStageFromDropId(overId) ?? overTask?.stage ?? null;

    // 用户拖动中已经看到“松手移入某阶段”时，松手瞬间 event.over 偶尔会为空；
    // 记录最后一次命中的阶段，保证视觉反馈和实际保存结果一致。
    if (overStage) {
      lastOverStageRef.current = overStage;
    }

    if (!activeTaskItem || !overStage || overStage === activeTaskItem.stage) {
      setDragStagePreview((current) => (current ? null : current));
      return;
    }

    const nextPreview: DragStagePreview = {
      overId: overTask?.id ?? null,
      stage: overStage,
      taskId: activeId
    };

    // onDragOver 会按帧触发；只有目标阶段或目标卡片变化时才刷新预览列表，避免无意义重渲染拖慢跟手感。
    setDragStagePreview((current) =>
      current?.taskId === nextPreview.taskId &&
      current.stage === nextPreview.stage &&
      current.overId === nextPreview.overId
        ? current
        : nextPreview
    );
  }, [taskById]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const currentPreview = dragStagePreview;
    setActiveTaskId(null);
    setDragStagePreview(null);

    const task = taskById.get(String(event.active.id));
    const overId = event.over?.id ? String(event.over.id) : "";
    const overTask = taskById.get(overId);
    const targetStage = getStageFromDropId(overId) ?? overTask?.stage ?? currentPreview?.stage ?? lastOverStageRef.current;

    lastOverStageRef.current = null;

    if (!task || !targetStage) {
      return;
    }

    if (task.stage === targetStage) {
      if (overTask) {
        setTaskOrderByStage((currentOrder) =>
          getNextStageOrder({
            activeId: task.id,
            overId: overTask.id,
            stage: targetStage,
            taskOrderByStage: currentOrder,
            tasks: tasksByStage[targetStage]
          })
        );
      }

      return;
    }

    const saved = await onStageChange(task, targetStage);

    if (saved) {
      setTaskOrderByStage((currentOrder) =>
        getNextCrossStageOrder({
          activeId: task.id,
          overId: overTask?.id ?? currentPreview?.overId ?? null,
          sourceStage: task.stage,
          targetStage,
          taskOrderByStage: currentOrder,
          tasksByStage,
          visibleCount: visibleCountByStage[targetStage]
        })
      );
    }
  }, [dragStagePreview, onStageChange, taskById, tasksByStage, visibleCountByStage]);

  const handleDragCancel = useCallback(() => {
    lastOverStageRef.current = null;
    setActiveTaskId(null);
    setDragStagePreview(null);
  }, []);

  return (
    <DndContext
      collisionDetection={taskStageCollisionDetection}
      measuring={taskStageMeasuring}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={`task-stage-board${activeTask ? " task-stage-board-dragging" : ""}`}>
        {taskStages.map((stage) => {
          const visibleCount = visibleCountByStage[stage];
          const stageTasks = visibleTasksByStage[stage];
          const visibleTasks = stageTasks.slice(0, visibleCount + (dragStagePreview?.stage === stage ? 1 : 0));
          const hiddenCount = Math.max(0, stageTasks.length - visibleTasks.length);

          return (
            <TaskStageColumn
              key={stage}
              draggingTask={Boolean(activeTask)}
              hiddenCount={hiddenCount}
              itemIds={visibleTasks.map((task) => task.id)}
              onShowMore={() => handleShowMore(stage)}
              stage={stage}
              tasks={stageTasks}
            >
              {visibleTasks.map((task) => (
                <SortableTaskCard key={task.id} task={task} onEdit={onEdit} />
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
