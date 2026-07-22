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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import type { RequirementFieldAccess } from "@/components/project-management-platform/forms/requirement-fields";
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
import { resolveProjectIdForRecord } from "@/components/project-management-platform/views/projects-view/utils";
import type {
  ProjectDeliveryNode,
  ProjectEffectivePermission,
  ProjectOwnerTransferInput,
  ProjectPermission,
  ProjectPermissionInput
} from "@/components/project-management-platform/views/projects-view/types";
import { RequirementsView } from "@/components/project-management-platform/views/requirements-view";
import { TasksView } from "@/components/project-management-platform/views/tasks-view";
import { VersionDashboardView } from "@/components/project-management-platform/views/version-dashboard-view";
import { getAiPmAuthLogoutHref } from "@/lib/auth/client";
import type { ProjectManagementSnapshot } from "@/lib/project-management/types";
import { createWeeklyReportFileName } from "@/lib/reports/weekly-report";
import { getVersionDeliveryLabelCatalog } from "@/data/project-delivery-labels";
import {
  applyProjectDeepLinkToUrl,
  normalizeProjectDetailTab,
  readProjectDeepLink,
  resolveProjectDeepLink,
  type ProjectDeepLinkState,
  type ProjectDetailTab
} from "@/components/project-management-platform/project-deep-link";
import {
  applyTaskRequirementDeepLinkToUrl,
  readTaskRequirementDeepLink,
  resolveTaskRequirementDeepLink,
  type TaskRequirementDeepLinkState
} from "@/components/project-management-platform/task-requirement-deep-link";

export type { AppView } from "@/components/project-management-platform/types";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;
const feishuPeopleCacheTtlMs = 5 * 60 * 1000;
const dashboardRefreshDebounceMs = 1800;
const projectManagementFailureRetryMs = 30 * 1000;

type TaskRequirementFilter = {
  id: string;
  title: string;
  project?: string;
  projectId: string;
  versionId?: string;
};

// URL 中保留的是经当前工作区校验后的稳定 ID，展示文案则始终从最新需求记录派生。
// 这样需求改名后刷新链接不会丢失筛选，也不会把旧标题当成关系主键。
function createTaskRequirementFilter(
  requirement: Requirement,
  state: TaskRequirementDeepLinkState
): TaskRequirementFilter | null {
  if (!state.requirementId || !state.projectId) {
    return null;
  }

  return {
    id: state.requirementId,
    title: requirement.title,
    project: requirement.project,
    projectId: state.projectId,
    versionId: state.versionId
  };
}

