# Landing 3D Spine Design QA

- source visual truth path: `/tmp/ai-pm-video-reference/frame-02.png`
- implementation screenshot path: `/tmp/ai-pm-exact-spine/default-v31.png`
- viewport: 1920x1080 desktop, 390x844 mobile
- state: unauthenticated landing page, default story frame; scroll state captured after one wheel gesture
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/crop-compare-v31.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/motion-strip-v31.png`
- final result: blocked

## Findings

- [P1] 柱体仍未达到参考 mp4 的完全一致
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry.
  Evidence: `/tmp/ai-pm-exact-spine/crop-compare-v31.png` shows v31 moves the pillar toward a smokier translucent surface with alpha-map breakups and internal veil layers. The source frame still has a more natural bone-like top silhouette and stronger blue/purple/gold oil-film patching on the exposed upper vertebra.
  Impact: user explicitly requires the pillar to match the video with no visible gap, so this remains a blocking fidelity issue.
  Fix: next pass should tune the exposed top vertebra silhouette and recover clustered oil-film highlights without returning to the toy-like glossy look.

- [P1] 卡片柱体投影仍不是参考的物理融合感
  Location: generated panel texture in `createPanelTexture`.
  Evidence: v31 replaces much of the evenly distributed dotted projection with larger clustered haze, but the source card still has sharper cyan/purple oil patches and more believable refraction from the pillar behind the glass.
  Impact: the foreground screen still reveals the implementation as a procedural approximation.
  Fix: keep the clustered approach, but add sharper local oil-film patches around the upper center and right-center of the panel.

- [P2] 滚动联动已接入中心装置，但时间曲线仍需按 mp4 微调
  Location: wheel/touch handlers and animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/motion-strip-v31.png` shows default静止、滚动瞬间、滚动后 3 个状态里柱体和故事卡片同步旋转/移位；v31 keeps the stronger v30 scroll coupling while adding a softer translucent pillar layer.
  Impact: the main interaction problem is materially improved, but the reference video's carousel arc still feels more cinematic.
  Fix: compare against `/tmp/ai-pm-video-reference/motion-contact-sheet.png` and tune inertia/settle timing frame by frame.

## Required Fidelity Surfaces

- Fonts and typography: project text intentionally remains AI PM copy; not judged as a blocker for the user's pillar-specific request.
- Spacing and layout rhythm: desktop and mobile screenshots show no obvious overflow; main card placement remains aligned with the reference composition.
- Colors and visual tokens: v31 reduces mirror-like toy highlights and increases smoky opacity variation, but now needs more source-like cyan/purple/gold oil patches on the exposed top vertebra.
- Image quality and asset fidelity: source is a video frame; implementation remains procedural Three.js as requested. The dynamic pillar is real geometry, not a static screenshot.
- Copy and content: product-specific labels remain AI PM rather than the source site's portfolio text by design.

## Patches Made Since Previous QA Pass

- Added wheel/touch impulse into the Three.js animation loop so pillar and cards react during scroll, not only after scene index changes.
- Reworked vertebra body geometry again for v30: 9 rounder chunks became 8 longer, tighter, more continuous spine segments.
- Added a v31 alpha map for smoky broken opacity on the pillar surface.
- Added pillar-local veil sprites so the translucent haze rotates with the column instead of sitting as a page background.
- Replaced evenly scattered panel speckles with clustered oil-film haze and reduced pillar glint count to avoid glossy toy highlights.
- Captured desktop default, scroll impulse, scroll settled, mobile, and side-by-side comparison screenshots for v31.

## Implementation Checklist

- Keep v31 screenshots as the current QA baseline.
- For stricter matching, compare additional mp4 frames and tune the silhouette frame by frame.
- Keep `pnpm lint`, `pnpm build`, and visual comparison as blocking checks before handoff.
