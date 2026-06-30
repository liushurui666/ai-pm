# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference frame: `/tmp/ai-pm-video-reference/user-ref-02.png`
- supplemental mirror path: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- mirror source assets now used: `spine.bin`, `draco_wasm_wrapper.js`, `draco_decoder.wasm`, `basis_transcoder.js`, `basis_transcoder.wasm`, `alien_cracked_2_basecolor.ktx2`, `cliffs_MRO.ktx2`, `matcap-test.jpg`, `damaged_road_normal.jpg`, `waternormals.jpg`, `env1.jpg`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v95-final.png`
- implementation scroll screenshot: `/tmp/ai-pm-exact-spine/impulse-v95-final.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v95-final.png`
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v95.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v95.png`
- viewport: 1920x1080 desktop capture, 390x844 mobile capture, plus 1280x720 comparison scaling
- state: unauthenticated landing page; default idle motion, one wheel-driven scroll state, and mobile first viewport
- final result: blocked for literal 100% pixel match; v95 is a materially closer implementation pass
- blocker: source geometry and source KTX2/FBR texture inputs are now used, but the original site still has a full multi-render-target refraction/composite pipeline that is not reproduced exactly inside AI PM.

## Findings

- [P1] Spine material now follows the mirror `SpineShader` path more closely
  Evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v95.png`.
  Change: added KTX2 baseColor/MRO textures and a source-like FBR shader path over the real `spine.bin` instancer.
  Remaining gap: the source site's `tRefraction` buffer is approximated with a local environment texture, so oil-film refraction and bloom are close in direction but not pixel-identical.

- [P1] Front glass card is better aligned with the pillar
  Evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v95.png`.
  Change: moved the front Work glass layer back toward the spine center and kept it coupled to `storyOrbit` on wheel.
  Remaining gap: the original Work card has source project media/content density; AI PM still uses product-specific generated panel text.

- [P2] Runtime verification is clean
  Evidence: `/tmp/ai-pm-exact-spine/v95-report.json`.
  Result: desktop and mobile canvases are nonblank, KTX2 loads without warnings, shader compilation does not report errors, and wheel interaction no longer emits the passive-listener error.

## Patches Made In V95

- Added source KTX2 assets and Basis transcoder runtime under `public/landing`.
- Added `KTX2Loader` support and excluded static third-party Basis runtime files from ESLint.
- Reworked `createSourceSpineShaderMaterial` to use source-like `tBaseColor`, `tMRO`, `tMatcap`, `tNormal`, `uLight`, `uNormalStrength`, and `uReflection` uniforms.
- Preserved the mirror `SpineInstancer` cadence: 40 instances, `0.65` vertical spacing, and `0.4` radians per-instance rotation.
- Centered the front glass panel closer to the pillar and kept the pillar/card scroll coupling.
- Removed wheel `preventDefault` to keep console clean while retaining virtual 3D scroll behavior.

## Required Fidelity Surfaces

- Fonts/copy remain AI PM-specific; acceptable for product landing, not a literal clone.
- Geometry uses the real source `spine.bin`, but source post-processing and MRT refraction are still approximated.
- Work card content and exact camera crop remain the biggest visible differences from the provided reference frame.
- Do not mark Product Design QA as fully passed until pillar silhouette, front-card content density, oil-film refraction, and source camera timing match the mp4 at the same frame/state.
