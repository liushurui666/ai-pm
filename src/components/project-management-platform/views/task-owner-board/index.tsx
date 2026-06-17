"use client";

import "./index.less";
import { Alert, Badge, Button, Card, Flex, Space, Tag, Tooltip, Typography } from "antd";
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
import { memo, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Task } from "@/types/dashboard";
import type { OwnerSelectableMember } from "@/components/project-management-platform/types";
import { priorityColor } from "@/components/project-management-platform/constants";
import { OwnerAvatar } from "@/components/project-management-platform/shared/owner-inline";
import { sortTasksForDelivery } from "@/components/project-management-platform/views/version-task-board";

const { Text } = Typography;
const unassignedOwnerKey = "__unassigned__";
const ownerDropPrefix = "owner:";
const dragActivationDistance = 1;

type TaskOwnerGroup = {
  avatarUrl?: string;
  key: string;
  member?: OwnerSelectableMember;
  owner: string;
  tasks: Task[];
};

function getOwnerDropId(ownerKey: string) {
  return `${ownerDropPrefix}${ownerKey}`;
}

function getOwnerKeyFromDropId(id: string) {
  return id.startsWith(ownerDropPrefix) ? id.slice(ownerDropPrefix.length) : "";
}

function normalizeOwnerName(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function getTaskOwnerGroupKey(task: Task, memberKeyByName: Map<string, string>) {
  if (task.ownerMemberId) {
    return task.ownerMemberId;
  }

  const ownerName = task.owner?.trim();

  if (!ownerName) {
    return unassignedOwnerKey;
  }

  // 历史任务可能只保存负责人姓名没有 memberId，优先落到同名平台成员列里，避免同一个人被拆成两列。
  return memberKeyByName.get(normalizeOwnerName(ownerName)) ?? `legacy:${ownerName}`;
}

function isSameOwner(task: Task, group: TaskOwnerGroup) {
  if (!group.member) {
    return getTaskOwnerGroupKey(task, new Map()) === group.key || (!task.ownerMemberId && !task.owner?.trim() && group.key === unassignedOwnerKey);
  }

  if (task.ownerMemberId) {
    return task.ownerMemberId === group.member.id;
  }

  return normalizeOwnerName(task.owner) === normalizeOwnerName(group.member.name);
}

function createOwnerGroups(tasks: Task[], ownerOptions: OwnerSelectableMember[]) {
  const memberKeyByName = new Map(ownerOptions.map((member) => [normalizeOwnerName(member.name), member.id]));
  const groups = new Map<string, TaskOwnerGroup>();

  // 负责人看板要允许拖到“当前无任务的人”，因此先把所有平台成员列建出来，再把任务分发进去。
  for (const member of ownerOptions) {
    groups.set(member.id, {
      avatarUrl: member.avatarUrl,
      key: member.id,
      member,
      owner: member.name,
      tasks: []
    });
  }

  for (const task of tasks) {
    const groupKey = getTaskOwnerGroupKey(task, memberKeyByName);
    const fallbackOwner = task.owner?.trim() || "未分配";
    const currentGroup = groups.get(groupKey) ?? {
      avatarUrl: task.ownerAvatarUrl,
      key: groupKey,
      owner: fallbackOwner,
      tasks: []
    };

    groups.set(groupKey, {
      ...currentGroup,
      avatarUrl: currentGroup.avatarUrl || task.ownerAvatarUrl,
      tasks: [...currentGroup.tasks, task]
    });
  }

  if (!groups.has(unassignedOwnerKey)) {
    groups.set(unassignedOwnerKey, {
      key: unassignedOwnerKey,
      owner: "未分配",
      tasks: []
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      tasks: [...group.tasks].sort(sortTasksForDelivery)
    }))
    .filter((group) => group.tasks.length || group.member || group.key === unassignedOwnerKey)
    .sort((left, right) => {
      if (left.key === unassignedOwnerKey) {
        return 1;
      }

      if (right.key === unassignedOwnerKey) {
        return -1;
      }

      return right.tasks.length - left.tasks.length || left.owner.localeCompare(right.owner, "zh-CN");
    });
}

function TaskOwnerColumn({
  dragging,
  group,
  children
}: {
  dragging: boolean;
  group: TaskOwnerGroup;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: getOwnerDropId(group.key) });
  const emptyText = dragging ? (isOver ? `松手转给${group.owner}` : "可拖入此负责人") : "暂无任务";

  return (
    <div ref={setNodeRef} className="task-owner-column-shell">
      <Card
        className={`owner-kanban-column task-owner-column${isOver ? " task-owner-column-over" : ""}`}
        title={
          <Flex justify="space-between" align="center" gap={8}>
            <Space size={8}>
              <OwnerAvatar name={group.owner} avatarUrl={group.avatarUrl} />
              <Text strong>{group.owner}</Text>
            </Space>
            <Badge count={group.tasks.length} color="var(--brand)" />
          </Flex>
        }
      >
        <Space orientation="vertical" size={12} className="pm-wide task-owner-list">
          {children}
          {!group.tasks.length ? (
            <div className={`task-owner-empty${dragging ? " task-owner-empty-active" : ""}`}>
              <Text type="secondary">{emptyText}</Text>
            </div>
          ) : null}
        </Space>
      </Card>
    </div>
  );
}

