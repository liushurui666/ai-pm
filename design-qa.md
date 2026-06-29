# Landing 3D Spine Design QA

- source visual truth path: `/tmp/ai-pm-video-reference/frame-02.png`
- implementation screenshot path: `/tmp/ai-pm-exact-spine/default-v30.png`
- viewport: 1920x1080 desktop, 390x844 mobile
- state: unauthenticated landing page, default story frame; scroll state captured after one wheel gesture
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/crop-compare-v30.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/motion-strip-v30.png`
- final result: blocked

## Findings

- [P1] 柱体仍未达到参考 mp4 的完全一致
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry.
  Evidence: `/tmp/ai-pm-exact-spine/crop-compare-v30.png` shows v30 is closer than v29: fewer/larger vertebra pieces, stronger vertical continuity, smaller dark cavities, and more oil-film speckle. The source frame still has a more natural translucent bone surface and a less procedural top silhouette.
  Impact: user explicitly requires the pillar to match the video with no visible gap, so this remains a blocking fidelity issue.
  Fix: continue tuning source-frame-specific silhouette offsets and material translucency; consider deriving per-segment front outline from the mp4 crop rather than purely parametric geometry.

- [P1] 卡片柱体投影仍不是参考的物理融合感
  Location: generated panel texture in `createPanelTexture`.
  Evidence: v30 adds finer screen-space speckles and a stronger vertical oil-film projection, but the reference card's highlight patches are more irregular, less dotted, and appear refracted by the glass instead of painted onto it.
  Impact: the foreground screen still reveals the implementation as a procedural approximation.
  Fix: drive the panel projection from the current pillar rotation and reduce evenly distributed speckles in favor of clustered oil-film patches.

- [P2] 滚动联动已接入中心装置，但时间曲线仍需按 mp4 微调
  Location: wheel/touch handlers and animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/motion-strip-v30.png` shows default静止、滚动瞬间、滚动后 3 个状态里柱体和故事卡片同步旋转/移位，且幅度比 v29 更明显。
  Impact: the main interaction problem is materially improved, but the reference video's carousel arc still feels more cinematic.
  Fix: compare against `/tmp/ai-pm-video-reference/motion-contact-sheet.png` and tune inertia/settle timing frame by frame.

## Required Fidelity Surfaces

- Fonts and typography: project text intentionally remains AI PM copy; not judged as a blocker for the user's pillar-specific request.
- Spacing and layout rhythm: desktop and mobile screenshots show no obvious overflow; main card placement remains aligned with the reference composition.
- Colors and visual tokens: v30 increases purple/cyan/gold oil-film highlights and reduces toy-like black cavities, but the source still has more smoke-like translucent color blending.
- Image quality and asset fidelity: source is a video frame; implementation remains procedural Three.js as requested. The dynamic pillar is real geometry, not a static screenshot.
- Copy and content: product-specific labels remain AI PM rather than the source site's portfolio text by design.

## Patches Made Since Previous QA Pass

- Added wheel/touch impulse into the Three.js animation loop so pillar and cards react during scroll, not only after scene index changes.
- Reworked vertebra body geometry again for v30: 9 rounder chunks became 8 longer, tighter, more continuous spine segments.
- Reduced cavity size/opacity, toned down side lobes, and strengthened vertical silhouette so the pillar reads less like separated blobs.
- Increased wheel/touch impulse influence on pillar position/rotation so the center装置 visibly follows scroll.
- Added finer glass projection particles and stronger pillar oil-film flecks.
- Captured desktop default, scroll impulse, scroll settled, mobile, and side-by-side comparison screenshots for v30.

## Implementation Checklist

- Keep v30 screenshots as the current QA baseline.
- For stricter matching, compare additional mp4 frames and tune the silhouette frame by frame.
- Keep `pnpm lint`, `pnpm build`, and visual comparison as blocking checks before handoff.
