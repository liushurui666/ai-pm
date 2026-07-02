"use client";

import "./index.less";
import {
  CloudOutlined,
  LoginOutlined,
  RocketOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { aeroHeroStats, aeroSceneCards } from "./story-data";
import { clamp } from "./scene-helpers";
import { useAeroCinematicScene } from "./use-aero-cinematic-scene";

// `/aero-system` 是基于 processed GLB 的电影化首页样机。
// React 层只负责真实可点的产品文案和业务节点，Three.js 层只负责模型、航线和光效。
export function AeroSystemShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeCardRef = useRef(0);
  const cursorOrbRef = useRef<HTMLDivElement>(null);
  const cursorXToRef = useRef<((value: number) => void) | null>(null);
  const cursorYToRef = useRef<((value: number) => void) | null>(null);
  const pointerRef = useRef({ active: 0, x: 0, y: 0 });
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [, setLoadedCount] = useState(0);
  const activeCard = aeroSceneCards[activeCardIndex];

  useEffect(() => {
    activeCardRef.current = activeCardIndex;
  }, [activeCardIndex]);

  useEffect(() => {
    const root = rootRef.current;
    const cursorOrb = cursorOrbRef.current;

    if (!root || !cursorOrb) {
      return;
    }

    // 入场动画只作用在 DOM 层，WebGL 运行时独立 RAF，避免互相抢帧造成刷新卡顿。
    const context = gsap.context(() => {
      gsap.fromTo(
        [
          ".aero-system-showcase__brand",
          ".aero-system-showcase__nav-menu a",
          ".aero-system-showcase__nav-actions a",
          ".aero-system-showcase__copy > *",
          ".aero-system-showcase__floating-card",
          ".aero-system-showcase__route-rail",
        ],
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          duration: 0.78,
          ease: "power3.out",
          stagger: 0.035,
          y: 0,
        }
      );
    }, root);

    cursorXToRef.current = gsap.quickTo(cursorOrb, "x", {
      duration: 0.5,
      ease: "power3.out",
    });
    cursorYToRef.current = gsap.quickTo(cursorOrb, "y", {
      duration: 0.5,
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

    // 节点切换时只做轻微呼吸，不改变布局位置，避免再次偏离目标图构图。
    const context = gsap.context(() => {
      gsap.fromTo(
        ".aero-system-showcase__floating-card[data-active='true']",
        { scale: 0.97 },
        { duration: 0.34, ease: "back.out(1.5)", scale: 1 }
      );
    }, root);

    return () => context.revert();
  }, [activeCardIndex]);

  useAeroCinematicScene({
    activeCardRef,
    canvasRef,
    pointerRef,
    setLoadedCount,
  });

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
      style={{ "--chapter-accent": activeCard.accent } as CSSProperties}
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
        <canvas aria-label="AI PM 浮空项目航线 3D 场景" className="aero-system-showcase__canvas" ref={canvasRef} />

        <header className="aero-system-showcase__nav">
          <Link className="aero-system-showcase__brand" href="/">
            <span className="aero-system-showcase__brand-mark">
              <ThunderboltOutlined />
            </span>
            <span>
              <strong>AI PM</strong>
              <small>智能项目管理平台</small>
            </span>
          </Link>
          <nav className="aero-system-showcase__nav-menu" aria-label="Aero System 页面导航">
            <Link href="/workbench">工作台</Link>
            <Link href="/aero-system">解决方案</Link>
            <Link href="/">资源中心</Link>
            <Link href="/">定价</Link>
          </nav>
          <div className="aero-system-showcase__nav-actions">
            <Link href="/login?client_id=ai-pm&redirect_uri=/workbench" className="aero-system-showcase__login-link">
              登录
            </Link>
            <Link href="/login?client_id=ai-pm&redirect_uri=/workbench" className="aero-system-showcase__primary-action">
              <LoginOutlined />
              登录并进入工作台
            </Link>
          </div>
        </header>

        <section className="aero-system-showcase__copy" aria-label="Aero System 首页文案">
          <p className="aero-system-showcase__eyebrow">
            <CloudOutlined />
            新一代 AI 驱动的项目管理平台
          </p>
          <h1>
            用 AI 调度
            <br />
            项目航线
          </h1>
          <p className="aero-system-showcase__summary">
            把需求、版本、任务、Bug 和发布串联成一条实时航线。AI 自动分析、智能调度、风险预警，让团队专注交付。
          </p>
          <div className="aero-system-showcase__signals" aria-label="Aero System 能力信号">
            {aeroHeroStats.map((stat) => (
              <span key={stat.label}>
                <strong>{stat.label}</strong>
                {stat.detail}
              </span>
            ))}
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

        <div className="aero-system-showcase__floating-cards" aria-label="Aero System 节点卡片">
          {aeroSceneCards.map((card, cardIndex) => {
            const isActive = cardIndex === activeCardIndex;

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className="aero-system-showcase__floating-card"
                data-active={isActive}
                data-card={card.id}
                key={card.id}
                onFocus={() => setActiveCardIndex(cardIndex)}
                onMouseEnter={() => setActiveCardIndex(cardIndex)}
                style={{ "--chapter-node-accent": card.accent } as CSSProperties}
                type="button"
              >
                <span>{card.index}</span>
                <strong>{card.title}</strong>
                <small>{card.summary}</small>
                <em>
                  {card.status}
                  <b>{card.metric.replace(card.status, "")}</b>
                </em>
              </button>
            );
          })}
        </div>

        <nav className="aero-system-showcase__route-rail" aria-label="项目航线节点">
          {aeroSceneCards.map((card, cardIndex) => {
            const isActive = cardIndex === activeCardIndex;

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className="aero-system-showcase__route-node"
                data-active={isActive}
                key={card.id}
                onClick={() => setActiveCardIndex(cardIndex)}
                style={{ "--chapter-node-accent": card.accent } as CSSProperties}
                type="button"
              >
                <span>{card.index}</span>
                <strong>{card.title}</strong>
                <small>{card.summary}</small>
              </button>
            );
          })}
        </nav>
      </section>
    </main>
  );
}
