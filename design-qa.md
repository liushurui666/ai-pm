# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v67.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v67.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v67.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v67.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v67.png`
- focused material texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-field-wide-v67.png`
- focused rim texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-rim-wide-v67.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked
- blocker: exact-source fidelity is still not proven; v67 imports a wider reference material field and a reference-derived colored rim field, but the live page still cannot be certified as source-identical to the mp4's geometry/refraction.

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v67.png` compares the reference crop, default v67 crop, and scroll-impulse v67 crop. v67 keeps the continuous 10-segment side silhouette and replaces the narrow v66 material layer with `reference-spine-field-wide-v67.png` plus `reference-spine-rim-wide-v67.png`, both mounted inside `pillarGroup`. The reference still has authored/scanned vertebra topology and true internal refraction that the procedural mesh plus reference-derived planes cannot fully prove as source-identical.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict Product Design QA remains blocked.
  Fix: use or author a matching 3D vertebra asset/shader pass; procedural geometry can approximate the direction but cannot guarantee source-identical topology and refraction.

- [P1] 光影材质更接近参考，但仍未达到源级内部折射
  Location: `referenceSpineField`, `referenceSpineRim`, `makeSourceProfileMaterial`, `makeReferenceSpineMaterial`, `spineFlecks`, and `surfaceOilPatches` in `src/components/landing-home/index.tsx`.
  Evidence: v67 extracts a wider mp4 material field and a colored edge/rim field from the reference frame, then renders both as additive RGBA material layers attached to `pillarGroup`. The default frame now includes the reference's red/blue bone highlights, card-edge occlusion, and more regular rib cadence. The reference still looks like colored flecks are embedded inside a wet translucent mesh, while the implementation reads as procedural geometry with calibrated luminous layers.
  Impact: the page has a better premium 3D direction, but it does not yet match the Active Theory material depth.
  Fix: build a custom shader that uses the reference material field as emissive, alpha, normal, and depth cues, or replace the procedural stack with a source-matched GLTF and authored material maps.

- [P2] 侧影更规整，但仍不是源视频级雕塑
  Location: `sourceProfileSegments` and `processBlade` in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/default-v67.png` shows the visible column no longer reads as several disconnected blue-purple beads; the new wider reference field keeps more of the original regular vertebra outline and the rim layer cuts the side highlights more like the mp4. The reference still has sharper authored vertebra transitions and physically richer card-side refraction.
  Impact: the page moves closer to the requested central-column direction without reintroducing the v58 needle spike regression.
  Fix: replace the procedural side-profile meshes with a source-matched GLTF or custom deformed geometry if exactness remains mandatory.

- [P2] 滚动联动 remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v67.png` and `/tmp/ai-pm-exact-spine/settled-v67.png` show the pillar, wide reference material field, rim layer, and carousel moving together; default remains visually still except for glow, smoke, flecks, and material breathing.
  Impact: the interaction part of the request is still satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V67

- Extracted `public/landing/reference-spine-field-wide-v67.png` from a wider crop of the mp4 reference frame as an RGBA material field with black background keyed out.
- Extracted `public/landing/reference-spine-rim-wide-v67.png` with colored edge detection to preserve the source's regular bone/rib highlights.
- Replaced the v66 narrow reference plane with a wider 1.92x6.16 material plane, then added a second colored rim plane inside `pillarGroup` so both fields follow the same scroll-coupled rotation/position as the 3D pillar.
- Reduced default opacity breathing and shifted the reference layers slightly left to keep the default state calmer while preserving scroll-triggered highlight response.
- Captured desktop default, desktop scroll impulse, desktop settled state, 390x844 mobile layout, and a side-by-side comparison image.

## Implementation Checklist

- v67 evidence is now the current baseline.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`; desktop default, desktop scroll impulse, desktop settled, mobile 390x844, and console checks passed with no warning/error logs.
- Mobile 390x844 has no horizontal overflow (`scrollWidth: 390`, `innerWidth: 390`) and one active canvas.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
