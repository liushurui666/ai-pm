"use client";

import "./index.less";
import {
  ArrowLeftOutlined,
  CloudOutlined,
  LoginOutlined,
  RocketOutlined,
  SendOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { aeroStoryChapters } from "./story-data";
import { clamp, getActiveChapterIndex } from "./scene-helpers";
import { useAeroCinematicScene } from "./use-aero-cinematic-scene";

// `/aero-system` 是给未登录首页后续替换方案用的可运行视觉样机：
// 主组件只负责滚动叙事和 DOM 层级，WebGL 生命周期下沉到 `useAeroCinematicScene`，避免 UI 与渲染逻辑混在一起。
export function AeroSystemShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeChapterRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; startX: number; yaw: number } | null>(
    null
  );
  const scrollFrameRef = useRef(0);
  const storyProgressRef = useRef(0);
  const yawOffsetRef = useRef(0);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const activeChapter = aeroStoryChapters[activeChapterIndex];

  const syncScrollProgress = useCallback(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    // 原生滚动是故事进度唯一来源，避免刷新恢复、触控惯性和 WebGL 动画互相抢状态。
    const maxScroll = Math.max(1, root.offsetHeight - window.innerHeight);
    const progress = clamp((window.scrollY - root.offsetTop) / maxScroll, 0, 1);
    const nextChapterIndex = getActiveChapterIndex(progress);

    storyProgressRef.current = progress;
    setScrollProgress((current) => (Math.abs(current - progress) > 0.006 ? progress : current));
    setActiveChapterIndex((current) =>
      current === nextChapterIndex ? current : nextChapterIndex
    );
  }, []);

  useEffect(() => {
    activeChapterRef.current = activeChapterIndex;
  }, [activeChapterIndex]);

  useEffect(() => {
    const handleScroll = () => {
      if (scrollFrameRef.current) {
        return;
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = 0;
        syncScrollProgress();
      });
    };

    syncScrollProgress();
    window.addEventListener("resize", syncScrollProgress);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.cancelAnimationFrame(scrollFrameRef.current);
      window.removeEventListener("resize", syncScrollProgress);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [syncScrollProgress]);

  useAeroCinematicScene({
    activeChapterRef,
    canvasRef,
    setLoadedCount,
    storyProgressRef,
    yawOffsetRef,
  });

  const goToChapter = (chapterIndex: number) => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const maxScroll = Math.max(1, root.offsetHeight - window.innerHeight);
    const targetProgress = chapterIndex / Math.max(1, aeroStoryChapters.length - 1);
    window.scrollTo({
      behavior: "smooth",
      top: root.offsetTop + maxScroll * targetProgress,
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      yaw: yawOffsetRef.current,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    yawOffsetRef.current = clamp(drag.yaw + (event.clientX - drag.startX) * 0.004, -0.38, 0.38);
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <main
      className="aero-system-showcase"
      ref={rootRef}
      style={
        {
          "--aero-story-count": aeroStoryChapters.length + 0.85,
          "--chapter-accent": activeChapter.accent,
        } as CSSProperties
      }
    >
      <section className="aero-system-showcase__stage">
        <div className="aero-system-showcase__backdrop" aria-hidden="true" />
        <div className="aero-system-showcase__cloud-veil" aria-hidden="true" />
        <div className="aero-system-showcase__cinema-grade" aria-hidden="true" />
        <canvas
          aria-label="Aero System 3D 叙事场景"
          className="aero-system-showcase__canvas"
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerUp}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          ref={canvasRef}
        />

        <header className="aero-system-showcase__nav">
          <Link className="aero-system-showcase__brand" href="/">
            <span className="aero-system-showcase__brand-mark">
              <CloudOutlined />
            </span>
            <span>
              <strong>AI PM</strong>
              <small>Aero System Lab</small>
            </span>
          </Link>
          <nav className="aero-system-showcase__nav-menu" aria-label="Aero System 页面导航">
            <Link href="/workbench">工作台</Link>
            <Link href="/aero-system">解决方案</Link>
            <Link href="/">资源中心</Link>
            <Link href="/">定价</Link>
          </nav>
          <div className="aero-system-showcase__nav-actions">
            <Link href="/" className="aero-system-showcase__ghost-action">
              <ArrowLeftOutlined />
              首页
            </Link>
            <Link href="/login?client_id=ai-pm&redirect_uri=/workbench" className="aero-system-showcase__primary-action">
              <LoginOutlined />
              登录并进入工作台
            </Link>
          </div>
        </header>

        <section className="aero-system-showcase__copy" aria-label="Aero System 故事">
          <p className="aero-system-showcase__eyebrow">
            <CloudOutlined />
            新一代 AI 驱动的项目管理平台
          </p>
          <h1>{activeChapter.title}</h1>
          <p className="aero-system-showcase__summary">{activeChapter.summary}</p>
          <div className="aero-system-showcase__signals" aria-label="Aero System 能力信号">
            <span>
              <strong>AI 智能调度</strong>
              自动规划最优路径
            </span>
            <span>
              <strong>全链路可视</strong>
              进度、风险一图掌控
            </span>
          </div>
          <div className="aero-system-showcase__copy-actions">
            <Link href="/login?client_id=ai-pm&redirect_uri=/workbench">
              <SendOutlined />
              登录并进入工作台
            </Link>
            <Link href="/bigscreen">
              <RocketOutlined />
              打开版本大屏
            </Link>
          </div>
        </section>

        <div className="aero-system-showcase__floating-cards" aria-label="Aero System 浮动故事卡">
          {aeroStoryChapters.slice(1).map((chapter, cardIndex) => {
            const chapterIndex = cardIndex + 1;
            const isActive = chapterIndex === activeChapterIndex;

            return (
              <button
                className="aero-system-showcase__floating-card"
                data-active={isActive}
                key={chapter.key}
                onClick={() => goToChapter(chapterIndex)}
                style={{ "--chapter-node-accent": chapter.accent } as CSSProperties}
                type="button"
              >
                <span>{chapter.index}</span>
                <strong>{chapter.title}</strong>
                <small>{chapter.metric}</small>
                <em>{chapter.kicker}</em>
              </button>
            );
          })}
        </div>

        <aside className="aero-system-showcase__chapter-card" aria-live="polite">
          <span>{activeChapter.kicker}</span>
          <strong>{activeChapter.metric}</strong>
          <p>
            {activeChapter.assetName} / {loadedCount}/15 模型
          </p>
        </aside>

        <nav className="aero-system-showcase__story-rail" aria-label="Aero System 故事章节">
          {aeroStoryChapters.map((chapter, chapterIndex) => {
            const isActive = chapterIndex === activeChapterIndex;

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className="aero-system-showcase__story-node"
                data-active={isActive}
                key={chapter.key}
                onClick={() => goToChapter(chapterIndex)}
                style={{ "--chapter-node-accent": chapter.accent } as CSSProperties}
                type="button"
              >
                <span>{chapter.index}</span>
                <strong>{chapter.title}</strong>
                <small>{chapter.metric}</small>
              </button>
            );
          })}
        </nav>

        <div className="aero-system-showcase__scroll-meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${scrollProgress})` }} />
        </div>
      </section>
    </main>
  );
}
