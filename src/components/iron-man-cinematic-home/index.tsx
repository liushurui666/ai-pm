"use client";

import "./index.less";
import {
  ArrowRightOutlined,
  CodeOutlined,
  LoginOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { cinematicShots } from "./story-data";
import { sketchfabModelEmbedUrl, sketchfabViewerApiUrl, useSketchfabIronMan } from "./use-sketchfab-iron-man";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// 独立首页用原生滚动驱动分镜，避免额外动画库把外部 3D iframe 反复重建。
// Scroll progress 同时写入 CSS 变量，CSS 负责光带、遮幅、HUD 和镜头层的插值。
export function IronManCinematicHome() {
  const rootRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [activeShotIndex, setActiveShotIndex] = useState(0);
  const activeShot = cinematicShots[activeShotIndex];
  const { availableAnimationCount, motionMode, setViewerScriptReady, viewerReady } = useSketchfabIronMan({
    activeShotIndex,
    iframeRef,
  });
  const activeProgress = cinematicShots.length <= 1 ? 0 : activeShotIndex / (cinematicShots.length - 1);
  const shotStyle = useMemo(
    () =>
      ({
        "--iron-accent": activeShot.accent,
        "--iron-progress": activeProgress.toFixed(4),
        "--iron-shot": activeShotIndex,
        "--iron-motion": activeShotIndex % 2 === 0 ? 1 : -1,
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
      <Script src={sketchfabViewerApiUrl} strategy="afterInteractive" onLoad={() => setViewerScriptReady(true)} />
      <section className="iron-cinematic-home__stage" aria-label="AI PM 钢铁侠电影分镜首页">
        <div className="iron-cinematic-home__backplate" aria-hidden="true" />
        <div className="iron-cinematic-home__grid" aria-hidden="true" />
        <div className="iron-cinematic-home__beam" aria-hidden="true" />
        <div className="iron-cinematic-home__model">
          <iframe
            allow="autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
            className="iron-cinematic-home__model-frame"
            ref={iframeRef}
            src={sketchfabModelEmbedUrl}
            title="Iron Man rigged animations 3D model"
          />
          <div className="iron-cinematic-home__model-mask" aria-hidden="true" />
          <div className="iron-cinematic-home__motion-ring" aria-hidden="true" />
          <a
            className="iron-cinematic-home__model-credit"
            href="https://sketchfab.com/3d-models/iron-man-rigged-animations-627b739b7d5845b0aefe31499a5f5965"
            rel="noreferrer"
            target="_blank"
          >
            Model: deepak rai / CC BY 4.0
          </a>
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
            <div>
              <dt>MOTION</dt>
              <dd>{activeShot.motion.label}</dd>
            </div>
            <div>
              <dt>CLIPS</dt>
              <dd>{viewerReady ? availableAnimationCount : "syncing"}</dd>
            </div>
          </dl>
          <div className="iron-cinematic-home__motion-status">
            <span>{viewerReady ? "SUIT DIRECTED" : "SUIT BOOTING"}</span>
            <strong>{motionMode}</strong>
          </div>
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
          <span>00:0{activeShotIndex + 1}:IRONMAN</span>
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
