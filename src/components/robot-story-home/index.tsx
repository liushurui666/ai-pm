"use client";

import "./index.less";
import {
  ArrowRightOutlined,
  CompassOutlined,
  LoginOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { robotStoryChapters } from "./story-data";
import { useRobotStoryScene } from "./three/use-robot-story-scene";

// 独立机器人首页负责把“产品能力”翻译成滚动电影分镜：
// React 层承载可访问文案、导航和 CTA，Three 层承载机器人动作、运镜和光场，两者只共享 activeChapterIndex。
export function RobotStoryHome() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const pointerRef = useRef({ active: 0, x: 0, y: 0 });
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const activeChapter = robotStoryChapters[activeChapterIndex];

  useRobotStoryScene({
    canvasRef,
    pointerRef,
    rootRef,
    setActiveChapterIndex,
    setSceneReady,
  });

  useEffect(() => {
    stageRef.current?.style.setProperty("--robot-active-accent", activeChapter.accent);
  }, [activeChapter.accent]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const normalizedY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;

    // 鼠标只作为“导演手持镜头”的微弱输入，真正的故事节奏仍由滚动驱动。
    // 这样用户停住时画面仍有呼吸感，但不会因为移动鼠标导致核心 CTA 或文字失焦。
    pointerRef.current.x = Math.max(-1, Math.min(1, normalizedX));
    pointerRef.current.y = Math.max(-1, Math.min(1, normalizedY));
    pointerRef.current.active = 1;
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointerRef.current.active = 0;
  }, []);

  const jumpToChapter = (chapterIndex: number) => {
    const root = rootRef.current;

    if (!root) {
      setActiveChapterIndex(chapterIndex);
      return;
    }

    // 节点点击也走真实滚动位置，保证 DOM、Three 运镜和机器人手势使用同一个时间轴。
    const rootTop = window.scrollY + root.getBoundingClientRect().top;
    const scrollable = Math.max(1, root.offsetHeight - window.innerHeight);
    const targetProgress = chapterIndex / Math.max(1, robotStoryChapters.length - 1);

    window.scrollTo({
      behavior: "smooth",
      top: rootTop + scrollable * targetProgress,
    });
  };

  return (
    <main
      className="robot-story-home"
      ref={rootRef}
      style={{ "--robot-active-accent": activeChapter.accent } as CSSProperties}
    >
      <section
        className="robot-story-home__stage"
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        ref={stageRef}
      >
        <canvas className="robot-story-home__canvas" ref={canvasRef} />
        <div className="robot-story-home__cinema-mask" aria-hidden="true" />

        <header className="robot-story-home__nav">
          <Link className="robot-story-home__brand" href="/">
            <span className="robot-story-home__brand-mark">AI</span>
            <span>
              <strong>AI PM</strong>
              <small>Robot Story</small>
            </span>
          </Link>
          <nav className="robot-story-home__nav-links" aria-label="机器人故事页导航">
            <Link href="/aero-system">Aero System</Link>
            <Link href="/workbench">Workbench</Link>
          </nav>
        </header>

        <div className="robot-story-home__copy">
          <div className="robot-story-home__chapter-index">
            <span>{activeChapter.index}</span>
            <i />
            <em>{activeChapter.eyebrow}</em>
          </div>
          <h1>{activeChapter.title}</h1>
          <p className="robot-story-home__subtitle">{activeChapter.subtitle}</p>
          <p className="robot-story-home__body">{activeChapter.body}</p>
          <div className="robot-story-home__actions">
            <Link className="robot-story-home__primary" href="/workbench">
              <LoginOutlined />
              进入工作台
            </Link>
            <Link className="robot-story-home__secondary" href="/workbench?view=versionDashboard">
              <PlayCircleOutlined />
              查看版本大屏
            </Link>
          </div>
        </div>

        <aside className="robot-story-home__mission" aria-label="当前分镜状态">
          <div className="robot-story-home__mission-top">
            <span className="robot-story-home__mission-icon">{activeChapter.icon}</span>
            <span>{activeChapter.signal}</span>
          </div>
          <strong>{activeChapter.metric}</strong>
          <ul>
            {activeChapter.beats.map((beat) => (
              <li key={beat}>
                <CompassOutlined />
                {beat}
              </li>
            ))}
          </ul>
        </aside>

        <div className="robot-story-home__rail" aria-label="分镜导航">
          {robotStoryChapters.map((chapter, index) => (
            <button
              aria-current={index === activeChapterIndex ? "step" : undefined}
              aria-label={`跳转到分镜 ${chapter.index} ${chapter.title}`}
              key={chapter.key}
              onClick={() => jumpToChapter(index)}
              type="button"
            >
              <span>{chapter.index}</span>
            </button>
          ))}
        </div>

        <div className="robot-story-home__loader" data-ready={sceneReady}>
          <span />
          <em>{sceneReady ? "ROBOT ONLINE" : "LOADING ROBOT"}</em>
        </div>

        <div className="robot-story-home__scroll-hint">
          <span>SCROLL STORY</span>
          <ArrowRightOutlined />
        </div>
      </section>

      <section className="robot-story-home__chapters" aria-label="滚动叙事章节">
        {robotStoryChapters.map((chapter, index) => (
          <article
            className="robot-story-home__chapter-card"
            data-active={index === activeChapterIndex}
            key={chapter.key}
            style={{ "--robot-card-accent": chapter.accent } as CSSProperties}
          >
            <span>{chapter.index}</span>
            <h2>{chapter.title}</h2>
            <p>{chapter.subtitle}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
