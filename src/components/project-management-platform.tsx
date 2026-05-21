"use client";

import {
  Alert,
  App,
  Avatar,
  Button,
  ConfigProvider,
  Form,
  Grid,
  Input,
  Layout,
  Menu,
  Popover,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message
} from "antd";
import {
  AlertOutlined,
  BarChartOutlined,
  BugOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ProjectOutlined,
  RobotOutlined,
  SearchOutlined,
  TeamOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import type {
  BugReport,
  DashboardData,
  DashboardMember,
  DashboardWorkspace,
  FeishuPerson,
  Project,
  Requirement,
  RequirementVersion,
  Task
} from "@/types/dashboard";
import type { CreateRecordResult, DashboardEntityType, DeleteRecordResult, DocumentAnalyzeResult } from "@/types/records";
import { getAntdThemeConfig, ThemeToggleButton, useThemePreference } from "@/components/theme-mode";
import { fetchDashboardFromApi, type PeopleResponse } from "@/components/project-management-platform/api";
import { createRequirementColumns } from "@/components/project-management-platform/columns/requirement-columns";
import { validViews } from "@/components/project-management-platform/constants";
import { AssistantDrawer } from "@/components/project-management-platform/drawers/assistant-drawer";
import { ScheduleDrawer } from "@/components/project-management-platform/drawers/schedule-drawer";
import { createSearchResults, SearchDrawer } from "@/components/project-management-platform/drawers/search-drawer";
import { WorkspaceDrawer } from "@/components/project-management-platform/drawers/workspace-drawer";
import {
  getCreateInitialValues,
  getMemberFormValues,
  getProjectFormValues,
  getRequirementFormValues,
  getRequirementVersionFormValues,
  getSelectedUploadFile,
  getTaskFormValues,
  serializeCreateValues
} from "@/components/project-management-platform/forms/form-utils";
import { hydrateOwnerFormValues } from "@/components/project-management-platform/forms/owner-select";
import {
  BugEditDrawer,
  CreateRecordDrawer,
  DocumentBreakdownDrawer,
  ProjectEditDrawer,
  RequirementEditDrawer,
  RequirementVersionEditDrawer,
  TaskEditDrawer
} from "@/components/project-management-platform/forms/record-drawers";
import { Brand } from "@/components/project-management-platform/shared/brand";
import {
  updateDashboardWithDocumentAnalysis,
  updateDashboardWithMember,
  updateDashboardWithRecord,
  updateDashboardWithRecordDeletion,
  updateDashboardWithRecordUpdate,
  updateDashboardWithWorkspace
} from "@/components/project-management-platform/state/dashboard-updates";
import type {
  AppView,
  ChatMessage,
  OwnerSelectableMember,
  SearchResult
} from "@/components/project-management-platform/types";
import { formatRequirementVersionOptionLabel } from "@/components/project-management-platform/requirements/version-utils";
import { BugRouteEditView } from "@/components/project-management-platform/views/bug-route-edit-view";
import { BugsView } from "@/components/project-management-platform/views/bugs-view";
import { DocumentsView } from "@/components/project-management-platform/views/documents-view";
import { MembersView } from "@/components/project-management-platform/views/members-view";
import { OverviewView } from "@/components/project-management-platform/views/overview-view";
import { ProjectsView } from "@/components/project-management-platform/views/projects-view";
import { ReportsView } from "@/components/project-management-platform/views/reports-view";
import { RequirementsView } from "@/components/project-management-platform/views/requirements-view";
import { RisksView } from "@/components/project-management-platform/views/risks-view";
import { TasksView } from "@/components/project-management-platform/views/tasks-view";

export type { AppView } from "@/components/project-management-platform/types";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// 项目管理平台主容器只保留跨模块状态、接口编排和页面路由切换。
export function ProjectManagementPlatform({
  initialBugId,
  initialView = "overview",
  initialWorkspaceId
}: {
  initialBugId?: string;
  initialView?: AppView;
  initialWorkspaceId?: string;
}) {
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
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [workspaceSelectOpen, setWorkspaceSelectOpen] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaceId ?? "");
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
  const [workspaceForm] = Form.useForm<Record<string, unknown>>();
  const [messageApi, messageContextHolder] = message.useMessage();
  const { mode: themeMode, effectiveTheme, cycleMode } = useThemePreference();
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const permissions = data?.meta?.permissions;
  const canCreateRequirements = Boolean(permissions?.canCreateRequirements);
  const canEditRequirements = Boolean(permissions?.canEditRequirements);
  const canDeleteRequirements = Boolean(permissions?.canDeleteRequirements);
  const canEditBugs = Boolean(permissions?.canEditBugs);
  const canEditBugsFully = Boolean(permissions?.canEditBugsFully);
  const canDeleteBugs = Boolean(permissions?.canDeleteBugs);
  const permissionDeniedReason = permissions?.deniedReason ?? "当前角色无此操作权限。";
  const currentWorkspace = data?.meta?.currentWorkspace;
  const currentWorkspaceId = currentWorkspace?.id ?? activeWorkspaceId;
  const navigationView = activeView === "bugEdit" ? "bugs" : activeView;
  const routeBug = initialBugId ? data?.bugs.find((bug) => bug.id === initialBugId) ?? null : null;

  // 静默刷新用于校准乐观更新结果，失败时保留当前 UI 避免打断用户操作。
  async function refreshDashboardState(workspaceId = currentWorkspaceId) {
    try {
      const nextData = await fetchDashboardFromApi(workspaceId);

      if (nextData) {
        setData(nextData);
        setActiveWorkspaceId(nextData.meta?.currentWorkspace?.id ?? workspaceId ?? "");
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
        const nextData = await fetchDashboardFromApi(initialWorkspaceId);

        if (mounted && nextData) {
          setData(nextData);
          setActiveWorkspaceId(nextData.meta?.currentWorkspace?.id ?? initialWorkspaceId ?? "");
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
  }, [initialWorkspaceId]);

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

    return data.projects;
  }, [data]);

  const ownerOptions = useMemo<OwnerSelectableMember[]>(() => {
    return (data?.members ?? [])
      .filter((member) => member.status === "active")
      .map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        email: member.email,
        avatarUrl: member.avatarUrl,
        feishuOpenId: member.notification.feishuOpenId,
        feishuUnionId: member.notification.feishuUnionId,
        feishuUserId: member.notification.feishuUserId
      }));
  }, [data?.members]);
  const ownerSelectLoading = loading;
  const ownerSelectError = !ownerSelectLoading && data && !ownerOptions.length ? "暂无可选平台成员，请先在成员管理添加成员。" : "";

  const requirementColumns = createRequirementColumns({
    canDeleteRequirements,
    canEditRequirements,
    permissionDeniedReason,
    onDelete: (requirementId) => handleDeleteRecord("requirement", requirementId),
    onEdit: openEditRequirementDrawer
  });

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
        body: JSON.stringify({ message, workspaceId: currentWorkspaceId })
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

  function showRecordResultMessage(resultMessage: string) {
    if (resultMessage.includes("未发送飞书通知") || resultMessage.includes("机器人通知失败")) {
      messageApi.warning(resultMessage, 6);

      return;
    }

    messageApi.success(resultMessage);
  }

  // 新建抽屉统一在打开前合并默认值和上下文值，减少各入口重复设置字段。
  function openCreateDrawer(type: DashboardEntityType, initialValues: Record<string, unknown> = {}) {
    if ((type === "requirement" || type === "requirementVersion") && !canCreateRequirements) {
      messageApi.warning(permissionDeniedReason);

      return;
    }

    setCreateType(type);
    createForm.resetFields();
    createForm.setFieldsValue(hydrateOwnerFormValues({
      ...getCreateInitialValues(type, data?.meta?.user),
      ...initialValues
    }, ownerOptions));
  }

  function openEditProjectDrawer(project: Project) {
    setEditingProject(project);
    projectEditForm.resetFields();
    projectEditForm.setFieldsValue(hydrateOwnerFormValues(getProjectFormValues(project), ownerOptions));
  }

  function openEditTaskDrawer(task: Task) {
    setEditingTask(task);
    editForm.resetFields();
    editForm.setFieldsValue(hydrateOwnerFormValues(getTaskFormValues(task), ownerOptions));
  }

  function openEditRequirementDrawer(requirement: Requirement) {
    if (!canEditRequirements) {
      messageApi.warning(permissionDeniedReason);

      return;
    }

    setEditingRequirement(requirement);
    requirementEditForm.resetFields();
    requirementEditForm.setFieldsValue(hydrateOwnerFormValues(getRequirementFormValues(requirement), ownerOptions));
  }

  function openEditRequirementVersionDrawer(version: RequirementVersion) {
    if (!canEditRequirements) {
      messageApi.warning(permissionDeniedReason);

      return;
    }

    setEditingRequirementVersion(version);
    requirementVersionEditForm.resetFields();
    requirementVersionEditForm.setFieldsValue(getRequirementVersionFormValues(version));
  }

  function openDocumentBreakdownDrawer(initialValues: Record<string, unknown> = {}) {
    setBreakdownOpen(true);
    breakdownForm.resetFields();
    breakdownForm.setFieldsValue(hydrateOwnerFormValues(initialValues, ownerOptions));
  }

  // 版本页发起拆任务时直接带入版本上下文，确保 AI 拆解不会跑到项目维度之外。
  function openVersionBreakdownDrawer(version: RequirementVersion) {
    openDocumentBreakdownDrawer({
      versionId: version.id,
      versionName: version.name,
      project: version.project === "跨项目" ? undefined : version.project
    });
  }

  // 子版本从父版本入口创建时预填层级和项目，确保版本树不会和需求项目脱节。
  function openCreateSubRequirementVersionDrawer(version: RequirementVersion) {
    openCreateDrawer("requirementVersion", {
      parentVersionId: version.id,
      parentVersionName: version.name,
      project: version.project === "跨项目" ? undefined : version.project
    });
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
          workspaceId: currentWorkspaceId,
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
      showRecordResultMessage(result.message);
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
      // 项目表单不再展示里程碑，更新基础信息时保留历史项目里程碑数据。
      const submittedValues = {
        ...values,
        milestones: Array.isArray(values.milestones) ? values.milestones : editingProject.milestones
      };
      const response = await fetch("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          type: "project",
          id: editingProject.id,
          values: serializeCreateValues(submittedValues)
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
      showRecordResultMessage(result.message);
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
          workspaceId: currentWorkspaceId,
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
      showRecordResultMessage(result.message);
      setEditingTask(null);
      editForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新任务失败");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleUpdateBug(
    values: Record<string, unknown>,
    bugOverride?: BugReport,
    options: { keepFormOpen?: boolean } = {}
  ) {
    const targetBug = bugOverride ?? editingBug;

    if (!targetBug) {
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
          workspaceId: currentWorkspaceId,
          type: "bug",
          id: targetBug.id,
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
      showRecordResultMessage(result.message);
      if (!options.keepFormOpen) {
        setEditingBug(null);
        bugEditForm.resetFields();
      }
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
          workspaceId: currentWorkspaceId,
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
      showRecordResultMessage(result.message);
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
          workspaceId: currentWorkspaceId,
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
      showRecordResultMessage(result.message);
      setEditingRequirementVersion(null);
      requirementVersionEditForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新版本失败");
    } finally {
      setRequirementVersionEditSubmitting(false);
    }
  }

  async function handleDeleteRecord(type: DashboardEntityType, id: string) {
    const canDelete =
      type === "requirement" || type === "requirementVersion"
        ? canDeleteRequirements
        : type === "bug"
          ? canDeleteBugs
          : Boolean(permissions?.canDeleteRecords);

    if (!canDelete) {
      messageApi.warning(permissionDeniedReason);

      return false;
    }

    try {
      const response = await fetch("/api/records", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          type,
          id
        })
      });
      const payload = (await response.json()) as DeleteRecordResult | { error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return false;
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
      showRecordResultMessage(result.message);

      if (type === "requirementVersion" && selectedRequirementVersionId === id) {
        setSelectedRequirementVersionId(null);
      }

      return true;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "删除失败");

      return false;
    }
  }

  async function handleCreateMember(values: Record<string, unknown>) {
    setMemberSubmitting(true);

    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as { member?: DashboardMember; message?: string; error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok || payload.error || !payload.member) {
        throw new Error(payload.error || "创建成员失败");
      }

      setData((current) => (current ? updateDashboardWithMember(current, payload.member!, payload.message) : current));
      void refreshDashboardState();
      messageApi.success(payload.message || "已添加成员");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建成员失败");
    } finally {
      setMemberSubmitting(false);
    }
  }

  async function handleUpdateMember(member: DashboardMember, values: Record<string, unknown>) {
    setMemberSubmitting(true);

    try {
      const response = await fetch("/api/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: member.id,
          workspaceId: member.workspaceId || currentWorkspaceId,
          values: serializeCreateValues({
            ...getMemberFormValues(member),
            ...values
          })
        })
      });
      const payload = (await response.json()) as { member?: DashboardMember; message?: string; error?: string };

      if (response.status === 401) {
        window.location.assign("/login");

        return;
      }

      if (!response.ok || payload.error || !payload.member) {
        throw new Error(payload.error || "更新成员失败");
      }

      setData((current) => (current ? updateDashboardWithMember(current, payload.member!, payload.message) : current));
      void refreshDashboardState();
      messageApi.success(payload.message || "已更新成员");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新成员失败");
    } finally {
      setMemberSubmitting(false);
    }
  }

  async function handleCreateWorkspace(values: Record<string, unknown>) {
    setWorkspaceSubmitting(true);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentWorkspaceId,
          values: serializeCreateValues(values)
        })
      });
      const payload = (await response.json()) as {
        workspace?: DashboardWorkspace;
        member?: DashboardMember;
        message?: string;
        error?: string;
      };

      if (response.status === 401) {
        window.location.assign("/login");

        return false;
      }

      if (!response.ok || payload.error || !payload.workspace) {
        throw new Error(payload.error || "创建工作区失败");
      }

      setData((current) => (current ? updateDashboardWithWorkspace(current, payload.workspace!, payload.member, payload.message) : current));
      await switchWorkspace(payload.workspace.id);
      messageApi.success(payload.message || "已创建工作区");

      return true;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建工作区失败");

      return false;
    } finally {
      setWorkspaceSubmitting(false);
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
      formData.append("workspaceId", currentWorkspaceId);
      for (const key of [
        "project",
        "versionId",
        "versionName",
        "owner",
        "ownerMemberId",
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
    { key: "projects", icon: <ProjectOutlined />, label: "项目视图" },
    { key: "tasks", icon: <CheckCircleOutlined />, label: "任务看板" },
    { key: "bugs", icon: <BugOutlined />, label: "Bug 管理" },
    { key: "requirements", icon: <NodeIndexOutlined />, label: "需求管理" },
    { key: "risks", icon: <AlertOutlined />, label: "风险中心" },
    { key: "docs", icon: <FileTextOutlined />, label: "文档知识库" },
    { key: "members", icon: <TeamOutlined />, label: "成员管理" },
    { key: "reports", icon: <BarChartOutlined />, label: "报表驾驶舱" }
  ];
  const userName = data?.meta?.user?.name ?? "苏";
  const userInitial = userName.slice(0, 1);
  const projectOptions = data?.projects.map((project) => project.name) ?? [];
  const workspaceOptions = useMemo(
    () =>
      (data?.workspaces ?? [])
        .filter((workspace) => workspace.status === "active")
        .map((workspace) => ({
          value: workspace.id,
          label: workspace.name
        })),
    [data?.workspaces]
  );
  const requirementVersions = useMemo(() => data?.requirementVersions ?? [], [data?.requirementVersions]);
  const requirementVersionOptions = useMemo(
    () =>
      requirementVersions.map((version) => ({
        value: version.id,
        label: formatRequirementVersionOptionLabel(version, requirementVersions),
        versionName: version.name,
        project: version.project,
        parentVersionId: version.parentVersionId
      })),
    [requirementVersions]
  );
  const globalSearchResults = useMemo(() => (data ? createSearchResults(data, searchQuery) : []), [data, searchQuery]);

  function getWorkspaceQueryString(view?: AppView) {
    const params = new URLSearchParams();

    if (view && view !== "bugEdit") {
      params.set("view", view);
    }

    if (currentWorkspaceId) {
      params.set("workspaceId", currentWorkspaceId);
    }

    const query = params.toString();

    return query ? `?${query}` : "";
  }

  function navigateToBugEdit(bug: BugReport) {
    if (typeof window === "undefined") {
      return;
    }

    window.location.assign(`/bugs/${bug.id}${getWorkspaceQueryString()}`);
  }

  function navigateToView(view: AppView) {
    if (typeof window === "undefined") {
      return;
    }

    window.location.assign(`/${getWorkspaceQueryString(view)}`);
  }

  // 视图切换同步写入 URL 查询参数，让刷新和分享链接能保留当前模块。
  function switchView(view: AppView) {
    if (view === "bugEdit") {
      return;
    }

    setActiveView(view);

    if (typeof window !== "undefined") {
      if (window.location.pathname !== "/") {
        navigateToView(view);

        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      if (currentWorkspaceId) {
        url.searchParams.set("workspaceId", currentWorkspaceId);
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  // 工作区切换需要重置版本选择，再重新拉取该工作区的完整项目数据。
  async function switchWorkspace(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);
    setSelectedRequirementVersionId(null);

    try {
      const nextData = await fetchDashboardFromApi(workspaceId);

      if (nextData) {
        setData(nextData);
        setLoadError("");

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("workspaceId", nextData.meta?.currentWorkspace?.id ?? workspaceId);
          url.searchParams.set("view", activeView);
          window.history.replaceState(null, "", url.toString());
        }
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "切换工作区失败");
    }
  }

  // 搜索结果按实体类型进入对应视图，能编辑的实体直接打开编辑入口。
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
        navigateToBugEdit(bug);
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
          {/* 桌面侧边栏始终输出，由 CSS 媒体查询控制显示，避免 F5 首屏断点未知时布局乱跳。 */}
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
              selectedKeys={[navigationView]}
              items={menuItems}
              onClick={(item) => switchView(item.key as AppView)}
            />
          </Sider>

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
                <Popover
                  arrow={false}
                  classNames={{ root: "pm-avatar-popover" }}
                  content={
                    <Space className="pm-avatar-menu" direction="vertical" size={12}>
                      <Space className="pm-avatar-profile" size={10}>
                        <Avatar className="pm-avatar" src={data?.meta?.user?.avatarUrl}>
                          {userInitial}
                        </Avatar>
                        <Space direction="vertical" size={0}>
                          <Text strong>{userName}</Text>
                          <Text type="secondary">账户设置</Text>
                        </Space>
                      </Space>
                      {data?.workspaces?.length ? (
                        <div className="pm-workspace-control">
                          <Text className="pm-avatar-menu-label" type="secondary">
                            工作区
                          </Text>
                          <Select
                            aria-label="切换工作区"
                            className="pm-workspace-select"
                            getPopupContainer={(triggerNode) =>
                              (triggerNode.closest(".pm-avatar-popover") as HTMLElement | null) ??
                              triggerNode.parentElement ??
                              document.body
                            }
                            open={workspaceSelectOpen}
                            value={currentWorkspace?.id}
                            options={workspaceOptions}
                            popupMatchSelectWidth={220}
                            popupRender={(menu) => (
                              <>
                                {menu}
                                <div className="pm-workspace-popup-divider" />
                                {permissions?.canManageMembers ? (
                                  <Button
                                    block
                                    className="pm-workspace-popup-action"
                                    icon={<PlusOutlined />}
                                    type="text"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      setWorkspaceSelectOpen(false);
                                      workspaceForm.resetFields();
                                      setWorkspaceDrawerOpen(true);
                                    }}
                                  >
                                    新建工作区
                                  </Button>
                                ) : (
                                  <Tooltip title={permissionDeniedReason}>
                                    <span className="pm-workspace-popup-disabled">
                                      <PlusOutlined />
                                      新建工作区
                                    </span>
                                  </Tooltip>
                                )}
                              </>
                            )}
                            onOpenChange={setWorkspaceSelectOpen}
                            onChange={switchWorkspace}
                          />
                        </div>
                      ) : null}
                      {data?.meta?.user ? (
                        <Button block href="/api/auth/logout" icon={<LogoutOutlined />}>
                          退出登录
                        </Button>
                      ) : null}
                    </Space>
                  }
                  placement="bottomRight"
                  trigger={isMobile ? "click" : "hover"}
                >
                  <span className="pm-avatar-trigger">
                    <Avatar className="pm-avatar" src={data?.meta?.user?.avatarUrl}>
                      {userInitial}
                    </Avatar>
                  </span>
                </Popover>
              </Space>
            </Header>

            {/* 移动导航也常驻 DOM，用 CSS 在小屏展示，避免刷新水合前后切换整块导航。 */}
            <div className="pm-mobile-nav">
              <Segmented
                block
                value={navigationView}
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
                      projects={filteredProjects}
                      bugs={data.bugs}
                      risks={data.risks}
                      tasks={data.tasks}
                      versions={requirementVersions}
                      projectFilter={projectFilter}
                      onFilterChange={setProjectFilter}
                      onCreate={() => openCreateDrawer("project")}
                      onEdit={openEditProjectDrawer}
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
                      canEditBugs={canEditBugs}
                      canDeleteBugs={canDeleteBugs}
                      currentUser={data.meta?.user}
                      editDeniedReason={permissions?.deniedReason ?? "当前角色无 Bug 编辑权限。"}
                      permissionDeniedReason={permissions?.deniedReason ?? "只有所有者、管理员或测试可以删除 Bug。"}
                      versionOptions={requirementVersionOptions}
                      onCreate={() => openCreateDrawer("bug")}
                      onDelete={(bug) => handleDeleteRecord("bug", bug.id)}
                      onEdit={navigateToBugEdit}
                    />
                  ) : null}
                  {activeView === "bugEdit" ? (
                    <BugRouteEditView
                      bug={routeBug}
                      canEditBugs={canEditBugs}
                      canEditBugsFully={canEditBugsFully}
                      canDeleteBugs={canDeleteBugs}
                      form={bugEditForm}
                      people={ownerOptions}
                      peopleError={ownerSelectError}
                      peopleLoading={ownerSelectLoading}
                      permissionDeniedReason={permissions?.deniedReason ?? "只有所有者、管理员或测试可以删除 Bug。"}
                      submitting={bugEditSubmitting}
                      versionOptions={requirementVersionOptions}
                      onBack={() => navigateToView("bugs")}
                      onDelete={async (bug) => {
                        const deleted = await handleDeleteRecord("bug", bug.id);

                        if (deleted) {
                          navigateToView("bugs");
                        }
                      }}
                      onSubmit={(bug, values) => handleUpdateBug(values, bug, { keepFormOpen: true })}
                    />
                  ) : null}
                  {activeView === "requirements" ? (
                    <RequirementsView
                      bugs={data.bugs}
                      canCreateRequirements={canCreateRequirements}
                      canDeleteRequirements={canDeleteRequirements}
                      canEditRequirements={canEditRequirements}
                      columns={requirementColumns}
                      permissionDeniedReason={permissionDeniedReason}
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
                      onCreateSubVersion={openCreateSubRequirementVersionDrawer}
                      onBreakdownVersion={openVersionBreakdownDrawer}
                      onDeleteVersion={(version) => handleDeleteRecord("requirementVersion", version.id)}
                      onEditVersion={openEditRequirementVersionDrawer}
                      onSelectVersion={setSelectedRequirementVersionId}
                    />
                  ) : null}
                  {activeView === "risks" ? (
                    <RisksView risks={data.risks} onCreate={() => openCreateDrawer("risk")} />
                  ) : null}
                  {activeView === "docs" ? (
                    <DocumentsView
                      documents={data.documents}
                      onCreate={() => openCreateDrawer("document")}
                      onUpload={() => openDocumentBreakdownDrawer()}
                    />
                  ) : null}
                  {activeView === "members" ? (
                    <MembersView
                      members={data.members}
                      people={people}
                      peopleError={peopleError}
                      peopleLoading={peopleLoading}
                      permissions={permissions ?? {
                        canManageMembers: false,
                        canCreateRequirements: false,
                        canEditRequirements: false,
                        canDeleteRequirements: false,
                        canEditBugs: false,
                        canEditBugsFully: false,
                        canDeleteBugs: false,
                        canDeleteRecords: false,
                        deniedReason: permissionDeniedReason
                      }}
                      submitting={memberSubmitting}
                      onCreateMember={handleCreateMember}
                      onUpdateMember={handleUpdateMember}
                    />
                  ) : null}
                  {activeView === "reports" ? (
                    <ReportsView data={data} onGenerateReport={handleGenerateWeeklyReport} />
                  ) : null}
                </>
              )}
            </Content>
          </Layout>

          <WorkspaceDrawer
            form={workspaceForm}
            open={workspaceDrawerOpen}
            submitting={workspaceSubmitting}
            onClose={() => setWorkspaceDrawerOpen(false)}
            onSubmit={handleCreateWorkspace}
          />

          <AssistantDrawer
            chatLoading={chatLoading}
            form={form}
            isMobile={isMobile}
            messages={chatMessages}
            open={assistantOpen}
            onClose={() => setAssistantOpen(false)}
            onSubmit={handleAskAssistant}
          />

          <CreateRecordDrawer
            form={createForm}
            open={Boolean(createType)}
            type={createType}
            submitting={createSubmitting}
            projectOptions={projectOptions}
            requirementVersionOptions={requirementVersionOptions}
            people={ownerOptions}
            peopleLoading={ownerSelectLoading}
            peopleError={ownerSelectError}
            onClose={() => setCreateType(null)}
            onSubmit={handleCreateRecord}
          />

          <ProjectEditDrawer
            form={projectEditForm}
            project={editingProject}
            submitting={projectEditSubmitting}
            people={ownerOptions}
            peopleLoading={ownerSelectLoading}
            peopleError={ownerSelectError}
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
            peopleLoading={ownerSelectLoading}
            peopleError={ownerSelectError}
            onClose={() => setEditingTask(null)}
            onSubmit={handleUpdateTask}
          />

          <BugEditDrawer
            form={bugEditForm}
            bug={editingBug}
            submitting={bugEditSubmitting}
            versionOptions={requirementVersionOptions}
            people={ownerOptions}
            peopleLoading={ownerSelectLoading}
            peopleError={ownerSelectError}
            onClose={() => setEditingBug(null)}
            onSubmit={handleUpdateBug}
          />

          <RequirementEditDrawer
            form={requirementEditForm}
            requirement={editingRequirement}
            submitting={requirementEditSubmitting}
            versionOptions={requirementVersionOptions}
            people={ownerOptions}
            peopleLoading={ownerSelectLoading}
            peopleError={ownerSelectError}
            onClose={() => setEditingRequirement(null)}
            onSubmit={handleUpdateRequirement}
          />

          <RequirementVersionEditDrawer
            form={requirementVersionEditForm}
            version={editingRequirementVersion}
            submitting={requirementVersionEditSubmitting}
            people={ownerOptions}
            peopleLoading={ownerSelectLoading}
            peopleError={ownerSelectError}
            projectOptions={projectOptions}
            versionOptions={requirementVersionOptions}
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
            peopleLoading={ownerSelectLoading}
            peopleError={ownerSelectError}
            onClose={() => setBreakdownOpen(false)}
            onSubmit={handleAnalyzeDocument}
          />
        </Layout>
      </App>
    </ConfigProvider>
  );
}
