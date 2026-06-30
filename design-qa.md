# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v76.png`
- implementation idle motion screenshot: `/tmp/ai-pm-exact-spine/idle-a-v76.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v76.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v76.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v76.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v76.png`
- focused material texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-field-wide-v67.png`
- focused rim texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-rim-wide-v67.png`
- focused motion texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-motion-v68.mp4`
- focused subject motion texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-subject-wide-v76.mp4`
- focused subject mask texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-subject-mask-v76.mp4`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default idle light/motion plus one story-advance interaction
- final result: blocked
- blocker: v76 keeps scroll-follow behavior and improves source-derived pillar fidelity with a wider source crop plus video-synchronized mask, but the rendered column and card occlusion still cannot be certified as visually identical to the mp4's authored spine composition.

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v76.png` places the reference crop, default v76 crop, and scroll-impulse v76 crop in one image. v76 uses `reference-spine-subject-wide-v76.mp4`, which preserves more of the reference video's left-side bone edges than v75, and it combines that color source with `reference-spine-subject-mask-v76.mp4` plus the runtime organic mask. The rendered source layer is more faithful, but the reference still has sharper authored vertebra topology and a different exact foreground-card occlusion relationship.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: the next meaningful jump is to align the card/pillar crop frame-by-frame or replace the remaining procedural stack with a source-matched 3D/alpha asset.

- [P1] 滚动时柱体继续跟随，但 exact motion 仍未证明
  Location: wheel handling, `motionProgress`, `storyOrbit`, `pillarGroup`, `referenceSpineSubject`, and `panelMeshes` animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v76.png` and `/tmp/ai-pm-exact-spine/settled-v76.png` show the central column moving, rotating, and shifting depth with the carousel after a wheel gesture. This preserves the v75 fix for the original "cards move but pillar does not" problem. The exact easing/camera relation still differs from the mp4.
  Impact: interaction fidelity is better than the original issue state, but not source-identical.
  Fix: compare a frame strip from the mp4 against a captured scroll sequence and tune transforms against that strip.

- [P2] Source-video fidelity improved, but composition drift remains
  Location: `referenceSpineSubjectMaterial`, `createReferenceSpineSubjectMaskTexture()`, and source-profile mesh opacity in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/default-v76.png` shows a wider source-video pillar body and more left-side source edges, while `/tmp/ai-pm-exact-spine/spine-compare-v76.png` still shows the AI PM glass card and text layer occluding the pillar differently from the reference.
  Impact: the pillar is closer to the reference source, but a direct visual comparison still exposes differences.
  Fix: reduce custom foreground-card conflict or build a source-matched foreground occlusion layer.

- [P2] Mobile layout remains stable
  Location: landing page 390x844 viewport.
  Evidence: `/tmp/ai-pm-exact-spine/mobile-v76.png`; browser metrics reported `scrollWidth: 390`, `innerWidth: 390`, `canvasCount: 1`, and no console warn/error logs.
  Impact: the wider source-video subject and extra mask video did not introduce mobile overflow or canvas breakage.
  Fix: no immediate mobile fix needed for v76.

## Patches Made In V76

- Added `public/landing/reference-spine-subject-wide-v76.mp4`, a wider source-video subject crop derived from `reference-spine-motion-v68.mp4` so the live page keeps more of the reference pillar's left-side bone edges.
- Added `public/landing/reference-spine-subject-mask-v76.mp4`, a frame-synchronized dynamic mask derived from the same crop to reduce black/rectangular video-plane artifacts.
- Updated `referenceSpineSubject` to sample both the runtime organic alpha mask and the new dynamic video mask.
- Widened and slightly shifted the source-video subject plane so the source pillar leads the silhouette.
- Reduced procedural reference-stack and source-profile mesh opacities so generated geometry no longer competes as strongly with the source-video pillar.
- Re-captured desktop default, desktop idle, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v76 evidence is now the current baseline.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`.
- Desktop default, desktop idle, desktop scroll impulse, desktop settled, and mobile 390x844 screenshots were captured.
- Desktop metrics: `scrollWidth: 1280`, `innerWidth: 1280`, one active canvas.
- Mobile metrics: `scrollWidth: 390`, `innerWidth: 390`, one active canvas.
- Browser console warn/error logs were empty after verification.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Do not mark Product Design QA passed until the visible vertebra silhouette, embedded oil-film/refraction, card occlusion, and scroll motion match the reference at source-frame level.
