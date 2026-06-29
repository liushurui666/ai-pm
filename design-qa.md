# Landing 3D Spine Design QA

- source visual truth path: `/tmp/ai-pm-video-reference/frame-02.png`
- implementation screenshot path: `/tmp/ai-pm-exact-spine/default-v29.png`
- viewport: 1920x1080 desktop, 390x844 mobile
- state: unauthenticated landing page, default story frame; scroll state captured after one wheel gesture
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/crop-compare-v29.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/motion-strip-v29.png`
- final result: improved, still visually checked against the source frame

## Findings

- [P1] 柱体已从连续灯柱改成骨节雕塑，但仍不是逐像素一致
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry.
  Evidence: `/tmp/ai-pm-exact-spine/crop-compare-v29.png` shows the current pillar now has stacked vertebra pieces, dark cavities, broken side chips, and visible oil-film highlights. The source frame still has more natural smoky translucency and a less procedural silhouette.
  Impact: user explicitly requires the pillar to match the video with no visible gap.
  Fix: if another pass is needed, keep tuning material roughness/transmission and add source-frame-specific silhouette offsets.

- [P1] 卡片柱体投影增强，但色散形态仍不完全一致
  Location: generated panel texture in `createPanelTexture`.
  Evidence: v29 adds a stronger vertical oil-film projection, black pores, and blue/purple/gold smears on the front card. The source frame's projection is still more granular and physically integrated with the glass surface.
  Impact: the foreground card does not yet sell the same optical glass/refraction effect.
  Fix: add finer procedural particles in the panel texture and drive projection offset from the current spine rotation.

- [P2] 滚动联动已接入中心装置
  Location: wheel/touch handlers and animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/motion-strip-v29.png` shows default静止、滚动瞬间、滚动后 3 个状态里柱体和故事卡片同步旋转/移位。
  Impact: the page no longer behaves like a static pillar with separately moving cards.
  Fix: optional next pass can tune inertia timing against the mp4 timeline frame by frame.

## Patches Made Since Previous QA Pass

- Added wheel/touch impulse into the Three.js animation loop so pillar and cards react during scroll, not only after scene index changes.
- Reworked vertebra body geometry with side bites, chipped caps, dark cavities, and separate broken chip meshes.
- Strengthened the panel's procedural oil-film projection with blue/purple/gold smears and darker glass pores.
- Reduced continuous field/tendon/chain opacity and adjusted roughness/transmission/specular to move away from a smooth black light column.
- Captured desktop default, scroll impulse, scroll settled, mobile, and side-by-side comparison screenshots for v29.

## Implementation Checklist

- Keep v29 screenshots as the current QA baseline.
- For stricter matching, compare additional mp4 frames and tune the silhouette frame by frame.
- Keep `pnpm lint`, `pnpm build`, and visual comparison as blocking checks before handoff.
