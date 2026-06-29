# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v55.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v55.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v55.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v55.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v55.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked for exact-source fidelity, improved for scroll-coupled motion and a darker, more regular side-spine silhouette

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v55.png` compares the reference crop, default v55 crop, and scroll-impulse v55 crop. v55 removes the v53 flat-blade artifact and gives the column a darker, more coherent side-spine silhouette, but the reference still has a more authored vertebra mesh with smoother protrusion roots, more accurate occlusion beside the glass card, and stronger embedded oil-film texture.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: replace the remaining procedural vertebra generator with a modeled or more source-frame-specific geometry layer, or obtain/author a matching 3D asset instead of approximating the form with generated meshes.

- [P1] 光影粒子方向 improved but source-level material complexity is still missing
  Location: `makeSourceProfileMaterial`, `makeReferenceSpineMaterial`, `spineFlecks`, and `columnParticleCount` in `src/components/landing-home/index.tsx`.
  Evidence: v55 keeps local oil-fleck sprites and wet-glass materials, and the scroll state shows stronger purple/cyan surface movement. The reference still has higher-frequency noisy iridescence embedded inside the mesh surface rather than highlights that mainly sit above it.
  Impact: the surface now feels less flat and less like a simple particle field, but it is not yet the same production-grade refraction/shader look.
  Fix: add a dedicated shader/material pass for internal oil-film breakup and per-surface noise, not only sprite flecks.

- [P2] v53 flat-blade silhouette was corrected
  Location: `sourceProfileSegments` and `makeSourceProfileMaterial` in `src/components/landing-home/index.tsx`.
  Evidence: v55 scales the side-profile layer down, darkens its reflection/emissive response, rounds the source-profile points, and moves the layer away from the clipped top edge. `/tmp/ai-pm-exact-spine/default-v55.png` no longer has the oversized blue blade row from v53.
  Impact: the column reads more like an integrated spine than a flat decorative sawtooth layer.
  Fix: keep future silhouette work focused on rounded vertebra geometry rather than large planar shards.

- [P2] 滚动联动 behavior remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v55.png` and `/tmp/ai-pm-exact-spine/settled-v55.png` show the pillar and carousel moving together; default remains visually still except for glow, smoke, flecks, and material breathing.
  Impact: the interaction part of the user's request is satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V55

- Added a darker source-profile geometry layer that follows the whole pillar and scroll orbit, then tuned it down after v53 showed an oversized flat-blade artifact.
- Rebalanced the main side spine: stronger rounded left protrusions, less overpowering top shard material, and legacy random geometry kept as low-opacity volume.
- Preserved the story-carousel coupling so scroll impulse rotates the pillar and cards together, while default state remains mostly static.
- Captured desktop default, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v55 evidence is now the current baseline.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
