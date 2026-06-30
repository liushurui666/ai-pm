# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v75.png`
- implementation idle motion screenshot: `/tmp/ai-pm-exact-spine/idle-a-v75.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v75.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v75.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v75.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v75.png`
- focused material texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-field-wide-v67.png`
- focused rim texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-rim-wide-v67.png`
- focused motion texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-motion-v68.mp4`
- focused subject motion texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-subject-v73.mp4`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default idle light/motion plus one story-advance interaction
- final result: blocked
- blocker: v75 improves scroll-follow behavior and makes the source-video subject layer read more like an opaque/refraction-bearing pillar, but the rendered column still cannot be certified as visually identical to the mp4's authored spine geometry and material.

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v75.png` places the reference crop, default v75 crop, and scroll-impulse v75 crop in one image. v75 uses the source mp4 subject video more strongly and masks it into an organic spine silhouette, so the pillar now carries darker body mass instead of only additive color flecks. The reference still has sharper authored vertebra topology, more precise internal refraction, and more exact foreground-card occlusion than the current mixed procedural/source-video stack.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: use or author a matching 3D vertebra asset/material pass, or promote a source-derived video/alpha layer that covers the exact reference composition without procedural mismatch.

- [P1] 滚动时柱体已经跟随，但 exact motion 仍未证明
  Location: wheel handling, `motionProgress`, `storyOrbit`, `pillarGroup`, `referenceSpineSubject`, and `panelMeshes` animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v75.png` and `/tmp/ai-pm-exact-spine/settled-v75.png` show the central column now visibly moves, rotates, and shifts depth with the carousel after a wheel gesture. This fixes the major interaction complaint that only cards felt like they were changing. However, the easing, camera relation, and pillar/card occlusion still are not source-identical to the mp4.
  Impact: interaction fidelity is materially better, but the "same as mp4" bar still requires tighter motion matching.
  Fix: compare against a short frame strip from the mp4 and tune the stage camera/pillar/card transforms frame-by-frame.

- [P2] 源视频主体层更像实体，但仍有 visible composition drift
  Location: `referenceSpineSubjectMaterial` and runtime `createReferenceSpineSubjectMaskTexture()` in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/default-v75.png` keeps the source pillar dark body and oil-film motion visible in default state, while the new mask suppresses some rectangular video-plane feeling. The page still blends AI PM copy, custom glass-card textures, and procedural meshes over/under the source, so the crop is closer but not indistinguishable.
  Impact: premium 3D feel improved, but a designer comparing against the mp4 will still notice differences.
  Fix: either fully match the reference composition or reduce custom overlays that conflict with the source crop.

- [P2] Mobile layout remains stable
  Location: landing page 390x844 viewport.
  Evidence: `/tmp/ai-pm-exact-spine/mobile-v75.png`; browser metrics reported `scrollWidth: 390`, `innerWidth: 390`, `canvasCount: 1`, and no console warn/error logs.
  Impact: the new heavier source layer did not introduce horizontal overflow or obvious mobile canvas breakage.
  Fix: no immediate mobile fix needed for v75.

## Patches Made In V75

- Added `createReferenceSpineSubjectMaskTexture()` to generate an organic runtime alpha mask for the source-video subject layer, preserving the pillar silhouette while suppressing rectangular/video-plane edges.
- Changed `referenceSpineSubjectMaterial` from pure additive highlight blending to normal transparent blending with source-video dark-body preservation, so the pillar has more mass and internal refraction instead of only colored flecks.
- Added `uMask` and `uScroll` uniforms to the subject shader; scroll now subtly alters scan/pulse behavior and subject transform.
- Increased wheel impulse handling, prevented native page scroll on the fixed 3D landing stage, and shortened the wheel lock so scroll gestures feel more immediate.
- Increased carousel follow speed and added direct `pillarGroup` y/z/rotation plus `referenceSpineSubject` position/rotation/scale response, making the column visibly move with the story cards.
- Captured desktop default, desktop idle, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v75 evidence is now the current baseline.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`.
- Desktop default, desktop idle, desktop scroll impulse, desktop settled, and mobile 390x844 screenshots were captured.
- Desktop metrics: `scrollWidth: 1280`, `innerWidth: 1280`, one active canvas.
- Mobile metrics: `scrollWidth: 390`, `innerWidth: 390`, one active canvas.
- Browser console warn/error logs were empty after verification.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Do not mark Product Design QA passed until the visible vertebra silhouette, embedded oil-film/refraction, and scroll motion match the reference at source-frame level.
