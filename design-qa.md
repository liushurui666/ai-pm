# Landing 3D Spine Design QA

- source visual truth path: `/tmp/ai-pm-video-reference/frame-02.png`
- implementation screenshot path: `/tmp/ai-pm-exact-spine/default-v35.png`
- viewport: 1920x1080 desktop, 390x844 mobile
- state: unauthenticated landing page default frame; scroll state captured after one wheel gesture
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/crop-compare-v35.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/motion-strip-v35.png`
- final result: blocked

## Findings

- [P1] 柱体仍未达到参考 mp4 的完全一致
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry and material.
  Evidence: `/tmp/ai-pm-exact-spine/crop-compare-v35.png` shows v35 has a wider exposed top/bottom bone mass, darker smoky material, and stronger follow-along oil patches than v31. The reference still has a more natural vertebra silhouette, cleaner hollow shapes, and brighter cyan/purple/gold oil-film fragments on the exposed upper bone.
  Impact: the user explicitly requires the pillar to be identical to the provided video, so the remaining silhouette/material drift is still blocking.
  Fix: tune the exposed top bone from the reference frame more precisely, especially the black hollow center, the right-side protruding fin, and the color-fragment placement.

- [P1] Glass-screen projection still lacks source-level physical refraction
  Location: generated panel texture in `createPanelTexture`.
  Evidence: v35 improves the central smoky projection and keeps the card warm/dense, but the source screen has sharper, more organic oil-film patches over the title area and a different glass grain.
  Impact: the foreground screen still reads as a procedural approximation next to the source capture.
  Fix: create a more source-shaped procedural projection mask with larger clustered cyan/purple fragments and less uniform horizontal line texture.

- [P2] Scroll linkage is materially improved but not frame-matched
  Location: wheel/touch handlers and animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/motion-strip-v35.png` shows the default frame, scroll impulse, and settled frame all move the pillar and carousel together. The overall arc is still not a frame-perfect match to the reference mp4.
  Impact: the main interaction is now aligned with the requested behavior, but the timing/camera curve still needs fine tuning.
  Fix: use the mp4 motion contact sheet to tune camera offset, carousel radius, and pillar rotation by frame.

## Required Fidelity Surfaces

- Fonts and typography: AI PM product copy intentionally remains product-specific; typography is not the blocker for this pillar-focused request.
- Spacing and layout rhythm: desktop and mobile captures show no new overflow from the added hero bone shapes; main card remains aligned with the scene.
- Colors and visual tokens: v35 restores darker smoky material and adds stronger exposed oil patches, but source-like color fragments are still not bright or naturally placed enough.
- Image quality and asset fidelity: implementation remains procedural Three.js geometry/material/texture as requested, not a static screenshot. The current procedural result still falls short of the visual target.
- Copy and content: AI PM labels remain intentionally different from the source portfolio page.

## Patches Made Since Previous QA Pass

- Added procedural oil-patch texture and pillar-local patch sprites that rotate with the spine.
- Reduced the smooth MarchingCubes field so the center no longer collapses into a continuous black pipe.
- Added larger top/bottom hero vertebra shapes and side wings to make the exposed pillar read as one connected sculpture through the glass card.
- Darkened and roughened the oil material while preserving animated light, texture offset, and scroll-driven movement.
- Strengthened scroll coupling so wheel/touch progress drives both the glass carousel and the pillar orientation.
- Captured desktop default, scroll impulse, scroll settled, mobile, side-by-side crop, and motion strip screenshots for v35.

## Implementation Checklist

- Keep v35 as the current evidence baseline.
- Continue with a source-frame-specific exposed-top silhouette pass before claiming exact match.
- Preserve the current scroll-coupled motion behavior when making the next fidelity pass.
- Keep `pnpm lint`, `pnpm build`, and visual comparison as blocking checks before handoff.
