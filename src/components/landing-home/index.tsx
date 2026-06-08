"use client";

import "./index.less";
import {
  AimOutlined,
  ApiOutlined,
  ArrowRightOutlined,
  BranchesOutlined,
  BugOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  FireOutlined,
  FundProjectionScreenOutlined,
  PartitionOutlined,
  RadarChartOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import Link from "next/link";
import { useCallback } from "react";
import type { PointerEvent } from "react";

type LandingHomeProps = {
  isAuthenticated: boolean;
  primaryHref: string;
  versionDashboardHref: string;
  workbenchHref: string;
};

const signalItems = [
  { label: "版本节奏", value: "实时锁定", icon: <FieldTimeOutlined /> },
  { label: "任务流转", value: "拖拽推进", icon: <BranchesOutlined /> },
  { label: "Bug 修复", value: "AI 开 PR", icon: <BugOutlined /> }
];

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
    icon: <SafetyCertificateOutlined />,
    title: "修复能闭环",
    text: "缺陷、复现、附件、代码仓库和 AI 修复链路串起来，真正把问题推进到 PR。"
  }
];

const commandNodes = [
  { label: "需求拆解", value: "12 条验收点", x: "18%", y: "23%" },
  { label: "版本推进", value: "86% 健康度", x: "70%", y: "18%" },
  { label: "风险拦截", value: "3 个阻塞", x: "76%", y: "70%" },
  { label: "AI 修复", value: "PR 待确认", x: "21%", y: "74%" }
];

const previewTasks = [
  { title: "站内权限配置表字段校验", owner: "后端", status: "进行中", tone: "hot" },
  { title: "登录渠道头像同步验收", owner: "产品", status: "评审中", tone: "focus" },
  { title: "版本大屏移动端适配", owner: "前端", status: "待处理", tone: "calm" }
];

const workflowItems = [
  { icon: <FileTextOutlined />, title: "文档拆需求", text: "AI 把模糊描述拆成可验收事项" },
  { icon: <PartitionOutlined />, title: "版本排任务", text: "自动带出负责人、阶段和依赖关系" },
  { icon: <RadarChartOutlined />, title: "看板盯流转", text: "延期、阻塞和风险第一时间亮起" },
  { icon: <ApiOutlined />, title: "AI 接修复", text: "Bug 进入代码分支，生成 PR 等人确认" }
];

// 首页参考 ai-interview 的多层背景、产品截图与滚动叙事，但不复刻招聘语境；
// AI PM 的首屏必须直接表达“项目现场正在流动”，所以这里用动态指挥台、脉冲节点和任务流来替代静态大图。
export function LandingHome({ isAuthenticated, primaryHref, versionDashboardHref, workbenchHref }: LandingHomeProps) {
  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    // 鼠标聚光只写 CSS 变量，不进 React state；这样高频 pointermove 不会触发重渲染，动画也更顺滑。
    event.currentTarget.style.setProperty("--cursor-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--cursor-y", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <main className="landing-home" id="main-content" onPointerMove={handlePointerMove}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__media" aria-hidden="true" />
        <div className="landing-hero__shade" aria-hidden="true" />
        <div className="landing-hero__motion" aria-hidden="true">
          <span className="landing-hero__beam landing-hero__beam--one" />
          <span className="landing-hero__beam landing-hero__beam--two" />
          <span className="landing-hero__beam landing-hero__beam--three" />
          <span className="landing-hero__scan" />
        </div>
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
          <span className="landing-nav__status">
            <i aria-hidden="true" />
            Live delivery OS
          </span>
        </header>

        <div className="landing-hero__content">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">
              <RocketOutlined />
              项目 AI 协同工作台
            </p>
            <h1 id="landing-title">
              AI PM
              <span>项目作战舱</span>
            </h1>
            <p className="landing-hero__lead">
              需求一进来，AI 先拆清楚。任务谁在推进、版本哪里卡住、Bug 有没有进代码分支，全部在同一块实时看板里亮起来。
            </p>
            <div className="landing-hero__actions">
              <a className="landing-button landing-button--primary" href={primaryHref}>
                <RocketOutlined />
                <span>{isAuthenticated ? "进入工作台" : "登录并进入工作台"}</span>
                <ArrowRightOutlined />
              </a>
              <a className="landing-button landing-button--ghost" href={versionDashboardHref}>
                <FundProjectionScreenOutlined />
                <span>打开版本大屏</span>
              </a>
            </div>
            <dl className="landing-hero__signals" aria-label="AI PM 核心能力">
              {signalItems.map((item) => (
                <div key={item.label}>
                  <dt>
                    {item.icon}
                    {item.label}
                  </dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <aside className="landing-command" aria-label="AI PM 动态工作台预览">
            <div className="landing-command__header">
              <span>Delivery Command Center</span>
              <strong>版本 2026.04 火力推进中</strong>
            </div>
            <div className="landing-command__stage">
              <div className="landing-radar" aria-hidden="true">
                <span className="landing-radar__ring landing-radar__ring--one" />
                <span className="landing-radar__ring landing-radar__ring--two" />
                <span className="landing-radar__sweep" />
                <div className="landing-radar__core">
                  <DeploymentUnitOutlined />
                  <strong>86</strong>
                  <small>健康度</small>
                </div>
                {commandNodes.map((node) => (
                  <span className="landing-radar__node" key={node.label} style={{ left: node.x, top: node.y }}>
                    <i />
                    <b>{node.label}</b>
                    <em>{node.value}</em>
                  </span>
                ))}
              </div>

              <div className="landing-command__panel">
                <div className="landing-command__metric">
                  <span>今日推进</span>
                  <strong>24</strong>
                  <small>任务流转</small>
                </div>
                <div className="landing-command__metric">
                  <span>AI 修复</span>
                  <strong>5</strong>
                  <small>PR 待确认</small>
                </div>
                <div className="landing-command__stream" aria-label="实时任务流">
                  {previewTasks.map((task) => (
                    <article className={`landing-task landing-task--${task.tone}`} key={task.title}>
                      <span>{task.status}</span>
                      <strong>{task.title}</strong>
                      <small>{task.owner}</small>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="landing-float landing-float--left">
              <FireOutlined />
              <span>阻塞 Bug 已接入 AI 修复</span>
            </div>
            <div className="landing-float landing-float--right">
              <AimOutlined />
              <span>验收风险自动标红</span>
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-workflow" id="workflow" aria-labelledby="workflow-title">
        <div className="landing-section-head">
          <p className="landing-section-kicker">从想法到交付</p>
          <h2 id="workflow-title">把项目每天最乱的四件事，串成一条会动的链路</h2>
        </div>
        <ol className="landing-workflow__rail">
          {workflowItems.map((item) => (
            <li key={item.title}>
              <span>{item.icon}</span>
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </li>
          ))}
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
          <RocketOutlined />
          <span>{isAuthenticated ? "进入 AI PM" : "登录 AI PM"}</span>
          <ArrowRightOutlined />
        </a>
      </section>
    </main>
  );
}
