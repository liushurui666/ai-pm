# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference frame: `/tmp/ai-pm-video-reference/user-ref-02.png`
- supplemental mirror path: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- mirror source assets now used: `spine.bin`, `draco_wasm_wrapper.js`, `draco_decoder.wasm`, `matcap-test.jpg`, `damaged_road_normal.jpg`, `waternormals.jpg`, `env1.jpg`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v90-source-instancer.png`
- implementation scroll screenshot: `/tmp/ai-pm-exact-spine/impulse-v90-source-instancer.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v90-source-instancer.png`
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v90.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v90.png`
- viewport: 1280x720 desktop, 390x844 mobile
- state: unauthenticated landing page; default idle motion, one wheel-driven scroll state, and mobile first viewport
- final result: blocked
- blocker: v90 now uses the mirror's real source instancing rhythm and Work textures, but it is still not pixel-identical to the provided reference mp4. The remaining differences are visible in source FBR/refraction shading, front card content density, and exact Work camera framing.

## Findings

- [P1] Source instancing is closer, but the source FBR material is still approximated
  Location: `src/components/landing-home/index.tsx` Active Theory spine instance layer.
  Evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v90.png` shows the column now using the mirror's `40`-instance cadence (`y = 4 - 0.65*i`, `rotation.y = 0.4*i`) and the fallback geometry no longer dominates. The reference frame still has denser wet black surfaces and sharper cyan/purple oil-film highlights.
  Impact: the mirror materially improves the shape match, but geometry plus physical material is still not the same as the source site's FBR/refraction shader stack.
  Fix: port a dedicated source-like spine shader using `tRefraction`, `uReflection`, matcap, and the normal map instead of relying on `MeshPhysicalMaterial` plus additive shell.

- [P1] Front Work card refraction is better, but still not the source WorkItem render
  Location: `createWorkRefractionPanelMaterial` and `referenceGlassPanels`.
  Evidence: the v90 front panel now uses `waternormals.jpg` and `env1.jpg`, with lower water distortion to match source `uDistortStrength: 0`. The reference panel still has richer video/image content and a heavier green glass body.
  Impact: users can see the spatial role is the same, but not mistake it for the exact Active Theory Work card.
  Fix: build a dedicated runtime texture/video-like panel with source-level content density, or wire a closer WorkItem shader pass around the current AI PM texture.

- [P2] Scroll coupling works, but exact camera orbit still differs
  Location: `activeTheorySpineInstances`, `referenceGlassPanels`, and `pillarGroup` animation.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v90-source-instancer.png` shows the pillar and front card rotate together after wheel input. The source reference has a heavier camera move around the column and a different center crop.
  Impact: behavior direction is correct, but the mp4 timing and perspective are not exact.
  Fix: tune `storyOrbit`, front-panel radius/rotation, and `pillarGroup` camera-relative position against multiple extracted mp4 frames.

## Patches Made In V90

- Added mirror source textures `damaged_road_normal.jpg`, `waternormals.jpg`, and `env1.jpg` to the landing public assets.
- Updated the source spine instances to match the mirror `SpineInstancer` cadence: `40` copies, `0.65` vertical spacing, and `0.4` radians per-instance rotation.
- Reduced the old hand-built fallback vertebrae after `spine.bin` loads so the real source geometry is visually dominant.
- Tuned the spine material toward source values: lower normal scale (`0.19`), source normal map on base/clearcoat, and darker rougher reflections.
- Tuned the front glass shader toward `WorkItemShader` behavior by reducing water distortion and leaning more on environment/Fresnel refraction.
- Verified desktop default, desktop scroll, and mobile first viewport in the in-app browser.

## Required Fidelity Surfaces

- Fonts and typography: AI PM landing copy remains product-specific, not source-identical Work typography; blocked for literal clone, acceptable for product context.
- Spacing and layout rhythm: central column/card relationship is closer and mobile CTAs remain stable, but source Work camera framing is still different.
- Colors and visual tokens: mirror normal/env textures improve cyan/green/purple highlights; source bloom and FBR contrast are still stronger.
- Image quality and asset fidelity: real source `spine.bin`, matcap, normal, water-normal, and env assets are used; the Work card content is still a generated AI PM texture rather than the source site's video/thumbnail stack.
- Copy and content: intentionally uses AI PM copy; this is acceptable for the product homepage but not for a literal 100% visual clone.

## Implementation Checklist

- Keep v90 evidence as the baseline for the next fidelity pass.
- Next pass should target a custom source-like `SpineShader` material and a closer WorkItem card render before further layout polish.
- Do not mark Product Design QA as passed until the pillar silhouette, front card opacity/content, oil-film refraction, and scroll camera motion match the mp4 at the same frame/state.
