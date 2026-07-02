"use client";

import "./index.less";
import {
  ArrowLeftOutlined,
  CloudOutlined,
  LoginOutlined,
  RocketOutlined,
  SendOutlined,
} from "@ant-design/icons";
import gsap from "gsap";
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
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeChapterRef = useRef(0);
  const cursorOrbRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; yaw: number } | null>(
    null
  );
  const cursorXToRef = useRef<((value: number) => void) | null>(null);
  const cursorYToRef = useRef<((value: number) => void) | null>(null);
  const pointerRef = useRef({ active: 0, x: 0, y: 0 });
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
    const root = rootRef.current;
    const cursorOrb = cursorOrbRef.current;

    if (!root || !cursorOrb) {
      return;
    }

    // GSAP 只负责 DOM 叙事层的入场和鼠标光晕，不参与 WebGL RAF，避免两套动画抢同一份渲染状态。
    const context = gsap.context(() => {
      gsap.fromTo(
        [
          ".aero-system-showcase__brand",
          ".aero-system-showcase__nav-menu a",
          ".aero-system-showcase__copy > *",
          ".aero-system-showcase__floating-card",
          ".aero-system-showcase__story-rail",
        ],
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.045,
          y: 0,
        }
      );
    }, root);

    cursorXToRef.current = gsap.quickTo(cursorOrb, "x", {
      duration: 0.55,
      ease: "power3.out",
    });
    cursorYToRef.current = gsap.quickTo(cursorOrb, "y", {
      duration: 0.55,
      ease: "power3.out",
    });

    return () => {
      context.revert();
      cursorXToRef.current = null;
      cursorYToRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    // 分镜切换时用 GSAP 做轻微字幕推进，增强电影剪辑感；内容仍由 React 状态驱动，动画只是表现层。
    const context = gsap.context(() => {
      const copyTargets = root.querySelectorAll(
        ".aero-system-showcase__copy h1, .aero-system-showcase__summary, .aero-system-showcase__chapter-card"
      );
      const activeCards = root.querySelectorAll(".aero-system-showcase__floating-card[data-active='true']");

      if (copyTargets.length > 0) {
        gsap.fromTo(
          copyTargets,
          { autoAlpha: 0.76, filter: "blur(3px)", y: 12 },
          {
            autoAlpha: 1,
            duration: 0.52,
            ease: "power2.out",
            filter: "blur(0px)",
            y: 0,
          }
        );
      }

      if (activeCards.length > 0) {
        gsap.fromTo(
          activeCards,
          { scale: 0.96 },
          { duration: 0.42, ease: "back.out(1.7)", scale: 1 }
        );
      }
    }, root);

    return () => context.revert();
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
    pointerRef,
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

  const handleStagePointerMove = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const normalizedY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;

    pointerRef.current.x = clamp(normalizedX, -1, 1);
    pointerRef.current.y = clamp(normalizedY, -1, 1);
    pointerRef.current.active = 1;
    stageRef.current?.setAttribute("data-pointer-active", "true");
    cursorXToRef.current?.(event.clientX - rect.left);
    cursorYToRef.current?.(event.clientY - rect.top);
  };

  const handleStagePointerLeave = () => {
    pointerRef.current.active = 0;
    stageRef.current?.setAttribute("data-pointer-active", "false");
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
      <section
        className="aero-system-showcase__stage"
        onPointerLeave={handleStagePointerLeave}
        onPointerMove={handleStagePointerMove}
        ref={stageRef}
      >
        <div className="aero-system-showcase__backdrop" aria-hidden="true" />
        <div className="aero-system-showcase__cloud-veil" aria-hidden="true" />
        <div className="aero-system-showcase__cinema-grade" aria-hidden="true" />
        <div className="aero-system-showcase__cursor-orb" aria-hidden="true" ref={cursorOrbRef} />
        <div className="aero-system-showcase__hover-particles" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, particleIndex) => {
            const particleTop = 18 + (particleIndex % 6) * 10;
            const particleLeft = 24 + (particleIndex % 9) * 7;

            return (
              <span
                key={particleIndex}
                style={
                  {
                    "--particle-delay": `${particleIndex * -90}ms`,
                    "--particle-left": `${particleLeft}%`,
                    "--particle-top": `${particleTop}%`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
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
                onMouseEnter={() => {
                  pointerRef.current.active = 1;
                  stageRef.current?.setAttribute("data-pointer-active", "true");
                }}
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
