# Landing 3D Spine Design QA

- source visual truth path: `/tmp/ai-pm-video-reference/frame-02.png`
- implementation screenshot path: `/tmp/ai-pm-exact-spine/default-v40.png`
- viewport: 1920x1080 desktop, 390x844 mobile
- state: unauthenticated landing page default frame; scroll state captured after one wheel gesture
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/crop-compare-v40.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/top-vertebra-compare-v40.png`, `/tmp/ai-pm-exact-spine/panel-projection-compare-v40.png`, `/tmp/ai-pm-exact-spine/motion-strip-v40.png`
- final result: blocked

## Findings

- [P1] 柱体仍未达到参考 mp4 的完全一致
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry and material.
  Evidence: `/tmp/ai-pm-exact-spine/crop-compare-v40.png` and `/tmp/ai-pm-exact-spine/top-vertebra-compare-v40.png` show v40 has a more continuous central body, stronger scroll-linked rotation, and less hard black-hole overlay than v35. The reference still has a more recognizable upper vertebra silhouette: a cleaner central hollow, a flatter right-side fin, and more naturally scattered cyan/purple/gold oil fragments.
  Impact: the user explicitly requires the pillar to be identical to the provided video, so the remaining silhouette/material drift is still blocking.
  Fix: continue a source-frame-specific sculpting pass on the exposed upper vertebra, especially the hollow contour, the right fin angle, and the high-frequency oil-film color breakup.

- [P1] Glass-screen projection still lacks source-level physical refraction
  Location: generated panel texture in `createPanelTexture`.
  Evidence: `/tmp/ai-pm-exact-spine/panel-projection-compare-v40.png` shows v40 keeps the warm smoky panel, weakens the uniform scan lines, and adds larger cyan/purple projection clusters. The source screen still has more irregular dirty-glass bloom and sharper oil-film islands across the title area.
  Impact: the foreground screen still reads as a procedural approximation next to the source capture.
  Fix: add a nonuniform clustered projection mask with stronger local contrast and less centered symmetry while keeping the AI PM copy readable.

- [P2] Scroll linkage is materially improved but not frame-matched
  Location: wheel/touch handlers and animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/motion-strip-v40.png` shows the pillar now translates and rotates with the glass carousel immediately after a wheel impulse, then settles into the next card state. The mp4 still has a different camera easing curve and card orbit radius.
  Impact: the requested “滚动时柱子也跟随滚动” behavior is now visible, but exact motion matching remains a follow-up fidelity task.
  Fix: tune the wheel impulse decay, carousel radius, and pillar yaw curve against the mp4 contact sheet frame by frame.

## Required Fidelity Surfaces

- Fonts and typography: AI PM product copy intentionally remains product-specific; typography is not the blocker for this pillar-focused request.
- Spacing and layout rhythm: desktop and mobile v40 captures show no new overflow; the hero card, nav, and CTA remain aligned while the pillar occupies the center stage.
- Colors and visual tokens: v40 makes the spine darker, glossier, and more continuous, but source-like color fragments are still not bright or naturally placed enough.
- Image quality and asset fidelity: implementation remains procedural Three.js geometry/material/texture as requested, not a static screenshot. The current procedural result still falls short of the visual target.
- Copy and content: AI PM labels remain intentionally different from the source portfolio page.

## Patches Made Since Previous QA Pass

- Added a visible but translucent MarchingCubes body layer so the spine reads more like one continuous sculpture instead of separate glossy chunks.
- Reworked the deep-cavity material so black hollows behave like embedded shadows rather than hard pasted shapes.
- Added stronger upper fin and foreground oil-bead geometry to improve the reference-like upper silhouette.
- Increased oil material clearcoat, env-map intensity, bump strength, and specular response for a more reflective purple/cyan/gold surface.
- Strengthened wheel impulse and animation coupling so scroll immediately drives both the glass carousel and pillar orientation.
- Captured desktop default, scroll impulse, scroll settled, mobile, side-by-side crop, focused top, focused panel, and motion strip screenshots for v40.

## Implementation Checklist

- Keep v40 as the current evidence baseline.
- Continue with a source-frame-specific exposed-top silhouette pass before claiming exact match.
- Preserve the current scroll-coupled motion behavior and continuous pillar layer when making the next fidelity pass.
- Keep `pnpm lint`, `pnpm build`, and visual comparison as blocking checks before handoff.
