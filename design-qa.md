# Landing 3D Spine Design QA

- source visual truth path: `/tmp/ai-pm-video-reference/frame-02.png`
- implementation screenshot path: `/tmp/ai-pm-exact-spine/default-v27.png`
- viewport: 1920x1080 desktop, 390x844 mobile
- state: unauthenticated landing page, default story frame; scroll state captured after one wheel gesture
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/crop-compare-v27.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/motion-strip-v27.png`
- final result: blocked

## Findings

- [P1] 柱体仍未达到参考视频的骨节自然度
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry.
  Evidence: reference pillar has irregular translucent vertebra pieces with smoky, fractured edges; current implementation is now closer to a stacked vertebra column than v25, but visible pieces still read as smooth glossy blocks.
  Impact: user explicitly requires the pillar to match the video with no visible gap.
  Fix: continue replacing the current parametric vertebra body with a more asymmetrical lumpy geometry and reduce uniform specular bands.

- [P1] 卡片上的柱体投影仍 weaker than reference
  Location: generated panel texture in `createPanelTexture`.
  Evidence: reference card shows blue/purple oil-film projection bleeding across the card surface; implementation has softer blurred spots and a central vertical veil, but projection is less organic and less integrated.
  Impact: the foreground card does not yet sell the same optical glass/refraction effect.
  Fix: strengthen nonuniform oil-film blotches and let projection follow spine position/scroll state.

- [P2] 滚动联动 is improved but not yet reference-matched
  Location: wheel/touch handlers and animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/motion-strip-v27.png` shows the pillar and panels now rotate with wheel input; the reference video has a more cinematic rotation arc and depth parallax.
  Impact: the interaction now moves in the right direction, but exact motion timing is not proven.
  Fix: tune motion curve after comparing against additional video frames.

## Patches Made Since Previous QA Pass

- Added wheel/touch impulse into the Three.js animation loop so pillar and cards react during scroll, not only after scene index changes.
- Reworked vertebra count, spacing, body scale, side processes, chain placement, and oil texture repeat.
- Reduced chain prominence and adjusted material roughness/specular/clearcoat to move away from a chrome-toy look.
- Captured desktop default, scroll impulse, scroll settled, mobile, and side-by-side comparison screenshots.

## Implementation Checklist

- Continue sculpting asymmetrical vertebra geometry from the video frame.
- Add stronger procedural oil-film projection on the front card.
- Compare against multiple mp4 frames, not only frame 02.
- Keep `pnpm lint`, `pnpm build`, and visual comparison as blocking checks before handoff.
