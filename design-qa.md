# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v66.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v66.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v66.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v66.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v66.png`
- focused material texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-field-v66.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked
- blocker: exact-source fidelity is still not proven; v66 improves reference-matched oil-film/color detail, but the geometry/refraction is still not source-identical.

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v66.png` compares the reference crop, default v66 crop, and scroll-impulse v66 crop. v66 keeps the v64 continuous 10-segment side silhouette and adds a reference-calibrated `reference-spine-field-v66.png` RGBA texture plane that moves with the pillar group. The reference still has authored/scanned vertebra topology, more accurate local occlusion beside the glass cards, and true internal refraction that the procedural mesh plus texture plane does not fully reproduce.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: use or author a matching 3D vertebra asset/shader pass; procedural geometry can approximate the direction but cannot guarantee source-identical topology and refraction.

- [P1] 光影材质更接近参考，但仍未达到源级内部折射
  Location: `referenceSpineField`, `makeSourceProfileMaterial`, `makeReferenceSpineMaterial`, `spineFlecks`, and `surfaceOilPatches` in `src/components/landing-home/index.tsx`.
  Evidence: v66 extracts the reference frame's red/blue/gold oil-film marks into `public/landing/reference-spine-field-v66.png` and renders it as an additive RGBA material layer attached to `pillarGroup`, so the default frame now has more source-like fleck distribution than v64. The reference still looks like colored flecks are embedded inside a wet translucent mesh, while the implementation reads as procedural geometry with a calibrated luminous material layer.
  Impact: the page has a better premium 3D direction, but it does not yet match the Active Theory material depth.
  Fix: build a custom shader that uses the reference material field as emissive, alpha, normal, and depth cues, or replace the procedural stack with a source-matched GLTF and authored material maps.

- [P2] 侧影更连续，但仍不是源视频级雕塑
  Location: `sourceProfileSegments` and `processBlade` in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/default-v66.png` shows the visible column no longer reads as several disconnected blue-purple beads; source-profile segments use a denser 10-segment cadence, process-root blending, dark silhouette blades, and the reference field overlay. The reference still has sharper authored vertebra transitions and more credible card-side occlusion.
  Impact: the page moves closer to the requested central-column direction without reintroducing the v58 needle spike regression.
  Fix: replace the procedural side-profile meshes with a source-matched GLTF or custom deformed geometry if exactness remains mandatory.

- [P2] 滚动联动 remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v66.png` and `/tmp/ai-pm-exact-spine/settled-v66.png` show the pillar, new reference-calibrated material layer, and carousel moving together; default remains visually still except for glow, smoke, flecks, and material breathing.
  Impact: the interaction part of the request is still satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V66

- Extracted `public/landing/reference-spine-field-v66.png` from the provided mp4 reference frame as an RGBA material field with black background keyed out.
- Added a reference-calibrated additive plane and ghost layer inside `pillarGroup`, so the material field follows the same scroll-coupled rotation/position as the 3D pillar.
- Added `alphaTest` and `depthTest: false` to prevent the extracted material layer from becoming a visible rectangular plane.
- Preserved the v64 10-segment source-profile geometry, darker process blades, and edge fading while improving red/blue oil-film distribution.
- Captured desktop default, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v66 evidence is now the current baseline.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`; `127.0.0.1` and IPv6 loopback did not hydrate the client bundle in this browser, so visual QA screenshots were captured from `localhost`.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
