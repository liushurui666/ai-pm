"use client";

import "./project-management-platform.css";
import {
  Alert,
  App,
  Avatar,
  Badge,
  Button,
  Col,
  ConfigProvider,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  Layout,
  Menu,
  Popconfirm,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Upload,
  message
} from "antd";
import type { BadgeProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import {
  AlertOutlined,
  BarChartOutlined,
  BugOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DashboardOutlined,
  EditOutlined,
  FlagOutlined,
  FileTextOutlined,
  InboxOutlined,
  LinkOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ProjectOutlined,
  RobotOutlined,
  SearchOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type {
  BugReport,
  DashboardData,
  DocumentItem,
  FeishuPerson,
  FeishuUser,
  Project,
  ProjectMilestone,
  Requirement,
  RequirementVersion,
  Risk,
  Task,
  TaskStage
} from "@/types/dashboard";
import type { CreateRecordResult, DashboardEntityType, DeleteRecordResult, DocumentAnalyzeResult } from "@/types/records";
import { getAntdThemeConfig, ThemeToggleButton, useThemePreference } from "@/components/theme-mode";
import { RequirementAiLinkAnalyzer } from "@/components/project-management-platform/requirements/requirement-ai-link-analyzer";
import { TableView } from "@/components/project-management-platform/shared/page-shell";
import { BugsView } from "@/components/project-management-platform/views/bugs-view";
import { OverviewView } from "@/components/project-management-platform/views/overview-view";
import { ProjectsView } from "@/components/project-management-platform/views/projects-view";
import { ReportsView } from "@/components/project-management-platform/views/reports-view";
import { RequirementsView } from "@/components/project-management-platform/views/requirements-view";
import { RisksView } from "@/components/project-management-platform/views/risks-view";
import { TasksView } from "@/components/project-management-platform/views/tasks-view";
import {
  getRequirementCompleteness,
  requirementStatusColor,
  requirementStatusOptions
} from "@/lib/requirements/requirement-quality";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

export type AppView = "overview" | "projects" | "tasks" | "bugs" | "requirements" | "risks" | "docs" | "reports";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const taskStages: TaskStage[] = ["待处理", "进行中", "评审中", "已完成"];
const entityLabels: Record<DashboardEntityType, string> = {
  project: "项目",
  task: "任务",
  bug: "Bug",
  risk: "风险",
  requirementVersion: "需求版本",
  requirement: "需求",
  document: "文档"
};
const fallbackRequirementVersionId = "rv-backlog";
const validViews = new Set<AppView>(["overview", "projects", "tasks", "bugs", "requirements", "risks", "docs", "reports"]);

const statusColor: Record<Project["status"], NonNullable<BadgeProps["status"]>> = {
  进行中: "processing",
  有风险: "error",
  已完成: "success",
  暂停: "default"
};

const milestoneColor: Record<ProjectMilestone["status"], string> = {
  未开始: "default",
  进行中: "blue",
  已完成: "green",
  延期: "red"
};

const priorityColor: Record<Task["priority"] | Requirement["priority"], string> = {
  高: "red",
  中: "gold",
  低: "green",
  P0: "red",
  P1: "blue",
  P2: "default"
};

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

type PeopleResponse = {
  people?: FeishuPerson[];
  error?: string;
};

type ScheduleItem = {
  id: string;
  type: "里程碑" | "任务" | "Bug";
  title: string;
  project: string;
  date: string;
  owner: string;
  ownerAvatarUrl?: string;
  ownerEmail?: string;
  ownerOpenId?: string;
  ownerUnionId?: string;
  ownerUserId?: string;
  status: string;
  color: string;
};

type SearchResult = {
  entity: DashboardEntityType;
  id: string;
  title: string;
  description: string;
  meta: string;
  owner?: string;
  ownerAvatarUrl?: string;
  type: string;
  view: AppView;
};

type RequirementVersionOption = {
  value: string;
  label: string;
  versionName: string;
  project: string;
};

async function fetchDashboardFromApi() {
  const response = await fetch("/api/dashboard");
  const nextData = (await response.json()) as DashboardData & { error?: string };

  if (response.status === 401) {
    window.location.assign("/login");

    return null;
  }

  if (!response.ok) {
    throw new Error(nextData.error || "读取项目数据失败");
  }

  return nextData;
}

function normalizeIdentity(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isMyOwnerRecord(
  record: {
    owner?: string;
    ownerEmail?: string;
    ownerOpenId?: string;
    ownerUnionId?: string;
    ownerUserId?: string;
  },
  currentUser?: FeishuUser
) {
  if (!currentUser) {
    return false;
  }

  const strictMatches = [
    [record.ownerOpenId, currentUser.openId],
    [record.ownerUnionId, currentUser.unionId],
    [record.ownerUserId, currentUser.userId],
    [record.ownerEmail, currentUser.email]
  ];

  if (strictMatches.some(([left, right]) => normalizeIdentity(left) && normalizeIdentity(left) === normalizeIdentity(right))) {
    return true;
  }

  const owner = normalizeIdentity(record.owner);

  return [currentUser.name, currentUser.enName, currentUser.email].some((value) => owner && owner === normalizeIdentity(value));
}

export function ProjectManagementPlatform({ initialView = "overview" }: { initialView?: AppView }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [createType, setCreateType] = useState<DashboardEntityType | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingBug, setEditingBug] = useState<BugReport | null>(null);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [editingRequirementVersion, setEditingRequirementVersion] = useState<RequirementVersion | null>(null);
  const [projectEditSubmitting, setProjectEditSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [bugEditSubmitting, setBugEditSubmitting] = useState(false);
  const [requirementEditSubmitting, setRequirementEditSubmitting] = useState(false);
  const [requirementVersionEditSubmitting, setRequirementVersionEditSubmitting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownSubmitting, setBreakdownSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(validViews.has(initialView) ? initialView : "overview");
  const [projectFilter, setProjectFilter] = useState("全部");
  const [selectedRequirementVersionId, setSelectedRequirementVersionId] = useState<string | null>(null);
  const [people, setPeople] = useState<FeishuPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "我会持续观察项目进度、任务阻塞和风险变化。你可以问我：本周风险、生成周报、版本范围。"
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [form] = Form.useForm<{ message: string }>();
  const [createForm] = Form.useForm<Record<string, unknown>>();
  const [projectEditForm] = Form.useForm<Record<string, unknown>>();
  const [editForm] = Form.useForm<Record<string, unknown>>();
  const [bugEditForm] = Form.useForm<Record<string, unknown>>();
  const [requirementEditForm] = Form.useForm<Record<string, unknown>>();
  const [requirementVersionEditForm] = Form.useForm<Record<string, unknown>>();
  const [breakdownForm] = Form.useForm<Record<string, unknown>>();
  const [messageApi, messageContextHolder] = message.useMessage();
  const { mode: themeMode, effectiveTheme, cycleMode } = useThemePreference();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  async function refreshDashboardState() {
    try {
      const nextData = await fetchDashboardFromApi();

      if (nextData) {
        setData(nextData);
        setLoadError("");
      }
    } catch {
      // Keep the optimistic UI if a silent refresh fails; the next page load will re-sync.
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const nextData = await fetchDashboardFromApi();

        if (mounted && nextData) {
          setData(nextData);
          setLoadError("");
        }
      } catch (error) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : "读取项目数据失败");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadPeople() {
      setPeopleLoading(true);

      try {
        const response = await fetch("/api/feishu/users");
        const payload = (await response.json()) as PeopleResponse;

        if (response.status === 401) {
          window.location.assign("/login");

          return;
        }

        if (!response.ok) {
          throw new Error(payload.error || "读取飞书通讯录失败");
        }

        if (mounted) {
          setPeople(payload.people ?? []);
          setPeopleError("");
        }
      } catch (error) {
        if (mounted) {
          setPeopleError(error instanceof Error ? error.message : "读取飞书通讯录失败");
        }
      } finally {
        if (mounted) {
          setPeopleLoading(false);
        }
      }
    }

    loadPeople();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!data) {
      return [];
    }

    if (projectFilter === "全部") {
      return data.projects;
    }

    return data.projects.filter((project) => project.status === projectFilter);
  }, [data, projectFilter]);

  const ownerOptions = useMemo(() => {
    return people;
  }, [people]);

  const projectColumns: ColumnsType<Project> = [
    {
      title: "项目",
      dataIndex: "name",
      key: "name",
      render: (_, project) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{project.name}</Text>
          <Text type="secondary">{project.summary}</Text>
        </Space>
      )
    },
    {
      title: "负责人",
      dataIndex: "owner",
      key: "owner",
      width: 110,
      render: (_, project) => <OwnerInline name={project.owner} avatarUrl={project.ownerAvatarUrl} />
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (status: Project["status"]) => <Badge status={statusColor[status]} text={status} />
    },
    {
      title: "进度",
      dataIndex: "progress",
      key: "progress",
      width: 180,
      render: (progress: number) => <Progress percent={progress} size="small" />
    },
    {
      title: "健康度",
      dataIndex: "health",
      key: "health",
      width: 120,
      render: (health: number) => (
        <Tag color={health >= 85 ? "green" : health >= 70 ? "gold" : "red"}>{health}</Tag>
      )
    },
    {
      title: "里程碑",
      dataIndex: "milestones",
      key: "milestones",
      width: 130,
      render: (milestones: ProjectMilestone[] = []) => {
        const finishedCount = milestones.filter((milestone) => milestone.status === "已完成").length;

        return (
          <Tag icon={<FlagOutlined />} color={finishedCount === milestones.length && milestones.length ? "green" : "blue"}>
            {finishedCount}/{milestones.length}
          </Tag>
        );
      }
    },
    {
      title: "截止",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 130
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 90,
      render: (_, project) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => openEditProjectDrawer(project)}>
          编辑
        </Button>
      )
    }
  ];

  const requirementColumns: ColumnsType<Requirement> = [
    {
      title: "需求",
      dataIndex: "title",
      key: "title",
      width: 260,
      render: (_, requirement) => (
        <Space orientation="vertical" size={2} className="requirement-title-cell">
          <Text strong>{requirement.title}</Text>
          {requirement.aiSummary ? <Text type="secondary">AI：{requirement.aiSummary}</Text> : null}
          <Text type="secondary">{requirement.acceptance}</Text>
        </Space>
      )
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 72,
      render: (priority: Requirement["priority"]) => (
        <Tag color={priorityColor[priority]}>{priority}</Tag>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 92,
      render: (status: Requirement["status"]) => <Tag color={requirementStatusColor[status]}>{status}</Tag>
    },
    {
      title: "版本",
      dataIndex: "versionName",
      key: "versionName",
      width: 150,
      render: (_, requirement) => requirement.versionName ? <Tag color="blue">{requirement.versionName}</Tag> : <Tag>未规划</Tag>
    },
    {
      title: "完整度",
      key: "completeness",
      width: 150,
      render: (_, requirement) => {
        const quality = getRequirementCompleteness(requirement);

        return (
          <Space direction="vertical" size={2} className="requirement-quality-cell">
            <Progress percent={quality.score} size="small" status={quality.score >= 80 ? "success" : "active"} />
            {quality.issues.length ? (
              <Text type="secondary">{quality.issues.slice(0, 2).join("、")}</Text>
            ) : (
              <Text type="success">资料完整</Text>
            )}
          </Space>
        );
      }
    },
    {
      title: "资料链接",
      key: "links",
      width: 132,
      render: (_, requirement) => <RequirementLinkActions requirement={requirement} />
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      render: (_, requirement) => (
        <Space className="requirement-row-actions" size={2} wrap={false}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditRequirementDrawer(requirement)}>
            编辑
          </Button>
          <Popconfirm
            title="删除需求"
            description="删除后不会影响任务和 Bug，但该需求记录会从版本中移除。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteRecord("requirement", requirement.id)}
          >
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const documentColumns: ColumnsType<DocumentItem> = [
    {
      title: "文档",
      dataIndex: "title",
      key: "title",
      render: (_, document) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{document.title}</Text>
          <Text type="secondary">{document.aiSummary}</Text>
        </Space>
      )
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 110,
      render: (type: DocumentItem["type"]) => <Tag>{type}</Tag>
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 170
    }
  ];

  async function handleAskAssistant(values: { message: string }) {
    const message = values.message.trim();

    if (!message) {
      return;
    }

    await submitAssistantQuestion(message);
    form.resetFields();
  }

  async function submitAssistantQuestion(message: string) {
    if (chatLoading) {
      messageApi.warning("AI 助手正在分析上一条问题");

      return;
    }

    setChatMessages((messages) => [...messages, { role: "user", content: message }]);
    setChatLoading(true);
    setAssistantOpen(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
      });
      const payload = (await response.json()) as { reply?: string; error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: payload.reply ?? payload.error ?? "AI 助手暂时没有返回内容。"
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleGenerateWeeklyReport() {
    void submitAssistantQuestion("请基于当前项目、任务、Bug、风险和文档数据，生成一份本周项目汇报，包含总体结论、关键风险、负责人和下周动作。");
  }

  function openCreateDrawer(type: DashboardEntityType, initialValues: Record<string, unknown> = {}) {
    setCreateType(type);
    createForm.resetFields();
    createForm.setFieldsValue({
      ...getCreateInitialValues(type, data?.meta?.user),
      ...initialValues
    });
  }

  function openEditProjectDrawer(project: Project) {
    setEditingProject(project);
    projectEditForm.resetFields();
    projectEditForm.setFieldsValue(getProjectFormValues(project));
  }

  function openEditTaskDrawer(task: Task) {
    setEditingTask(task);
    editForm.resetFields();
    editForm.setFieldsValue(getTaskFormValues(task));
  }

  function openEditBugDrawer(bug: BugReport) {
    setEditingBug(bug);
    bugEditForm.resetFields();
    bugEditForm.setFieldsValue(getBugFormValues(bug));
  }

  function openEditRequirementDrawer(requirement: Requirement) {
    setEditingRequirement(requirement);
    requirementEditForm.resetFields();
    requirementEditForm.setFieldsValue(getRequirementFormValues(requirement));
  }

  function openEditRequirementVersionDrawer(version: RequirementVersion) {
    setEditingRequirementVersion(version);
    requirementVersionEditForm.resetFields();
    requirementVersionEditForm.setFieldsValue(getRequirementVersionFormValues(version));
  }

  function openDocumentBreakdownDrawer(initialValues: Record<string, unknown> = {}) {
    setBreakdownOpen(true);
    breakdownForm.resetFields();
    breakdownForm.setFieldsValue(initialValues);
  }

  async function handleCreateRecord(values: Record<string, unknown>) {
    if (!createType) {
      return;
    }

    const submittedType = createType;
    setCreateSubmitting(true);

    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: createType,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "创建失败" : "创建失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "创建失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecord(current, result) : current));
      void refreshDashboardState();
      messageApi.success(result.message);
      setCreateType(null);
      createForm.resetFields();

      if (submittedType === "project") {
        switchView("projects");
      }

      if (submittedType === "bug") {
        switchView("bugs");
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleUpdateProject(values: Record<string, unknown>) {
    if (!editingProject) {
      return;
    }

    setProjectEditSubmitting(true);

    try {
      const response = await fetch("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "project",
          id: editingProject.id,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新项目失败" : "更新项目失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新项目失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      messageApi.success(result.message);
      setEditingProject(null);
      projectEditForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新项目失败");
    } finally {
      setProjectEditSubmitting(false);
    }
  }

  async function handleUpdateTask(values: Record<string, unknown>) {
    if (!editingTask) {
      return;
    }

    setEditSubmitting(true);

    try {
      const response = await fetch("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "task",
          id: editingTask.id,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新任务失败" : "更新任务失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新任务失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      messageApi.success(result.message);
      setEditingTask(null);
      editForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新任务失败");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleUpdateBug(values: Record<string, unknown>) {
    if (!editingBug) {
      return;
    }

    setBugEditSubmitting(true);

    try {
      const response = await fetch("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "bug",
          id: editingBug.id,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新 Bug 失败" : "更新 Bug 失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新 Bug 失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      messageApi.success(result.message);
      setEditingBug(null);
      bugEditForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新 Bug 失败");
    } finally {
      setBugEditSubmitting(false);
    }
  }

  async function handleUpdateRequirement(values: Record<string, unknown>) {
    if (!editingRequirement) {
      return;
    }

    setRequirementEditSubmitting(true);

    try {
      const response = await fetch("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "requirement",
          id: editingRequirement.id,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新需求失败" : "更新需求失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新需求失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      messageApi.success(result.message);
      setEditingRequirement(null);
      requirementEditForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新需求失败");
    } finally {
      setRequirementEditSubmitting(false);
    }
  }

  async function handleUpdateRequirementVersion(values: Record<string, unknown>) {
    if (!editingRequirementVersion) {
      return;
    }

    setRequirementVersionEditSubmitting(true);

    try {
      const response = await fetch("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "requirementVersion",
          id: editingRequirementVersion.id,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新版本失败" : "更新版本失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新版本失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      messageApi.success(result.message);
      setEditingRequirementVersion(null);
      requirementVersionEditForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新版本失败");
    } finally {
      setRequirementVersionEditSubmitting(false);
    }
  }

  async function handleDeleteRecord(type: DashboardEntityType, id: string) {
    try {
      const response = await fetch("/api/records", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          id
        })
      });
      const payload = (await response.json()) as DeleteRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "删除失败" : "删除失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "删除失败");
      }

      const result = payload as DeleteRecordResult;

      setData((current) => (current ? updateDashboardWithRecordDeletion(current, result) : current));
      void refreshDashboardState();
      messageApi.success(result.message);

      if (type === "requirementVersion" && selectedRequirementVersionId === id) {
        setSelectedRequirementVersionId(null);
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleAnalyzeDocument(values: Record<string, unknown>) {
    const file = getSelectedUploadFile(values.fileList);

    if (!file) {
      messageApi.error("请先上传要拆解的文档");

      return;
    }

    setBreakdownSubmitting(true);

    try {
      const formData = new FormData();

      formData.append("file", file);
      for (const key of [
        "project",
        "versionId",
        "versionName",
        "owner",
        "ownerOpenId",
        "ownerUnionId",
        "ownerUserId",
        "ownerEmail",
        "ownerAvatarUrl"
      ]) {
        const value = values[key];

        if (typeof value === "string") {
          formData.append(key, value);
        }
      }

      const response = await fetch("/api/documents/analyze", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as DocumentAnalyzeResult & { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok || payload.error) {
        throw new Error(payload.error || "文档拆解失败");
      }

      setData((current) => (current ? updateDashboardWithDocumentAnalysis(current, payload) : current));
      void refreshDashboardState();
      setBreakdownOpen(false);
      breakdownForm.resetFields();
      switchView("tasks");
      if (payload.warning) {
        messageApi.warning(payload.warning);
      }

      if (payload.source === "ai") {
        messageApi.success(payload.message);
      } else {
        messageApi.warning(payload.message);
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "文档拆解失败");
    } finally {
      setBreakdownSubmitting(false);
    }
  }

  const menuItems = [
    { key: "overview", icon: <DashboardOutlined />, label: "工作台" },
    { key: "projects", icon: <ProjectOutlined />, label: "项目管理" },
    { key: "tasks", icon: <CheckCircleOutlined />, label: "任务看板" },
    { key: "bugs", icon: <BugOutlined />, label: "Bug 管理" },
    { key: "requirements", icon: <NodeIndexOutlined />, label: "需求管理" },
    { key: "risks", icon: <AlertOutlined />, label: "风险中心" },
    { key: "docs", icon: <FileTextOutlined />, label: "文档知识库" },
    { key: "reports", icon: <BarChartOutlined />, label: "报表驾驶舱" }
  ];
  const userName = data?.meta?.user?.name ?? "苏";
  const userInitial = userName.slice(0, 1);
  const projectOptions = data?.projects.map((project) => project.name) ?? [];
  const requirementVersions = useMemo(() => data?.requirementVersions ?? [], [data?.requirementVersions]);
  const requirementVersionOptions = useMemo(
    () =>
      requirementVersions.map((version) => ({
        value: version.id,
        label: `${version.name} · ${version.project}`,
        versionName: version.name,
        project: version.project
      })),
    [requirementVersions]
  );
  const globalSearchResults = useMemo(() => (data ? createSearchResults(data, searchQuery) : []), [data, searchQuery]);

  function switchView(view: AppView) {
    setActiveView(view);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function openSearchResult(result: SearchResult) {
    if (!data) {
      return;
    }

    switchView(result.view);
    setSearchOpen(false);

    if (result.entity === "project") {
      const project = data.projects.find((item) => item.id === result.id);

      if (project) {
        openEditProjectDrawer(project);
      }

      return;
    }

    if (result.entity === "task") {
      const task = data.tasks.find((item) => item.id === result.id);

      if (task) {
        openEditTaskDrawer(task);
      }

      return;
    }

    if (result.entity === "bug") {
      const bug = data.bugs.find((item) => item.id === result.id);

      if (bug) {
        openEditBugDrawer(bug);
      }

      return;
    }

    if (result.entity === "requirementVersion") {
      setSelectedRequirementVersionId(result.id);
      messageApi.success("已打开需求版本");

      return;
    }

    if (result.entity === "requirement") {
      const requirement = data.requirements.find((item) => item.id === result.id);

      if (requirement?.versionId) {
        setSelectedRequirementVersionId(requirement.versionId);
      }

      messageApi.success("已定位到需求所在版本");

      return;
    }

    messageApi.success(`已打开${result.type}模块`);
  }

  return (
    <ConfigProvider
      theme={getAntdThemeConfig(effectiveTheme)}
    >
      <App>
        {messageContextHolder}
        <Layout className="pm-shell">
          {!isMobile ? (
            <Sider
              width={248}
              collapsed={collapsed}
              breakpoint="lg"
              className="pm-sider"
              trigger={null}
            >
              <Brand collapsed={collapsed} />
              <Menu
                theme="dark"
                mode="inline"
                selectedKeys={[activeView]}
                items={menuItems}
                onClick={(item) => switchView(item.key as AppView)}
              />
            </Sider>
          ) : null}

          <Layout className="pm-main">
            <Header className="pm-header">
              <Space size={12} className="pm-header-left">
                {!isMobile ? (
                  <Tooltip title={collapsed ? "展开导航" : "收起导航"}>
                    <Button
                      type="text"
                      icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                      onClick={() => setCollapsed((current) => !current)}
                    />
                  </Tooltip>
                ) : null}
                <Input
                  className="pm-search"
                  prefix={<SearchOutlined />}
                  placeholder="搜索项目、任务、文档"
                  aria-label="搜索项目、任务、文档"
                  allowClear
                  value={searchQuery}
                  onChange={(event) => {
                    const value = event.target.value;

                    setSearchQuery(value);
                    if (!value.trim()) {
                      setSearchOpen(false);
                    }
                  }}
                  onPressEnter={() => {
                    if (searchQuery.trim()) {
                      setSearchOpen(true);
                    }
                  }}
                />
              </Space>

              <Space size={10} className="pm-header-actions">
                {data?.meta ? (
                  <Tag color={data.meta.source === "local" ? "green" : "default"}>
                    {data.meta.source === "local" ? "站内数据" : "演示数据"}
                  </Tag>
                ) : null}
                <Tooltip title="查看日程">
                  <Button icon={<CalendarOutlined />} onClick={() => setScheduleOpen(true)} />
                </Tooltip>
                <ThemeToggleButton
                  mode={themeMode}
                  effectiveTheme={effectiveTheme}
                  onClick={cycleMode}
                  showLabel={!isMobile}
                />
                <Tooltip title="打开 AI 项目助手">
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={() => setAssistantOpen(true)}
                  >
                    {!isMobile ? "AI 助手" : null}
                  </Button>
                </Tooltip>
                {data?.meta?.user ? (
                  <Tooltip title="退出登录">
                    <Button href="/api/auth/logout" icon={<LogoutOutlined />}>
                      {!isMobile ? "退出" : null}
                    </Button>
                  </Tooltip>
                ) : null}
                <Tooltip title={userName}>
                  <Avatar className="pm-avatar" src={data?.meta?.user?.avatarUrl}>
                    {userInitial}
                  </Avatar>
                </Tooltip>
              </Space>
            </Header>

            {isMobile ? (
              <div className="pm-mobile-nav">
                <Segmented
                  block
                  value={activeView}
                  onChange={(value) => switchView(String(value) as AppView)}
                  options={[
                    { label: "工作台", value: "overview" },
                    { label: "项目", value: "projects" },
                    { label: "任务", value: "tasks" },
                    { label: "Bug", value: "bugs" },
                    { label: "风险", value: "risks" }
                  ]}
                />
              </div>
            ) : null}

            <Content className="pm-content">
              {loading || !data ? (
                <div className="pm-loading">
                  {loadError ? (
                    <Alert type="error" showIcon title={loadError} />
                  ) : (
                    <Spin size="large" />
                  )}
                </div>
              ) : (
                <>
                  {activeView === "overview" ? (
                    <OverviewView
                      data={data}
                      onGenerateReport={handleGenerateWeeklyReport}
                      onOpenAssistant={() => setAssistantOpen(true)}
                      onViewProjects={() => switchView("projects")}
                      onViewRisks={() => switchView("risks")}
                    />
                  ) : null}
                  {activeView === "projects" ? (
                    <ProjectsView
                      columns={projectColumns}
                      projects={filteredProjects}
                      projectFilter={projectFilter}
                      onFilterChange={setProjectFilter}
                      onCreate={() => openCreateDrawer("project")}
                    />
                  ) : null}
                  {activeView === "tasks" ? (
                    <TasksView
                      tasks={data.tasks}
                      currentUser={data.meta?.user}
                      versionOptions={requirementVersionOptions}
                      onCreate={() => openCreateDrawer("task")}
                      onEdit={openEditTaskDrawer}
                    />
                  ) : null}
                  {activeView === "bugs" ? (
                    <BugsView
                      bugs={data.bugs}
                      currentUser={data.meta?.user}
                      projectOptions={projectOptions}
                      versionOptions={requirementVersionOptions}
                      onCreate={() => openCreateDrawer("bug")}
                      onEdit={openEditBugDrawer}
                    />
                  ) : null}
                  {activeView === "requirements" ? (
                    <RequirementsView
                      bugs={data.bugs}
                      columns={requirementColumns}
                      requirements={data.requirements}
                      selectedVersionId={selectedRequirementVersionId}
                      tasks={data.tasks}
                      versions={requirementVersions}
                      onBack={() => setSelectedRequirementVersionId(null)}
                      onCreateRequirement={(version) =>
                        openCreateDrawer("requirement", {
                          versionId: version.id,
                          versionName: version.name,
                          project: version.project === "跨项目" ? undefined : version.project
                        })
                      }
                      onCreateVersion={() => openCreateDrawer("requirementVersion")}
                      onDeleteVersion={(version) => handleDeleteRecord("requirementVersion", version.id)}
                      onEditVersion={openEditRequirementVersionDrawer}
                      onSelectVersion={setSelectedRequirementVersionId}
                    />
                  ) : null}
                  {activeView === "risks" ? (
                    <RisksView risks={data.risks} onCreate={() => openCreateDrawer("risk")} />
                  ) : null}
                  {activeView === "docs" ? (
                    <TableView
                      title="文档知识库"
                      subtitle="上传 PRD、会议纪要或技术方案，自动沉淀摘要并拆解任务。"
                      icon={<FileTextOutlined />}
                      extra={
                        <Space wrap>
                          <Button icon={<UploadOutlined />} onClick={() => openDocumentBreakdownDrawer()}>
                            上传文档拆任务
                          </Button>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => openCreateDrawer("document")}
                          >
                            新建文档
                          </Button>
                        </Space>
                      }
                    >
                      <Table
                        rowKey="id"
                        columns={documentColumns}
                        dataSource={data.documents}
                        pagination={false}
                        scroll={{ x: 720 }}
                      />
                    </TableView>
                  ) : null}
                  {activeView === "reports" ? (
                    <ReportsView data={data} onGenerateReport={handleGenerateWeeklyReport} />
                  ) : null}
                </>
              )}
            </Content>
          </Layout>

          <Drawer
            title={
              <Space>
                <RobotOutlined />
                <span>AI 项目助手</span>
              </Space>
            }
            open={assistantOpen}
            onClose={() => setAssistantOpen(false)}
            size={isMobile ? "large" : "default"}
            extra={<Tag color="blue">实时分析</Tag>}
          >
            <div className="assistant-panel">
              <div className="assistant-messages">
                {chatMessages.map((message, index) => (
                  <div
                    className={`assistant-message assistant-message-${message.role}`}
                    key={`${message.role}-${index}`}
                  >
                    <Text>{message.content}</Text>
                  </div>
                ))}
                {chatLoading ? (
                  <div className="assistant-message assistant-message-assistant">
                    <Spin size="small" /> <Text>正在分析项目数据...</Text>
                  </div>
                ) : null}
              </div>

              <Form form={form} layout="vertical" onFinish={handleAskAssistant}>
                <Form.Item name="message" noStyle>
                  <Input.TextArea
                    rows={3}
                    placeholder="例如：帮我分析当前最大风险"
                    maxLength={200}
                  />
                </Form.Item>
                <Button
                  className="assistant-send"
                  type="primary"
                  htmlType="submit"
                  icon={<SendOutlined />}
                  loading={chatLoading}
                >
                  发送
                </Button>
              </Form>
            </div>
          </Drawer>

          <CreateRecordDrawer
            form={createForm}
            open={Boolean(createType)}
            type={createType}
            submitting={createSubmitting}
            projectOptions={projectOptions}
            requirementVersionOptions={requirementVersionOptions}
            people={ownerOptions}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            onClose={() => setCreateType(null)}
            onSubmit={handleCreateRecord}
          />

          <ProjectEditDrawer
            form={projectEditForm}
            project={editingProject}
            submitting={projectEditSubmitting}
            people={ownerOptions}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            onClose={() => setEditingProject(null)}
            onSubmit={handleUpdateProject}
          />

          <TaskEditDrawer
            form={editForm}
            task={editingTask}
            submitting={editSubmitting}
            projectOptions={projectOptions}
            versionOptions={requirementVersionOptions}
            people={ownerOptions}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            onClose={() => setEditingTask(null)}
            onSubmit={handleUpdateTask}
          />

          <BugEditDrawer
            form={bugEditForm}
            bug={editingBug}
            submitting={bugEditSubmitting}
            projectOptions={projectOptions}
            versionOptions={requirementVersionOptions}
            people={ownerOptions}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            onClose={() => setEditingBug(null)}
            onSubmit={handleUpdateBug}
          />

          <RequirementEditDrawer
            form={requirementEditForm}
            requirement={editingRequirement}
            submitting={requirementEditSubmitting}
            versionOptions={requirementVersionOptions}
            onClose={() => setEditingRequirement(null)}
            onSubmit={handleUpdateRequirement}
          />

          <RequirementVersionEditDrawer
            form={requirementVersionEditForm}
            version={editingRequirementVersion}
            submitting={requirementVersionEditSubmitting}
            projectOptions={projectOptions}
            onClose={() => setEditingRequirementVersion(null)}
            onSubmit={handleUpdateRequirementVersion}
          />

          {data ? (
            <ScheduleDrawer
              data={data}
              currentUser={data.meta?.user}
              open={scheduleOpen}
              onClose={() => setScheduleOpen(false)}
            />
          ) : null}

          {data ? (
            <SearchDrawer
              open={searchOpen}
              query={searchQuery}
              results={globalSearchResults}
              onClose={() => setSearchOpen(false)}
              onOpenResult={openSearchResult}
              onQueryChange={setSearchQuery}
            />
          ) : null}

          <DocumentBreakdownDrawer
            form={breakdownForm}
            open={breakdownOpen}
            submitting={breakdownSubmitting}
            projectOptions={projectOptions}
            versionOptions={requirementVersionOptions}
            people={ownerOptions}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            onClose={() => setBreakdownOpen(false)}
            onSubmit={handleAnalyzeDocument}
          />
        </Layout>
      </App>
    </ConfigProvider>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="pm-brand">
      <div className="pm-brand-mark">
        <ThunderboltOutlined />
      </div>
      {!collapsed ? (
        <div>
          <Text className="pm-brand-title">AI PM</Text>
          <Text className="pm-brand-subtitle">智能项目管理平台</Text>
        </div>
      ) : null}
    </div>
  );
}

function getOwnerInitial(name?: string) {
  return (name?.trim() || "未").slice(0, 1);
}

function OwnerAvatar({
  avatarUrl,
  name,
  size = "small"
}: {
  avatarUrl?: string;
  name?: string;
  size?: "small" | "default";
}) {
  return (
    <Avatar size={size} src={avatarUrl}>
      {getOwnerInitial(name)}
    </Avatar>
  );
}

function OwnerInline({
  avatarUrl,
  name,
  secondary
}: {
  avatarUrl?: string;
  name?: string;
  secondary?: string;
}) {
  return (
    <Space>
      <OwnerAvatar name={name} avatarUrl={avatarUrl} />
      <Space orientation="vertical" size={0}>
        <Text>{name || "未分配"}</Text>
        {secondary ? <Text type="secondary">{secondary}</Text> : null}
      </Space>
    </Space>
  );
}

function OwnerOption({ person }: { person: FeishuPerson }) {
  return (
    <OwnerInline
      name={person.name}
      avatarUrl={person.avatarUrl}
      secondary={person.email || person.enName}
    />
  );
}

function getPersonSearchText(person: FeishuPerson) {
  return [person.name, person.enName, person.email, person.openId].filter(Boolean).join(" ");
}

function getOwnerSelectOptions(people: FeishuPerson[]) {
  return people.map((person) => ({
    value: person.openId,
    displayName: person.name,
    label: <OwnerOption person={person} />,
    searchText: getPersonSearchText(person)
  }));
}

function filterOwnerOption(input: string, option?: { searchText?: string }) {
  return (option?.searchText ?? "").toLowerCase().includes(input.trim().toLowerCase());
}


function RequirementLinkActions({ requirement }: { requirement: Requirement }) {
  const uiHref = getSafeExternalUrl(requirement.uiLink);
  const documentHref = getSafeExternalUrl(requirement.documentLink);
  const links = [
    { key: "ui", label: "UI", href: uiHref },
    { key: "document", label: "需求文档", href: documentHref }
  ].filter((link) => Boolean(link.href));
  const missingItems = [
    !uiHref ? { key: "ui-missing", label: "缺 UI" } : null,
    !documentHref ? { key: "document-missing", label: "缺文档" } : null
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <Space className="requirement-link-actions" size={[8, 4]} wrap>
      {links.map((link) => (
        <Button
          key={link.key}
          type="link"
          size="small"
          icon={<LinkOutlined />}
          href={link.href}
          target="_blank"
          rel="noreferrer"
        >
          {link.label}
        </Button>
      ))}
      {missingItems.map((item) => (
        <Tag key={item.key} color="warning">
          {item.label}
        </Tag>
      ))}
    </Space>
  );
}


function createScheduleItems(data: DashboardData): ScheduleItem[] {
  const milestoneItems = data.projects.flatMap((project) =>
    project.milestones.map((milestone) => ({
      id: `${project.id}-${milestone.id}`,
      type: "里程碑" as const,
      title: milestone.title,
      project: project.name,
      date: milestone.dueDate,
      owner: milestone.owner || project.owner,
      ownerAvatarUrl: milestone.ownerAvatarUrl || project.ownerAvatarUrl,
      ownerEmail: milestone.ownerEmail || project.ownerEmail,
      ownerOpenId: milestone.ownerOpenId || project.ownerOpenId,
      ownerUnionId: milestone.ownerUnionId || project.ownerUnionId,
      ownerUserId: milestone.ownerUserId || project.ownerUserId,
      status: milestone.status,
      color: milestoneColor[milestone.status] === "default" ? "gray" : milestoneColor[milestone.status]
    }))
  );
  const taskItems = data.tasks.map((task) => ({
    id: task.id,
    type: "任务" as const,
    title: task.title,
    project: task.project,
    date: task.dueDate,
    owner: task.owner,
    ownerAvatarUrl: task.ownerAvatarUrl,
    ownerEmail: task.ownerEmail,
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
    date: bug.dueDate,
    owner: bug.owner || bug.reporter,
    ownerAvatarUrl: bug.ownerAvatarUrl,
    ownerEmail: bug.ownerEmail,
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

function getWeekdayLabel(date: string) {
  return weekdayLabels[dayjs(date).day()] ?? "";
}

function ScheduleDrawer({
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

function createSearchResults(data: DashboardData, query: string): SearchResult[] {
  const keyword = query.trim().toLowerCase();

  if (!keyword) {
    return [];
  }

  const matches = (values: Array<string | undefined>) =>
    values.filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));

  const projectResults = data.projects
    .filter((project) => matches([project.name, project.owner, project.summary, project.status]))
    .map((project) => ({
      entity: "project" as const,
      id: project.id,
      title: project.name,
      description: project.summary,
      meta: `项目 · ${project.status} · 健康度 ${project.health}`,
      owner: project.owner,
      ownerAvatarUrl: project.ownerAvatarUrl,
      type: "项目",
      view: "projects" as const
    }));
  const taskResults = data.tasks
    .filter((task) => matches([task.title, task.owner, task.project, task.versionName, task.stage, task.aiHint]))
    .map((task) => ({
      entity: "task" as const,
      id: task.id,
      title: task.title,
      description: task.aiHint,
      meta: `任务 · ${task.versionName ?? "未规划"} · ${task.stage} · ${task.dueDate}`,
      owner: task.owner,
      ownerAvatarUrl: task.ownerAvatarUrl,
      type: "任务",
      view: "tasks" as const
    }));
  const bugResults = data.bugs
    .filter((bug) => matches([bug.title, bug.owner, bug.reporter, bug.project, bug.versionName, bug.reproduction, bug.actual]))
    .map((bug) => ({
      entity: "bug" as const,
      id: bug.id,
      title: bug.title,
      description: bug.reproduction,
      meta: `Bug · ${bug.versionName ?? "未规划"} · ${bug.status} · ${bug.severity}`,
      owner: bug.owner,
      ownerAvatarUrl: bug.ownerAvatarUrl,
      type: "Bug",
      view: "bugs" as const
    }));
  const documentResults = data.documents
    .filter((document) => matches([document.title, document.type, document.aiSummary]))
    .map((document) => ({
      entity: "document" as const,
      id: document.id,
      title: document.title,
      description: document.aiSummary,
      meta: `文档 · ${document.type} · ${document.updatedAt}`,
      type: "文档",
      view: "docs" as const
    }));
  const riskResults = data.risks
    .filter((risk) => matches([risk.title, risk.owner, risk.project, risk.mitigation, risk.level]))
    .map((risk) => ({
      entity: "risk" as const,
      id: risk.id,
      title: risk.title,
      description: risk.mitigation,
      meta: `风险 · ${risk.level} · ${risk.project}`,
      owner: risk.owner,
      ownerAvatarUrl: risk.ownerAvatarUrl,
      type: "风险",
      view: "risks" as const
    }));
  const versionResults = data.requirementVersions
    .filter((version) => matches([version.name, version.project, version.status, version.goal]))
    .map((version) => ({
      entity: "requirementVersion" as const,
      id: version.id,
      title: version.name,
      description: version.goal,
      meta: `需求版本 · ${version.status} · ${version.releaseDate}`,
      type: "需求版本",
      view: "requirements" as const
    }));
  const requirementResults = data.requirements
    .filter((requirement) =>
      matches([
        requirement.title,
        requirement.project,
        requirement.versionName,
        requirement.acceptance,
        requirement.status,
        requirement.uiLink,
        requirement.documentLink
      ])
    )
    .map((requirement) => ({
      entity: "requirement" as const,
      id: requirement.id,
      title: requirement.title,
      description: requirement.acceptance,
      meta: `需求 · ${requirement.versionName ?? "未规划"} · ${requirement.status}`,
      type: "需求",
      view: "requirements" as const
    }));

  return [
    ...projectResults,
    ...taskResults,
    ...bugResults,
    ...documentResults,
    ...riskResults,
    ...versionResults,
    ...requirementResults
  ].slice(0, 30);
}

function SearchDrawer({
  onClose,
  onOpenResult,
  onQueryChange,
  open,
  query,
  results
}: {
  onClose: () => void;
  onOpenResult: (result: SearchResult) => void;
  onQueryChange: (query: string) => void;
  open: boolean;
  query: string;
  results: SearchResult[];
}) {
  return (
    <Drawer
      title={
        <Space>
          <SearchOutlined />
          <span>全局搜索</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size="default"
    >
      <Space orientation="vertical" size={16} className="pm-wide">
        <Input.Search
          allowClear
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索项目、任务、Bug、文档、风险"
        />
        {results.length ? (
          <div className="search-results-list">
            {results.map((result) => (
              <div className="search-result-item" key={`${result.entity}-${result.id}`}>
                <div className="search-result-main">
                  {result.owner ? <OwnerAvatar name={result.owner} avatarUrl={result.ownerAvatarUrl} /> : null}
                  <Space orientation="vertical" size={4} className="search-result-content">
                    <Space wrap>
                      <Tag>{result.type}</Tag>
                      <Text strong>{result.title}</Text>
                    </Space>
                    <Text type="secondary">{result.meta}</Text>
                    <Text type="secondary" ellipsis className="search-result-description">
                      {result.description}
                    </Text>
                  </Space>
                </div>
                <Button type="link" className="search-result-action" onClick={() => onOpenResult(result)}>
                  打开详情
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim() ? "没有匹配结果" : "输入关键词开始搜索"} />
        )}
      </Space>
    </Drawer>
  );
}


function getCreateInitialValues(type: DashboardEntityType, currentUser?: FeishuUser) {
  if (type === "project") {
    return {
      status: "进行中",
      progress: 0,
      health: 80,
      dueDate: dayjs().add(14, "day"),
      team: 1,
      riskCount: 0,
      milestones: [
        {
          title: "项目启动",
          status: "进行中",
          dueDate: dayjs(),
          owner: "",
          note: "确认项目目标、范围和负责人。"
        },
        {
          title: "阶段验收",
          status: "未开始",
          dueDate: dayjs().add(14, "day"),
          owner: "",
          note: "检查交付物、风险和上线准备。"
        }
      ]
    };
  }

  if (type === "task") {
    return {
      stage: "待处理",
      priority: "中",
      startDate: dayjs(),
      dueDate: dayjs().add(7, "day")
    };
  }

  if (type === "bug") {
    return {
      status: "新建",
      severity: "一般",
      reporter: currentUser?.name ?? "",
      dueDate: dayjs().add(3, "day")
    };
  }

  if (type === "risk") {
    return {
      level: "中"
    };
  }

  if (type === "requirement") {
    return {
      priority: "P1",
      status: "待评审"
    };
  }

  if (type === "requirementVersion") {
    return {
      status: "规划中",
      startDate: dayjs(),
      releaseDate: dayjs().add(30, "day")
    };
  }

  return {
    type: "PRD",
    updatedAt: dayjs()
  };
}

function getProjectFormValues(project: Project) {
  return {
    ...project,
    dueDate: dayjs(project.dueDate),
    milestones: project.milestones.map((milestone) => ({
      ...milestone,
      dueDate: dayjs(milestone.dueDate)
    }))
  };
}

function getTaskFormValues(task: Task) {
  return {
    ...task,
    startDate: dayjs(task.startDate),
    dueDate: dayjs(task.dueDate)
  };
}

function getBugFormValues(bug: BugReport) {
  return {
    ...bug,
    dueDate: dayjs(bug.dueDate)
  };
}

function getRequirementVersionFormValues(version: RequirementVersion) {
  return {
    ...version,
    startDate: dayjs(version.startDate),
    releaseDate: dayjs(version.releaseDate)
  };
}

function getRequirementFormValues(requirement: Requirement) {
  return {
    ...requirement,
    aiRisks: JSON.stringify(requirement.aiRisks ?? []),
    aiMissingItems: JSON.stringify(requirement.aiMissingItems ?? []),
    aiFrontendNotes: JSON.stringify(requirement.aiFrontendNotes ?? []),
    aiBackendNotes: JSON.stringify(requirement.aiBackendNotes ?? []),
    aiTestingNotes: JSON.stringify(requirement.aiTestingNotes ?? [])
  };
}

function getSafeExternalUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function validateExternalUrl(_: unknown, value?: string) {
  if (!value?.trim() || getSafeExternalUrl(value)) {
    return Promise.resolve();
  }

  return Promise.reject(new Error("请输入 http 或 https 开头的完整链接"));
}

function serializeCreateValue(value: unknown, key = ""): unknown {
  if (dayjs.isDayjs(value)) {
    return value.format(key === "updatedAt" ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD");
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeCreateValue(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        serializeCreateValue(childValue, childKey)
      ])
    );
  }

  return value;
}

function serializeCreateValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, serializeCreateValue(value, key)])
  );
}

function recalculateMetrics(data: DashboardData) {
  const activeProjects = data.projects.filter((project) => project.status !== "已完成").length;
  const deliveryRate = data.projects.length
    ? Math.round(data.projects.reduce((sum, project) => sum + project.progress, 0) / data.projects.length)
    : 0;
  const overdueTasks = data.tasks.filter(
    (task) => task.stage !== "已完成" && dayjs(task.dueDate).isBefore(dayjs().startOf("day"))
  ).length;

  return {
    activeProjects,
    deliveryRate,
    overdueTasks,
    aiSavedHours: Math.max(0, data.requirements.length * 3 + data.documents.length * 2 + data.tasks.length + data.bugs.length)
  };
}

function updateDashboardWithRecord(data: DashboardData, result: CreateRecordResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    projects: [...data.projects],
    tasks: [...data.tasks],
    bugs: [...data.bugs],
    risks: [...data.risks],
    requirementVersions: [...data.requirementVersions],
    requirements: [...data.requirements],
    documents: [...data.documents],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  if (result.type === "project") {
    nextData.projects = [result.record as Project, ...nextData.projects];
  }

  if (result.type === "task") {
    nextData.tasks = [result.record as Task, ...nextData.tasks];
  }

  if (result.type === "bug") {
    nextData.bugs = [result.record as BugReport, ...nextData.bugs];
  }

  if (result.type === "risk") {
    nextData.risks = [result.record as Risk, ...nextData.risks];
  }

  if (result.type === "requirementVersion") {
    nextData.requirementVersions = [result.record as RequirementVersion, ...nextData.requirementVersions];
  }

  if (result.type === "requirement") {
    nextData.requirements = [result.record as Requirement, ...nextData.requirements];
  }

  if (result.type === "document") {
    nextData.documents = [result.record as DocumentItem, ...nextData.documents];
  }

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

function updateDashboardWithRecordUpdate(data: DashboardData, result: CreateRecordResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    projects: [...data.projects],
    tasks: [...data.tasks],
    bugs: [...data.bugs],
    risks: [...data.risks],
    requirementVersions: [...data.requirementVersions],
    requirements: [...data.requirements],
    documents: [...data.documents],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  if (result.type === "task") {
    const task = result.record as Task;
    nextData.tasks = nextData.tasks.map((item) => item.id === task.id ? task : item);
  }

  if (result.type === "project") {
    const project = result.record as Project;
    nextData.projects = nextData.projects.map((item) => item.id === project.id ? project : item);
  }

  if (result.type === "bug") {
    const bug = result.record as BugReport;
    nextData.bugs = nextData.bugs.map((item) => item.id === bug.id ? bug : item);
  }

  if (result.type === "requirementVersion") {
    const version = result.record as RequirementVersion;
    nextData.requirementVersions = nextData.requirementVersions.map((item) => item.id === version.id ? version : item);
    nextData.requirements = nextData.requirements.map((requirement) =>
      requirement.versionId === version.id
        ? {
            ...requirement,
            versionName: version.name,
            project: version.project
          }
        : requirement
    );
    nextData.tasks = nextData.tasks.map((task) =>
      task.versionId === version.id
        ? {
            ...task,
            versionName: version.name,
            project: version.project === "跨项目" ? task.project : version.project
          }
        : task
    );
    nextData.bugs = nextData.bugs.map((bug) =>
      bug.versionId === version.id
        ? {
            ...bug,
            versionName: version.name,
            project: version.project === "跨项目" ? bug.project : version.project
          }
        : bug
    );
  }

  if (result.type === "requirement") {
    const requirement = result.record as Requirement;
    nextData.requirements = nextData.requirements.map((item) => item.id === requirement.id ? requirement : item);
  }

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

function updateDashboardWithRecordDeletion(data: DashboardData, result: DeleteRecordResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    projects: [...data.projects],
    tasks: [...data.tasks],
    bugs: [...data.bugs],
    risks: [...data.risks],
    requirementVersions: [...data.requirementVersions],
    requirements: [...data.requirements],
    documents: [...data.documents],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  if (result.type === "requirement") {
    nextData.requirements = nextData.requirements.filter((requirement) => requirement.id !== result.id);
  }

  if (result.type === "requirementVersion") {
    const fallbackVersion =
      result.fallbackVersion ??
      nextData.requirementVersions.find((version) => version.id === fallbackRequirementVersionId) ??
      nextData.requirementVersions.find((version) => version.id !== result.id);

    nextData.requirementVersions = nextData.requirementVersions.filter((version) => version.id !== result.id);

    if (fallbackVersion) {
      nextData.requirements = nextData.requirements.map((requirement) =>
        requirement.versionId === result.id
          ? {
              ...requirement,
              versionId: fallbackVersion.id,
              versionName: fallbackVersion.name,
              project: fallbackVersion.project === "跨项目" ? requirement.project : fallbackVersion.project
            }
          : requirement
      );
      nextData.tasks = nextData.tasks.map((task) =>
        task.versionId === result.id
          ? {
              ...task,
              versionId: fallbackVersion.id,
              versionName: fallbackVersion.name,
              project: fallbackVersion.project === "跨项目" ? task.project : fallbackVersion.project
            }
          : task
      );
      nextData.bugs = nextData.bugs.map((bug) =>
        bug.versionId === result.id
          ? {
              ...bug,
              versionId: fallbackVersion.id,
              versionName: fallbackVersion.name,
              project: fallbackVersion.project === "跨项目" ? bug.project : fallbackVersion.project
            }
          : bug
      );
    }
  }

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

function updateDashboardWithDocumentAnalysis(data: DashboardData, result: DocumentAnalyzeResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    tasks: [...result.tasks, ...data.tasks],
    bugs: [...data.bugs],
    documents: [result.document, ...data.documents],
    meta: data.meta
      ? {
          ...data.meta,
          message: result.message
        }
      : undefined
  };

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

function getUploadFileList(event: unknown) {
  if (Array.isArray(event)) {
    return event;
  }

  return (event as { fileList?: UploadFile[] })?.fileList;
}

function getSelectedUploadFile(value: unknown) {
  const fileList = Array.isArray(value) ? (value as UploadFile[]) : [];
  const file = fileList[0]?.originFileObj;

  return file instanceof File ? file : null;
}

function DrawerFooterActions({
  submitting,
  submitText,
  onClose,
  onSubmit
}: {
  submitting: boolean;
  submitText: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Flex className="pm-drawer-actions" justify="flex-end" gap={10}>
      <Button onClick={onClose}>取消</Button>
      <Button type="primary" loading={submitting} onClick={onSubmit}>
        {submitText}
      </Button>
    </Flex>
  );
}

function CreateRecordDrawer({
  form,
  open,
  type,
  submitting,
  projectOptions,
  requirementVersionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  open: boolean;
  type: DashboardEntityType | null;
  submitting: boolean;
  projectOptions: string[];
  requirementVersionOptions: RequirementVersionOption[];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const label = type ? entityLabels[type] : "";

  return (
    <Drawer
      className="pm-record-drawer"
      title={type ? `新建${label}` : "新建"}
      open={open}
      onClose={onClose}
      size={type === "project" ? "large" : "default"}
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {type ? (
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          {type === "project" ? (
            <ProjectFields form={form} people={people} peopleLoading={peopleLoading} peopleError={peopleError} />
          ) : null}
          {type === "task" ? (
            <TaskFields
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              projectOptions={projectOptions}
              versionOptions={requirementVersionOptions}
            />
          ) : null}
          {type === "bug" ? (
            <BugFields
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              projectOptions={projectOptions}
              versionOptions={requirementVersionOptions}
            />
          ) : null}
          {type === "risk" ? (
            <RiskFields
              form={form}
              people={people}
              peopleLoading={peopleLoading}
              peopleError={peopleError}
              projectOptions={projectOptions}
            />
          ) : null}
          {type === "requirementVersion" ? <RequirementVersionFields projectOptions={projectOptions} /> : null}
          {type === "requirement" ? (
            <RequirementFields form={form} versionOptions={requirementVersionOptions} />
          ) : null}
          {type === "document" ? <DocumentFields /> : null}
        </Form>
      ) : null}
    </Drawer>
  );
}

function ProjectEditDrawer({
  form,
  project,
  submitting,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  project: Project | null;
  submitting: boolean;
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑项目</span>
        </Space>
      }
      open={Boolean(project)}
      onClose={onClose}
      size="large"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {project ? (
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <ProjectFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            ownerRequired={false}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

function TaskEditDrawer({
  form,
  task,
  submitting,
  projectOptions,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  task: Task | null;
  submitting: boolean;
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑任务</span>
        </Space>
      }
      open={Boolean(task)}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {task ? (
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <TaskFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            projectOptions={projectOptions}
            versionOptions={versionOptions}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

function BugEditDrawer({
  form,
  bug,
  submitting,
  projectOptions,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  bug: BugReport | null;
  submitting: boolean;
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑 Bug</span>
        </Space>
      }
      open={Boolean(bug)}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {bug ? (
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <BugFields
            form={form}
            people={people}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            projectOptions={projectOptions}
            versionOptions={versionOptions}
          />
        </Form>
      ) : null}
    </Drawer>
  );
}

function RequirementEditDrawer({
  form,
  requirement,
  submitting,
  versionOptions,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  requirement: Requirement | null;
  submitting: boolean;
  versionOptions: RequirementVersionOption[];
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑需求</span>
        </Space>
      }
      open={Boolean(requirement)}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {requirement ? (
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <RequirementFields form={form} versionOptions={versionOptions} />
        </Form>
      ) : null}
    </Drawer>
  );
}

function RequirementVersionEditDrawer({
  form,
  version,
  submitting,
  projectOptions,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  version: RequirementVersion | null;
  submitting: boolean;
  projectOptions: string[];
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
      title={
        <Space>
          <EditOutlined />
          <span>编辑版本</span>
        </Space>
      }
      open={Boolean(version)}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="保存修改"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      {version ? (
        <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
          <RequirementVersionFields projectOptions={projectOptions} />
        </Form>
      ) : null}
    </Drawer>
  );
}

function DocumentBreakdownDrawer({
  form,
  open,
  submitting,
  projectOptions,
  versionOptions,
  people,
  peopleLoading,
  peopleError,
  onClose,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  open: boolean;
  submitting: boolean;
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      className="pm-record-drawer"
      title={
        <Space>
          <UploadOutlined />
          <span>上传文档拆任务</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size="default"
      footer={
        <DrawerFooterActions
          submitting={submitting}
          submitText="AI 拆解并入库"
          onClose={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
        <Alert
          className="pm-form-alert"
          type="info"
          showIcon
          title="上传后会自动生成任务"
          description="系统会读取文档内容，调用 AI 拆解执行任务，并保存到任务看板。AI 识别到的负责人会优先匹配飞书通讯录，未匹配时使用默认负责人。"
        />
        <VersionProjectFields
          form={form}
          projectOptions={projectOptions}
          versionOptions={versionOptions}
          versionLabel="目标版本"
          versionMessage="请选择文档拆解的目标版本"
        />
        <OwnerSelect
          form={form}
          people={people}
          loading={peopleLoading}
          error={peopleError}
          required={false}
          label="默认负责人"
        />
        <Form.Item
          label="文档"
          name="fileList"
          valuePropName="fileList"
          getValueFromEvent={getUploadFileList}
          rules={[{ required: true, message: "请上传文档" }]}
        >
          <Upload.Dragger
            accept=".docx,.txt,.md,.markdown,.csv,.json"
            beforeUpload={() => false}
            maxCount={1}
            multiple={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文档到这里</p>
            <p className="ant-upload-hint">支持 DOCX、Markdown、TXT、CSV、JSON，单个文件不超过 4MB。</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Drawer>
  );
}

function OwnerSelect({
  form,
  people,
  loading,
  error,
  required = true,
  label = "负责人"
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  loading: boolean;
  error: string;
  required?: boolean;
  label?: string;
}) {
  return (
    <>
      <Form.Item
        label={label}
        name="ownerOpenId"
        rules={required ? [{ required: true, message: "请选择飞书内部负责人" }] : undefined}
      >
        <Select
          showSearch
          loading={loading}
          disabled={Boolean(error) || !people.length}
          placeholder={required ? "从飞书通讯录选择负责人" : "可选，未匹配负责人时使用"}
          optionFilterProp="displayName"
          optionLabelProp="displayName"
          filterOption={(input, option) => filterOwnerOption(input, option as { searchText?: string })}
          options={getOwnerSelectOptions(people)}
          onChange={(value) => {
            const selectedPerson = people.find((person) => person.openId === value);

            form.setFieldsValue({
              ownerOpenId: value,
              ownerUnionId: selectedPerson?.unionId ?? "",
              ownerUserId: selectedPerson?.userId ?? "",
              ownerEmail: selectedPerson?.email ?? "",
              ownerAvatarUrl: selectedPerson?.avatarUrl ?? "",
              owner: selectedPerson?.name ?? ""
            });
          }}
        />
      </Form.Item>
      <Form.Item name="owner" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerUnionId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerUserId" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerEmail" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="ownerAvatarUrl" hidden>
        <Input />
      </Form.Item>
      {error ? (
        <Alert
          className="pm-form-alert"
          type="error"
          showIcon
          title="通讯录权限不足，无法选择负责人"
          description={`请在飞书开放平台把应用通讯录权限范围设置为全员或目标部门，并开通通讯录用户读取权限。原始错误：${error}`}
        />
      ) : !people.length && !loading ? (
        <Alert
          className="pm-form-alert"
          type="warning"
          showIcon
          title="通讯录暂无可选成员"
          description="飞书接口没有返回成员。请确认应用通讯录权限范围包含需要选择的部门成员。"
        />
      ) : (
        <Text className="pm-form-note" type="secondary">
          负责人会保存飞书身份关联，并在创建成功后尝试通过机器人通知。
        </Text>
      )}
    </>
  );
}

function MilestoneOwnerSelect({
  form,
  name,
  people,
  peopleError,
  peopleLoading,
  restField
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  name: number;
  people: FeishuPerson[];
  peopleError: string;
  peopleLoading: boolean;
  restField: Record<string, unknown>;
}) {
  return (
    <>
      <Form.Item
        {...restField}
        label="负责人"
        name={[name, "ownerOpenId"]}
        rules={!peopleError && people.length ? [{ required: true, message: "请选择飞书成员" }] : undefined}
      >
        <Select
          showSearch
          loading={peopleLoading}
          disabled={Boolean(peopleError) || !people.length}
          placeholder="从飞书通讯录选择"
          optionFilterProp="displayName"
          optionLabelProp="displayName"
          filterOption={(input, option) => filterOwnerOption(input, option as { searchText?: string })}
          options={getOwnerSelectOptions(people)}
          onChange={(value) => {
            const selectedPerson = people.find((person) => person.openId === value);
            const milestones = [...((form.getFieldValue("milestones") as ProjectMilestone[]) ?? [])];

            milestones[name] = {
              ...milestones[name],
              owner: selectedPerson?.name ?? "",
              ownerOpenId: value,
              ownerUnionId: selectedPerson?.unionId ?? "",
              ownerUserId: selectedPerson?.userId ?? "",
              ownerEmail: selectedPerson?.email ?? "",
              ownerAvatarUrl: selectedPerson?.avatarUrl ?? ""
            };
            form.setFieldsValue({
              milestones
            });
          }}
        />
      </Form.Item>
      <Form.Item {...restField} name={[name, "owner"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerUnionId"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerUserId"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerEmail"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item {...restField} name={[name, "ownerAvatarUrl"]} hidden>
        <Input />
      </Form.Item>
    </>
  );
}

function ProjectFields({
  form,
  people,
  peopleLoading,
  peopleError,
  ownerRequired = true
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  ownerRequired?: boolean;
}) {
  return (
    <>
      <Form.Item label="项目名称" name="name" rules={[{ required: true, message: "请输入项目名称" }]}>
        <Input placeholder="例如：智能项目驾驶舱二期" />
      </Form.Item>
      <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} required={ownerRequired} />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="状态" name="status">
            <Select options={["进行中", "有风险", "已完成", "暂停"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="截止日期" name="dueDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="进度（自动）" name="progress">
            <InputNumber className="pm-form-control" min={0} max={100} suffix="%" disabled />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="健康度（自动）" name="health">
            <InputNumber className="pm-form-control" min={0} max={100} disabled />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="团队人数" name="team">
            <InputNumber className="pm-form-control" min={1} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="风险数（自动）" name="riskCount">
            <InputNumber className="pm-form-control" min={0} disabled />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="摘要" name="summary">
        <Input.TextArea rows={4} placeholder="项目当前进展、目标或风险说明" />
      </Form.Item>
      <Form.List name="milestones">
        {(fields, { add, remove }) => (
          <div className="project-milestone-form">
            <Flex justify="space-between" align="center" className="project-milestone-form-header">
              <Text strong>项目里程碑</Text>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({
                    title: "",
                    status: "未开始",
                    dueDate: dayjs().add(7, "day"),
                    owner: form.getFieldValue("owner") || "",
                    ownerOpenId: form.getFieldValue("ownerOpenId") || "",
                    ownerUnionId: form.getFieldValue("ownerUnionId") || "",
                    ownerUserId: form.getFieldValue("ownerUserId") || "",
                    ownerEmail: form.getFieldValue("ownerEmail") || "",
                    ownerAvatarUrl: form.getFieldValue("ownerAvatarUrl") || "",
                    note: ""
                  })
                }
              >
                添加里程碑
              </Button>
            </Flex>
            <Space orientation="vertical" size={12} className="pm-wide">
              {fields.map(({ key, name, ...restField }, index) => (
                <div className="project-milestone-form-item" key={key}>
                  <Flex justify="space-between" align="center">
                    <Text type="secondary">里程碑 {index + 1}</Text>
                    <Tooltip title="删除里程碑">
                      <Button
                        danger
                        size="small"
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                        disabled={fields.length <= 1}
                      />
                    </Tooltip>
                  </Flex>
                  <Form.Item {...restField} name={[name, "id"]} hidden>
                    <Input />
                  </Form.Item>
                  <div className="project-milestone-form-grid">
                    <Form.Item
                      {...restField}
                      label="标题"
                      name={[name, "title"]}
                      rules={[{ required: true, message: "请输入里程碑标题" }]}
                    >
                      <Input placeholder="例如：需求评审完成" />
                    </Form.Item>
                    <Form.Item {...restField} label="状态" name={[name, "status"]}>
                      <Select options={["未开始", "进行中", "已完成", "延期"].map((value) => ({ value, label: value }))} />
                    </Form.Item>
                    <Form.Item {...restField} label="日期" name={[name, "dueDate"]}>
                      <DatePicker className="pm-form-control" />
                    </Form.Item>
                    <MilestoneOwnerSelect
                      form={form}
                      name={name}
                      people={people}
                      peopleError={peopleError}
                      peopleLoading={peopleLoading}
                      restField={restField}
                    />
                  </div>
                  <Form.Item {...restField} label="说明" name={[name, "note"]} className="project-milestone-note">
                    <Input.TextArea rows={2} placeholder="交付范围、检查点或风险说明" />
                  </Form.Item>
                </div>
              ))}
            </Space>
          </div>
        )}
      </Form.List>
    </>
  );
}

function ProjectOptionSelect({
  projectOptions,
  value,
  onChange
}: {
  projectOptions: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      optionFilterProp="label"
      placeholder="选择站内已有项目"
      notFoundContent="请先在项目管理中新建项目"
      options={projectOptions.map((project) => ({
        value: project,
        label: project
      }))}
    />
  );
}

function useSyncProjectWithVersion(
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0],
  versionOptions: RequirementVersionOption[]
) {
  const selectedVersionId = Form.useWatch("versionId", form) as string | undefined;

  useEffect(() => {
    const selectedVersion = versionOptions.find((version) => version.value === selectedVersionId);

    if (!selectedVersion) {
      return;
    }

    const nextValues: Record<string, unknown> = {
      versionName: selectedVersion.versionName
    };

    if (selectedVersion.project !== "跨项目") {
      nextValues.project = selectedVersion.project;
    }

    form.setFieldsValue(nextValues);
  }, [form, selectedVersionId, versionOptions]);
}

function VersionProjectFields({
  form,
  projectOptions,
  versionOptions,
  versionLabel = "关联版本",
  versionMessage = "请选择关联版本"
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  versionLabel?: string;
  versionMessage?: string;
}) {
  useSyncProjectWithVersion(form, versionOptions);

  return (
    <>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label={versionLabel} name="versionId" rules={[{ required: true, message: versionMessage }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择版本"
              notFoundContent="请先在需求管理中新建版本"
              options={versionOptions}
            />
          </Form.Item>
          <Form.Item name="versionName" hidden>
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="版本归属项目" name="project" rules={[{ required: true, message: "请选择版本归属项目" }]}>
            <ProjectOptionSelect projectOptions={projectOptions} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}

function RequirementVersionSelectField({
  form,
  versionOptions,
  versionLabel = "关联版本",
  versionMessage = "请选择关联版本"
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
  versionLabel?: string;
  versionMessage?: string;
}) {
  useSyncProjectWithVersion(form, versionOptions);

  return (
    <>
      <Form.Item label={versionLabel} name="versionId" rules={[{ required: true, message: versionMessage }]}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="选择版本"
          notFoundContent="请先新建版本"
          options={versionOptions}
        />
      </Form.Item>
      <Form.Item name="versionName" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="project" hidden>
        <Input />
      </Form.Item>
    </>
  );
}

function TaskFields({
  form,
  projectOptions,
  versionOptions,
  people,
  peopleLoading,
  peopleError
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
}) {
  return (
    <>
      <Form.Item label="任务标题" name="title" rules={[{ required: true, message: "请输入任务标题" }]}>
        <Input placeholder="例如：补齐权限过滤测试" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="阶段" name="stage">
            <Select options={taskStages.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="优先级" name="priority">
            <Select options={["高", "中", "低"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <VersionProjectFields form={form} projectOptions={projectOptions} versionOptions={versionOptions} />
      <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="开始日期" name="startDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="截止日期"
            name="dueDate"
            dependencies={["startDate"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("startDate");

                  if (!value || !startDate || !dayjs(value).isBefore(dayjs(startDate), "day")) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error("截止日期不能早于开始日期"));
                }
              })
            ]}
          >
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="AI 提示" name="aiHint">
        <Input.TextArea rows={4} placeholder="可填写 AI 需要提醒的风险、依赖或建议" />
      </Form.Item>
    </>
  );
}

function BugFields({
  form,
  projectOptions,
  versionOptions,
  people,
  peopleLoading,
  peopleError
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  projectOptions: string[];
  versionOptions: RequirementVersionOption[];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
}) {
  return (
    <>
      <Form.Item label="Bug 标题" name="title" rules={[{ required: true, message: "请输入 Bug 标题" }]}>
        <Input placeholder="例如：上传文档后任务负责人未自动关联飞书" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="严重程度" name="severity">
            <Select options={["阻塞", "严重", "一般", "轻微"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="状态" name="status">
            <Select options={["新建", "定位中", "修复中", "待验证", "已关闭"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <VersionProjectFields form={form} projectOptions={projectOptions} versionOptions={versionOptions} />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item
            label="提交人"
            name="reporter"
            rules={[{ required: true, message: "请输入提交人" }]}
          >
            <Input placeholder="填写提 Bug 的人" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="截止日期" name="dueDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <OwnerSelect
        form={form}
        people={people}
        loading={peopleLoading}
        error={peopleError}
        label="修复负责人"
      />
      <Form.Item label="环境" name="environment" rules={[{ required: true, message: "请输入复现环境" }]}>
        <Input placeholder="例如：Chrome 124 / macOS / 测试环境" />
      </Form.Item>
      <Form.Item label="复现步骤" name="reproduction" rules={[{ required: true, message: "请输入复现步骤" }]}>
        <Input.TextArea rows={4} placeholder="按 1、2、3 写清楚如何稳定复现" />
      </Form.Item>
      <Form.Item label="预期结果" name="expected">
        <Input.TextArea rows={3} placeholder="系统应该出现什么结果" />
      </Form.Item>
      <Form.Item label="实际结果" name="actual" rules={[{ required: true, message: "请输入实际结果" }]}>
        <Input.TextArea rows={3} placeholder="实际看到的问题、报错或异常表现" />
      </Form.Item>
    </>
  );
}

function RiskFields({
  form,
  projectOptions,
  people,
  peopleLoading,
  peopleError
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  projectOptions: string[];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
}) {
  return (
    <>
      <Form.Item label="风险标题" name="title" rules={[{ required: true, message: "请输入风险标题" }]}>
        <Input placeholder="例如：需求范围未冻结" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="风险等级" name="level">
            <Select options={["高", "中", "低"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} />
        </Col>
      </Row>
      <Form.Item label="关联项目" name="project" rules={[{ required: true, message: "请选择关联项目" }]}>
        <ProjectOptionSelect projectOptions={projectOptions} />
      </Form.Item>
      <Form.Item label="应对措施" name="mitigation">
        <Input.TextArea rows={4} placeholder="处理策略、责任人和检查时间" />
      </Form.Item>
    </>
  );
}

function RequirementVersionFields({ projectOptions }: { projectOptions: string[] }) {
  return (
    <>
      <Form.Item label="版本名称" name="name" rules={[{ required: true, message: "请输入版本名称" }]}>
        <Input placeholder="例如：1.5 协同提效版本" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="版本状态" name="status">
            <Select options={["规划中", "进行中", "已发布", "已归档"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="版本归属项目" name="project" rules={[{ required: true, message: "请选择版本归属项目" }]}>
            <ProjectOptionSelect projectOptions={projectOptions} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="开始日期" name="startDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="发布日期"
            name="releaseDate"
            dependencies={["startDate"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("startDate");

                  if (!value || !startDate || !dayjs(value).isBefore(dayjs(startDate), "day")) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error("发布日期不能早于开始日期"));
                }
              })
            ]}
          >
            <DatePicker className="pm-form-control" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="版本目标" name="goal">
        <Input.TextArea rows={4} placeholder="这个版本要解决的问题、交付范围和验收口径" />
      </Form.Item>
    </>
  );
}

function RequirementFields({
  form,
  versionOptions
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  versionOptions: RequirementVersionOption[];
}) {
  return (
    <>
      <Form.Item label="需求标题" name="title" rules={[{ required: true, message: "请输入需求标题" }]}>
        <Input placeholder="例如：会议纪要自动转任务" />
      </Form.Item>
      <RequirementVersionSelectField
        form={form}
        versionOptions={versionOptions}
        versionLabel="需求版本"
        versionMessage="请选择需求版本"
      />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="优先级" name="priority">
            <Select options={["P0", "P1", "P2"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="状态" name="status">
            <Select options={requirementStatusOptions.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="UI 设计链接" name="uiLink" rules={[{ validator: validateExternalUrl }]}>
            <Input prefix={<LinkOutlined />} placeholder="例如：https://www.figma.com/design/..." />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="需求文档链接" name="documentLink" rules={[{ validator: validateExternalUrl }]}>
            <Input prefix={<LinkOutlined />} placeholder="例如：https://xxx.feishu.cn/docx/..." />
          </Form.Item>
        </Col>
      </Row>
      <RequirementAiLinkAnalyzer form={form} />
      <Form.Item label="验收标准" name="acceptance">
        <Input.TextArea rows={4} placeholder="可量化的验收条件和边界场景" />
      </Form.Item>
      <Form.Item name="aiSummary" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiRisks" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiMissingItems" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiFrontendNotes" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiBackendNotes" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiTestingNotes" hidden>
        <Input />
      </Form.Item>
      <Form.Item name="aiCompletenessScore" hidden>
        <InputNumber />
      </Form.Item>
    </>
  );
}

function DocumentFields() {
  return (
    <>
      <Form.Item label="文档标题" name="title" rules={[{ required: true, message: "请输入文档标题" }]}>
        <Input placeholder="例如：AI 项目助手 PRD v1.0" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="类型" name="type">
            <Select options={["PRD", "会议纪要", "技术方案", "复盘"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="更新时间" name="updatedAt">
            <DatePicker className="pm-form-control" showTime />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="AI 摘要" name="aiSummary">
        <Input.TextArea rows={4} placeholder="文档重点、决策项或待办摘要" />
      </Form.Item>
    </>
  );
}
