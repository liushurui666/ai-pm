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
  ProjectOutlined,
  RadarChartOutlined,
  RocketOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { ThemeToggleButton, useThemePreference } from "@/components/theme-mode";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
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

// 这三组数据把首页从“展示亮点”扩展为完整交付主题：主线、角色现场和落地证明必须讲同一件事。
const operatingSignals = [
  { icon: <FileTextOutlined />, label: "需求输入", value: "PRD / 会议 / 链接" },
  { icon: <PartitionOutlined />, label: "AI 编排", value: "任务 / 验收 / 风险" },
  { icon: <BranchesOutlined />, label: "阶段推进", value: "看板 / 版本 / 成员" },
  { icon: <BugOutlined />, label: "代码闭环", value: "Bug / 分支 / PR" }
];

const roleLanes = [
  {
    icon: <DashboardOutlined />,
    role: "项目经理",
    title: "节奏总控",
    text: "版本健康、延期任务和阻塞风险在同一条线上滚动，早会不再从群消息里捞进度。",
    points: ["版本健康", "成员负载", "周报导出"]
  },
  {
    icon: <FileTextOutlined />,
    role: "产品",
    title: "需求变交付",
    text: "每个需求都带着验收点、边界条件和前后端事项进入版本，评审后能直接推进。",
    points: ["PRD 拆解", "验收清单", "需求版本"]
  },
  {
    icon: <ApiOutlined />,
    role: "研发",
    title: "任务进分支",
    text: "缺陷不是只停在描述里，仓库、分支、复现材料和 AI 修复任务会一起进入执行链路。",
    points: ["Bug 复现", "AI 修复", "PR 确认"]
  },
  {
    icon: <SafetyCertificateOutlined />,
    role: "测试验收",
    title: "风险能回归",
    text: "测试风险、回归结果和版本验收状态沉淀下来，交付前能看到真正没闭合的地方。",
    points: ["风险标记", "回归记录", "上线校验"]
  }
];

const proofItems = [
  { value: "1 条主线", label: "需求到 PR", text: "所有页面围绕同一条交付链路展开，首页、看板和版本大屏不再像三个孤岛。" },
  { value: "4 个现场", label: "产品 / 项目 / 研发 / 测试", text: "不同角色看到的是自己的推进动作，但数据源保持一致。" },
  { value: "实时反馈", label: "风险先亮起来", text: "延期、阻塞、未验收和 AI 修复状态会进入统一节奏盘。" }
];

const scrollStoryItems = [
  {
    badge: "01 / Requirement Map",
    icon: <FileTextOutlined />,
    metric: "12 条验收点",
    title: "需求进入后，先变成可执行地图",
    text: "AI 把 PRD、会议纪要和口头描述拆成角色、验收点、前后端事项与测试边界，项目经理不用再手动补一遍上下文。"
  },
  {
    badge: "02 / Delivery Pulse",
    icon: <RadarChartOutlined />,
    metric: "86% 健康度",
    title: "版本推进时，风险会自己浮上来",
    text: "阶段拖拽、负责人变更、延期任务和阻塞 Bug 进入同一个节奏盘，滚动就像看一场项目推进的实时回放。"
  },
  {
    badge: "03 / AI Fix Loop",
    icon: <ApiOutlined />,
    metric: "5 个 PR",
    title: "Bug 不止被记录，而是被推进到代码",
    text: "复现、附件、仓库、分支和 AI 修复任务被串成闭环，最终停在可确认的 PR，而不是停在聊天里的“我看看”。"
  }
];

