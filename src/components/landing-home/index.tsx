"use client";

import "./index.less";
import {
  ApiOutlined,
  ArrowRightOutlined,
  BranchesOutlined,
  BugOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  FileTextOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import Link from "next/link";

type LandingHomeProps = {
  isAuthenticated: boolean;
  primaryHref: string;
  versionDashboardHref: string;
  workbenchHref: string;
};

const capabilityItems = [
  {
    icon: <FileTextOutlined />,
    title: "需求先成形",
    text: "PRD、验收点、前后端事项和测试风险统一沉淀，版本节奏不再散在群聊里。"
  },
  {
    icon: <DashboardOutlined />,
    title: "任务看得见",
    text: "阶段看板、负责人视图和版本大屏同步推进，延期和阻塞能在第一屏暴露。"
  },
  {
    icon: <BugOutlined />,
    title: "Bug 直接推进",
    text: "缺陷、复现、附件和 AI 修复链路串起来，代码改动进 PR，不靠人工反复转述。"
  }
];

const previewTasks = [
  { title: "确认站内权限配置表", owner: "后端", status: "进行中" },
  { title: "登录渠道头像同步验收", owner: "产品", status: "评审中" },
  { title: "版本大屏移动端适配", owner: "前端", status: "待处理" }
];

// 首页参考 interview 的“产品叙事 + 工作台实景预览”首屏，但内容必须落到 AI PM 的项目交付场景；
// 这里不复用业务工作台组件，避免未登录访客触发数据库读取或权限同步副作用。
export function LandingHome({ isAuthenticated, primaryHref, versionDashboardHref, workbenchHref }: LandingHomeProps) {
  return (
    <main className="landing-home" id="main-content">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__media" aria-hidden="true" />
        <div className="landing-hero__shade" aria-hidden="true" />
        <header className="landing-nav">
          <Link className="landing-brand" href="/">
            <span className="landing-brand__mark">
              <ThunderboltOutlined />
            </span>
            <span>
              <strong>AI PM</strong>
              <small>智能项目管理平台</small>
            </span>
          </Link>
          <nav className="landing-nav__links" aria-label="首页导航">
            <a href="#workflow">工作流</a>
            <a href="#capabilities">能力</a>
            <a href={workbenchHref}>工作台</a>
          </nav>
        </header>

        <div className="landing-hero__content">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">项目 AI 协同工作台</p>
            <h1 id="landing-title">AI PM</h1>
            <p className="landing-hero__lead">
              需求，先拆清楚。任务，一眼知道谁在推进。Bug，能直接接到代码修复。把项目经理、产品、研发、测试每天反复同步的事，收进一条可追踪的工作流。
            </p>
            <div className="landing-hero__actions">
              <a className="landing-button landing-button--primary" href={primaryHref}>
                <span>{isAuthenticated ? "进入工作台" : "登录并进入工作台"}</span>
                <ArrowRightOutlined />
              </a>
              <a className="landing-button landing-button--ghost" href={versionDashboardHref}>
                <DashboardOutlined />
                <span>查看版本大屏</span>
              </a>
            </div>
            <dl className="landing-hero__stats" aria-label="AI PM 核心指标">
              <div>
                <dt>版本节奏</dt>
                <dd>一屏跟进</dd>
              </div>
              <div>
                <dt>任务流转</dt>
                <dd>拖拽同步</dd>
              </div>
              <div>
                <dt>Bug 修复</dt>
                <dd>自动开 PR</dd>
              </div>
            </dl>
          </div>

          <aside className="landing-preview" aria-label="AI PM 工作台预览">
            <div className="landing-preview__sidebar">
              <strong>Workspace</strong>
              <span className="is-active">个人工作台</span>
              <span>版本大屏</span>
              <span>任务看板</span>
              <span>Bug 管理</span>
            </div>
            <div className="landing-preview__main">
              <div className="landing-preview__top">
                <div>
                  <span>本周交付</span>
                  <strong>AI PM 站内认证与看板优化</strong>
                </div>
                <span className="landing-preview__badge">健康度 86</span>
              </div>
              <div className="landing-preview__metrics">
                <div>
                  <small>推进中任务</small>
                  <strong>24</strong>
                </div>
                <div>
                  <small>待验收需求</small>
                  <strong>7</strong>
                </div>
                <div>
                  <small>阻塞 Bug</small>
                  <strong>3</strong>
                </div>
              </div>
              <div className="landing-preview__board">
                {previewTasks.map((task) => (
                  <article key={task.title}>
                    <span>{task.status}</span>
                    <strong>{task.title}</strong>
                    <small>{task.owner}</small>
                  </article>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-workflow" id="workflow" aria-labelledby="workflow-title">
        <div>
          <p className="landing-section-kicker">从想法到交付</p>
          <h2 id="workflow-title">把“今天谁推进什么”变成默认可见</h2>
        </div>
        <ol>
          <li>
            <FileTextOutlined />
            <span>文档拆需求</span>
          </li>
          <li>
            <BranchesOutlined />
            <span>版本排任务</span>
          </li>
          <li>
            <CheckCircleOutlined />
            <span>看板盯流转</span>
          </li>
          <li>
            <ApiOutlined />
            <span>AI 接修复</span>
          </li>
        </ol>
      </section>

      <section className="landing-capabilities" id="capabilities" aria-labelledby="capabilities-title">
        <div className="landing-section-head">
          <p className="landing-section-kicker">内建能力</p>
          <h2 id="capabilities-title">不是再加一个报表页，而是把项目现场接起来</h2>
        </div>
        <div className="landing-capability-grid">
          {capabilityItems.map((item) => (
            <article key={item.title}>
              <span>{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <div>
          <p className="landing-section-kicker">准备接入你的项目现场</p>
          <h2>从首页进入，回到真正可用的工作台</h2>
        </div>
        <a className="landing-button landing-button--primary" href={primaryHref}>
          <span>{isAuthenticated ? "进入 AI PM" : "登录 AI PM"}</span>
          <ArrowRightOutlined />
        </a>
      </section>
    </main>
  );
}
