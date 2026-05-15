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
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Layout,
  List,
  Menu,
  Progress,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  theme
} from "antd";
import type { BadgeProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AlertOutlined,
  ApiOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ProjectOutlined,
  RobotOutlined,
  SearchOutlined,
  SendOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import type {
  DashboardData,
  DocumentItem,
  Project,
  Requirement,
  Risk,
  Task,
  TaskStage
} from "@/types/dashboard";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const taskStages: TaskStage[] = ["待处理", "进行中", "评审中", "已完成"];

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

export function ProjectManagementPlatform() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [activeView, setActiveView] = useState("overview");
  const [projectFilter, setProjectFilter] = useState("全部");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "我会持续观察项目进度、任务阻塞和风险变化。你可以问我：本周风险、生成周报、拆解需求。"
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [form] = Form.useForm<{ message: string }>();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard");
        const nextData = (await response.json()) as DashboardData & { error?: string };

        if (response.status === 401) {
          window.location.href = "/login";

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

  const filteredProjects = useMemo(() => {
    if (!data) {
      return [];
    }

    if (projectFilter === "全部") {
      return data.projects;
    }

    return data.projects.filter((project) => project.status === projectFilter);
  }, [data, projectFilter]);

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
        window.location.href = "/login";

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
                  <Tag color={data.meta.source === "feishu" ? "green" : "default"}>
                    {data.meta.source === "feishu" ? "飞书数据" : "演示数据"}
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
                  {activeView === "overview" ? <Overview data={data} /> : null}
                  {activeView === "projects" ? (
                    <ProjectsView
                      columns={projectColumns}
                      projects={filteredProjects}
                      projectFilter={projectFilter}
                      onFilterChange={setProjectFilter}
                    />
                  ) : null}
                  {activeView === "tasks" ? <TasksView tasks={data.tasks} /> : null}
                  {activeView === "requirements" ? (
                    <TableView
                      title="需求管理"
                      subtitle="围绕优先级、验收标准和关联项目组织需求执行。"
                      icon={<NodeIndexOutlined />}
                      extra={
                        <Button type="primary" icon={<PlusOutlined />}>
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
                  {activeView === "risks" ? <RisksView risks={data.risks} /> : null}
                  {activeView === "docs" ? (
                    <TableView
                      title="文档知识库"
                      subtitle="集中沉淀 PRD、会议纪要、技术方案和项目复盘。"
                      icon={<FileTextOutlined />}
                      extra={
                        <Button type="primary" icon={<PlusOutlined />}>
                          新建文档
                        </Button>
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

function Overview({ data }: { data: DashboardData }) {
  const topRiskProject = data.projects.reduce((current, project) =>
    project.health < current.health ? project : current
  );

  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      {data.meta?.message ? (
        <Alert
          type={data.meta.source === "feishu" ? "success" : "info"}
          showIcon
          title={data.meta.message}
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
            <Button type="primary" icon={<RobotOutlined />}>
              生成本周汇报
            </Button>
            <Button icon={<AlertOutlined />}>查看风险清单</Button>
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
  onFilterChange
}: {
  columns: ColumnsType<Project>;
  projects: Project[];
  projectFilter: string;
  onFilterChange: (value: string) => void;
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
          <Button type="primary" icon={<PlusOutlined />}>
            新建项目
          </Button>
        </Space>
      }
    >
      <Table rowKey="id" columns={columns} dataSource={projects} pagination={false} scroll={{ x: 920 }} />
    </TableView>
  );
}

function TasksView({ tasks }: { tasks: Task[] }) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<CheckCircleOutlined />}
        title="任务看板"
        subtitle="按状态推进任务，并让 AI 标记依赖、延期和补充动作。"
        extra={
          <Button type="primary" icon={<PlusOutlined />}>
            新建任务
          </Button>
        }
      />

      <div className="kanban-grid">
        {taskStages.map((stage) => {
          const stageTasks = tasks.filter((task) => task.stage === stage);

          return (
            <Card className="kanban-column" title={`${stage} ${stageTasks.length}`} key={stage}>
              {stageTasks.length ? (
                <Space orientation="vertical" size={12} className="pm-wide">
                  {stageTasks.map((task) => (
                    <div className="task-card" key={task.id}>
                      <Flex justify="space-between" align="start" gap={12}>
                        <Text strong>{task.title}</Text>
                        <Tag color={priorityColor[task.priority]}>{task.priority}</Tag>
                      </Flex>
                      <Text type="secondary">{task.project}</Text>
                      <Divider />
                      <Flex justify="space-between" align="center">
                        <Space>
                          <Avatar size="small">{task.owner.slice(0, 1)}</Avatar>
                          <Text>{task.owner}</Text>
                        </Space>
                        <Text type="secondary">{task.dueDate}</Text>
                      </Flex>
                      <Alert
                        className="task-ai-hint"
                        type={task.priority === "高" ? "warning" : "info"}
                        showIcon
                        title={task.aiHint}
                      />
                    </div>
                  ))}
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />
              )}
            </Card>
          );
        })}
      </div>
    </Space>
  );
}

function RisksView({ risks }: { risks: Risk[] }) {
  return (
    <Space orientation="vertical" size={18} className="pm-page-stack">
      <PageTitle
        icon={<AlertOutlined />}
        title="风险中心"
        subtitle="集中管理 AI 自动发现和人工登记的项目风险。"
        extra={
          <Button type="primary" icon={<PlusOutlined />}>
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
