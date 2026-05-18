"use client";

import "./project-management-platform.css";
import {
  Alert,
  App,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  ConfigProvider,
  DatePicker,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Upload,
  message,
  theme
} from "antd";
import type { BadgeProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import {
  AlertOutlined,
  ApiOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  InboxOutlined,
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
  UnorderedListOutlined,
  UploadOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type {
  DashboardData,
  DocumentItem,
  FeishuPerson,
  FeishuUser,
  Project,
  Requirement,
  Risk,
  Task,
  TaskStage
} from "@/types/dashboard";
import type { CreateRecordResult, DashboardEntityType, DocumentAnalyzeResult } from "@/types/records";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const taskStages: TaskStage[] = ["待处理", "进行中", "评审中", "已完成"];
const entityLabels: Record<DashboardEntityType, string> = {
  project: "项目",
  task: "任务",
  risk: "风险",
  requirement: "需求",
  document: "文档"
};

const statusColor: Record<Project["status"], NonNullable<BadgeProps["status"]>> = {
  进行中: "processing",
  有风险: "error",
  已完成: "success",
  暂停: "default"
};

const priorityColor: Record<Task["priority"] | Requirement["priority"], string> = {
  高: "red",
  中: "gold",
  低: "green",
  P0: "red",
  P1: "blue",
  P2: "default"
};

const riskColor: Record<Risk["level"], string> = {
  高: "red",
  中: "gold",
  低: "green"
};

type PeopleResponse = {
  people?: FeishuPerson[];
  error?: string;
};

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

export function ProjectManagementPlatform() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [createType, setCreateType] = useState<DashboardEntityType | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownSubmitting, setBreakdownSubmitting] = useState(false);
  const [activeView, setActiveView] = useState("overview");
  const [projectFilter, setProjectFilter] = useState("全部");
  const [people, setPeople] = useState<FeishuPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "我会持续观察项目进度、任务阻塞和风险变化。你可以问我：本周风险、生成周报、拆解需求。"
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [form] = Form.useForm<{ message: string }>();
  const [createForm] = Form.useForm<Record<string, unknown>>();
  const [editForm] = Form.useForm<Record<string, unknown>>();
  const [breakdownForm] = Form.useForm<Record<string, unknown>>();
  const [messageApi, messageContextHolder] = message.useMessage();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard");
        const nextData = (await response.json()) as DashboardData & { error?: string };

        if (response.status === 401) {
          window.location.assign("/login");

          return;
        }

        if (!response.ok) {
          throw new Error(nextData.error || "读取项目数据失败");
        }

        if (mounted) {
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
      render: (owner: string) => (
        <Space>
          <Avatar size="small">{owner.slice(0, 1)}</Avatar>
          <Text>{owner}</Text>
        </Space>
      )
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
      title: "截止",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 130
    }
  ];

  const requirementColumns: ColumnsType<Requirement> = [
    {
      title: "需求",
      dataIndex: "title",
      key: "title",
      render: (_, requirement) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{requirement.title}</Text>
          <Text type="secondary">{requirement.acceptance}</Text>
        </Space>
      )
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 100,
      render: (priority: Requirement["priority"]) => (
        <Tag color={priorityColor[priority]}>{priority}</Tag>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120
    },
    {
      title: "关联项目",
      dataIndex: "project",
      key: "project",
      width: 190
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

    setChatMessages((messages) => [...messages, { role: "user", content: message }]);
    form.resetFields();
    setChatLoading(true);

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

  function openCreateDrawer(type: DashboardEntityType) {
    setCreateType(type);
    createForm.resetFields();
    createForm.setFieldsValue(getCreateInitialValues(type));
  }

  function openEditTaskDrawer(task: Task) {
    setEditingTask(task);
    editForm.resetFields();
    editForm.setFieldsValue(getTaskFormValues(task));
  }

  function openDocumentBreakdownDrawer(project?: string) {
    setBreakdownOpen(true);
    breakdownForm.resetFields();

    if (project) {
      breakdownForm.setFieldsValue({
        project
      });
    }
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
      messageApi.success(result.message);
      setCreateType(null);
      createForm.resetFields();

      if (submittedType === "project") {
        const project = result.record as Project;

        setActiveView("docs");
        openDocumentBreakdownDrawer(project.name);
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreateSubmitting(false);
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
      messageApi.success(result.message);
      setEditingTask(null);
      editForm.resetFields();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新任务失败");
    } finally {
      setEditSubmitting(false);
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
      for (const key of ["project", "owner", "ownerOpenId", "ownerUnionId", "ownerUserId", "ownerEmail"]) {
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
      setBreakdownOpen(false);
      breakdownForm.resetFields();
      setActiveView("tasks");
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
    { key: "requirements", icon: <NodeIndexOutlined />, label: "需求管理" },
    { key: "risks", icon: <AlertOutlined />, label: "风险中心" },
    { key: "docs", icon: <FileTextOutlined />, label: "文档知识库" },
    { key: "reports", icon: <BarChartOutlined />, label: "报表驾驶舱" }
  ];
  const userName = data?.meta?.user?.name ?? "苏";
  const userInitial = userName.slice(0, 1);
  const projectOptions = data?.projects.map((project) => project.name) ?? [];

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#2563eb",
          colorInfo: "#0f766e",
          colorBgLayout: "#f5f7fb",
          colorText: "#172033",
          colorTextSecondary: "#667085",
          borderRadius: 8,
          boxShadowTertiary: "0 10px 30px rgba(15, 23, 42, 0.06)",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 38
          },
          Card: {
            borderRadiusLG: 8
          },
          Layout: {
            siderBg: "#102033",
            headerBg: "#ffffff"
          },
          Menu: {
            darkItemBg: "#102033",
            darkSubMenuItemBg: "#102033",
            darkItemSelectedBg: "#2563eb"
          },
          Table: {
            headerBg: "#f8fafc",
            headerColor: "#475467"
          }
        }
      }}
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
                onClick={(item) => setActiveView(item.key)}
              />
            </Sider>
          ) : null}

          <Layout className="pm-main">
            <Header className="pm-header">
              <Space size={12}>
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
                />
              </Space>

              <Space size={10}>
                {data?.meta ? (
                  <Tag color={data.meta.source === "local" ? "green" : "default"}>
                    {data.meta.source === "local" ? "站内数据" : "演示数据"}
                  </Tag>
                ) : null}
                <Tooltip title="查看日程">
                  <Button icon={<CalendarOutlined />} />
                </Tooltip>
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
                  onChange={(value) => setActiveView(String(value))}
                  options={[
                    { label: "工作台", value: "overview" },
                    { label: "项目", value: "projects" },
                    { label: "任务", value: "tasks" },
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
                    <Overview
                      data={data}
                      onOpenAssistant={() => setAssistantOpen(true)}
                      onViewRisks={() => setActiveView("risks")}
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
                      onCreate={() => openCreateDrawer("task")}
                      onEdit={openEditTaskDrawer}
                    />
                  ) : null}
                  {activeView === "requirements" ? (
                    <TableView
                      title="需求管理"
                      subtitle="围绕优先级、验收标准和关联项目组织需求执行。"
                      icon={<NodeIndexOutlined />}
                      extra={
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => openCreateDrawer("requirement")}
                        >
                          新建需求
                        </Button>
                      }
                    >
                      <Table
                        rowKey="id"
                        columns={requirementColumns}
                        dataSource={data.requirements}
                        pagination={false}
                        scroll={{ x: 720 }}
                      />
                    </TableView>
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
                  {activeView === "reports" ? <ReportsView data={data} /> : null}
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
            people={ownerOptions}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            onClose={() => setCreateType(null)}
            onSubmit={handleCreateRecord}
          />

          <TaskEditDrawer
            form={editForm}
            task={editingTask}
            submitting={editSubmitting}
            projectOptions={projectOptions}
            people={ownerOptions}
            peopleLoading={peopleLoading}
            peopleError={peopleError}
            onClose={() => setEditingTask(null)}
            onSubmit={handleUpdateTask}
          />

          <DocumentBreakdownDrawer
            form={breakdownForm}
            open={breakdownOpen}
            submitting={breakdownSubmitting}
            projectOptions={projectOptions}
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

function Overview({
  data,
  onOpenAssistant,
  onViewRisks
}: {
  data: DashboardData;
  onOpenAssistant: () => void;
  onViewRisks: () => void;
}) {
  const topRiskProject = data.projects.reduce((current, project) =>
    project.health < current.health ? project : current
  );

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      {data.meta?.message ? (
        <Alert
          type={data.meta.source === "local" ? "success" : "warning"}
          showIcon
          title={data.meta.message}
          description={
            <Space orientation="vertical" size={4}>
              {data.meta.storage ? (
                <Text>数据存储：{data.meta.storage}</Text>
              ) : null}
              <Text>飞书用于登录、负责人选择和机器人通知，不作为项目主数据源。</Text>
            </Space>
          }
        />
      ) : null}
      <section className="pm-hero">
        <div className="pm-hero-copy">
          <Tag color="blue">AI 项目运营中枢</Tag>
          <Title level={1}>今天有 3 个项目需要你关注</Title>
          <Paragraph>
            系统已综合任务进度、会议待办、风险登记和文档变化，优先建议处理知识库增强项目的权限测试风险。
          </Paragraph>
          <Space wrap>
            <Button type="primary" icon={<RobotOutlined />} onClick={onOpenAssistant}>
              生成本周汇报
            </Button>
            <Button icon={<AlertOutlined />} onClick={onViewRisks}>
              查看风险清单
            </Button>
          </Space>
        </div>

        <div className="pm-hero-panel">
          <Space orientation="vertical" size={12}>
            <Flex justify="space-between" align="center">
              <Text strong>AI 风险判断</Text>
              <Tag color="red">需要处理</Tag>
            </Flex>
            <Title level={4}>{topRiskProject.name}</Title>
            <Text type="secondary">{topRiskProject.summary}</Text>
            <Divider />
            <Row gutter={12}>
              <Col span={12}>
                <Statistic title="健康度" value={topRiskProject.health} suffix="/ 100" />
              </Col>
              <Col span={12}>
                <Statistic title="风险数" value={topRiskProject.riskCount} />
              </Col>
            </Row>
          </Space>
        </div>
      </section>

      <Row gutter={[16, 16]}>
        <MetricCard
          icon={<ProjectOutlined />}
          title="活跃项目"
          value={data.metrics.activeProjects}
          suffix="个"
          tone="blue"
        />
        <MetricCard
          icon={<CheckCircleOutlined />}
          title="交付达成率"
          value={data.metrics.deliveryRate}
          suffix="%"
          tone="green"
        />
        <MetricCard
          icon={<ClockCircleOutlined />}
          title="逾期任务"
          value={data.metrics.overdueTasks}
          suffix="个"
          tone="orange"
        />
        <MetricCard
          icon={<RobotOutlined />}
          title="AI 节省工时"
          value={data.metrics.aiSavedHours}
          suffix="小时"
          tone="violet"
        />
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card
            title={
              <Space>
                <ProjectOutlined />
                项目健康度
              </Space>
            }
            extra={<Button type="link">查看全部</Button>}
          >
            <Space orientation="vertical" size={16} className="pm-wide">
              {data.projects.slice(0, 3).map((project) => (
                <div className="project-health-row" key={project.id}>
                  <div>
                    <Text strong>{project.name}</Text>
                    <div>
                      <Text type="secondary">{project.owner} · 截止 {project.dueDate}</Text>
                    </div>
                  </div>
                  <div className="project-health-progress">
                    <Progress
                      percent={project.progress}
                      strokeColor={project.health >= 85 ? "#0f766e" : "#b45309"}
                    />
                  </div>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card
            title={
              <Space>
                <ApiOutlined />
                AI 本周洞察
              </Space>
            }
          >
            <Timeline
              items={data.weeklyInsight.map((insight) => ({
                color: insight.includes("风险") ? "red" : "blue",
                content: <Text>{insight}</Text>
              }))}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function MetricCard({
  icon,
  title,
  value,
  suffix,
  tone
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  suffix: string;
  tone: "blue" | "green" | "orange" | "violet";
}) {
  return (
    <Col xs={24} sm={12} xl={6}>
      <Card className={`metric-card metric-card-${tone}`}>
        <Flex justify="space-between" align="center">
          <Statistic title={title} value={value} suffix={suffix} />
          <div className="metric-icon">{icon}</div>
        </Flex>
      </Card>
    </Col>
  );
}

function ProjectsView({
  columns,
  projects,
  projectFilter,
  onFilterChange,
  onCreate
}: {
  columns: ColumnsType<Project>;
  projects: Project[];
  projectFilter: string;
  onFilterChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <TableView
      title="项目管理"
      subtitle="统一查看项目状态、健康度、风险数量和交付进度。"
      icon={<FolderOpenOutlined />}
      extra={
        <Space wrap>
          <Segmented
            value={projectFilter}
            onChange={(value) => onFilterChange(String(value))}
            options={["全部", "进行中", "有风险", "暂停"]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建项目
          </Button>
        </Space>
      }
    >
      <Table rowKey="id" columns={columns} dataSource={projects} pagination={false} scroll={{ x: 920 }} />
    </TableView>
  );
}

function TasksView({
  tasks,
  currentUser,
  onCreate,
  onEdit
}: {
  tasks: Task[];
  currentUser?: FeishuUser;
  onCreate: () => void;
  onEdit: (task: Task) => void;
}) {
  const [viewMode, setViewMode] = useState<"table" | "owner">("table");
  const [onlyMine, setOnlyMine] = useState(false);
  const visibleTasks = useMemo(() => {
    return onlyMine ? tasks.filter((task) => isMyTask(task, currentUser)) : tasks;
  }, [currentUser, onlyMine, tasks]);
  const ownerGroups = useMemo(() => {
    const groups = new Map<string, Task[]>();

    for (const task of visibleTasks) {
      const owner = task.owner?.trim() || "未分配";
      groups.set(owner, [...(groups.get(owner) ?? []), task]);
    }

    return Array.from(groups.entries())
      .map(([owner, ownerTasks]) => ({
        owner,
        tasks: ownerTasks.sort((left, right) => {
          const stageDelta = taskStages.indexOf(left.stage) - taskStages.indexOf(right.stage);

          if (stageDelta !== 0) {
            return stageDelta;
          }

          return dayjs(left.dueDate).valueOf() - dayjs(right.dueDate).valueOf();
        })
      }))
      .sort((left, right) => right.tasks.length - left.tasks.length || left.owner.localeCompare(right.owner, "zh-CN"));
  }, [visibleTasks]);
  const taskColumns: ColumnsType<Task> = [
    {
      title: "任务",
      dataIndex: "title",
      key: "title",
      fixed: "left",
      width: 300,
      render: (_, task) => (
        <Space orientation="vertical" size={4}>
          <Text strong>{task.title}</Text>
          <Text type="secondary">{task.aiHint}</Text>
        </Space>
      )
    },
    {
      title: "项目",
      dataIndex: "project",
      key: "project",
      width: 180,
      render: (project: string) => <Text>{project}</Text>
    },
    {
      title: "负责人",
      dataIndex: "owner",
      key: "owner",
      width: 140,
      render: (owner: string) => (
        <Space>
          <Avatar size="small">{(owner || "未").slice(0, 1)}</Avatar>
          <Text>{owner || "未分配"}</Text>
        </Space>
      )
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
      render: (ownerOpenId?: string) => (
        <Tag color={ownerOpenId ? "green" : "default"}>{ownerOpenId ? "已关联" : "未关联"}</Tag>
      )
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
        subtitle="先用表格扫全量任务，再按负责人追踪每个人手上的交付。"
        extra={
          <Space wrap>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as "table" | "owner")}
              options={[
                { label: "全部任务", value: "table", icon: <UnorderedListOutlined /> },
                { label: "按负责人", value: "owner", icon: <UserOutlined /> }
              ]}
            />
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

      {viewMode === "table" ? (
        <Card>
          <Table
            rowKey="id"
            columns={taskColumns}
            dataSource={visibleTasks}
            locale={{
              emptyText: onlyMine ? "暂无分配给你的任务" : "暂无任务"
            }}
            pagination={{ pageSize: 12, showSizeChanger: true }}
            scroll={{ x: 1320 }}
            size="middle"
          />
        </Card>
      ) : (
        <div className="owner-kanban-grid">
          {ownerGroups.length ? (
            ownerGroups.map((group) => (
              <Card
                className="owner-kanban-column"
                key={group.owner}
                title={
                  <Flex justify="space-between" align="center">
                    <Space>
                      <Avatar size="small">{group.owner.slice(0, 1)}</Avatar>
                      <Text strong>{group.owner}</Text>
                    </Space>
                    <Badge count={group.tasks.length} color="#2563eb" />
                  </Flex>
                }
              >
                <Space orientation="vertical" size={12} className="pm-wide">
                  {group.tasks.map((task) => (
                    <div className="task-card" key={task.id}>
                      <Flex justify="space-between" align="start" gap={12}>
                        <Text strong>{task.title}</Text>
                        <Space size={4}>
                          <Tag color={priorityColor[task.priority]}>{task.priority}</Tag>
                          <Tooltip title="编辑任务">
                            <Button
                              size="small"
                              type="text"
                              icon={<EditOutlined />}
                              onClick={() => onEdit(task)}
                            />
                          </Tooltip>
                        </Space>
                      </Flex>
                      <Space wrap size={[6, 6]} className="task-meta-tags">
                        <Tag>{task.stage}</Tag>
                        <Tag color="blue">{task.project}</Tag>
                        <Tag>开始 {task.startDate}</Tag>
                        <Tag icon={<CalendarOutlined />}>{task.dueDate}</Tag>
                      </Space>
                      <Alert
                        className="task-ai-hint"
                        type={task.priority === "高" ? "warning" : "info"}
                        showIcon
                        title={task.aiHint}
                      />
                    </div>
                  ))}
                </Space>
              </Card>
            ))
          ) : (
            <Card className="pm-wide">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={onlyMine ? "暂无分配给你的任务" : "暂无任务，上传文档后会自动生成"}
              />
            </Card>
          )}
        </div>
      )}
    </Space>
  );
}

function RisksView({ risks, onCreate }: { risks: Risk[]; onCreate: () => void }) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<AlertOutlined />}
        title="风险中心"
        subtitle="集中管理 AI 自动发现和人工登记的项目风险。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            登记风险
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        {risks.map((risk) => (
          <Col xs={24} lg={8} key={risk.id}>
            <Card className="risk-card">
              <Space orientation="vertical" size={12} className="pm-wide">
                <Flex justify="space-between" align="center">
                  <Tag color={riskColor[risk.level]}>{risk.level}风险</Tag>
                  <Text type="secondary">{risk.owner}</Text>
                </Flex>
                <Title level={4}>{risk.title}</Title>
                <Text type="secondary">{risk.project}</Text>
                <Alert type={risk.level === "高" ? "error" : "warning"} showIcon title={risk.mitigation} />
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}

function ReportsView({ data }: { data: DashboardData }) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<BarChartOutlined />}
        title="报表驾驶舱"
        subtitle="为管理层提供进度、质量、风险和 AI 解释。"
        extra={
          <Button type="primary" icon={<FileTextOutlined />}>
            生成汇报
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="项目健康分布">
            <Space orientation="vertical" size={16} className="pm-wide">
              {data.projects.map((project) => (
                <div key={project.id}>
                  <Flex justify="space-between">
                    <Text>{project.name}</Text>
                    <Text strong>{project.health}</Text>
                  </Flex>
                  <Progress percent={project.health} showInfo={false} />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="交付预测">
            <div className="report-focus">
              <Progress type="dashboard" percent={data.metrics.deliveryRate} strokeColor="#0f766e" />
              <Paragraph>
                AI 判断当前交付趋势稳定。若知识库增强项目风险在 3 天内关闭，本月达成率预计可提升到 91%。
              </Paragraph>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="资源负载">
            <List
              dataSource={[
                { team: "产品组", load: 82 },
                { team: "前端组", load: 76 },
                { team: "后端组", load: 91 },
                { team: "测试组", load: 88 }
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Space orientation="vertical" size={4} className="pm-wide">
                    <Flex justify="space-between">
                      <Text>{item.team}</Text>
                      <Text>{item.load}%</Text>
                    </Flex>
                    <Progress percent={item.load} showInfo={false} />
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function TableView({
  title,
  subtitle,
  icon,
  extra,
  children
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle icon={icon} title={title} subtitle={subtitle} extra={extra} />
      <Card>{children}</Card>
    </Space>
  );
}

function PageTitle({
  icon,
  title,
  subtitle,
  extra
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <Space align="start" size={14}>
        <div className="page-title-icon">{icon}</div>
        <div>
          <Title level={2}>{title}</Title>
          <Text type="secondary">{subtitle}</Text>
        </div>
      </Space>
      {extra ? <div className="page-title-extra">{extra}</div> : null}
    </div>
  );
}

function getCreateInitialValues(type: DashboardEntityType) {
  if (type === "project") {
    return {
      status: "进行中",
      progress: 0,
      health: 80,
      dueDate: dayjs().add(14, "day"),
      team: 1,
      riskCount: 0
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

  if (type === "risk") {
    return {
      level: "中"
    };
  }

  if (type === "requirement") {
    return {
      priority: "P1",
      status: "评审中"
    };
  }

  return {
    type: "PRD",
    updatedAt: dayjs()
  };
}

function getTaskFormValues(task: Task) {
  return {
    ...task,
    startDate: dayjs(task.startDate),
    dueDate: dayjs(task.dueDate)
  };
}

function serializeCreateValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (dayjs.isDayjs(value)) {
        return [key, value.format(key === "updatedAt" ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD")];
      }

      return [key, value];
    })
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
    aiSavedHours: Math.max(0, data.requirements.length * 3 + data.documents.length * 2 + data.tasks.length)
  };
}

function updateDashboardWithRecord(data: DashboardData, result: CreateRecordResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    projects: [...data.projects],
    tasks: [...data.tasks],
    risks: [...data.risks],
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

  if (result.type === "risk") {
    nextData.risks = [result.record as Risk, ...nextData.risks];
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
    risks: [...data.risks],
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

  nextData.metrics = recalculateMetrics(nextData);

  return nextData;
}

function updateDashboardWithDocumentAnalysis(data: DashboardData, result: DocumentAnalyzeResult): DashboardData {
  const nextData: DashboardData = {
    ...data,
    tasks: [...result.tasks, ...data.tasks],
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

function CreateRecordDrawer({
  form,
  open,
  type,
  submitting,
  projectOptions,
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
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const label = type ? entityLabels[type] : "";

  return (
    <Drawer
      title={type ? `新建${label}` : "新建"}
      open={open}
      onClose={onClose}
      size="default"
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            保存
          </Button>
        </Space>
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
          {type === "requirement" ? <RequirementFields projectOptions={projectOptions} /> : null}
          {type === "document" ? <DocumentFields /> : null}
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
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      title={
        <Space>
          <EditOutlined />
          <span>编辑任务</span>
        </Space>
      }
      open={Boolean(task)}
      onClose={onClose}
      size="default"
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            保存修改
          </Button>
        </Space>
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
          />
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
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Drawer
      title={
        <Space>
          <UploadOutlined />
          <span>上传文档拆任务</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      size="default"
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            AI 拆解并入库
          </Button>
        </Space>
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
        <Form.Item label="所属项目" name="project" rules={[{ required: true, message: "请选择所属项目" }]}>
          <Select
            showSearch
            placeholder="选择项目"
            options={projectOptions.map((project) => ({
              value: project,
              label: project
            }))}
          />
        </Form.Item>
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
          optionFilterProp="label"
          options={people.map((person) => ({
            value: person.openId,
            label: person.email ? `${person.name} · ${person.email}` : person.name
          }))}
          onChange={(value) => {
            const selectedPerson = people.find((person) => person.openId === value);

            form.setFieldsValue({
              ownerOpenId: value,
              ownerUnionId: selectedPerson?.unionId ?? "",
              ownerUserId: selectedPerson?.userId ?? "",
              ownerEmail: selectedPerson?.email ?? "",
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

function ProjectFields({
  form,
  people,
  peopleLoading,
  peopleError
}: {
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  people: FeishuPerson[];
  peopleLoading: boolean;
  peopleError: string;
}) {
  return (
    <>
      <Form.Item label="项目名称" name="name" rules={[{ required: true, message: "请输入项目名称" }]}>
        <Input placeholder="例如：智能项目驾驶舱二期" />
      </Form.Item>
      <OwnerSelect form={form} people={people} loading={peopleLoading} error={peopleError} />
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
          <Form.Item label="进度" name="progress">
            <InputNumber className="pm-form-control" min={0} max={100} addonAfter="%" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="健康度" name="health">
            <InputNumber className="pm-form-control" min={0} max={100} />
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
          <Form.Item label="风险数" name="riskCount">
            <InputNumber className="pm-form-control" min={0} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="摘要" name="summary">
        <Input.TextArea rows={4} placeholder="项目当前进展、目标或风险说明" />
      </Form.Item>
    </>
  );
}

function ProjectSelect({
  projectOptions,
  value,
  onChange
}: {
  projectOptions: string[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  const placeholder = projectOptions[0] ? `例如：${projectOptions[0]}` : "输入项目名称";

  return <Input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />;
}

function TaskFields({
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
      <Form.Item label="关联项目" name="project" rules={[{ required: true, message: "请选择关联项目" }]}>
        <ProjectSelect projectOptions={projectOptions} />
      </Form.Item>
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
        <ProjectSelect projectOptions={projectOptions} />
      </Form.Item>
      <Form.Item label="应对措施" name="mitigation">
        <Input.TextArea rows={4} placeholder="处理策略、责任人和检查时间" />
      </Form.Item>
    </>
  );
}

function RequirementFields({ projectOptions }: { projectOptions: string[] }) {
  return (
    <>
      <Form.Item label="需求标题" name="title" rules={[{ required: true, message: "请输入需求标题" }]}>
        <Input placeholder="例如：会议纪要自动转任务" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="优先级" name="priority">
            <Select options={["P0", "P1", "P2"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="状态" name="status">
            <Select options={["评审中", "设计中", "开发中", "待上线"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="关联项目" name="project" rules={[{ required: true, message: "请选择关联项目" }]}>
        <ProjectSelect projectOptions={projectOptions} />
      </Form.Item>
      <Form.Item label="验收标准" name="acceptance">
        <Input.TextArea rows={4} placeholder="可量化的验收条件和边界场景" />
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
