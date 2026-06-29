# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v59.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v59.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v59.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v59.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v59.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked for exact-source fidelity, improved for smoother source-profile geometry and scroll-coupled motion

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v59.png` compares the reference crop, default v59 crop, and scroll-impulse v59 crop. v59 replaces the most visible reference-profile protrusions with smoother rounded core/process meshes, so the side profile is less like a random shard stack and less needle-like than v58. The reference still has an authored/scanned vertebra asset with more accurate occlusion beside the glass cards, richer internal oil-film breakup, and smoother root transitions.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: use or author a matching 3D vertebra asset/shader pass; procedural geometry can approximate the direction but cannot guarantee source-identical topology and refraction.

- [P1] 光影粒子 still lacks source-level embedded material complexity
  Location: `makeSourceProfileMaterial`, `makeReferenceSpineMaterial`, `spineFlecks`, and `surfaceOilPatches` in `src/components/landing-home/index.tsx`.
  Evidence: v59 raises the source-profile reflection intensity and keeps high-frequency local flecks on the pillar. The reference still looks like flecks are inside a wet translucent mesh, while the implementation reads partly as surface sprites and procedural reflections.
  Impact: the page has a better premium 3D direction, but it does not yet match the Active Theory material depth.
  Fix: add a dedicated custom shader/material pass for surface/internal oil-film breakup instead of relying mostly on `MeshPhysicalMaterial` plus sprites.

- [P2] v58 spike regression was corrected
  Location: `createReferenceProcessGeometry` usages in source-profile, reference-stack, wing, and fin meshes.
  Evidence: `/tmp/ai-pm-exact-spine/default-v59.png` shows the horizontal protrusions are shorter and thicker than v58, reducing the long-needle appearance while preserving the single-column side profile.
  Impact: the landing page no longer regresses into thin spikes, and the default frame keeps the story card visible.
  Fix: future tuning should continue thickening root transitions and improving glass occlusion, not re-extending protrusions.

- [P2] 滚动联动 remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v59.png` and `/tmp/ai-pm-exact-spine/settled-v59.png` show the pillar and carousel moving together; default remains visually still except for glow, smoke, flecks, and material breathing.
  Impact: the interaction part of the request is still satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V59

- Added `createReferenceVertebraCoreGeometry` for smoother, less jagged source-profile vertebra bodies.
- Added `createReferenceProcessGeometry` for rounded club-like lateral processes.
- Swapped the most visible reference stack, source-profile, wing, and fin meshes to the new rounded geometry.
- Shortened and thickened lateral process scaling after v58 showed needle-like protrusions.
- Raised per-frame environment reflection on reference/source profile meshes so material tuning is not overwritten by the animation loop.
- Captured desktop default, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v59 evidence is now the current baseline.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`; `127.0.0.1` and IPv6 loopback did not hydrate the client bundle in this browser, so visual QA screenshots were captured from `localhost`.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
