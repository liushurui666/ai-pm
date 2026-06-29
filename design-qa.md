# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v57.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v57.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v57.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v57.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v57.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked for exact-source fidelity, improved for scroll-coupled motion and a rounder, less planar side-spine silhouette

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v57.png` compares the reference crop, default v57 crop, and scroll-impulse v57 crop. v57 replaces the v55 planar source-profile layer with rounded vertebra body/process meshes, so the exposed column reads less like flat shards. The reference still has a more authored vertebra mesh with smoother protrusion roots, more accurate occlusion beside the glass card, and stronger embedded oil-film texture.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: replace the remaining procedural vertebra generator with a modeled or more source-frame-specific geometry layer, or obtain/author a matching 3D asset instead of approximating the form with generated meshes.

- [P1] 光影粒子方向 improved but source-level material complexity is still missing
  Location: `makeSourceProfileMaterial`, `makeReferenceSpineMaterial`, `spineFlecks`, and `columnParticleCount` in `src/components/landing-home/index.tsx`.
  Evidence: v57 keeps local oil-fleck sprites and wet-glass materials, and the scroll state shows stronger purple/cyan surface movement. The reference still has higher-frequency noisy iridescence embedded inside the mesh surface rather than highlights that mainly sit above it.
  Impact: the surface now feels less flat and less like a simple particle field, but it is not yet the same production-grade refraction/shader look.
  Fix: add a dedicated shader/material pass for internal oil-film breakup and per-surface noise, not only sprite flecks.

- [P2] v55 planar补形层 was corrected again
  Location: `sourceProfileSegments` and `makeSourceProfileMaterial` in `src/components/landing-home/index.tsx`.
  Evidence: v57 removes the extruded source-profile polygon constants and builds each source-profile segment from a rounded vertebra body, a long side process, and a smaller lower process. `/tmp/ai-pm-exact-spine/default-v57.png` has less clipped planar geometry than v55.
  Impact: the column reads more like wet organic vertebrae than a decorative sawtooth layer.
  Fix: keep future silhouette work focused on rounded vertebra geometry and card occlusion rather than planar shards.

- [P2] 滚动联动 behavior remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v57.png` and `/tmp/ai-pm-exact-spine/settled-v57.png` show the pillar and carousel moving together; default remains visually still except for glow, smoke, flecks, and material breathing.
  Impact: the interaction part of the user's request is satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V57

- Replaced the planar source-profile shard layer with rounded procedural meshes: one vertebra body, one long side process, and one lower process per segment.
- Reduced source-profile segment count and increased vertical spacing so the spine cadence is less dense and closer to the reference crop.
- Rebalanced the source-profile material toward wet, dark, rounded forms instead of flat polygonal reflections.
- Preserved the story-carousel coupling so scroll impulse rotates the pillar and cards together, while default state remains mostly static.
- Captured desktop default, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v57 evidence is now the current baseline.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
