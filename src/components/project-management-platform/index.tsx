"use client";

import "./index.less";
import {
  Alert,
  App,
  Button,
  ConfigProvider,
  Form,
  Grid,
  Input,
  Layout,
  Segmented,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message
} from "antd";
import {
  BugOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  FundProjectionScreenOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NodeIndexOutlined,
  ProjectOutlined,
  SearchOutlined,
  TeamOutlined
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  BugReport,
  DashboardData,
  DashboardMember,
  DashboardWorkspace,
  FeishuPerson,
  Project,
  Requirement,
  RequirementVersion,
  Task,
  TaskStage
} from "@/types/dashboard";
import type { CreateRecordResult, DashboardEntityType, DeleteRecordResult, DocumentAnalyzeResult } from "@/types/records";
import { getAntdThemeConfig, ThemeToggleButton, useThemePreference } from "@/components/theme-mode";
import {
  fetchDashboardFromApi,
  fetchWithAuthRedirect,
  isSessionExpiredError,
  redirectToLogin,
  type PeopleResponse
} from "@/components/project-management-platform/api";
import { createRequirementColumns } from "@/components/project-management-platform/columns/requirement-columns";
import { validViews } from "@/components/project-management-platform/constants";
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
import type { BugAiFixFormValues } from "@/components/project-management-platform/forms/bug-ai-fix-drawer";
import { createOwnerFormFieldsFromMember, hydrateOwnerFormValues } from "@/components/project-management-platform/forms/owner-select";
import {
  BugEditDrawer,
  CreateRecordDrawer,
  DocumentBreakdownDrawer,
  ProjectEditDrawer,
  RequirementEditDrawer,
  RequirementVersionEditDrawer,
  TaskEditDrawer
} from "@/components/project-management-platform/forms/record-drawers";
import {
  AccountAvatarPopover,
  AccountPopoverContent,
  AccountWorkspacePopover,
  AssistantSessionSidebar,
  WorkbenchSidebar,
  type StudioMenuGroup
} from "@/components/project-management-platform/shared/workbench-sidebar";
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
  OwnerSelectableMember,
  SearchResult
} from "@/components/project-management-platform/types";
import { formatRequirementVersionOptionLabel } from "@/components/project-management-platform/requirements/version-utils";
import { AssistantView } from "@/components/project-management-platform/views/assistant-view";
import type { AssistantSessionSidebarRenderProps } from "@/components/project-management-platform/drawers/assistant-drawer/assistant-chat-box";
import { BugRouteEditView } from "@/components/project-management-platform/views/bug-route-edit-view";
import { BugsView } from "@/components/project-management-platform/views/bugs-view";
import { MembersView } from "@/components/project-management-platform/views/members-view";
import { OverviewView } from "@/components/project-management-platform/views/overview-view";
import {
  allProjectCalendarVersionsValue,
  type ProjectCalendarItem,
  type ProjectCalendarScheduleChange
} from "@/components/project-management-platform/views/project-calendar-utils";
import { ProjectsView } from "@/components/project-management-platform/views/projects-view";
import { RequirementsView } from "@/components/project-management-platform/views/requirements-view";
import { TasksView } from "@/components/project-management-platform/views/tasks-view";
import { VersionDashboardView } from "@/components/project-management-platform/views/version-dashboard-view";
import { getAiPmAuthLogoutHref } from "@/lib/auth/unified-auth";
import { createWeeklyReportFileName } from "@/lib/reports/weekly-report";

