# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v64.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v64.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v64.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v64.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v64.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked for exact-source fidelity, improved for denser embedded oil-film material, a more continuous source-profile column, and scroll-coupled motion

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v64.png` compares the reference crop, default v64 crop, and scroll-impulse v64 crop. v64 adds a dedicated reference oil-film texture, shifts the source-profile column into a more continuous 10-segment side silhouette, and fades the top/bottom edge segments so flat white reflections do not dominate. The reference still has an authored/scanned vertebra asset with more accurate local topology, occlusion beside the glass cards, and true internal refraction.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: use or author a matching 3D vertebra asset/shader pass; procedural geometry can approximate the direction but cannot guarantee source-identical topology and refraction.

- [P1] 光影粒子 still lacks source-level embedded material complexity
  Location: `makeSourceProfileMaterial`, `makeReferenceSpineMaterial`, `spineFlecks`, and `surfaceOilPatches` in `src/components/landing-home/index.tsx`.
  Evidence: v64 adds `createReferenceOilFilmTexture()` with red/blue/gold/white flecks and short scan-like strokes, plus denser local spine flecks. The implementation is less uniformly blue-purple than v59, but the reference still looks like flecks are suspended inside a wet translucent mesh rather than layered onto procedural geometry.
  Impact: the page has a better premium 3D direction, but it does not yet match the Active Theory material depth.
  Fix: add a dedicated custom shader/material pass for surface/internal oil-film breakup instead of relying mostly on `MeshPhysicalMaterial` plus sprites.

- [P2] 侧影更连续，但仍不是源视频级雕塑
  Location: `sourceProfileSegments` and `processBlade` in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/default-v64.png` shows the visible column no longer reads as several disconnected blue-purple beads; source-profile segments use a denser 10-segment cadence, process-root blending, and dark silhouette blades. The reference still has sharper authored vertebra transitions and more credible card-side occlusion.
  Impact: the page moves closer to the requested central-column direction without reintroducing the v58 needle spike regression.
  Fix: replace the procedural side-profile meshes with a source-matched GLTF or custom deformed geometry if exactness remains mandatory.

- [P2] 滚动联动 remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v64.png` and `/tmp/ai-pm-exact-spine/settled-v64.png` show the pillar and carousel moving together; default remains visually still except for glow, smoke, flecks, and material breathing.
  Impact: the interaction part of the request is still satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V64

- Added `createReferenceOilFilmTexture()` for denser red/blue/gold/white embedded oil-film breakup.
- Mapped the reference oil texture into `makeReferenceSpineMaterial()` and `makeSourceProfileMaterial()` so the main column is less uniformly blue-purple.
- Expanded source-profile geometry to 10 closer segments with a smoother root bridge, darker side blades, and edge fading to avoid flat white top reflections.
- Reduced the old background blobby field and old reference-stack opacity so the continuous source-profile column is visually dominant.
- Retuned local spine flecks to be smaller, denser, and more red/blue/gold like the reference frame.
- Captured desktop default, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v64 evidence is now the current baseline.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`; `127.0.0.1` and IPv6 loopback did not hydrate the client bundle in this browser, so visual QA screenshots were captured from `localhost`.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