function TaskOwnerCard({
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
  return (
    <div className={`task-card task-owner-card${dragging ? " task-owner-card-dragging" : ""}`}>
      <Flex justify="space-between" align="start" gap={12}>
        <Space size={8} align="start" className="task-owner-card-title">
          <span
            ref={setDragHandleRef}
            className="task-owner-card-handle"
            {...dragAttributes}
            {...dragListeners}
          >
            <HolderOutlined />
          </span>
          <Text strong>{task.title}</Text>
        </Space>
        <Space size={4}>
          <Tag color={priorityColor[task.priority]}>{task.priority}</Tag>
          <Tooltip title="编辑任务">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(task)} />
          </Tooltip>
        </Space>
      </Flex>
      <Space wrap size={[6, 6]} className="task-meta-tags">
        <Tag>{task.stage}</Tag>
        <Tag color="blue">{task.project}</Tag>
        {task.versionName ? <Tag color="cyan">{task.versionName}</Tag> : null}
        <Tag>开始 {task.startDate}</Tag>
        <Tag icon={<CalendarOutlined />}>{task.dueDate}</Tag>
      </Space>
      <Alert
        className="task-ai-hint"
        type={task.priority === "高" ? "warning" : "info"}
        showIcon
        message={task.aiHint}
      />
    </div>
  );
}

// 负责人看板只提供“转交给某个人”的拖拽，不做列内排序，避免拖动时对卡片列表做额外测量。
const DraggableOwnerTaskCard = memo(function DraggableOwnerTaskCard({
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
      type: "task-owner"
    },
    id: task.id
  });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "task-owner-draggable task-owner-draggable-active" : "task-owner-draggable"}
    >
      <TaskOwnerCard
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

export function TaskOwnerBoard({
  emptyText,
  onEdit,
  onOwnerChange,
  ownerOptions,
  tasks
}: {
  emptyText: string;
  onEdit: (task: Task) => void;
  onOwnerChange: (task: Task, owner: OwnerSelectableMember | null) => Promise<boolean>;
  ownerOptions: OwnerSelectableMember[];
  tasks: Task[];
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const lastOverOwnerKeyRef = useRef("");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: dragActivationDistance
      }
    })
  );
  const ownerGroups = useMemo(() => createOwnerGroups(tasks, ownerOptions), [ownerOptions, tasks]);
  const groupByKey = useMemo(() => new Map(ownerGroups.map((group) => [group.key, group])), [ownerGroups]);

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((item) => item.id === event.active.id) ?? null;

    lastOverOwnerKeyRef.current = "";
    setActiveTask(task);
  }

  function handleDragOver(event: DragOverEvent) {
    const ownerKey = event.over?.id ? getOwnerKeyFromDropId(String(event.over.id)) : "";

    // 负责人列拖拽同样记录最后命中的列，避免松手瞬间 over 为空导致“提示可放入但没有保存”。
    if (ownerKey) {
      lastOverOwnerKeyRef.current = ownerKey;
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const task = activeTask;
    const ownerKey = (event.over?.id ? getOwnerKeyFromDropId(String(event.over.id)) : "") || lastOverOwnerKeyRef.current;
    const targetGroup = groupByKey.get(ownerKey);

    setActiveTask(null);
    lastOverOwnerKeyRef.current = "";

    if (!task || !targetGroup || isSameOwner(task, targetGroup)) {
      return;
    }

    await onOwnerChange(task, targetGroup.member ?? null);
  }

  if (!tasks.length) {
    return (
      <Card className="pm-wide task-board-empty-card">
        {/* 负责人看板空状态只承担反馈，不参与数据层级，视觉上要比真实任务列更轻。 */}
        <Alert type="info" showIcon message={emptyText} />
      </Card>
    );
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        lastOverOwnerKeyRef.current = "";
        setActiveTask(null);
      }}
    >
      <div className="owner-kanban-grid task-owner-board">
        {ownerGroups.map((group) => (
          <TaskOwnerColumn key={group.key} group={group} dragging={Boolean(activeTask)}>
            {group.tasks.map((task) => (
              <DraggableOwnerTaskCard key={task.id} task={task} onEdit={onEdit} />
            ))}
          </TaskOwnerColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="task-owner-drag-overlay">
            <TaskOwnerCard task={activeTask} onEdit={onEdit} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