// 同一浏览器会切换工作区，缓存键必须同时包含 workspaceId，避免全局唯一假设失效时复用旧权限。
function getProjectManagementSnapshotCacheKey(workspaceId: string, projectId: string) {
  return `${workspaceId}:${projectId}`;
}

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
  initialWorkspaceId,
  initialProjectId,
  initialProjectVersionId,
  initialProjectDetailTab,
  initialTaskRequirementId,
  initialTaskProjectId,
  initialTaskVersionId
}: {
  initialBugId?: string;
  initialData?: DashboardData;
  initialLoadError?: string;
  initialView?: AppView;
  initialWorkspaceId?: string;
  initialProjectId?: string;
  initialProjectVersionId?: string;
  initialProjectDetailTab?: string;
  initialTaskRequirementId?: string;
  initialTaskProjectId?: string;
  initialTaskVersionId?: string;
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
  const [editingRequirementFieldAccess, setEditingRequirementFieldAccess] = useState<RequirementFieldAccess>({
    design: true,
    governance: true,
    product: true
  });
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
  const [taskRequirementFilter, setTaskRequirementFilter] = useState<TaskRequirementFilter | null>(() => {
    if (initialView !== "tasks" || !initialData || !initialTaskRequirementId) {
      return null;
    }

    // SSR 只负责把有界参数传进工作台；首次状态仍要用服务端已过滤的 dashboard 再校验归属。
    const resolved = resolveTaskRequirementDeepLink({
      requested: {
        requirementId: initialTaskRequirementId,
        projectId: initialTaskProjectId,
        versionId: initialTaskVersionId
      },
      projects: initialData.projects,
      requirements: initialData.requirements,
      versions: initialData.requirementVersions
    });
    const requirement = resolved.requirementId
      ? initialData.requirements.find((candidate) => candidate.id === resolved.requirementId)
      : undefined;

    return requirement ? createTaskRequirementFilter(requirement, resolved) : null;
  });
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId ?? initialData?.projects[0]?.id ?? "");
  const [activeProjectVersionId, setActiveProjectVersionId] = useState<string | undefined>(initialProjectVersionId);
  const [projectDetailTab, setProjectDetailTab] = useState<ProjectDetailTab>(
    normalizeProjectDetailTab(initialProjectDetailTab)
  );
  const [projectManagementSnapshots, setProjectManagementSnapshots] = useState<Map<string, ProjectManagementSnapshot>>(
    () => new Map()
  );
  const [people, setPeople] = useState<FeishuPerson[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [peopleLoadedAt, setPeopleLoadedAt] = useState(0);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [peopleWarning, setPeopleWarning] = useState("");
  const feishuPeopleRequestSeqRef = useRef(0);
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [workspaceSelectOpen, setWorkspaceSelectOpen] = useState(false);
  const [weeklyReportExporting, setWeeklyReportExporting] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialData?.meta?.currentWorkspace?.id ?? initialWorkspaceId ?? "");
  const [assistantSessionSidebar, setAssistantSessionSidebar] = useState<ReactNode | null>(null);
  const initialCacheWorkspaceId = initialData?.meta?.currentWorkspace?.id ?? initialWorkspaceId ?? "";
  const workspaceDashboardCacheRef = useRef<Map<string, DashboardData>>(
    new Map(initialData && initialCacheWorkspaceId ? [[initialCacheWorkspaceId, initialData]] : [])
  );
  const workspaceSwitchSeqRef = useRef(0);
  const dashboardRefreshTimerRef = useRef<number | null>(null);
  const dashboardRefreshSeqRef = useRef(0);
  const projectManagementSnapshotCacheRef = useRef<Map<string, ProjectManagementSnapshot>>(new Map());
  const projectManagementFailuresRef = useRef<Map<string, number>>(new Map());
  const projectManagementRequestSequencesRef = useRef<Map<string, number>>(new Map());
  const projectManagementRequestsRef = useRef<Map<string, {
    promise: Promise<ProjectManagementSnapshot | null>;
    sequence: number;
  }>>(new Map());
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
  const canEditBugs = Boolean(permissions?.canEditBugs);
  const canEditBugsFully = Boolean(permissions?.canEditBugsFully);
  const canDeleteBugs = Boolean(permissions?.canDeleteBugs);
  const permissionDeniedReason = permissions?.deniedReason ?? "当前角色无此操作权限。";
  const currentWorkspace = data?.meta?.currentWorkspace;
  const currentWorkspaceId = currentWorkspace?.id ?? activeWorkspaceId;
  const navigationView = activeView === "bugEdit" ? "bugs" : activeView;
  const contentView = activeView;
  const routeBug = initialBugId ? data?.bugs.find((bug) => bug.id === initialBugId) ?? null : null;

  function cacheDashboardData(nextData: DashboardData, fallbackWorkspaceId = "") {
    const workspaceId = nextData.meta?.currentWorkspace?.id ?? fallbackWorkspaceId;

    if (workspaceId) {
      workspaceDashboardCacheRef.current.set(workspaceId, nextData);
    }

    return workspaceId;
  }

  function replaceWorkbenchUrl(workspaceId: string, view = activeView, clearScopedDeepLink = false) {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", workspaceId);
    url.searchParams.set("view", view);

    if (clearScopedDeepLink || !["projects", "tasks"].includes(view)) {
      // requirement helper 会同时清理两种深链共用的 project/version 参数。
      applyTaskRequirementDeepLinkToUrl(url);
    }

    window.history.replaceState(null, "", url.toString());
  }

  const writeProjectDeepLink = useCallback((
    state: Partial<ProjectDeepLinkState> | undefined,
    mode: "push" | "replace" = "push"
  ) => {
    if (typeof window === "undefined") {
      return;
    }

    const url = applyTaskRequirementDeepLinkToUrl(new URL(window.location.href));

    applyProjectDeepLinkToUrl(url, state);

    url.searchParams.set("view", "projects");
    if (currentWorkspaceId) {
      url.searchParams.set("workspaceId", currentWorkspaceId);
    }
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url.toString());
  }, [currentWorkspaceId]);

  const writeTaskRequirementDeepLink = useCallback((
    state: TaskRequirementDeepLinkState | undefined,
    mode: "push" | "replace" = "push"
  ) => {
    if (typeof window === "undefined") {
      return;
    }

    const url = applyTaskRequirementDeepLinkToUrl(new URL(window.location.href), state);

    url.searchParams.set("view", "tasks");
    if (currentWorkspaceId) {
      url.searchParams.set("workspaceId", currentWorkspaceId);
    }
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url.toString());
  }, [currentWorkspaceId]);

  // 静默刷新用于校准乐观更新结果，失败时保留当前 UI 避免打断用户操作。
  // 这类刷新通常发生在拖拽、保存后的后台同步或助手动作完成后；一次 401/网络抖动不应直接把用户踢到登录页。
  async function refreshDashboardState(workspaceId = currentWorkspaceId) {
    const refreshSeq = dashboardRefreshSeqRef.current + 1;

    dashboardRefreshSeqRef.current = refreshSeq;

    try {
      const nextData = await fetchDashboardFromApi(workspaceId, {
        redirectOnUnauthorized: false
      });

      if (nextData) {
        // 慢网下多个静默刷新可能乱序返回；只允许最后一次刷新落状态，避免旧 dashboard 覆盖刚刚拖拽成功的新状态。
        if (dashboardRefreshSeqRef.current !== refreshSeq) {
          return;
        }

        cacheDashboardData(nextData, workspaceId);
        setData(nextData);
        setActiveWorkspaceId(nextData.meta?.currentWorkspace?.id ?? workspaceId ?? "");
        setLoadError("");
      }
    } catch {
      // Keep the optimistic UI if a silent refresh fails; the next page load will re-sync.
    }
  }

  function scheduleDashboardRefresh(workspaceId = currentWorkspaceId) {
    if (dashboardRefreshTimerRef.current) {
      window.clearTimeout(dashboardRefreshTimerRef.current);
    }

    // 任务看板拖拽是高频交互，保存成功后只需要最终校准一次整份 dashboard；
    // 防抖可以减少 3G/弱网下 PATCH 后连续触发 `/api/dashboard`，也避免单次 401 把静默校准放大成登录跳转。
    dashboardRefreshTimerRef.current = window.setTimeout(() => {
      dashboardRefreshTimerRef.current = null;
      void refreshDashboardState(workspaceId);
    }, dashboardRefreshDebounceMs);
  }

  useEffect(() => () => {
    if (dashboardRefreshTimerRef.current) {
      window.clearTimeout(dashboardRefreshTimerRef.current);
    }
  }, []);

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
          cacheDashboardData(nextData, initialWorkspaceId);
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

  const loadFeishuPeople = useCallback(
    async (options: { force?: boolean } = {}) => {
      const shouldUseCache =
        peopleLoaded &&
        !options.force &&
        peopleLoadedAt > 0 &&
        Date.now() - peopleLoadedAt < feishuPeopleCacheTtlMs;

      if (options.force) {
        // 强制刷新通常来自“添加成员/通知配置”的即时操作。先清掉旧联系人，
        // 避免飞书授权或服务端展开逻辑刚调整后，抽屉里还短暂展示上一轮只读到的少量成员。
        setPeople([]);
        setPeopleError("");
        setPeopleWarning("");
      }

      // 通讯录曾经因为飞书权限/分页问题返回过少量联系人；这里保留短缓存只为避免切页反复打外部接口，
      // 添加成员或通知配置入口会强制刷新，防止旧的“部分结果”一直卡在选择框里。
      if ((!options.force && peopleLoading) || shouldUseCache) {
        return;
      }

      const requestSeq = feishuPeopleRequestSeqRef.current + 1;

      feishuPeopleRequestSeqRef.current = requestSeq;
      setPeopleLoading(true);

      try {
        const response = await fetchWithAuthRedirect("/api/feishu/users", undefined, {
          redirectOnUnauthorized: false
        });
        const payload = (await response.json()) as PeopleResponse;

        if (!response.ok) {
          throw new Error(payload.error || "读取飞书通讯录失败");
        }

        // 成员页进入时的懒加载可能和“添加成员”的强制刷新并发；只允许最后一次请求落状态，
        // 防止慢返回的旧请求把最新 83 人通讯录覆盖成历史缓存里的少量成员。
        if (feishuPeopleRequestSeqRef.current !== requestSeq) {
          return;
        }

        setPeople(payload.people ?? []);
        setPeopleError("");
        // 飞书通讯录可能返回“部分可用”：例如授权范围里有用户组，但应用还缺用户组读取权限。
        // 这类问题不应该禁用已读到的人，只在成员页提示管理员去补权限。
        setPeopleWarning(payload.warning ?? "");
      } catch (error) {
        if (feishuPeopleRequestSeqRef.current !== requestSeq) {
          return;
        }

        setPeopleError(error instanceof Error ? error.message : "读取飞书通讯录失败");
        setPeopleWarning("");
      } finally {
        if (feishuPeopleRequestSeqRef.current !== requestSeq) {
          return;
        }

        setPeopleLoading(false);
        setPeopleLoaded(true);
        setPeopleLoadedAt(Date.now());
      }
    },
    [peopleLoaded, peopleLoadedAt, peopleLoading]
  );

  useEffect(() => {
    // 飞书通讯录只服务于成员管理里的联系人选择；工作台、项目和任务首屏不需要它，
    // 延迟到进入成员页后再加载可以少一次认证读取和一次外部通讯录请求。
    if (activeView !== "members") {
      return;
    }

    // React 19 的 lint 会阻止 effect 同步触发 setState；通讯录本来就是外部系统同步，
    // 延后一拍执行可以保留懒加载行为，也避免进入成员页时形成级联渲染。
    const loadTimer = window.setTimeout(() => {
      void loadFeishuPeople();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [activeView, loadFeishuPeople]);

  const filteredProjects = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.projects;
  }, [data]);
  useEffect(() => {
    if (activeView !== "projects" || !data) {
      return;
    }

    const resolved = resolveProjectDeepLink({
      requested: {
        projectId: activeProjectId || undefined,
        versionId: activeProjectVersionId,
        detailTab: projectDetailTab
      },
      projects: data.projects,
      versions: data.requirementVersions,
      fallbackProjectId: data.projects[0]?.id
    });
    const stateMatches = resolved.projectId === (activeProjectId || undefined)
      && resolved.versionId === activeProjectVersionId
      && resolved.detailTab === projectDetailTab;
    const urlState = typeof window === "undefined" ? resolved : readProjectDeepLink(window.location.search);
    const urlMatches = urlState.projectId === resolved.projectId
      && urlState.versionId === resolved.versionId
      && urlState.detailTab === resolved.detailTab;

    if (stateMatches && urlMatches) {
      return;
    }

    // 非法 project/version 深链只能回退到当前工作区内的稳定 ID，并 replace 掉坏 URL 避免回退重复命中。
    const syncTimer = window.setTimeout(() => {
      setActiveProjectId(resolved.projectId ?? "");
      setActiveProjectVersionId(resolved.versionId);
      setProjectDetailTab(resolved.detailTab);
      writeProjectDeepLink(resolved.projectId ? resolved : undefined, "replace");
    }, 0);

    return () => window.clearTimeout(syncTimer);
  }, [
    activeProjectId,
    activeProjectVersionId,
    activeView,
    data,
    projectDetailTab,
    writeProjectDeepLink
  ]);

  useEffect(() => {
    if (activeView !== "tasks" || !data) {
      return;
    }

    const urlState = readTaskRequirementDeepLink(window.location.search);
    const resolved = resolveTaskRequirementDeepLink({
      requested: urlState,
      projects: data.projects,
      requirements: data.requirements,
      versions: data.requirementVersions
    });
    const requirement = resolved.requirementId
      ? data.requirements.find((candidate) => candidate.id === resolved.requirementId)
      : undefined;
    const nextFilter = requirement ? createTaskRequirementFilter(requirement, resolved) : null;
    const stateMatches = taskRequirementFilter?.id === nextFilter?.id
      && taskRequirementFilter?.title === nextFilter?.title
      && taskRequirementFilter?.project === nextFilter?.project
      && taskRequirementFilter?.projectId === nextFilter?.projectId
      && taskRequirementFilter?.versionId === nextFilter?.versionId;
    const urlMatches = urlState.requirementId === resolved.requirementId
      && urlState.projectId === resolved.projectId
      && urlState.versionId === resolved.versionId;

    if (stateMatches && urlMatches) {
      return;
    }

    // 刷新数据后需求/版本可能被删除或权限不再可见；replace 清理坏参数，避免回退时重复命中失效条目。
    const syncTimer = window.setTimeout(() => {
      setTaskRequirementFilter(nextFilter);
      writeTaskRequirementDeepLink(nextFilter ? resolved : undefined, "replace");
    }, 0);

    return () => window.clearTimeout(syncTimer);
  }, [activeView, data, taskRequirementFilter, writeTaskRequirementDeepLink]);

  useEffect(() => {
    if (!data) {
      return;
    }

    function replayWorkbenchDeepLink() {
      const url = new URL(window.location.href);
      const requestedView = url.searchParams.get("view");
      const nextView = requestedView
        && requestedView !== "bugEdit"
        && validViews.has(requestedView as AppView)
        ? requestedView as AppView
        : "overview";
      const dashboardWorkspaceId = data!.meta?.currentWorkspace?.id;
      const originalUrl = url.toString();

      url.searchParams.set("view", nextView);

      if (!dashboardWorkspaceId || url.searchParams.get("workspaceId") !== dashboardWorkspaceId) {
        // 浏览器后退可能命中另一工作区的历史条目；当前 dashboard 未切换前不得拿其 ID 跨租户回放。
        if (dashboardWorkspaceId) {
          url.searchParams.set("workspaceId", dashboardWorkspaceId);
        }

        applyTaskRequirementDeepLinkToUrl(url);
        setTaskRequirementFilter(null);

        if (nextView === "projects") {
          const fallbackProject = resolveProjectDeepLink({
            requested: readProjectDeepLink(url.search),
            projects: data!.projects,
            versions: data!.requirementVersions,
            fallbackProjectId: data!.projects[0]?.id
          });

          setActiveProjectId(fallbackProject.projectId ?? "");
          setActiveProjectVersionId(fallbackProject.versionId);
          setProjectDetailTab(fallbackProject.detailTab);
          applyProjectDeepLinkToUrl(url, fallbackProject.projectId ? fallbackProject : undefined);
        }

        setActiveView(nextView);
        window.history.replaceState(null, "", url.toString());

        return;
      }

      if (nextView === "projects") {
        const resolved = resolveProjectDeepLink({
          requested: readProjectDeepLink(url.search),
          projects: data!.projects,
          versions: data!.requirementVersions,
          fallbackProjectId: data!.projects[0]?.id
        });

        setTaskRequirementFilter(null);
        setActiveProjectId(resolved.projectId ?? "");
        setActiveProjectVersionId(resolved.versionId);
        setProjectDetailTab(resolved.detailTab);
        applyTaskRequirementDeepLinkToUrl(url);
        applyProjectDeepLinkToUrl(url, resolved.projectId ? resolved : undefined);
      } else if (nextView === "tasks") {
        const resolved = resolveTaskRequirementDeepLink({
          requested: readTaskRequirementDeepLink(url.search),
          projects: data!.projects,
          requirements: data!.requirements,
          versions: data!.requirementVersions
        });
        const requirement = resolved.requirementId
          ? data!.requirements.find((candidate) => candidate.id === resolved.requirementId)
          : undefined;

        setTaskRequirementFilter(requirement ? createTaskRequirementFilter(requirement, resolved) : null);
        applyTaskRequirementDeepLinkToUrl(url, requirement ? resolved : undefined);
      } else {
        // 非任务历史条目必须清掉隐藏筛选，之后前进到任务条目时再从它自己的 URL 精确恢复。
        setTaskRequirementFilter(null);
        applyTaskRequirementDeepLinkToUrl(url);
      }

      setActiveView(nextView);

      if (url.toString() !== originalUrl) {
        window.history.replaceState(null, "", url.toString());
      }
    }

    window.addEventListener("popstate", replayWorkbenchDeepLink);

    return () => window.removeEventListener("popstate", replayWorkbenchDeepLink);
  }, [data]);

  // 项目管理页使用受控项目选择；项目被删除或切换工作区后自动回退到当前数据里的首个项目，
  // 不额外在 effect 中同步 state，避免 React 19 下产生级联渲染。
  const resolvedActiveProject = useMemo(
    () => filteredProjects.find((project) => project.id === activeProjectId) ?? filteredProjects[0],
    [activeProjectId, filteredProjects]
  );
  const resolvedActiveProjectId = resolvedActiveProject?.id ?? "";
  const canManageWorkspaceProjects = Boolean(permissions?.canManageMembers);
  const taskScopedProjectIds = useMemo(() => {
    if (!data) {
      return [];
    }

    if (taskRequirementFilter) {
      const filteredProjectId = resolveProjectIdForRecord(taskRequirementFilter, filteredProjects);

      return filteredProjectId ? [filteredProjectId] : [];
    }

    // 直接进入任务页会混合多个项目；按稳定 ID 去重，历史名称仅由共享 helper 在唯一时回退。
    return Array.from(new Set(
      data.tasks
        .map((task) => resolveProjectIdForRecord(task, filteredProjects))
        .filter((projectId): projectId is string => Boolean(projectId))
    ));
  }, [data, filteredProjects, taskRequirementFilter]);
  const requirementScopedProjectIds = useMemo(
    () => activeView === "requirements" ? filteredProjects.map((project) => project.id) : [],
    [activeView, filteredProjects]
  );
  const bugScopedProjectIds = useMemo(() => {
    if (!data || !["bugs", "bugEdit"].includes(activeView)) {
      return [];
    }

    const scopedBugs = activeView === "bugEdit" && routeBug ? [routeBug] : data.bugs;

    return Array.from(new Set(
      scopedBugs
        .map((bug) => resolveProjectIdForRecord(bug, filteredProjects))
        .filter((projectId): projectId is string => Boolean(projectId))
    ));
  }, [activeView, data, filteredProjects, routeBug]);

  const loadProjectManagementSnapshot = useCallback(async (
    projectId: string,
    options: { force?: boolean } = {}
  ) => {
    if (!projectId || !currentWorkspaceId) {
      return null;
    }

    const workspaceId = currentWorkspaceId;
    const cacheKey = getProjectManagementSnapshotCacheKey(workspaceId, projectId);

    if (!options.force) {
      const cachedSnapshot = projectManagementSnapshotCacheRef.current.get(cacheKey);

      if (cachedSnapshot) {
        return cachedSnapshot;
      }

      // 同一项目失败后保持保守只读，不因组件重渲染持续轰炸治理接口；显式业务变更会用 force 重试。
      const failedAt = projectManagementFailuresRef.current.get(cacheKey);

      if (failedAt) {
        if (Date.now() - failedAt < projectManagementFailureRetryMs) {
          return null;
        }

        projectManagementFailuresRef.current.delete(cacheKey);
      }

      const inFlightRequest = projectManagementRequestsRef.current.get(cacheKey);

      if (inFlightRequest) {
        return inFlightRequest.promise;
      }
    } else {
      projectManagementFailuresRef.current.delete(cacheKey);
    }

    const sequence = (projectManagementRequestSequencesRef.current.get(cacheKey) ?? 0) + 1;
    projectManagementRequestSequencesRef.current.set(cacheKey, sequence);

    const request = (async () => {
      try {
        const url = new URL("/api/project-management", window.location.origin);

        url.searchParams.set("workspaceId", workspaceId);
        url.searchParams.set("projectId", projectId);
        const response = await fetchWithAuthRedirect(url.toString(), undefined, {
          redirectOnUnauthorized: false
        });
        const payload = (await response.json()) as ProjectManagementSnapshot & { error?: string };

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "读取项目权限与动态失败");
        }

        if (projectManagementRequestSequencesRef.current.get(cacheKey) === sequence) {
          projectManagementFailuresRef.current.delete(cacheKey);
          projectManagementSnapshotCacheRef.current.set(cacheKey, payload);
          setProjectManagementSnapshots((currentSnapshots) => {
            const nextSnapshots = new Map(currentSnapshots);
            nextSnapshots.set(cacheKey, payload);

            return nextSnapshots;
          });
        }

        return payload;
      } catch {
        if (projectManagementRequestSequencesRef.current.get(cacheKey) === sequence) {
          // 强制刷新失败时旧快照也可能已经过期；移除它比继续沿用潜在过授权更安全。
          projectManagementFailuresRef.current.set(cacheKey, Date.now());
          projectManagementSnapshotCacheRef.current.delete(cacheKey);
          setProjectManagementSnapshots((currentSnapshots) => {
            if (!currentSnapshots.has(cacheKey)) {
              return currentSnapshots;
            }

            const nextSnapshots = new Map(currentSnapshots);
            nextSnapshots.delete(cacheKey);

            return nextSnapshots;
          });
        }

        return null;
      } finally {
        if (projectManagementRequestsRef.current.get(cacheKey)?.sequence === sequence) {
          projectManagementRequestsRef.current.delete(cacheKey);
        }
      }
    })();

    projectManagementRequestsRef.current.set(cacheKey, { promise: request, sequence });

    return request;
  }, [currentWorkspaceId]);

  async function refreshProjectManagementSnapshotsForRecords(
    records: Array<{ projectId?: string; project?: string } | null | undefined>,
    explicitProjectIds: Array<string | null | undefined> = []
  ) {
    const projectIds = new Set(explicitProjectIds.filter((projectId): projectId is string => Boolean(projectId)));

    records.forEach((record) => {
      if (!record) {
        return;
      }

      const projectId = resolveProjectIdForRecord(record, filteredProjects);

      if (projectId) {
        projectIds.add(projectId);
      }
    });

    // 任何项目内写操作都可能改变活动流、责任派生角色或有效权限；旧/新归属项目都必须强制校准。
    await Promise.all(Array.from(projectIds, (projectId) =>
      loadProjectManagementSnapshot(projectId, { force: true })
    ));
  }

  useEffect(() => {
    if (activeView !== "projects" || !resolvedActiveProjectId) {
      return;
    }

    // 项目治理数据是项目页的第二阶段数据，延后一拍读取以保证工作台主数据优先完成渲染。
    const loadTimer = window.setTimeout(() => {
      void loadProjectManagementSnapshot(resolvedActiveProjectId);
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [activeView, data, loadProjectManagementSnapshot, resolvedActiveProjectId]);

  useEffect(() => {
    if (activeView !== "tasks" || canManageWorkspaceProjects || !taskScopedProjectIds.length) {
      return;
    }

    // 任务页可能一次混合多个项目；并发预取所有缺失快照，load helper 会按项目去重并隔离竞态。
    const loadTimer = window.setTimeout(() => {
      void Promise.all(taskScopedProjectIds.map((projectId) => loadProjectManagementSnapshot(projectId)));
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [activeView, canManageWorkspaceProjects, loadProjectManagementSnapshot, taskScopedProjectIds]);

  useEffect(() => {
    if (activeView !== "requirements" || canManageWorkspaceProjects || !requirementScopedProjectIds.length) {
      return;
    }

    // 需求主视图同时展示多项目版本卡片，预读各项目快照才能做逐版本和逐需求判权。
    const loadTimer = window.setTimeout(() => {
      void Promise.all(
        requirementScopedProjectIds.map((projectId) => loadProjectManagementSnapshot(projectId))
      );
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [activeView, canManageWorkspaceProjects, loadProjectManagementSnapshot, requirementScopedProjectIds]);

  useEffect(() => {
    if (!["bugs", "bugEdit"].includes(activeView) || canManageWorkspaceProjects || !bugScopedProjectIds.length) {
      return;
    }

    const loadTimer = window.setTimeout(() => {
      void Promise.all(bugScopedProjectIds.map((projectId) => loadProjectManagementSnapshot(projectId)));
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [activeView, bugScopedProjectIds, canManageWorkspaceProjects, loadProjectManagementSnapshot]);

  const activeProjectManagementSnapshot = currentWorkspaceId && resolvedActiveProjectId
    ? projectManagementSnapshots.get(
        getProjectManagementSnapshotCacheKey(currentWorkspaceId, resolvedActiveProjectId)
      ) ?? null
    : null;
  const activeProjectCapabilities = activeProjectManagementSnapshot?.capabilities;
  const activeProjectActorAccess = activeProjectManagementSnapshot?.actorAccess;
  const canUpdateActiveProject = canManageWorkspaceProjects || Boolean(activeProjectCapabilities?.canUpdateProject);
  const canDeleteActiveProject = canManageWorkspaceProjects || Boolean(activeProjectCapabilities?.canDeleteProject);
  const canCreateActiveRequirements = canManageWorkspaceProjects || Boolean(
    activeProjectCapabilities
    && activeProjectActorAccess
    && (
      activeProjectCapabilities.canManageMembers
      || activeProjectCapabilities.canCreatePlanUnit
      || activeProjectActorAccess.legacyProductRole
      || activeProjectActorAccess.functionalRoles.some((role) =>
        role.roleKey === "product_owner" && role.scopeType === "project"
      )
    )
  );
  const canCreateActivePlanUnits = canManageWorkspaceProjects || Boolean(activeProjectCapabilities?.canManageMembers);
  const canDeleteActivePlanUnits = canManageWorkspaceProjects || Boolean(activeProjectCapabilities?.canManageMembers);
  const canManageActiveProjectMembers = canManageWorkspaceProjects || Boolean(activeProjectCapabilities?.canManageMembers);
  const canTransferActiveProjectOwner = canManageWorkspaceProjects || Boolean(activeProjectCapabilities?.canTransferOwner);
  const canCreateAnyPlanUnit = canManageWorkspaceProjects || Boolean(
    currentWorkspaceId
    && requirementScopedProjectIds.some((projectId) =>
      projectManagementSnapshots.get(
        getProjectManagementSnapshotCacheKey(currentWorkspaceId, projectId)
      )?.capabilities.canManageMembers
    )
  );

  function getProjectManagementSnapshotForRecord(record: { projectId?: string; project?: string }) {
    const projectId = resolveProjectIdForRecord(record, filteredProjects);

    if (!projectId || !currentWorkspaceId) {
      return null;
    }

    // 只读 state Map 触发 React 重渲染；缓存 ref 只服务请求去重，判权必须读取当前渲染快照。
    return projectManagementSnapshots.get(
      getProjectManagementSnapshotCacheKey(currentWorkspaceId, projectId)
    ) ?? null;
  }

  function canArchiveProjectForActor(project: Project) {
    if (canManageWorkspaceProjects) {
      return true;
    }

    if (!currentWorkspaceId) {
      return false;
    }

    return Boolean(projectManagementSnapshots.get(
      getProjectManagementSnapshotCacheKey(currentWorkspaceId, project.id)
    )?.capabilities.canArchiveProject);
  }

  function hasProjectWriteAccessForRecord(record: { projectId?: string; project?: string }) {
    if (canManageWorkspaceProjects) {
      return true;
    }

    const hasProjectIdentity = Boolean(record.projectId || record.project?.trim());

    if (!hasProjectIdentity) {
      return true;
    }

    const snapshot = getProjectManagementSnapshotForRecord(record);

    return Boolean(
      snapshot?.capabilities.canManageMembers
      || (snapshot?.actorAccess.accessLevel && ["admin", "member"].includes(snapshot.actorAccess.accessLevel))
    );
  }

  function canEditBugForActor(bug: BugReport) {
    return canEditBugs && hasProjectWriteAccessForRecord(bug);
  }

  function canDeleteBugForActor(bug: BugReport) {
    return canDeleteBugs && hasProjectWriteAccessForRecord(bug);
  }

  async function ensureProjectManagementSnapshotForRecord(record: { projectId?: string; project?: string }) {
    const cachedSnapshot = getProjectManagementSnapshotForRecord(record);

    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    const projectId = resolveProjectIdForRecord(record, filteredProjects);

    return projectId ? loadProjectManagementSnapshot(projectId) : null;
  }

  function getRequirementFieldAccess(
    requirement: Requirement,
    snapshot: ProjectManagementSnapshot | null
  ): RequirementFieldAccess {
    if (canManageWorkspaceProjects) {
      return { design: true, governance: true, product: true };
    }

    if (!snapshot) {
      return { design: false, governance: false, product: false };
    }

    const targetVersion = data?.requirementVersions.find((version) =>
      requirement.versionId
        ? version.id === requirement.versionId
        : version.name === requirement.versionName
    );
    const isVersionOwner = Boolean(
      targetVersion?.ownerMemberId
      && targetVersion.ownerMemberId === snapshot.actorAccess.memberId
    );
    const isProjectManager = snapshot.capabilities.canManageMembers;
    const canUseScopedRequirementRole = snapshot.capabilities.canManageRequirements;
    const targetVersionId = targetVersion?.id || requirement.versionId;
    const hasScopedRole = (roleKey: "product_owner" | "design_owner") =>
      snapshot.actorAccess.functionalRoles.some((role) =>
        role.roleKey === roleKey
        && (role.scopeType === "project"
          || (role.scopeType === "requirement" && role.scopeId === requirement.id)
          || (role.scopeType === "plan_unit" && Boolean(targetVersionId) && role.scopeId === targetVersionId))
      );
    const legacyProduct = Boolean(snapshot.actorAccess.legacyProductRole);
    const governance = isProjectManager || isVersionOwner;

    if (legacyProduct && canUseScopedRequirementRole) {
      return { design: true, governance: true, product: true };
    }

    // one2all 将需求编辑拆为产品、设计和治理三组字段，避免单一 update 权限让参与者越权改排期或开发分工。
    return {
      governance,
      product: governance || (canUseScopedRequirementRole && (legacyProduct || hasScopedRole("product_owner"))),
      design: governance || (canUseScopedRequirementRole && hasScopedRole("design_owner"))
    };
  }

  function canManageRequirementWithSnapshot(
    requirement: Requirement,
    action: "update" | "delete",
    snapshot: ProjectManagementSnapshot
  ) {
    if (action === "delete") {
      return snapshot.capabilities.canManageMembers;
    }

    return Object.values(getRequirementFieldAccess(requirement, snapshot)).some(Boolean);
  }

  function canManageActiveProjectRequirement(
    requirement: Requirement,
    action: "update" | "delete"
  ) {
    if (canManageWorkspaceProjects) {
      return true;
    }

    const snapshot = getProjectManagementSnapshotForRecord(requirement);

    if (!snapshot) {
      return false;
    }

    return canManageRequirementWithSnapshot(requirement, action, snapshot);
  }

  function canManageActiveProjectTask(task: Task) {
    if (canManageWorkspaceProjects) {
      return true;
    }

    const snapshot = getProjectManagementSnapshotForRecord(task);

    if (!snapshot) {
      return false;
    }

    return canManageTaskWithSnapshot(task, snapshot);
  }

  function canManageTaskWithSnapshot(task: Task, snapshot: ProjectManagementSnapshot) {
    if (snapshot.capabilities.canManageMembers) {
      return true;
    }

    const ownsTask = Boolean(
      task.ownerMemberId
      && snapshot.actorAccess.memberId
      && task.ownerMemberId === snapshot.actorAccess.memberId
    );
    const taskVersionId = task.versionId
      || data?.requirements.find((requirement) => requirement.id === task.requirementId)?.versionId;
    const participatesInRequirement = snapshot.actorAccess.functionalRoles.some((role) =>
      ["product_owner", "design_owner", "developer"].includes(role.roleKey)
      && (role.scopeType === "project"
        || (role.scopeType === "requirement" && role.scopeId === task.requirementId)
        || (role.scopeType === "plan_unit" && Boolean(taskVersionId) && role.scopeId === taskVersionId))
    );

    return ownsTask || participatesInRequirement;
  }

  function canDeleteTaskForActor(task: Task) {
    if (canManageWorkspaceProjects) {
      return true;
    }

    const snapshot = getProjectManagementSnapshotForRecord(task);

    // one2all 的任务经办人/需求参与者可更新但不可删除；删除仅留给项目管理者。
    return Boolean(snapshot?.capabilities.canManageMembers);
  }

  function canManageVersionForActor(
    version: RequirementVersion,
    action: "update" | "createRequirement" | "createSubVersion" | "breakdown" | "delete"
  ) {
    if (canManageWorkspaceProjects) {
      return true;
    }

    const snapshot = getProjectManagementSnapshotForRecord(version);

    if (!snapshot) {
      return false;
    }

    return canManageVersionWithSnapshot(version, action, snapshot);
  }

  function canManageVersionWithSnapshot(
    version: RequirementVersion,
    action: "update" | "createRequirement" | "createSubVersion" | "breakdown" | "delete",
    snapshot: ProjectManagementSnapshot
  ) {
    const isProjectManager = snapshot.capabilities.canManageMembers;
    const ownerAction = action === "update" || action === "createRequirement" || action === "breakdown";
    const isVersionOwner = ownerAction && Boolean(
      snapshot.actorAccess.memberId
      && version.ownerMemberId === snapshot.actorAccess.memberId
    );
    const roleAppliesToVersion = (roleKey: "delivery_manager" | "product_owner") =>
      snapshot.actorAccess.functionalRoles.some((role) =>
        role.roleKey === roleKey
        && (role.scopeType === "project"
          || (role.scopeType === "plan_unit" && role.scopeId === version.id))
      );
    const isScopedDeliveryManager = roleAppliesToVersion("delivery_manager");

    if (action === "delete" || action === "createSubVersion") {
      // plan_unit 职能角色不可上溢到层级创建或删除。
      return isProjectManager;
    }

    if (action === "createRequirement") {
      return isProjectManager
        || isVersionOwner
        || isScopedDeliveryManager
        || Boolean(snapshot.actorAccess.legacyProductRole)
        || roleAppliesToVersion("product_owner");
    }

    // 交付总负责人和 manual delivery_manager 只获得目标版本更新/拆解权，不外溢其它 plan unit。
    return isProjectManager || isVersionOwner || isScopedDeliveryManager;
  }

  function canCreateTaskForRequirement(requirement?: Requirement) {
    if (canManageWorkspaceProjects) {
      return true;
    }

    if (!requirement) {
      return false;
    }

    const snapshot = getProjectManagementSnapshotForRecord(requirement);

    if (!snapshot) {
      return false;
    }

    if (snapshot.capabilities.canManageMembers) {
      return true;
    }

    if (snapshot.actorAccess.accessLevel !== "member") {
      return false;
    }

    // 新建和更新是两套规则：不能把“把自己设为经办人”伪装成已有任务的 assignee 更新权。
    return snapshot.actorAccess.functionalRoles.some((role) =>
      ["product_owner", "developer"].includes(role.roleKey)
      && (role.scopeType === "project"
        || (role.scopeType === "requirement" && role.scopeId === requirement.id)
        || (role.scopeType === "plan_unit" && Boolean(requirement.versionId) && role.scopeId === requirement.versionId))
    );
  }

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
    canDeleteRequirements: (requirement) => canManageActiveProjectRequirement(requirement, "delete"),
    canEditRequirements: (requirement) => canManageActiveProjectRequirement(requirement, "update"),
    permissionDeniedReason,
    onDelete: (requirementId) => handleDeleteRecord("requirement", requirementId),
    onEdit: openEditRequirementDrawer,
    onOpenTasks: openRequirementTasks
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

  async function requestProjectManagementMutation(
    method: "POST" | "PATCH" | "DELETE",
    values: Record<string, unknown>
  ) {
    const response = await fetchWithAuthRedirect("/api/project-management", {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        workspaceId: currentWorkspaceId,
        ...values
      })
    });
    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error || "更新项目治理信息失败");
    }

    return payload;
  }

  async function handleSaveProjectPermission(input: ProjectPermissionInput) {
    try {
      // 需求责任自动生成的角色只由服务端派生；前端保存时仅提交可编辑的手工角色，
      // 避免需求负责人变化后遗留一份无法自动回收的伪自动授权。
      const functionalRoles = input.functionalRoles.filter((role) => role.sourceType === "manual");

      if (!input.permissionId) {
        const memberIds = input.memberIds?.length
          ? input.memberIds
          : input.memberId ? [input.memberId] : [];

        if (!memberIds.length) {
          throw new Error("请至少选择一名项目成员");
        }

        await requestProjectManagementMutation("POST", {
          action: "members",
          projectId: input.projectId,
          memberIds,
          accessLevel: input.accessLevel,
          functionalRoles
        });
      } else {
        if (!input.memberId) {
          throw new Error("缺少待编辑的项目成员");
        }

        // 已有显式权限行才走 PATCH；新增成员已由 POST 在一个事务中写入初始访问级别和角色。
        await requestProjectManagementMutation("PATCH", {
          action: "member",
          projectId: input.projectId,
          permissionId: input.permissionId,
          memberId: input.memberId,
          accessLevel: input.accessLevel,
          functionalRoles
        });
      }
      await loadProjectManagementSnapshot(input.projectId, { force: true });

      return true;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "保存项目成员权限失败");

      return false;
    }
  }

  async function handleRemoveProjectPermission(permission: ProjectPermission) {
    try {
      await requestProjectManagementMutation("DELETE", {
        projectId: permission.projectId,
        permissionId: permission.id,
        memberId: permission.memberId
      });
      await loadProjectManagementSnapshot(permission.projectId, { force: true });

      return true;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "移除项目成员失败");

      return false;
    }
  }

  async function handleLoadEffectivePermission(permission: ProjectPermission): Promise<ProjectEffectivePermission | void> {
    const snapshot = await loadProjectManagementSnapshot(permission.projectId, { force: true });
    const refreshedPermission = snapshot?.permissions.find((item) => item.memberId === permission.memberId);

    return refreshedPermission?.effectivePermission ?? permission.effectivePermission;
  }

  async function handleTransferProjectOwner(input: ProjectOwnerTransferInput) {
    try {
      await requestProjectManagementMutation("POST", {
        action: "transferOwner",
        ...input
      });
      await Promise.all([
        refreshDashboardState(),
        loadProjectManagementSnapshot(input.projectId, { force: true })
      ]);

      return true;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "项目负责人交接失败");

      return false;
    }
  }

  async function handleUpdateVersionDeliveryNodes(
    version: RequirementVersion,
    deliveryNodes: ProjectDeliveryNode[]
  ) {
    if (!canManageVersionForActor(version, "update")) {
      messageApi.warning(permissionDeniedReason);

      return false;
    }

    const milestones = deliveryNodes.map((node, index) => {
      const previous = version.milestones.find((milestone) => milestone.id === node.id) ?? version.milestones[index];
      const member = node.ownerMemberId
        ? ownerOptions.find((item) => item.id === node.ownerMemberId)
        : undefined;
      const ownerFields = member
        ? createOwnerFormFieldsFromMember(member)
        : {
            // ownerMemberId 为空表示用户主动清空，不能再用旧节点负责人兜底回填。
            owner: node.owner ?? previous?.owner ?? "",
            ownerMemberId: node.ownerMemberId
          };

      return {
        ...previous,
        ...ownerFields,
        id: node.id || previous?.id || `milestone-${version.id}-${index + 1}`,
        title: node.label,
        type: previous?.type || node.label,
        status: node.actualCompletedDate ? "已完成" : previous?.status || "未开始",
        dueDate: node.plannedDate || node.dueDate || previous?.dueDate || version.releaseDate,
        actualCompletedDate: node.actualCompletedDate || undefined,
        note: previous?.note || "交付节点快捷更新。"
      };
    });
    const versionProjectId = resolveProjectIdForRecord(version, filteredProjects);
    const legacyProjectCatalog = filteredProjects.find((project) => project.id === versionProjectId)?.deliveryLabelCatalog;

    try {
      const response = await fetchWithAuthRedirect("/api/records", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          type: "requirementVersion",
          id: version.id,
          values: serializeCreateValues({
            ...version,
            deliveryLabelCatalog: getVersionDeliveryLabelCatalog(version, legacyProjectCatalog),
            milestones
          })
        })
      });
      const payload = (await response.json()) as CreateRecordResult | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "更新交付节点失败" : "更新交付节点失败");
      }

      if ("error" in payload) {
        throw new Error(payload.error || "更新交付节点失败");
      }

      const result = payload as CreateRecordResult;

      setData((current) => (current ? updateDashboardWithRecordUpdate(current, result) : current));
      await refreshProjectManagementSnapshotsForRecords([
        version,
        result.record as { projectId?: string; project?: string }
      ], [version.projectId || resolvedActiveProjectId]);

      return true;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新交付节点失败");

      return false;
    }
  }

  // 新建抽屉统一在打开前合并默认值和上下文值，减少各入口重复设置字段。
  function openCreateDrawer(
    type: DashboardEntityType,
    initialValues: Record<string, unknown> = {},
    options: { projectPermissionGranted?: boolean } = {}
  ) {
    const canCreateRequirementInContext = options.projectPermissionGranted ?? canCreateActiveRequirements;
    const lacksProjectPermission = (
      type === "requirement" && options.projectPermissionGranted === false
    ) || (
      activeView === "projects" && (
        (type === "requirement" && !canCreateRequirementInContext)
        || (type === "requirementVersion" && !canCreateActivePlanUnits)
      )
    );

    if (lacksProjectPermission) {
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

  async function openEditProjectDrawer(project: Project) {
    let canEditTarget = canManageWorkspaceProjects || Boolean(
      currentWorkspaceId
      && projectManagementSnapshots.get(
        getProjectManagementSnapshotCacheKey(currentWorkspaceId, project.id)
      )?.capabilities.canUpdateProject
    );

    if (!canEditTarget) {
      const snapshot = await loadProjectManagementSnapshot(project.id);

      canEditTarget = Boolean(snapshot?.capabilities.canUpdateProject);
    }

    if (!canEditTarget) {
      messageApi.warning(permissionDeniedReason);

      return;
    }

    setEditingProject(project);
    projectEditForm.resetFields();
    projectEditForm.setFieldsValue(hydrateOwnerFormValues(getProjectFormValues(project), ownerOptions));
  }

  async function openEditTaskDrawer(task: Task) {
    let canEditTarget = canManageActiveProjectTask(task);

    if (!canEditTarget && !canManageWorkspaceProjects) {
      const projectId = resolveProjectIdForRecord(task, filteredProjects);
      const snapshot = projectId
        ? await loadProjectManagementSnapshot(projectId)
        : null;

      // 搜索和日历可以在任务页 effect 执行前直达编辑；用本次返回快照立即判权，
      // 不能等待 React state 下一轮渲染，否则合法用户第一次点击也会被误判为只读。
      canEditTarget = Boolean(snapshot && canManageTaskWithSnapshot(task, snapshot));
    }

    if (!canEditTarget) {
      messageApi.warning("当前任务不在你的项目或需求职责范围内，请从已授权的项目详情进入。");

      return;
    }

    setEditingTask(task);
    editForm.resetFields();
    editForm.setFieldsValue(hydrateOwnerFormValues(getTaskFormValues(task), ownerOptions));
  }

  async function openEditRequirementDrawer(requirement: Requirement) {
    let snapshot = getProjectManagementSnapshotForRecord(requirement);
    let fieldAccess = getRequirementFieldAccess(requirement, snapshot);
    let canEditTarget = Object.values(fieldAccess).some(Boolean);

    if (!canEditTarget && !canManageWorkspaceProjects) {
      snapshot = await ensureProjectManagementSnapshotForRecord(requirement);
      fieldAccess = getRequirementFieldAccess(requirement, snapshot);

      canEditTarget = Object.values(fieldAccess).some(Boolean);
    }

    if (!canEditTarget) {
      messageApi.warning(permissionDeniedReason);

      return;
    }

    setEditingRequirement(requirement);
    setEditingRequirementFieldAccess(fieldAccess);
    requirementEditForm.resetFields();
    requirementEditForm.setFieldsValue(hydrateOwnerFormValues(getRequirementFormValues(requirement), ownerOptions));
  }

  async function openEditRequirementVersionDrawer(version: RequirementVersion) {
    let canEditTarget = canManageVersionForActor(version, "update");

    if (!canEditTarget && !canManageWorkspaceProjects) {
      const snapshot = await ensureProjectManagementSnapshotForRecord(version);

      canEditTarget = Boolean(snapshot && canManageVersionWithSnapshot(version, "update", snapshot));
    }

    if (!canEditTarget) {
      messageApi.warning(permissionDeniedReason);

      return;
    }

    setEditingRequirementVersion(version);
    requirementVersionEditForm.resetFields();
    const versionProjectId = resolveProjectIdForRecord(version, filteredProjects);
    const legacyProjectCatalog = filteredProjects.find((project) => project.id === versionProjectId)?.deliveryLabelCatalog;

    requirementVersionEditForm.setFieldsValue(
      {
        ...getRequirementVersionFormValues(version, legacyProjectCatalog),
        // 名称唯一的 legacy 版本首次编辑时回填稳定 projectId，编辑态仍不允许改绑。
        projectId: version.projectId || versionProjectId
      }
    );
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
      project: version.project,
      projectId: version.projectId
    });
  }

  function openCreateProjectVersionDrawer() {
    if (!resolvedActiveProject) {
      messageApi.warning("请先选择项目集，再新建项目或版本。");

      return;
    }

    openCreateDrawer("requirementVersion", {
      project: resolvedActiveProject.name,
      projectId: resolvedActiveProject.id,
      type: "版本"
    });
  }

  function openCreateProjectRequirementDrawer(version: RequirementVersion) {
    const targetProjectId = resolveProjectIdForRecord(version, filteredProjects);
    const targetProject = filteredProjects.find((project) => project.id === targetProjectId);

    openCreateDrawer("requirement", {
      project: targetProject?.name || version.project,
      projectId: targetProject?.id || version.projectId,
      versionId: version.id,
      versionName: version.name
    }, {
      projectPermissionGranted: canManageVersionForActor(version, "createRequirement")
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
          values: serializeCreateValues(values, {
            dateTimeFields: submittedType === "task" ? ["startDate", "dueDate"] : []
          })
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
      await refreshProjectManagementSnapshotsForRecords(
        [result.record as { projectId?: string; project?: string }],
        submittedType === "project" ? [(result.record as Project).id] : []
      );
      void refreshDashboardState();
      showRecordResultMessage(result.message);
      setCreateType(null);
      createForm.resetFields();

      if (submittedType === "project") {
        setActiveProjectId((result.record as Project).id);
        setActiveProjectVersionId(undefined);
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

    const nextStatus = typeof values.status === "string" ? values.status : editingProject.status;
    const changesArchiveState = nextStatus !== editingProject.status
      && (nextStatus === "已归档" || editingProject.status === "已归档");

    if (changesArchiveState && !canArchiveProjectForActor(editingProject)) {
      messageApi.warning("只有项目负责人或工作区管理员可以归档或恢复项目。");

      return;
    }

    setProjectEditSubmitting(true);

    try {
      // 项目表单不再展示里程碑或负责人：前者保留历史值，后者只能通过带审计的负责人交接流程修改。
      const projectOwnerFieldNames = new Set([
        "owner",
        "ownerMemberId",
        "ownerOpenId",
        "ownerUnionId",
        "ownerUserId",
        "ownerEmail",
        "ownerAvatarUrl"
      ]);
      const submittedValues = {
        ...Object.fromEntries(Object.entries(values).filter(([key]) => !projectOwnerFieldNames.has(key))),
        // 项目级目录只作为 legacy 版本读取回退，项目资料编辑不应清空它。
        deliveryLabelCatalog: editingProject.deliveryLabelCatalog,
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
      await refreshProjectManagementSnapshotsForRecords(
        [
          { project: editingProject.name },
          result.record as { projectId?: string; project?: string }
        ],
        [editingProject.id]
      );
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

    if (!canManageActiveProjectTask(editingTask)) {
      messageApi.warning("当前任务不在你的项目或需求职责范围内，已拒绝保存。");
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
          values: serializeCreateValues(values, { dateTimeFields: ["startDate", "dueDate"] })
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
      await refreshProjectManagementSnapshotsForRecords([
        editingTask,
        result.record as { projectId?: string; project?: string }
      ]);
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

    if (!canManageActiveProjectTask(task)) {
      messageApi.warning("当前任务只读，不能拖拽变更阶段。");
      return false;
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
            __quickTaskUpdate: true,
            stage: optimisticTask.stage
          })
        })
      }, {
        redirectOnUnauthorized: false
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
      await refreshProjectManagementSnapshotsForRecords([
        task,
        result.record as { projectId?: string; project?: string }
      ]);
      scheduleDashboardRefresh();
      showRecordResultMessage(result.message);

      return true;
    } catch (error) {
      if (previousData) {
        setData(previousData);
      }

      messageApi.error(isSessionExpiredError(error)
        ? "登录状态暂时无法确认，已撤回本次拖拽，请稍后重试或刷新页面。"
        : error instanceof Error ? error.message : "更新任务阶段失败");

      return false;
    }
  }

  async function handleUpdateTaskOwner(task: Task, owner: OwnerSelectableMember | null) {
    if (!data) {
      return false;
    }

    if (!canManageActiveProjectTask(task)) {
      messageApi.warning("当前任务只读，不能变更负责人。");
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
          values: serializeCreateValues({
            __quickTaskUpdate: true,
            ...nextOwnerFields
          })
        })
      }, {
        redirectOnUnauthorized: false
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
      await refreshProjectManagementSnapshotsForRecords([
        task,
        result.record as { projectId?: string; project?: string }
      ]);
      scheduleDashboardRefresh();
      showRecordResultMessage(result.message);

      return true;
    } catch (error) {
      if (previousData) {
        setData(previousData);
      }

      messageApi.error(isSessionExpiredError(error)
        ? "登录状态暂时无法确认，已撤回本次负责人变更，请稍后重试或刷新页面。"
        : error instanceof Error ? error.message : "更新任务负责人失败");

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

    if (!canManageActiveProjectTask(task)) {
      messageApi.warning("当前任务只读，不能拖拽或缩放调整排期。");
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
          values: serializeCreateValues(rescheduledTaskValues, { dateTimeFields: ["startDate", "dueDate"] })
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
      await refreshProjectManagementSnapshotsForRecords([
        task,
        result.record as { projectId?: string; project?: string }
      ]);
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

    if (!canEditBugForActor(targetBug)) {
      messageApi.warning(permissionDeniedReason);

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
      await refreshProjectManagementSnapshotsForRecords([
        targetBug,
        result.record as { projectId?: string; project?: string }
      ]);
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

    const productFields = [
      "title", "description", "owner", "ownerMemberId", "ownerOpenId", "ownerUnionId", "ownerUserId",
      "ownerEmail", "ownerAvatarUrl", "priority", "documentLink", "acceptance", "aiSummary", "aiRisks",
      "aiMissingItems", "aiFrontendNotes", "aiBackendNotes", "aiTestingNotes", "aiCompletenessScore"
    ];
    const designFields = [
      "designOwner", "designOwnerMemberId", "designOwnerOpenId", "designOwnerUnionId", "designOwnerUserId",
      "designOwnerEmail", "designOwnerAvatarUrl", "uiLink"
    ];
    const governanceFields = [
      "status", "startDate", "dueDate", "developerMemberIds"
    ];
    const allowedFields = new Set([
      ...(editingRequirementFieldAccess.product ? productFields : []),
      ...(editingRequirementFieldAccess.design ? designFields : []),
      ...(editingRequirementFieldAccess.governance ? governanceFields : [])
    ]);
    const serializedValues = serializeCreateValues(values);
    const baselineValues = serializeCreateValues(
      hydrateOwnerFormValues(getRequirementFormValues(editingRequirement), ownerOptions)
    );
    const submittedValues = Object.fromEntries(
      Object.entries(serializedValues).filter(([key, value]) =>
        allowedFields.has(key) && JSON.stringify(value) !== JSON.stringify(baselineValues[key])
      )
    );

    if (!Object.keys(submittedValues).length) {
      messageApi.info("没有可保存的职责范围内变更。");

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
          values: submittedValues
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
      await refreshProjectManagementSnapshotsForRecords([
        editingRequirement,
        result.record as { projectId?: string; project?: string }
      ]);
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

    const lockedProjectId = editingRequirementVersion.projectId
      || resolveProjectIdForRecord(editingRequirementVersion, filteredProjects);

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
          values: serializeCreateValues({
            ...values,
            // 编辑时项目归属为稳定关系，即使表单值被外部修改也只提交原归属。
            project: editingRequirementVersion.project,
            projectId: lockedProjectId
          })
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
      await refreshProjectManagementSnapshotsForRecords([
        editingRequirementVersion,
        result.record as { projectId?: string; project?: string }
      ]);
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
    const targetProject = type === "project" ? data?.projects.find((item) => item.id === id) : undefined;
    const targetRequirement = type === "requirement" ? data?.requirements.find((item) => item.id === id) : undefined;
    const targetVersion = type === "requirementVersion"
      ? data?.requirementVersions.find((item) => item.id === id)
      : undefined;
    const targetTask = type === "task" ? data?.tasks.find((item) => item.id === id) : undefined;
    const targetRisk = type === "risk" ? data?.risks.find((item) => item.id === id) : undefined;
    const targetBug = type === "bug" ? data?.bugs.find((item) => item.id === id) : undefined;
    const targetProjectScopedRecord = targetRequirement || targetVersion || targetTask || targetRisk || targetBug;
    const projectScopedCanDelete =
      type === "project"
        ? Boolean(activeProjectCapabilities?.canDeleteProject)
        : type === "requirementVersion"
          ? Boolean(targetVersion && canManageVersionForActor(targetVersion, "delete"))
          : type === "risk"
            ? Boolean(activeProjectCapabilities?.canDeletePlanUnit)
          : type === "requirement"
            ? Boolean(targetRequirement && canManageActiveProjectRequirement(targetRequirement, "delete"))
            : type === "task"
              ? Boolean(targetTask && canDeleteTaskForActor(targetTask))
              : false;
    const canDelete = projectScopedCanDelete || (
      type === "bug"
          ? Boolean(targetBug && canDeleteBugForActor(targetBug))
          : !["requirement", "requirementVersion", "task"].includes(type) && Boolean(permissions?.canDeleteRecords)
    );

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

      await refreshProjectManagementSnapshotsForRecords([
        targetProjectScopedRecord,
        result.fallbackVersion
      ], targetProject ? [targetProject.id] : []);

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
        { key: "projects", icon: <ProjectOutlined />, label: "项目管理" },
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
  // 顶部工作区入口与左下角身份卡复用同一个弹层组件，但左下角不再承担工作区切换；
  // 用一个渲染函数集中注入账号信息，避免两处弹层因为复制字段而出现昵称、头像或退出链接不一致。
  const renderAccountPopoverContent = (showWorkspaceControls: boolean) => (
    <AccountPopoverContent
      // 创建工作区是平台级入口，不应被当前工作区的成员管理权限限制；
      // 只读成员也应该能新建自己的空间，真正的登录保护交给 `/api/workspaces` 服务端兜底。
      canCreateWorkspace={Boolean(data)}
      currentWorkspace={currentWorkspace}
      logoutHref={logoutHref}
      permissionDeniedReason={permissionDeniedReason}
      showLogout={Boolean(data?.meta?.user)}
      showWorkspaceControls={showWorkspaceControls}
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
  const accountPopoverContent = renderAccountPopoverContent(true);
  const sidebarAccountPopoverContent = renderAccountPopoverContent(false);
  const requirementVersions = useMemo(() => data?.requirementVersions ?? [], [data?.requirementVersions]);
  const requirementVersionOptions = useMemo(
    () =>
      requirementVersions.map((version) => ({
        value: version.id,
        label: formatRequirementVersionOptionLabel(version, requirementVersions),
        versionName: version.name,
        project: version.project,
        projectId: version.projectId,
        parentVersionId: version.parentVersionId
      })),
    [requirementVersions]
  );
  const taskRequirementOptions = useMemo(
    () => (data?.requirements ?? []).map((requirement) => ({
      value: requirement.id,
      label: requirement.title,
      project: requirement.project,
      projectId: requirement.projectId,
      versionId: requirement.versionId,
      versionName: requirement.versionName
    })),
    [data?.requirements]
  );
  const taskFilterRequirement = useMemo(
    () => taskRequirementFilter
      ? data?.requirements.find((requirement) => requirement.id === taskRequirementFilter.id)
      : undefined,
    [data?.requirements, taskRequirementFilter]
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

  // 从项目详情或需求视图进入任务页时，先用当前可见数据生成标准深链，再 push 一条可回退的历史记录。
  function openRequirementTasks(requirement: Requirement) {
    if (!data) {
      return;
    }

    const resolved = resolveTaskRequirementDeepLink({
      requested: { requirementId: requirement.id },
      projects: data.projects,
      requirements: data.requirements,
      versions: data.requirementVersions
    });
    const resolvedRequirement = resolved.requirementId
      ? data.requirements.find((candidate) => candidate.id === resolved.requirementId)
      : undefined;
    const nextFilter = resolvedRequirement
      ? createTaskRequirementFilter(resolvedRequirement, resolved)
      : null;

    if (!nextFilter || !resolvedRequirement) {
      messageApi.warning("当前需求的项目或版本归属已失效，无法安全打开任务筛选。");

      return;
    }

    setTaskRequirementFilter(nextFilter);
    setActiveView("tasks");
    writeTaskRequirementDeepLink(resolved, "push");
    messageApi.info(`已筛选“${resolvedRequirement.title}”的交付任务。`);
  }

  // 关闭筛选是当前历史条目内的状态修正，用 replace 避免用户后退时又回到刚手动清除的筛选。
  function clearTaskRequirementFilter() {
    setTaskRequirementFilter(null);

    if (activeView === "tasks") {
      writeTaskRequirementDeepLink(undefined, "replace");
    }
  }

  // 视图切换同步写入 URL 查询参数，让刷新和分享链接能保留当前模块。
  function switchView(view: AppView) {
    if (view === "bugEdit") {
      return;
    }

    setActiveView(view);

    if (view !== "tasks") {
      setTaskRequirementFilter(null);
    }

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
      if (view === "projects") {
        applyTaskRequirementDeepLinkToUrl(url);
        applyProjectDeepLinkToUrl(url, resolvedActiveProjectId ? {
          projectId: resolvedActiveProjectId,
          versionId: activeProjectVersionId,
          detailTab: projectDetailTab
        } : undefined);
      } else if (view === "tasks") {
        applyTaskRequirementDeepLinkToUrl(url, taskRequirementFilter ? {
          requirementId: taskRequirementFilter.id,
          projectId: taskRequirementFilter.projectId,
          versionId: taskRequirementFilter.versionId
        } : undefined);
      } else {
        applyTaskRequirementDeepLinkToUrl(url);
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  // 工作区切换先使用本地缓存即时响应，再后台校准完整 dashboard。
  // 单次 401/慢网失败只说明这次校准没有拿到数据，不足以证明整段会话已经失效，所以这里保留当前页面而不是硬跳登录。
  async function switchWorkspace(workspaceId: string) {
    if (!workspaceId || workspaceId === currentWorkspaceId) {
      setWorkspaceSelectOpen(false);

      return;
    }

    const previousWorkspaceId = currentWorkspaceId;
    const cachedWorkspaceData = workspaceDashboardCacheRef.current.get(workspaceId);
    const switchSeq = workspaceSwitchSeqRef.current + 1;

    workspaceSwitchSeqRef.current = switchSeq;
    // 工作区切换时同时作废旧请求序号；即使旧请求稍后返回，也不能再把权限快照写回缓存。
    projectManagementSnapshotCacheRef.current.clear();
    projectManagementFailuresRef.current.clear();
    for (const [cacheKey, sequence] of projectManagementRequestSequencesRef.current) {
      projectManagementRequestSequencesRef.current.set(cacheKey, sequence + 1);
    }
    projectManagementRequestsRef.current.clear();
    setProjectManagementSnapshots(new Map());
    setActiveWorkspaceId(workspaceId);
    setActiveProjectId("");
    setActiveProjectVersionId(undefined);
    setProjectDetailTab("overview");
    setTaskRequirementFilter(null);
    setSelectedRequirementVersionId(null);
    setProjectCalendarVersionId(allProjectCalendarVersionsValue);
    setWorkspaceSelectOpen(false);

    if (cachedWorkspaceData) {
      const cachedWorkspaceId = cacheDashboardData(cachedWorkspaceData, workspaceId);

      setData(cachedWorkspaceData);
      setActiveWorkspaceId(cachedWorkspaceId);
      setLoadError("");
      replaceWorkbenchUrl(cachedWorkspaceId, activeView, true);
    }

    try {
      const nextData = await fetchDashboardFromApi(workspaceId, {
        redirectOnUnauthorized: false
      });

      if (nextData) {
        if (workspaceSwitchSeqRef.current !== switchSeq) {
          return;
        }

        const nextWorkspaceId = cacheDashboardData(nextData, workspaceId);

        setData(nextData);
        setActiveWorkspaceId(nextWorkspaceId);
        setLoadError("");
        replaceWorkbenchUrl(nextWorkspaceId, activeView, true);
      }
    } catch (error) {
      if (workspaceSwitchSeqRef.current !== switchSeq) {
        return;
      }

      if (!cachedWorkspaceData) {
        setActiveWorkspaceId(previousWorkspaceId);
      }

      if (isSessionExpiredError(error)) {
        messageApi.warning(cachedWorkspaceData ? "工作区数据刷新失败，已展示上次缓存数据。" : "登录状态暂时无法确认，已保留当前工作区。");

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
              accountPopoverContent={sidebarAccountPopoverContent}
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
                      activeProjectId={resolvedActiveProjectId}
                      activeVersionId={activeProjectVersionId}
                      activities={activeProjectManagementSnapshot?.activities ?? []}
                      bugs={data.bugs}
                      currentMemberId={data.meta?.currentMember?.id}
                      activeDetailTab={projectDetailTab}
                      members={data.members}
                      projectPermissions={activeProjectManagementSnapshot?.permissions ?? []}
                      projects={filteredProjects}
                      requirements={data.requirements}
                      risks={data.risks}
                      tasks={data.tasks}
                      versionFilter={projectCalendarVersionId}
                      versionOptions={requirementVersionOptions}
                      versions={requirementVersions}
                      canDeleteRequirement={(requirement) => canManageActiveProjectRequirement(requirement, "delete")}
                      canEditRequirement={(requirement) => canManageActiveProjectRequirement(requirement, "update")}
                      canEditTask={canManageActiveProjectTask}
                      onActiveProjectChange={(projectId) => {
                        setActiveProjectId(projectId);
                        setActiveProjectVersionId(undefined);
                        setProjectDetailTab("overview");
                        setProjectCalendarVersionId(allProjectCalendarVersionsValue);
                        writeProjectDeepLink({ projectId, detailTab: "overview" });
                      }}
                      onActiveVersionChange={(versionId) => {
                        setActiveProjectVersionId(versionId);
                        setProjectDetailTab("overview");
                        writeProjectDeepLink({
                          projectId: resolvedActiveProjectId,
                          versionId,
                          detailTab: "overview"
                        });
                      }}
                      onActiveDetailTabChange={(detailTab) => {
                        setProjectDetailTab(detailTab);
                        writeProjectDeepLink({
                          projectId: resolvedActiveProjectId,
                          versionId: activeProjectVersionId,
                          detailTab
                        });
                      }}
                      onCreateProject={canManageWorkspaceProjects ? () => openCreateDrawer("project") : undefined}
                      canCreateRequirementForVersion={(version) => canManageVersionForActor(version, "createRequirement")}
                      canEditVersion={(version) => canManageVersionForActor(version, "update")}
                      canUpdateVersionDeliveryNodes={(version) => canManageVersionForActor(version, "update")}
                      onCreateRequirement={openCreateProjectRequirementDrawer}
                      onCreateVersion={canCreateActivePlanUnits ? openCreateProjectVersionDrawer : undefined}
                      onDeleteProject={canDeleteActiveProject
                        ? (project) => { void handleDeleteRecord("project", project.id); }
                        : undefined}
                      onDeleteRequirement={(requirement) => { void handleDeleteRecord("requirement", requirement.id); }}
                      onDeleteVersion={canDeleteActivePlanUnits
                        ? (version) => { void handleDeleteRecord("requirementVersion", version.id); }
                        : undefined}
                      onEditProject={canUpdateActiveProject ? openEditProjectDrawer : undefined}
                      onEditRequirement={openEditRequirementDrawer}
                      onEditVersion={openEditRequirementVersionDrawer}
                      onLoadEffectivePermission={handleLoadEffectivePermission}
                      onOpenCalendarItem={openProjectCalendarItem}
                      onOpenRequirement={openRequirementTasks}
                      onRemoveProjectPermission={canManageActiveProjectMembers ? handleRemoveProjectPermission : undefined}
                      onRescheduleCalendarItem={handleRescheduleProjectCalendarItem}
                      onSaveProjectPermission={canManageActiveProjectMembers ? handleSaveProjectPermission : undefined}
                      onTransferProjectOwner={canTransferActiveProjectOwner ? handleTransferProjectOwner : undefined}
                      onUpdateVersionDeliveryNodes={handleUpdateVersionDeliveryNodes}
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
                      requirementFilter={taskRequirementFilter ?? undefined}
                      onClearRequirementFilter={clearTaskRequirementFilter}
                      canCreate={taskRequirementFilter
                        ? canCreateTaskForRequirement(taskFilterRequirement)
                        : canManageWorkspaceProjects}
                      canEditTask={canManageActiveProjectTask}
                      onCreate={() => openCreateDrawer("task", taskFilterRequirement ? {
                        project: taskFilterRequirement.project,
                        projectId: taskFilterRequirement.projectId,
                        requirementId: taskFilterRequirement.id,
                        requirementTitle: taskFilterRequirement.title,
                        versionId: taskFilterRequirement.versionId,
                        versionName: taskFilterRequirement.versionName
                      } : {})}
                      onEdit={openEditTaskDrawer}
                      onOwnerChange={handleUpdateTaskOwner}
                      onStageChange={handleUpdateTaskStage}
                    />
                  ) : null}
                  {contentView === "bugs" ? (
                    <BugsView
                      bugs={data.bugs}
                      canEditBugs={canEditBugForActor}
                      canDeleteBugs={canDeleteBugForActor}
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
                      canEditBugs={Boolean(routeBug && canEditBugForActor(routeBug))}
                      canEditBugsFully={Boolean(routeBug && canEditBugsFully && hasProjectWriteAccessForRecord(routeBug))}
                      canDeleteBugs={Boolean(routeBug && canDeleteBugForActor(routeBug))}
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
                      canBreakdownVersion={(version) => canManageVersionForActor(version, "breakdown")}
                      canCreateRequirementForVersion={(version) => canManageVersionForActor(version, "createRequirement")}
                      canCreateSubVersion={(version) => canManageVersionForActor(version, "createSubVersion")}
                      canCreateVersion={canCreateAnyPlanUnit}
                      canDeleteVersion={(version) => canManageVersionForActor(version, "delete")}
                      canEditVersion={(version) => canManageVersionForActor(version, "update")}
                      columns={requirementColumns}
                      permissionDeniedReason={permissionDeniedReason}
                      projects={filteredProjects}
                      requirements={data.requirements}
                      selectedVersionId={selectedRequirementVersionId}
                      tasks={data.tasks}
                      versions={requirementVersions}
                      onBack={() => setSelectedRequirementVersionId(null)}
                      onCreateRequirement={openCreateProjectRequirementDrawer}
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
                      peopleWarning={peopleWarning}
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
                      onReloadPeople={() => loadFeishuPeople({ force: true })}
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
            projects={data?.projects ?? []}
            requirementVersionOptions={requirementVersionOptions}
            requirementOptions={taskRequirementOptions}
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
            canArchiveProject={Boolean(editingProject && canArchiveProjectForActor(editingProject))}
            onClose={() => setEditingProject(null)}
            onSubmit={handleUpdateProject}
          />

          <TaskEditDrawer
            form={editForm}
            task={editingTask}
            submitting={editSubmitting}
            versionOptions={requirementVersionOptions}
            requirementOptions={taskRequirementOptions}
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
            fieldAccess={editingRequirementFieldAccess}
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
            projects={data?.projects ?? []}
            versionOptions={requirementVersionOptions}
            canManageDeliveryLabelCatalog={Boolean(
              canManageWorkspaceProjects
              || (editingRequirementVersion
                && getProjectManagementSnapshotForRecord(editingRequirementVersion)?.capabilities.canManageMembers)
            )}
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
