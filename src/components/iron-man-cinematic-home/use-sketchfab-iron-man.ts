import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cinematicShots, type CinematicShot } from "./story-data";

type SketchfabAnimation = {
  name?: string;
  uid?: string;
};

type SketchfabCameraLookAt = {
  position: number[];
  target: number[];
};

type SketchfabApi = {
  addEventListener: (eventName: string, callback: () => void) => void;
  getCameraLookAt?: (callback: (error: unknown, camera?: SketchfabCameraLookAt) => void) => void;
  getAnimations: (callback: (error: unknown, animations?: SketchfabAnimation[]) => void) => void;
  play: () => void;
  setCameraLookAt: (eye: number[], target: number[], duration?: number) => void;
  setCurrentAnimationByUID: (uid: string, callback?: () => void) => void;
  setCycleMode?: (mode: string) => void;
  setSpeed?: (speed: number) => void;
  start: () => void;
};

type SketchfabClient = {
  init: (
    modelUid: string,
    options: {
      autostart?: number;
      camera?: number;
      dnt?: number;
      graph_optimizer?: number;
      preload?: number;
      success: (api: SketchfabApi) => void;
      transparent?: number;
      ui_animations?: number;
      ui_controls?: number;
      ui_infos?: number;
      ui_inspector?: number;
      ui_stop?: number;
      ui_theme?: string;
      ui_watermark?: number;
    }
  ) => void;
};

declare global {
  interface Window {
    Sketchfab?: new (version: string, iframe: HTMLIFrameElement) => SketchfabClient;
  }
}

export const sketchfabModelEmbedUrl =
  "https://sketchfab.com/models/627b739b7d5845b0aefe31499a5f5965/embed?autostart=1&preload=1&transparent=1&ui_theme=dark&dnt=1";

export const sketchfabViewerApiUrl = "https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js";

const sketchfabModelUid = "627b739b7d5845b0aefe31499a5f5965";

function pickShotAnimation(animations: SketchfabAnimation[], shot: CinematicShot, shotIndex: number) {
  const normalizedHints = shot.motion.animationHints.map((hint) => hint.toLowerCase());

  return (
    animations.find((animation) => {
      const animationName = animation.name?.toLowerCase() ?? "";

      return normalizedHints.some((hint) => animationName.includes(hint));
    }) ?? animations[shotIndex % animations.length]
  );
}

export function useSketchfabIronMan({
  activeShotIndex,
  iframeRef,
}: {
  activeShotIndex: number;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}) {
  const sketchfabApiRef = useRef<SketchfabApi | null>(null);
  const sketchfabAnimationsRef = useRef<SketchfabAnimation[]>([]);
  const sketchfabBaseCameraRef = useRef<SketchfabCameraLookAt | null>(null);
  const lastDirectedShotRef = useRef<number | null>(null);
  const viewerBootstrappedRef = useRef(false);
  const [viewerScriptReady, setViewerScriptReady] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [motionMode, setMotionMode] = useState("loading viewer");
  const [availableAnimationCount, setAvailableAnimationCount] = useState(0);

  const directShotMotion = useCallback((shotIndex: number) => {
    const api = sketchfabApiRef.current;
    const shot = cinematicShots[shotIndex];

    if (!api) {
      setMotionMode("loading viewer");
      return;
    }

    // #2 这个免费 Sketchfab 模型只有 1 个真实 animation clip。
    // 所以每段分镜都会优先循环播放这个真实动作，再叠加相机位、速度和 HUD 节奏做电影镜头区分。
    const animations = sketchfabAnimationsRef.current;
    const matchedAnimation = animations.length > 0 ? pickShotAnimation(animations, shot, shotIndex) : null;

    if (matchedAnimation?.uid) {
      api.setCurrentAnimationByUID(matchedAnimation.uid, () => {
        api.setSpeed?.(shotIndex === 3 ? 1.35 : 1);
        api.setCycleMode?.("loop");
        api.play();
      });
      setMotionMode(`clip: ${matchedAnimation.name || "suit animation"}`);
    } else if (matchedAnimation) {
      api.setSpeed?.(shotIndex === 3 ? 1.35 : 1);
      api.setCycleMode?.("loop");
      api.play();
      setMotionMode("clip: suit animation");
    } else {
      api.play();
      setMotionMode(shot.motion.status);
    }

    const baseCamera = sketchfabBaseCameraRef.current;

    if (baseCamera) {
      const nextEye = baseCamera.position.map((value, index) => value + (shot.motion.camera.eyeOffset[index] ?? 0));
      const nextTarget = baseCamera.target.map((value, index) => value + (shot.motion.camera.targetOffset[index] ?? 0));

      api.setCameraLookAt(nextEye, nextTarget, shot.motion.camera.duration);
    }

    lastDirectedShotRef.current = shotIndex;
  }, []);

  useEffect(() => {
    if (!viewerScriptReady || !iframeRef.current || !window.Sketchfab || sketchfabApiRef.current) {
      return;
    }

    const client = new window.Sketchfab("1.12.1", iframeRef.current);

    client.init(sketchfabModelUid, {
      autostart: 1,
      camera: 0,
      dnt: 1,
      graph_optimizer: 1,
      preload: 1,
      transparent: 1,
      ui_animations: 0,
      ui_controls: 0,
      ui_infos: 0,
      ui_inspector: 0,
      ui_stop: 0,
      ui_theme: "dark",
      ui_watermark: 0,
      success: (api) => {
        sketchfabApiRef.current = api;

        const bootstrapViewerMotion = () => {
          if (viewerBootstrappedRef.current) {
            return;
          }

          viewerBootstrappedRef.current = true;
          api.getAnimations((_error, animations = []) => {
            sketchfabAnimationsRef.current = animations;
            setAvailableAnimationCount(animations.length);

            const finishBootstrap = () => {
              setViewerReady(true);
              directShotMotion(activeShotIndex);
            };

            // 先读取 Sketchfab 模型作者设置好的默认相机，再在默认相机上做小幅分镜偏移。
            // 这样既接入了 Viewer API 运镜，又不会因为猜测模型坐标而把钢铁侠推到远处。
            if (api.getCameraLookAt) {
              api.getCameraLookAt((_cameraError, camera) => {
                if (camera?.position?.length === 3 && camera?.target?.length === 3) {
                  sketchfabBaseCameraRef.current = camera;
                }

                finishBootstrap();
              });
              return;
            }

            finishBootstrap();
          });
        };

        api.addEventListener("viewerready", bootstrapViewerMotion);
        api.start();

        // Sketchfab iframe 在 dev/HMR 或缓存命中时偶尔会先完成内部 ready，
        // 再触发我们这层 React effect。为了不让“动作导演层”卡在 booting，
        // 超时后也进入相机动作模式；如果模型没有真实动画 clip，就用相机分镜补足动作感。
        window.setTimeout(bootstrapViewerMotion, 4800);
      },
    });
  }, [activeShotIndex, directShotMotion, iframeRef, viewerScriptReady]);

  useEffect(() => {
    if (!viewerReady || lastDirectedShotRef.current === activeShotIndex) {
      return;
    }

    directShotMotion(activeShotIndex);
  }, [activeShotIndex, directShotMotion, viewerReady]);

  return {
    availableAnimationCount,
    motionMode,
    setViewerScriptReady,
    viewerReady,
  };
}