// 首页参考 ai-interview 的多层背景、产品截图与滚动叙事，但不复刻招聘语境；
// AI PM 的首屏必须直接表达“项目现场正在流动”，所以这里用动态指挥台、脉冲节点和任务流来替代静态大图。
export function LandingHome({ isAuthenticated, primaryHref, versionDashboardHref, workbenchHref }: LandingHomeProps) {
  const homeRef = useRef<HTMLElement>(null);
  const { cycleMode, effectiveTheme, mode: themeMode } = useThemePreference();

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    // 鼠标聚光只写 CSS 变量，不进 React state；这样高频 pointermove 不会触发重渲染，动画也更顺滑。
    event.currentTarget.style.setProperty("--cursor-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--cursor-y", `${event.clientY - rect.top}px`);
  }, []);

  useEffect(() => {
    const root = homeRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!root || reducedMotion) {
      root?.querySelectorAll<HTMLElement>("[data-landing-reveal]").forEach((element) => {
        element.classList.add("is-visible");
      });
      return;
    }

    let frame = 0;
    const hero = root.querySelector<HTMLElement>(".landing-hero");
    const story = root.querySelector<HTMLElement>(".landing-scroll-story");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.18
      }
    );

    root.querySelectorAll<HTMLElement>("[data-landing-reveal]").forEach((element) => {
      revealObserver.observe(element);
    });

    const clampProgress = (value: number) => Math.min(1, Math.max(0, value));
    const updateScrollProgress = () => {
      frame = 0;

      // 这里不用额外引入 GSAP：只把滚动进度写成 CSS 变量，由样式层驱动首屏缩放和滚动剧场进度条；
      // 这样既能做出参考站的滚动感，又不会把首页依赖变重。
      if (hero) {
        const rect = hero.getBoundingClientRect();
        const range = Math.max(1, rect.height - window.innerHeight * 0.42);
        const progress = clampProgress(-rect.top / range);
        root.style.setProperty("--hero-command-y", `${Math.round(progress * -34)}px`);
        root.style.setProperty("--hero-command-scale", `${1 - progress * 0.045}`);
      }

      if (story) {
        const rect = story.getBoundingClientRect();
        const range = Math.max(1, rect.height - window.innerHeight);
        const progress = clampProgress(-rect.top / range);
        root.style.setProperty("--story-progress", progress.toFixed(3));
      }
    };

    const requestScrollUpdate = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(updateScrollProgress);
      }
    };

    updateScrollProgress();
    window.addEventListener("scroll", requestScrollUpdate, { passive: true });
    window.addEventListener("resize", requestScrollUpdate);

    return () => {
      revealObserver.disconnect();
      window.removeEventListener("scroll", requestScrollUpdate);
      window.removeEventListener("resize", requestScrollUpdate);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <main className="landing-home" id="main-content" onPointerMove={handlePointerMove} ref={homeRef}>
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
              <ProjectOutlined />
            </span>
            <span>
              <strong>AI PM</strong>
              <small>智能项目管理平台</small>
            </span>
          </Link>
          <nav className="landing-nav__links" aria-label="首页导航">
            <a href="#system">系统</a>
            <a href="#workflow">工作流</a>
            <a href="#capabilities">能力</a>
            <a href={workbenchHref}>工作台</a>
          </nav>
          <div className="landing-nav__tools">
            <span className="landing-nav__status">
              <i aria-hidden="true" />
              Live delivery OS
            </span>
            {/* 首页和登录后工作台共用同一个主题 hook：这里写入的 localStorage/cookie 会被 /workbench 首屏脚本直接读取。 */}
            <ThemeToggleButton
              mode={themeMode}
              effectiveTheme={effectiveTheme}
              onClick={cycleMode}
              showLabel
            />
          </div>
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

      <section className="landing-scroll-story" aria-labelledby="scroll-story-title">
        <div className="landing-scroll-story__intro" data-landing-reveal>
          <p className="landing-section-kicker">Scroll Command</p>
          <h2 id="scroll-story-title">往下滚，项目不是换几张图，而是在你眼前推进</h2>
          <p>
            AI PM 把需求地图、版本脉冲和修复闭环放在同一条滚动时间线上，项目从进入系统那一刻开始就能被追踪、判断和推进。
          </p>
        </div>

        <div className="landing-scroll-story__stage">
          <div className="landing-scroll-story__sticky" aria-hidden="true">
            <div className="landing-scroll-meter">
              <span />
            </div>
            <div className="landing-story-screen">
              <div className="landing-story-screen__top">
                <span>AI PM / live delivery replay</span>
                <strong>项目推进轨迹</strong>
              </div>
              <div className="landing-story-screen__body">
                <div className="landing-story-map">
                  <span className="landing-story-map__line landing-story-map__line--one" />
                  <span className="landing-story-map__line landing-story-map__line--two" />
                  {scrollStoryItems.map((item, index) => (
                    <div className={`landing-story-map__node landing-story-map__node--${index + 1}`} key={item.title}>
                      {item.icon}
                      <strong>{item.metric}</strong>
                    </div>
                  ))}
                </div>
                <div className="landing-story-table">
                  <span>需求拆分完成</span>
                  <span>任务已进入看板</span>
                  <span>AI 修复 PR 等待确认</span>
                </div>
              </div>
            </div>
          </div>

          <ol className="landing-scroll-story__steps">
            {scrollStoryItems.map((item) => (
              <li data-landing-reveal key={item.title}>
                <span>{item.badge}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <strong>{item.metric}</strong>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="landing-system" data-landing-reveal id="system" aria-labelledby="system-title">
        <div className="landing-system__halo" aria-hidden="true" />
        <div className="landing-system__head">
          <p className="landing-section-kicker">统一交付主题</p>
          <h2 id="system-title">一套交付调度系统，把需求、版本、缺陷和 PR 接在一起</h2>
          <p>
            AI PM 的真实产品逻辑从这里展开：需求进入、AI 编排、阶段推进、代码闭环，所有角色围绕同一条主线工作。
          </p>
        </div>

        <div className="landing-system__flow" aria-label="AI PM 交付主线">
          {operatingSignals.map((item, index) => (
            <div className="landing-system__node" key={item.label}>
              <span>{item.icon}</span>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <strong>{item.label}</strong>
              <em>{item.value}</em>
            </div>
          ))}
        </div>

        <div className="landing-system__roles" aria-label="不同角色的项目现场">
          {roleLanes.map((item) => (
            <article className="landing-role" key={item.role}>
              <div className="landing-role__top">
                <span>{item.icon}</span>
                <small>{item.role}</small>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <div className="landing-role__tags">
                {item.points.map((point) => (
                  <b key={point}>{point}</b>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="landing-proof" aria-label="首页主题落地证明">
          {proofItems.map((item) => (
            <div key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-workflow" data-landing-reveal id="workflow" aria-labelledby="workflow-title">
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

      <section className="landing-capabilities" data-landing-reveal id="capabilities" aria-labelledby="capabilities-title">
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

      <section className="landing-final" data-landing-reveal>
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
