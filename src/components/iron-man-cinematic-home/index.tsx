"use client";

import "./index.less";
import {
  ArrowRightOutlined,
  BranchesOutlined,
  BugOutlined,
  CodeOutlined,
  DashboardOutlined,
  LoginOutlined,
  PlayCircleOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type CinematicShot = {
  key: string;
  index: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
  metric: string;
  command: string;
  accent: string;
  temperature: string;
  lens: string;
  icon: ReactNode;
  beats: string[];
};

const sketchfabModelEmbedUrl =
  "https://sketchfab.com/models/dde1085c464d4f8da259fe6669ae4dd2/embed?autostart=1&preload=1&transparent=1&ui_theme=dark&dnt=1";

const cinematicShots: CinematicShot[] = [
  {
    key: "reactor",
    index: "01",
    eyebrow: "ARC REACTOR WAKE",
    title: "Mark 85 进入 AI PM 作战舱",
    subtitle: "镜头从反应堆冷光推入，项目全局、版本节奏和风险警报在装甲表面同步点亮。",
    body: "这个首页不是普通卡片堆叠，而是把 AI PM 的交付现场拍成一条电影预告片：滚动就是运镜，模型就是主角，数据 HUD 就是分镜字幕。",
    metric: "98.7% suit sync",
    command: "command center",
    accent: "#45f4d1",
    temperature: "cold open",
    lens: "35mm macro",
    icon: <DashboardOutlined />,
    beats: ["项目健康扫描", "版本热区锁定", "关键负责人上线"],
  },
  {
    key: "briefing",
    index: "02",
    eyebrow: "MISSION BRIEF",
    title: "需求像任务简报一样展开",
    subtitle: "PRD、会议纪要和口头输入被拆成验收点，像战术标记一样贴到下一段镜头里。",
    body: "AI PM 的首页风格继续保留项目管理的真实感：不是卖概念，而是让用户第一眼看到需求、任务、Bug、PR 如何进入同一条交付链路。",
    metric: "12 acceptance locks",
    command: "requirement map",
    accent: "#f5c15b",
    temperature: "gold tactical",
    lens: "anamorphic wide",
    icon: <RadarChartOutlined />,
    beats: ["验收点拆解", "边界条件标注", "版本目标对齐"],
  },
  {
    key: "assembly",
    index: "03",
    eyebrow: "NANO ASSEMBLY",
    title: "任务推进有装甲拼合的节奏",
    subtitle: "阶段流转、负责人变化和延期信号被组织成一段高速装配蒙太奇。",
    body: "滚动中每一屏都像分镜脚本的一格：左侧是导演字幕，右侧是模型和 HUD，底部则用时间码和镜头条把故事连接起来。",
    metric: "24 stage moves",
    command: "delivery pulse",
    accent: "#ff5b42",
    temperature: "reactor heat",
    lens: "80mm chase",
    icon: <BranchesOutlined />,
    beats: ["阶段拖拽", "负责人负载", "延期风险"],
  },
  {
    key: "targeting",
    index: "04",
    eyebrow: "TARGETING LOOP",
    title: "Bug 被锁定到代码闭环",
    subtitle: "复现材料、影响范围、仓库分支和 AI 修复状态在瞄准环里连续刷新。",
    body: "电影感不只靠黑底和光线，还靠叙事冲突。这里把 Bug 从出现、定位、生成修复到 PR 确认做成一组高压目标锁定镜头。",
    metric: "5 PR awaiting",
    command: "fix loop",
    accent: "#38a8ff",
    temperature: "blue alert",
    lens: "120mm scope",
    icon: <BugOutlined />,
    beats: ["复现证据", "AI 修复分支", "PR 人工确认"],
  },
  {
    key: "launch",
    index: "05",
    eyebrow: "FINAL LAUNCH",
    title: "上线前最后一秒保持冷静",
    subtitle: "版本大屏、周报、风险回归和团队状态在最后一段长镜头里完成收束。",
    body: "结尾保留 AI PM 的产品目标：让管理者、产品、研发、测试在同一个高密度界面里看清交付是否真的可以发射。",
    metric: "ready to ship",
    command: "launch lock",
    accent: "#e6ff6f",
    temperature: "green clearance",
    lens: "50mm hero",
    icon: <ThunderboltOutlined />,
    beats: ["上线检查", "周报导出", "风险回归"],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// 独立首页用原生滚动驱动分镜，避免额外动画库把外部 3D iframe 反复重建。
// Scroll progress 同时写入 CSS 变量，CSS 负责光带、遮幅、HUD 和镜头层的插值。
export function IronManCinematicHome() {
  const rootRef = useRef<HTMLElement>(null);
  const [activeShotIndex, setActiveShotIndex] = useState(0);
  const activeShot = cinematicShots[activeShotIndex];
  const activeProgress = cinematicShots.length <= 1 ? 0 : activeShotIndex / (cinematicShots.length - 1);
  const shotStyle = useMemo(
    () =>
      ({
        "--iron-accent": activeShot.accent,
        "--iron-progress": activeProgress.toFixed(4),
        "--iron-shot": activeShotIndex,
      }) as CSSProperties,
    [activeProgress, activeShot.accent, activeShotIndex]
  );

  useEffect(() => {
    let frameId = 0;

    const syncScrollState = () => {
      const root = rootRef.current;

      if (!root) {
        return;
      }

      const rect = root.getBoundingClientRect();
      const scrollableHeight = Math.max(1, root.offsetHeight - window.innerHeight);
      const progress = clamp((window.scrollY - (window.scrollY + rect.top)) / scrollableHeight, 0, 1);
      const nextIndex = clamp(Math.round(progress * (cinematicShots.length - 1)), 0, cinematicShots.length - 1);

      root.style.setProperty("--iron-scroll", progress.toFixed(4));
      root.style.setProperty("--iron-shot-float", (progress * (cinematicShots.length - 1)).toFixed(4));
      setActiveShotIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    const requestSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncScrollState);
    };

    syncScrollState();
    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", requestSync);
      window.removeEventListener("resize", requestSync);
    };
  }, []);

  const jumpToShot = useCallback((shotIndex: number) => {
    const root = rootRef.current;

    if (!root) {
      setActiveShotIndex(shotIndex);
      return;
    }

    // 点击分镜导航时仍然写真实滚动位置，保证 sticky 舞台、章节文案和 HUD 时间轴完全同步。
    const rootTop = window.scrollY + root.getBoundingClientRect().top;
    const scrollableHeight = Math.max(1, root.offsetHeight - window.innerHeight);
    const targetProgress = shotIndex / Math.max(1, cinematicShots.length - 1);

    window.scrollTo({
      behavior: "smooth",
      top: rootTop + scrollableHeight * targetProgress,
    });
  }, []);

  return (
    <main className="iron-cinematic-home" ref={rootRef} style={shotStyle}>
      <section className="iron-cinematic-home__stage" aria-label="AI PM 钢铁侠电影分镜首页">
        <div className="iron-cinematic-home__backplate" aria-hidden="true" />
        <div className="iron-cinematic-home__grid" aria-hidden="true" />
        <div className="iron-cinematic-home__beam" aria-hidden="true" />
        <div className="iron-cinematic-home__model">
          <iframe
            allow="autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
            className="iron-cinematic-home__model-frame"
            src={sketchfabModelEmbedUrl}
            title="Iron-Man Mark 85 Rigged 3D model"
          />
          <div className="iron-cinematic-home__model-mask" aria-hidden="true" />
        </div>

        <header className="iron-cinematic-home__nav">
          <Link className="iron-cinematic-home__brand" href="/">
            <span>AI</span>
            <strong>AI PM / STARK CUT</strong>
          </Link>
          <nav aria-label="电影首页导航">
            <Link href="/robot-story">Robot Story</Link>
            <Link href="/workbench?view=versionDashboard">版本大屏</Link>
            <Link href="/workbench">工作台</Link>
          </nav>
        </header>

        <section className="iron-cinematic-home__copy" aria-live="polite">
          <div className="iron-cinematic-home__slate">
            <span>{activeShot.index}</span>
            <i />
            <em>{activeShot.eyebrow}</em>
          </div>
          <h1>{activeShot.title}</h1>
          <p className="iron-cinematic-home__subtitle">{activeShot.subtitle}</p>
          <p className="iron-cinematic-home__body">{activeShot.body}</p>
          <div className="iron-cinematic-home__actions">
            <Link className="iron-cinematic-home__primary" href="/workbench">
              <LoginOutlined />
              进入工作台
            </Link>
            <Link className="iron-cinematic-home__secondary" href="/workbench?view=versionDashboard">
              <PlayCircleOutlined />
              看版本大屏
            </Link>
          </div>
        </section>

        <aside className="iron-cinematic-home__hud" aria-label="当前分镜数据">
          <div className="iron-cinematic-home__hud-top">
            <span>{activeShot.icon}</span>
            <strong>{activeShot.command}</strong>
          </div>
          <em>{activeShot.metric}</em>
          <dl>
            <div>
              <dt>LENS</dt>
              <dd>{activeShot.lens}</dd>
            </div>
            <div>
              <dt>LOOK</dt>
              <dd>{activeShot.temperature}</dd>
            </div>
          </dl>
          <ul>
            {activeShot.beats.map((beat) => (
              <li key={beat}>
                <CodeOutlined />
                {beat}
              </li>
            ))}
          </ul>
        </aside>

        <div className="iron-cinematic-home__rail" aria-label="分镜导航">
          {cinematicShots.map((shot, index) => (
            <button
              aria-current={index === activeShotIndex ? "step" : undefined}
              aria-label={`跳转到分镜 ${shot.index} ${shot.title}`}
              key={shot.key}
              onClick={() => jumpToShot(index)}
              type="button"
            >
              <span>{shot.index}</span>
              <i />
            </button>
          ))}
        </div>

        <div className="iron-cinematic-home__timeline" aria-hidden="true">
          <span>00:0{activeShotIndex + 1}:MARK85</span>
          <i />
          <span>{activeShot.eyebrow}</span>
        </div>

        <div className="iron-cinematic-home__scroll-hint">
          <span>SCROLL FILM</span>
          <ArrowRightOutlined />
        </div>
      </section>

      <section className="iron-cinematic-home__chapters" aria-label="滚动分镜章节">
        {cinematicShots.map((shot, index) => (
          <article className="iron-cinematic-home__chapter" data-active={index === activeShotIndex} key={shot.key}>
            <span>{shot.index}</span>
            <h2>{shot.title}</h2>
            <p>{shot.subtitle}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
