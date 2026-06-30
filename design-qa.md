# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference frame: `/tmp/ai-pm-video-reference/user-ref-02.png`
- supplemental mirror path: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- mirror source assets now used: `spine.bin`, `draco_wasm_wrapper.js`, `draco_decoder.wasm`, `basis_transcoder.js`, `basis_transcoder.wasm`, `alien_cracked_2_basecolor.ktx2`, `cliffs_MRO.ktx2`, `matcap-test.jpg`, `damaged_road_normal.jpg`, `waternormals.jpg`, `env1.jpg`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v96-refraction.png`
- implementation scroll screenshot: `/tmp/ai-pm-exact-spine/impulse-v96-refraction.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v96-refraction.png`
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v96.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v96.png`
- viewport: 1920x1080 desktop capture, 390x844 mobile capture, plus 1280x720 comparison scaling
- state: unauthenticated landing page; default idle motion, one wheel-driven scroll state, and mobile first viewport
- final result: blocked for literal 100% pixel match; v96 improves source-informed refraction and body thickness but still has visible differences
- blocker: source geometry and source KTX2/FBR texture inputs are now used, and `tRefraction` is fed by a dynamic pillar texture instead of static env, but the original site still has a full multi-render-target refraction/composite pipeline and exact Work project media/camera timing that are not reproduced exactly inside AI PM.

## Findings

- [P1] Spine refraction now follows the mirror `SpineShader` data path more closely
  Evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v96.png`.
  Change: kept KTX2 baseColor/MRO textures and source-like FBR uniforms, then changed `tRefraction` from the static `env1` texture to the dynamic reference pillar texture so scroll/default frames carry moving wet highlights.
  Remaining gap: the source site's `Work/refraction` buffer is generated from the real Work scene MRT pass; our dynamic texture is a local approximation, so the oil-film highlights and bloom are directionally closer but still not pixel-identical.

- [P1] Source spine body is less thin but still not the exact source silhouette
  Evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v96.png`.
  Change: used mirror evidence that `MESH_Element_5_Workscale` is `[3.5, 3.5, 3.5]` and increased the local `spine.bin` instance scale from `1.72/1.38/1.5` to `2.04/1.58/1.82`.
  Remaining gap: direct `3.5` scale would occlude the AI PM login/home composition, and the original source crop/camera makes the upper bone cluster taller and wider than the current implementation.

- [P1] Front glass card is better aligned with the pillar
  Evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v95.png`.
  Change: moved the front Work glass layer back toward the spine center and kept it coupled to `storyOrbit` on wheel.
  Remaining gap: the original Work card has source project media/content density; AI PM still uses product-specific generated panel text.

- [P2] Runtime verification is clean
  Evidence: `/tmp/ai-pm-exact-spine/v96-report.json`.
  Result: desktop and mobile canvases are nonblank, shader compilation does not report errors, wheel interaction works, and the captured console has no error/warning issues.

## Patches Made In V96

- Changed source `SpineShader` refraction sampling to use the dynamic reference pillar texture instead of the static Work env texture.
- Increased the real `spine.bin` instance scale to better honor the mirror scene's `[3.5, 3.5, 3.5]` source mesh scale without covering the AI PM entry UI.
- Widened the dynamic subject plane from `1.54` to `1.72` so the pillar no longer collapses into a thin dark strip in the default crop.
- Re-ran lint, production build, desktop/mobile Playwright captures, and full/focused source-vs-implementation comparison images.

## Required Fidelity Surfaces

- Fonts/copy remain AI PM-specific; acceptable for product landing, not a literal clone.
- Geometry uses the real source `spine.bin`, but source post-processing and MRT refraction are still approximated.
- Work card content and exact camera crop remain the biggest visible differences from the provided reference frame.
- Do not mark Product Design QA as fully passed until pillar silhouette, front-card content density, oil-film refraction, and source camera timing match the mp4 at the same frame/state.
