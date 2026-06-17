"use client";

import "./index.less";
import { Button, Card, Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { CheckCircleOutlined, EditOutlined, PlusOutlined, UnorderedListOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import type { FeishuUser, Task, TaskStage } from "@/types/dashboard";
import type { OwnerSelectableMember, RequirementVersionOption } from "@/components/project-management-platform/types";
import { OwnerInline } from "@/components/project-management-platform/shared/owner-inline";
import { PageTitle } from "@/components/project-management-platform/shared/page-shell";
import { priorityColor, taskStages } from "@/components/project-management-platform/constants";
import { TaskOwnerBoard } from "@/components/project-management-platform/views/task-owner-board";
import { TaskStageBoard } from "@/components/project-management-platform/views/task-stage-board";

const { Text } = Typography;
const allTaskVersionValue = "全部";
const unplannedTaskVersionValue = "__unplanned__";

function normalizeIdentity(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isMyTask(task: Task, currentUser?: FeishuUser) {
  if (!currentUser) {
    return false;
  }

  const strictMatches = [
    [task.ownerOpenId, currentUser.openId],
    [task.ownerUnionId, currentUser.unionId],
    [task.ownerUserId, currentUser.userId],
    [task.ownerEmail, currentUser.email]
  ];

  if (strictMatches.some(([left, right]) => normalizeIdentity(left) && normalizeIdentity(left) === normalizeIdentity(right))) {
    return true;
  }

  const owner = normalizeIdentity(task.owner);

  return [currentUser.name, currentUser.enName, currentUser.email].some((value) => owner && owner === normalizeIdentity(value));
}

function getTaskEmptyText(onlyMine: boolean, versionFilter: string) {
  if (versionFilter !== allTaskVersionValue) {
    return onlyMine ? "当前版本暂无分配给你的任务" : "当前版本暂无任务，上传文档后会自动生成";
  }

  return onlyMine ? "暂无分配给你的任务" : "暂无任务";
}

function getTaskVersionScopeIds(versionOptions: RequirementVersionOption[], selectedVersionId: string) {
  const scopeIds = new Set<string>([selectedVersionId]);
  let hasNewChild = true;

  while (hasNewChild) {
    hasNewChild = false;
    versionOptions.forEach((version) => {
      if (version.parentVersionId && scopeIds.has(version.parentVersionId) && !scopeIds.has(version.value)) {
        scopeIds.add(version.value);
        hasNewChild = true;
      }
    });
  }

  return scopeIds;
}

export function TasksView({
  tasks,
  currentUser,
  ownerOptions,
  versionOptions,
  onCreate,
  onEdit,
  onOwnerChange,
  onStageChange
}: {
  tasks: Task[];
  currentUser?: FeishuUser;
  ownerOptions: OwnerSelectableMember[];
  versionOptions: RequirementVersionOption[];
  onCreate: () => void;
  onEdit: (task: Task) => void;
  onOwnerChange: (task: Task, owner: OwnerSelectableMember | null) => Promise<boolean>;
  onStageChange: (task: Task, stage: TaskStage) => Promise<boolean>;
}) {
  const [viewMode, setViewMode] = useState<"stage" | "table" | "owner">("stage");
  const [onlyMine, setOnlyMine] = useState(false);
  const [taskVersionFilter, setTaskVersionFilter] = useState(allTaskVersionValue);
  const scopedTasks = useMemo(
    () => (onlyMine ? tasks.filter((task) => isMyTask(task, currentUser)) : tasks),
    [currentUser, onlyMine, tasks]
  );
  const taskVersionOptions = useMemo(() => {
    const hasUnplannedTask = scopedTasks.some((task) => !task.versionId);

    // 版本筛选是任务看板的全局入口，所有展示模式共享同一批过滤后的任务。
    return [
      { value: allTaskVersionValue, label: "全部版本" },
      ...versionOptions.map((version) => ({ value: version.value, label: version.label })),
      ...(hasUnplannedTask ? [{ value: unplannedTaskVersionValue, label: "未规划" }] : [])
    ];
  }, [scopedTasks, versionOptions]);
  const versionFilteredTasks = useMemo(() => {
    if (taskVersionFilter === allTaskVersionValue) {
      return scopedTasks;
    }

    if (taskVersionFilter === unplannedTaskVersionValue) {
      return scopedTasks.filter((task) => !task.versionId);
    }

    const versionScopeIds = getTaskVersionScopeIds(versionOptions, taskVersionFilter);

    return scopedTasks.filter((task) => task.versionId && versionScopeIds.has(task.versionId));
  }, [scopedTasks, taskVersionFilter, versionOptions]);
  const visibleTasks = versionFilteredTasks;
  const taskColumns: ColumnsType<Task> = [
    {
      title: "任务",
      dataIndex: "title",
      key: "title",
      fixed: "left",
      width: 300,
      render: (_, task) => (
        <Space className="task-title-cell" orientation="vertical" size={4}>
          <Text strong>{task.title}</Text>
          <Text type="secondary">{task.aiHint}</Text>
        </Space>
      )
    },
    { title: "项目", dataIndex: "project", key: "project", width: 180 },
    {
      title: "版本",
      dataIndex: "versionName",
      key: "versionName",
      width: 180,
      render: (_, task) => task.versionName ? <Tag color="blue">{task.versionName}</Tag> : <Tag>未规划</Tag>
    },
    {
      title: "负责人",
      dataIndex: "owner",
      key: "owner",
      width: 140,
      render: (_, task) => <OwnerInline name={task.owner} avatarUrl={task.ownerAvatarUrl} />
    },
    {
      title: "阶段",
      dataIndex: "stage",
      key: "stage",
      width: 120,
      filters: taskStages.map((stage) => ({ text: stage, value: stage })),
      onFilter: (value, task) => task.stage === value,
      render: (stage: TaskStage) => <Tag color={stage === "已完成" ? "green" : stage === "评审中" ? "blue" : "default"}>{stage}</Tag>
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 100,
      filters: ["高", "中", "低"].map((priority) => ({ text: priority, value: priority })),
      onFilter: (value, task) => task.priority === value,
      render: (priority: Task["priority"]) => <Tag color={priorityColor[priority]}>{priority}</Tag>
    },
    {
      title: "开始日期",
      dataIndex: "startDate",
      key: "startDate",
      width: 130,
      sorter: (left, right) => dayjs(left.startDate).valueOf() - dayjs(right.startDate).valueOf(),
      render: (startDate: string) => <Text type="secondary">{startDate}</Text>
    },
    {
      title: "截止日期",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 130,
      sorter: (left, right) => dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf(),
      render: (dueDate: string, task) => (
        <Text type={task.stage !== "已完成" && dayjs(dueDate).isBefore(dayjs().startOf("day")) ? "danger" : "secondary"}>
          {dueDate}
        </Text>
      )
    },
    {
      title: "飞书关联",
      dataIndex: "ownerOpenId",
      key: "ownerOpenId",
      width: 120,
      render: (ownerOpenId?: string) => <Tag color={ownerOpenId ? "green" : "default"}>{ownerOpenId ? "已关联" : "未关联"}</Tag>
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 90,
      render: (_, task) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(task)}>
          编辑
        </Button>
      )
    }
  ];

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<CheckCircleOutlined />}
        title="任务看板"
        subtitle="围绕需求版本拆解和推进交付任务，文档拆解后的执行项会进入对应版本。"
        extra={
          <Space wrap>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as "stage" | "table" | "owner")}
              options={[
                { label: "按阶段", value: "stage", icon: <CheckCircleOutlined /> },
                { label: "全部任务", value: "table", icon: <UnorderedListOutlined /> },
                { label: "按负责人", value: "owner", icon: <UserOutlined /> }
              ]}
            />
            <Space className="task-version-filter">
              <Text type="secondary">版本</Text>
              <Select
                className="task-version-select"
                value={taskVersionFilter}
                onChange={setTaskVersionFilter}
                options={taskVersionOptions}
                aria-label="任务看板版本筛选"
              />
            </Space>
            <Tooltip title={currentUser ? `当前登录：${currentUser.name}` : "未获取到登录用户"}>
              <Space className="task-mine-filter">
                <Text type="secondary">只看我的</Text>
                <Switch checked={onlyMine} disabled={!currentUser} onChange={setOnlyMine} />
              </Space>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
              新建任务
            </Button>
          </Space>
        }
      />

      {viewMode === "stage" ? (
        <TaskStageBoard onlyMine={onlyMine} tasks={visibleTasks} onEdit={onEdit} onStageChange={onStageChange} />
      ) : viewMode === "table" ? (
        <Card className="pm-table-card">
          {/* 表格模式沿用通用表格容器，保证任务、Bug、成员等长列表的视觉层级一致。 */}
          <Table
            rowKey="id"
            columns={taskColumns}
            dataSource={visibleTasks}
            locale={{ emptyText: getTaskEmptyText(onlyMine, taskVersionFilter) }}
            pagination={{ pageSize: 12, showSizeChanger: true }}
            scroll={{ x: 1500 }}
            size="middle"
          />
        </Card>
      ) : (
        <TaskOwnerBoard
          emptyText={getTaskEmptyText(onlyMine, taskVersionFilter)}
          ownerOptions={ownerOptions}
          tasks={visibleTasks}
          onEdit={onEdit}
          onOwnerChange={onOwnerChange}
        />
      )}
    </Space>
  );
}