export type { AppView } from "@/components/project-management-platform/types";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// 周报导出在浏览器侧完成，避免为了一个 Markdown 文件额外落库或新增下载接口。
function downloadMarkdownFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// 项目管理平台主容器只保留跨模块状态、接口编排和页面路由切换。
export function ProjectManagementPlatform({
  initialBugId,
  initialData,
  initialLoadError = "",
  initialView = "overview",
  initialWorkspaceId
}: {
  initialBugId?: string;
  initialData?: DashboardData;
  initialLoadError?: string;
  initialView?: AppView;
  initialWorkspaceId?: string;
}) {
  const [data, setData] = useState<DashboardData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData && !initialLoadError);
  const [loadError, setLoadError] = useState(initialLoadError);
  const [collapsed, setCollapsed] = useState(false);
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
  const [projectCalendarVersionId, setProjectCalendarVersionId] = useState(allProjectCalendarVersionsValue);
  const [selectedRequirementVersionId, setSelectedRequirementVersionId] = useState<string | null>(null);
  const [people, setPeople] = useState<FeishuPerson[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [workspaceSelectOpen, setWorkspaceSelectOpen] = useState(false);
  const [weeklyReportExporting, setWeeklyReportExporting] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialData?.meta?.currentWorkspace?.id ?? initialWorkspaceId ?? "");
  const [assistantSessionSidebar, setAssistantSessionSidebar] = useState<ReactNode | null>(null);
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
  const contentView = activeView;
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
    // 服务端已经预取 dashboard 时，首屏不再补打一遍 `/api/dashboard`；
    // 失败信息也直接进入应用内错误态，避免刷新时先空转 loading 再显示同一条错误。
    if (initialData || initialLoadError) {
      return;
    }

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
  }, [initialData, initialLoadError, initialWorkspaceId]);

  useEffect(() => {
    // 飞书通讯录只服务于成员管理里的联系人选择；工作台、项目和任务首屏不需要它，
    // 延迟到进入成员页后再加载可以少一次认证读取和一次外部通讯录请求。
    if (activeView !== "members" || peopleLoaded) {
      return;
    }

    let mounted = true;

    async function loadPeople() {
      setPeopleLoading(true);

      try {
        const response = await fetchWithAuthRedirect("/api/feishu/users");
        const payload = (await response.json()) as PeopleResponse;

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
          setPeopleLoaded(true);
        }
      }
    }

    loadPeople();

    return () => {
      mounted = false;
    };
  }, [activeView, peopleLoaded]);

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

  async function handleGenerateWeeklyReport() {
    if (!data) {
      messageApi.warning("项目数据还在加载，稍后再生成周报。");

      return;
    }

    if (weeklyReportExporting) {
      messageApi.warning("周报正在生成中，请稍候。");

      return;
    }

    setWeeklyReportExporting(true);

    try {
      const response = await fetchWithAuthRedirect("/api/assistant/weekly-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "请生成固定格式的详细 Markdown 项目周报。",
          workspaceId: currentWorkspaceId
        })
      });
      const payload = (await response.json()) as { error?: string; reply?: string; warning?: string };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || "周报生成失败");
      }

      downloadMarkdownFile(createWeeklyReportFileName(data), payload.reply);

      if (payload.warning) {
        messageApi.warning(payload.warning, 6);
      } else {
        messageApi.success("Markdown 周报已导出");
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "周报生成失败");
    } finally {
      setWeeklyReportExporting(false);
    }
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
      project: version.project
    });
  }

  async function handleCreateRecord(values: Record<string, unknown>) {
    if (!createType) {
      return;
    }

    const submittedType = createType;
    setCreateSubmitting(true);

    try {
      const response = await fetchWithAuthRedirect("/api/records", {
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
      const response = await fetchWithAuthRedirect("/api/records", {
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
      const response = await fetchWithAuthRedirect("/api/records", {
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

  async function handleUpdateTaskStage(task: Task, stage: TaskStage) {
    if (!data) {
      return false;
    }

    if (task.stage === stage) {
      return true;
    }

    const optimisticTask = {
      ...task,
      stage
    };
    let previousData: DashboardData | null = null;

    // 拖拽交互需要在松手后立刻反馈，否则公网数据库或通知链路稍慢时会像“没有拖成功”。
    // 这里先做本地乐观移动，接口失败再回滚，真实数据仍由 PATCH 后的服务端结果校准。
    setData((current) => {
      previousData = current;

      return current
        ? updateDashboardWithRecordUpdate(current, {
            type: "task",
            record: optimisticTask,
            persisted: false,
            message: current.meta?.message ?? ""
          })
        : current;
    });

    try {
      // 阶段拖拽只改任务流转状态，其余字段沿用原任务，避免 PATCH 时丢失版本、负责人和日期。
      const response = await fetchWithAuthRedirect("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          type: "task",
          id: task.id,
          values: serializeCreateValues({
            ...optimisticTask
          })
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新任务阶段失败" : "更新任务阶段失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新任务阶段失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      showRecordResultMessage(result.message);

      return true;
    } catch (error) {
      if (previousData) {
        setData(previousData);
      }

      messageApi.error(error instanceof Error ? error.message : "更新任务阶段失败");

      return false;
    }
  }

  async function handleUpdateTaskOwner(task: Task, owner: OwnerSelectableMember | null) {
    if (!data) {
      return false;
    }

    const nextOwnerFields = owner
      ? createOwnerFormFieldsFromMember(owner)
      : {
          owner: "",
          ownerAvatarUrl: "",
          ownerEmail: "",
          ownerMemberId: "",
          ownerOpenId: "",
          ownerUnionId: "",
          ownerUserId: ""
        };

    if (owner ? task.ownerMemberId === owner.id : !task.ownerMemberId && !task.owner?.trim()) {
      return true;
    }

    const optimisticTask = {
      ...task,
      ...nextOwnerFields
    };
    let previousData: DashboardData | null = null;

    // 负责人转交同样先本地移动，避免等待数据库写入时卡片停在原列造成“拖了没反应”的错觉。
    setData((current) => {
      previousData = current;

      return current
        ? updateDashboardWithRecordUpdate(current, {
            type: "task",
            record: optimisticTask,
            persisted: false,
            message: current.meta?.message ?? ""
          })
        : current;
    });

    try {
      // 负责人拖拽必须同步成员 ID、头像、邮箱和飞书身份字段；只改 owner 字符串会导致后续通知和成员匹配继续指向旧人。
      const response = await fetchWithAuthRedirect("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          type: "task",
          id: task.id,
          values: serializeCreateValues(optimisticTask)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新任务负责人失败" : "更新任务负责人失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新任务负责人失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      showRecordResultMessage(result.message);

      return true;
    } catch (error) {
      if (previousData) {
        setData(previousData);
      }

      messageApi.error(error instanceof Error ? error.message : "更新任务负责人失败");

      return false;
    }
  }

  async function handleRescheduleProjectCalendarItem(
    item: ProjectCalendarItem,
    change: ProjectCalendarScheduleChange
  ) {
    if (!data) {
      return false;
    }

    if (item.type !== "任务") {
      messageApi.warning("当前只支持拖拽任务改期，版本、里程碑和 Bug 请进入详情编辑。");

      return false;
    }

    const task = data.tasks.find((target) => target.id === item.id);

    if (!task) {
      messageApi.warning("没有找到要改期的任务。");

      return false;
    }

    if (change.owner !== (item.owner || "未分配")) {
      messageApi.warning("拖拽改期暂不支持跨负责人移动，请在任务编辑抽屉里调整负责人。");

      return false;
    }

    if (task.startDate === change.startDate && task.dueDate === change.endDate) {
      return true;
    }

    try {
      // 记录接口会按 values 重建任务，拖拽改期只覆盖日期，其余字段必须沿用原任务。
      const rescheduledTaskValues = {
        ...task,
        dueDate: change.endDate,
        startDate: change.startDate
      };
      const response = await fetchWithAuthRedirect("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          type: "task",
          id: task.id,
          values: serializeCreateValues(rescheduledTaskValues)
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "拖拽更新任务排期失败" : "拖拽更新任务排期失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "拖拽更新任务排期失败");
      }

      const result = payload as CreateRecordResult;

      // 排期拖拽需要保持画布不中断，先乐观更新，再静默刷新校准服务端数据。
      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      void refreshDashboardState();
      showRecordResultMessage(result.message);

      return true;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "拖拽更新任务排期失败");

      return false;
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
      const response = await fetchWithAuthRedirect("/api/records", {
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

  async function handleCreateBugFixJob(bug: BugReport, values: BugAiFixFormValues) {
    try {
      const response = await fetchWithAuthRedirect("/api/bug-fix-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          bugId: bug.id,
          // 前端允许操作者覆盖默认仓库和基准分支，服务端仍会二次校验仓库归属、启用状态和分支名。
          repositoryId: values.repositoryId,
          baseBranch: values.baseBranch.trim()
        })
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "创建 AI 修复任务失败");
      }

      messageApi.success(payload.message || "已创建 AI 修复 MR 任务");
      await refreshDashboardState();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建 AI 修复任务失败");
      throw error;
    }
  }

  async function handleUpdateRequirement(values: Record<string, unknown>) {
    if (!editingRequirement) {
      return;
    }

    setRequirementEditSubmitting(true);

    try {
      const response = await fetchWithAuthRedirect("/api/records", {
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
      const response = await fetchWithAuthRedirect("/api/records", {
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
      const response = await fetchWithAuthRedirect("/api/records", {
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
      const response = await fetchWithAuthRedirect("/api/members", {
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
      const response = await fetchWithAuthRedirect("/api/members", {
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
      const response = await fetchWithAuthRedirect("/api/workspaces", {
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

      const response = await fetchWithAuthRedirect("/api/documents/analyze", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as DocumentAnalyzeResult & { error?: string };
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

  // 侧栏改为 Chat / Studio 两种工作模式：Chat 直接进入 AI 助手，Studio 承载项目管理模块。
  // 这里使用真实模块分组，不照搬参考图中的招聘/题库文案，避免出现看似可用但实际不存在的产品入口。
  const studioMenuGroups: StudioMenuGroup[] = [
    {
      title: "工作台",
      items: [
        { key: "overview", icon: <DashboardOutlined />, label: "工作台" }
      ]
    },
    {
      title: "交付管理",
      items: [
        { key: "projects", icon: <ProjectOutlined />, label: "项目视图" },
        { key: "versionDashboard", icon: <FundProjectionScreenOutlined />, label: "版本大屏" },
        { key: "tasks", icon: <CheckCircleOutlined />, label: "任务看板" }
      ]
    },
    {
      title: "质量与需求",
      items: [
        { key: "bugs", icon: <BugOutlined />, label: "Bug 管理" },
        { key: "requirements", icon: <NodeIndexOutlined />, label: "需求管理" }
      ]
    },
    {
      title: "系统配置",
      items: [
        { key: "members", icon: <TeamOutlined />, label: "成员管理" }
      ]
    }
  ];
  const renderAssistantSessionSidebar = useCallback(
    (props: AssistantSessionSidebarRenderProps) => <AssistantSessionSidebar {...props} />,
    []
  );
  // 顶部账号入口只能展示真实认证上下文或当前成员信息，不能硬编码个人昵称兜底；
  // OAuth 切换时数据还在加载，使用中性文案可以避免 GitHub/Google 登录看起来都变成同一个人。
  const currentAuthUser = data?.meta?.user;
  const currentMember = data?.meta?.currentMember;
  const userName = currentAuthUser?.name || currentAuthUser?.enName || currentAuthUser?.email || currentMember?.name || "用户";
  const userAvatarUrl = currentAuthUser?.avatarUrl || currentMember?.avatarUrl;
  const userInitial = userName.trim().slice(0, 1) || "用";
  // 退出仍由本地 route 清理 Cookie；统一由 SDK 适配层生成 href，避免业务壳散落认证端点路径。
  const logoutHref = getAiPmAuthLogoutHref("/login");
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
  const accountPopoverContent = (
    <AccountPopoverContent
      canCreateWorkspace={Boolean(permissions?.canManageMembers)}
      currentWorkspace={currentWorkspace}
      logoutHref={logoutHref}
      permissionDeniedReason={permissionDeniedReason}
      showLogout={Boolean(data?.meta?.user)}
      userAvatarUrl={userAvatarUrl}
      userInitial={userInitial}
      userName={userName}
      workspaceOptions={workspaceOptions}
      workspaces={data?.workspaces}
      workspaceSelectOpen={workspaceSelectOpen}
      onCreateWorkspace={() => {
        setWorkspaceSelectOpen(false);
        workspaceForm.resetFields();
        setWorkspaceDrawerOpen(true);
      }}
      onSwitchWorkspace={switchWorkspace}
      onWorkspaceSelectOpenChange={setWorkspaceSelectOpen}
    />
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

  function openProjectCalendarItem(item: ProjectCalendarItem) {
    if (!data) {
      return;
    }

    // 项目排期条只存统一日历条目，这里再映射回原始实体，复用现有编辑抽屉和权限校验。
    if (item.type === "任务") {
      const task = data.tasks.find((target) => target.id === item.id);

      if (task) {
        openEditTaskDrawer(task);
        return;
      }
    }

    if (item.type === "Bug") {
      const bug = data.bugs.find((target) => target.id === item.id);

      if (bug) {
        navigateToBugEdit(bug);
        return;
      }
    }

    if (item.type === "版本") {
      const version = requirementVersions.find((target) => target.id === item.id);

      if (version) {
        openEditRequirementVersionDrawer(version);
        return;
      }
    }

    if (item.type === "里程碑") {
      const project = data.projects.find((target) => target.name === item.project);

      if (project) {
        openEditProjectDrawer(project);
        messageApi.info("项目里程碑已迁移到需求版本里维护，这里先打开所属项目。");
        return;
      }
    }

    messageApi.warning("没有找到可编辑的原始记录。");
  }

  function navigateToView(view: AppView) {
    if (typeof window === "undefined") {
      return;
    }

    // 根路径现在是公开首页；工作台内部视图必须固定回到 /workbench，否则切到项目视图会被送到首页。
    window.location.assign(`/workbench${getWorkspaceQueryString(view)}`);
  }

  // 视图切换同步写入 URL 查询参数，让刷新和分享链接能保留当前模块。
  function switchView(view: AppView) {
    if (view === "bugEdit") {
      return;
    }

    setActiveView(view);

    if (typeof window !== "undefined") {
      if (window.location.pathname !== "/workbench") {
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
  // 这里不能在选择值变更后直接把任何 401 都交给全局重定向：账号切换、Cookie 刷新和多接口并发时，
  // 一次短暂失败会被多个请求放大成重复登录。切换失败时先恢复旧工作区，只有确认是会话失效才触发一次登录闸门。
  async function switchWorkspace(workspaceId: string) {
    if (!workspaceId || workspaceId === currentWorkspaceId) {
      setWorkspaceSelectOpen(false);

      return;
    }

    const previousWorkspaceId = currentWorkspaceId;

    setActiveWorkspaceId(workspaceId);
    setSelectedRequirementVersionId(null);
    setProjectCalendarVersionId(allProjectCalendarVersionsValue);
    setWorkspaceSelectOpen(false);

    try {
      const nextData = await fetchDashboardFromApi(workspaceId, {
        redirectOnUnauthorized: false
      });

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
      setActiveWorkspaceId(previousWorkspaceId);
      if (isSessionExpiredError(error)) {
        messageApi.error("登录状态已失效，请重新登录后再切换工作区。");
        redirectToLogin();

        return;
      }

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

  // 大屏下钻到需求版本详情时，先保存选中的版本，再交给需求管理页展示详情。
  function openRequirementVersionFromDashboard(versionId: string) {
    setSelectedRequirementVersionId(versionId);
    switchView("requirements");
  }

  return (
    <ConfigProvider
      theme={getAntdThemeConfig(effectiveTheme)}
    >
      <App>
        {messageContextHolder}
        {weeklyReportExporting ? (
          <div className="pm-global-loading" role="status" aria-live="polite">
            <Spin size="large" />
            <Text strong>AI 正在生成周报...</Text>
            <Text type="secondary">完成后会自动下载 Markdown 文件</Text>
          </div>
        ) : null}
        <Layout className="pm-shell">
          {/* 桌面侧边栏始终输出，由 CSS 媒体查询控制显示，避免 F5 首屏断点未知时布局乱跳。 */}
          <Sider
            width={248}
            collapsed={collapsed}
            breakpoint="lg"
            className={navigationView === "assistant" ? "pm-sider pm-sider--chat" : "pm-sider"}
            trigger={null}
          >
            <WorkbenchSidebar
              accountPopoverContent={accountPopoverContent}
              assistantSessionSidebar={assistantSessionSidebar}
              collapsed={collapsed}
              currentWorkspaceName={currentWorkspace?.name ?? "当前工作区"}
              navigationView={navigationView}
              studioMenuGroups={studioMenuGroups}
              userAvatarUrl={userAvatarUrl}
              userInitial={userInitial}
              userName={userName}
              onSwitchView={switchView}
            />
          </Sider>

          <Layout className="pm-main">
            <Header className="pm-header">
              <Space size={12} className="pm-header-left">
                {!isMobile ? (
                  <Tooltip title={collapsed ? "展开导航" : "收起导航"}>
                    <Button
                      className="pm-nav-toggle-button"
                      type="text"
                      icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                      onClick={() => setCollapsed((current) => !current)}
                    />
                  </Tooltip>
                ) : null}
                <Input
                  className="pm-search"
                  prefix={<SearchOutlined />}
                  placeholder="搜索项目、任务、Bug、需求"
                  aria-label="搜索项目、任务、Bug、需求"
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
                  <Tag color={data.meta.source === "database" ? "green" : data.meta.source === "local" ? "blue" : "default"}>
                    {data.meta.source === "database" ? "MySQL" : data.meta.source === "local" ? "站内数据" : "演示数据"}
                  </Tag>
                ) : null}
                <Tooltip title="查看日程">
                  <Button icon={<CalendarOutlined />} onClick={() => setScheduleOpen(true)} />
                </Tooltip>
                {isMobile ? (
                  <AccountAvatarPopover
                    content={accountPopoverContent}
                    placement="bottomRight"
                    userAvatarUrl={userAvatarUrl}
                    userInitial={userInitial}
                  />
                ) : (
                  <AccountWorkspacePopover
                    content={accountPopoverContent}
                    currentWorkspaceName={currentWorkspace?.name ?? "当前工作区"}
                  />
                )}
                <ThemeToggleButton
                  mode={themeMode}
                  effectiveTheme={effectiveTheme}
                  onClick={cycleMode}
                  showLabel={false}
                />
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
                  { label: "大屏", value: "versionDashboard" },
                  { label: "任务", value: "tasks" },
                  { label: "Bug", value: "bugs" },
                  { label: "需求", value: "requirements" },
                  { label: "助手", value: "assistant" }
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
                  {contentView === "overview" ? (
                    <OverviewView
                      data={data}
                      onGenerateReport={handleGenerateWeeklyReport}
                      onViewBugs={() => switchView("bugs")}
                      onViewTasks={() => switchView("tasks")}
                    />
                  ) : null}
                  {contentView === "projects" ? (
                    <ProjectsView
                      projects={filteredProjects}
                      tasks={data.tasks}
                      versionFilter={projectCalendarVersionId}
                      versionOptions={requirementVersionOptions}
                      versions={requirementVersions}
                      onCreateVersion={() => openCreateDrawer("requirementVersion")}
                      onEditVersion={openEditRequirementVersionDrawer}
                      onOpenCalendarItem={openProjectCalendarItem}
                      onRescheduleCalendarItem={handleRescheduleProjectCalendarItem}
                      onVersionFilterChange={setProjectCalendarVersionId}
                    />
                  ) : null}
                  {contentView === "versionDashboard" ? (
                    <VersionDashboardView
                      bugs={data.bugs}
                      requirements={data.requirements}
                      tasks={data.tasks}
                      versions={requirementVersions}
                      onOpenVersion={openRequirementVersionFromDashboard}
                    />
                  ) : null}
                  {contentView === "tasks" ? (
                    <TasksView
                      tasks={data.tasks}
                      currentUser={data.meta?.user}
                      ownerOptions={ownerOptions}
                      versionOptions={requirementVersionOptions}
                      onCreate={() => openCreateDrawer("task")}
                      onEdit={openEditTaskDrawer}
                      onOwnerChange={handleUpdateTaskOwner}
                      onStageChange={handleUpdateTaskStage}
                    />
                  ) : null}
                  {contentView === "bugs" ? (
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
                  {contentView === "bugEdit" ? (
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
                      projects={data.projects}
                      submitting={bugEditSubmitting}
                      versionOptions={requirementVersionOptions}
                      workspaceId={currentWorkspaceId}
                      onBack={() => navigateToView("bugs")}
                      onDelete={async (bug) => {
                        const deleted = await handleDeleteRecord("bug", bug.id);

                        if (deleted) {
                          navigateToView("bugs");
                        }
                      }}
                      onCreateAiFix={handleCreateBugFixJob}
                      onSubmit={(bug, values) => handleUpdateBug(values, bug, { keepFormOpen: true })}
                    />
                  ) : null}
                  {contentView === "requirements" ? (
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
                  {contentView === "members" ? (
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
                      workspaceId={currentWorkspaceId}
                      onCreateMember={handleCreateMember}
                      onUpdateMember={handleUpdateMember}
                    />
                  ) : null}
                  {contentView === "assistant" ? (
                    <AssistantView
                      currentWorkspaceId={currentWorkspaceId}
                      isMobile={isMobile}
                      onInteractionSettled={refreshDashboardState}
                      onSessionSidebarChange={setAssistantSessionSidebar}
                      sessionSidebarRender={renderAssistantSessionSidebar}
                    />
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
