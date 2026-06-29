# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v68.png`
- implementation idle motion screenshots: `/tmp/ai-pm-exact-spine/idle-a-v68.png`, `/tmp/ai-pm-exact-spine/idle-b-v68.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v68.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v68.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v68.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v68.png`
- focused material texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-field-wide-v67.png`
- focused rim texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-rim-wide-v67.png`
- focused motion texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-motion-v68.mp4`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default idle light/motion frame pair plus one story-advance interaction
- final result: blocked
- blocker: exact-source fidelity is still not proven; v68 adds a source-cropped VideoTexture for idle oil-film motion, but the live page still cannot be certified as source-identical to the mp4's geometry/refraction.

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v68.png` compares the reference crop, default v68 crop, and scroll-impulse v68 crop. v68 keeps the continuous 10-segment side silhouette, the wide reference field, and the colored rim layer, then adds `reference-spine-motion-v68.mp4` as a muted VideoTexture mounted inside `pillarGroup`. The reference still has authored/scanned vertebra topology and true internal refraction that the procedural mesh plus reference-derived planes/video cannot fully prove as source-identical.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: use or author a matching 3D vertebra asset/shader pass; procedural geometry can approximate the direction but cannot guarantee source-identical topology and refraction.

- [P1] 光影材质更接近参考，但仍未达到源级内部折射
  Location: `referenceSpineField`, `referenceSpineMotion`, `referenceSpineRim`, `makeSourceProfileMaterial`, `makeReferenceSpineMaterial`, `spineFlecks`, and `surfaceOilPatches` in `src/components/landing-home/index.tsx`.
  Evidence: v68 uses a 0.5s, 344x736 source-cropped mp4 as an additive `VideoTexture`, with `/tmp/ai-pm-exact-spine/idle-a-v68.png` and `/tmp/ai-pm-exact-spine/idle-b-v68.png` showing idle oil-film/highlight variation while the story card does not auto-advance. The reference still looks like colored flecks are embedded inside a wet translucent mesh, while the implementation reads as procedural geometry with calibrated luminous layers and a video material pass.
  Impact: the page has a better premium 3D direction, but it does not yet match the Active Theory material depth.
  Fix: build a custom shader that uses the reference material field as emissive, alpha, normal, and depth cues, or replace the procedural stack with a source-matched GLTF and authored material maps.

- [P2] 侧影更规整，但仍不是源视频级雕塑
  Location: `sourceProfileSegments` and `processBlade` in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/default-v68.png` shows the visible column no longer reads as several disconnected blue-purple beads; the wide reference field and short motion crop keep more of the original regular vertebra outline and wet material movement. The reference still has sharper authored vertebra transitions and physically richer card-side refraction.
  Impact: the page moves closer to the requested central-column direction without reintroducing the v58 needle spike regression.
  Fix: replace the procedural side-profile meshes with a source-matched GLTF or custom deformed geometry if exactness remains mandatory.

- [P2] 滚动联动 remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v68.png` and `/tmp/ai-pm-exact-spine/settled-v68.png` show the pillar, wide reference material field, motion video texture, rim layer, and carousel moving together; default remains visually still except for glow, smoke, flecks, and material/video breathing.
  Impact: the interaction part of the request is still satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V68

- Extracted `public/landing/reference-spine-motion-v68.mp4` from the user-provided mp4 as a 0.5s muted 344x736 pillar-only loop, deliberately recropped to avoid bringing in the source site's left glass-panel vertical line.
- Added `referenceSpineMotionVideo` / `THREE.VideoTexture` as a weak additive material layer inside `pillarGroup`, with explicit pause/src cleanup on unmount.
- Kept the v67 wide static field and colored rim field, then tuned the new motion layer opacity so default state has oil-film motion without auto-advancing the story.
- Captured desktop default, desktop idle A/B, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v68 evidence is now the current baseline.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`; desktop default, desktop idle A/B, desktop scroll impulse, desktop settled, mobile 390x844, and console checks passed with no warning/error logs.
- Mobile 390x844 has no horizontal overflow (`scrollWidth: 390`, `innerWidth: 390`) and one active canvas.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
