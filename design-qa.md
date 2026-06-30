# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference frame: `/tmp/ai-pm-video-reference/user-ref-02.png`
- supplemental Hogwarts reference screenshot: `/var/folders/xf/l02y_0qx7pd4zztgnkrpsbq80000gn/T/codex-clipboard-1e846b05-ef1a-49ee-bb9c-a6eb441cb54a.png`
- supplemental mirror path: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- mirror/source assets now used: `spine.bin`, `draco_wasm_wrapper.js`, `draco_decoder.wasm`, `basis_transcoder.js`, `basis_transcoder.wasm`, `alien_cracked_2_basecolor.ktx2`, `cliffs_MRO.ktx2`, `matcap-test.jpg`, `damaged_road_normal.jpg`, `waternormals.jpg`, `env1.jpg`, CMS `Welcome to Hogwarts` thumbnail/logo
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v102.png`
- implementation scroll screenshot: `/tmp/ai-pm-exact-spine/impulse-v102.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v102.png`
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/hogwarts-ref-default-impulse-v102.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/hogwarts-pillar-panel-focused-v102.png`
- viewport: 1920x1080 desktop capture, 390x844 mobile capture, plus 1280x720 comparison scaling
- state: unauthenticated landing page; default idle motion, one wheel-driven scroll state, and mobile first viewport
- final result: improved but not a literal 100% pixel match; v102 uses the mirror-derived Work-pane behavior plus real `Welcome to Hogwarts` CMS media/logo, and is materially closer than v99.
- blocker: the mirror materially improves fidelity because it exposes `spine.bin`, Work camera, `SpineInstancer`, `SpineShader`, `WorkItemShader`, `WorkPaneUI`, shader uniform values, and CMS URLs. It is still a minified production bundle/cache, not full editable engine source; the original site's MRT `Work/refraction` pipeline, exact FBR internals, video frame timing, font rasterization, and post-processing stack are not fully reproduced inside AI PM.

## Findings

- [P1] Mirror materially improves the chance of high-fidelity reconstruction, but not by itself to 100%
  Evidence: `/tmp/ai-pm-exact-spine/hogwarts-pillar-panel-focused-v102.png`.
  Change: treated the mirror as production evidence instead of a visual moodboard: retained real `spine.bin`, 40-instance spacing/rotation, Work camera values, `SpineShader` refraction uniforms, `WorkItemShader` env/normal inputs, and CMS `Welcome to Hogwarts` project media.
  Remaining gap: the mirror does not provide editable engine source or the exact live render-target/post-processing chain, so exact Work render-target composition remains approximated.

- [P1] Front Work pane now follows source card content density more closely
  Evidence: `/tmp/ai-pm-exact-spine/hogwarts-pillar-panel-focused-v102.png`.
  Change: replaced the clean AI PM text board with a WorkPaneUI-like projection and added a real media shader sampling `active-theory-hogwarts-thumb.jpg` plus `active-theory-hogwarts-logo.jpg`. The pane now carries the same `Welcome to Hogwarts` identity as the user's source screenshot.
  Remaining gap: the source pane is driven by live video frame timing, the original NBArchitekt font rasterization, and Active Theory's exact post-processing; our panel is still a local Canvas/Shader reconstruction.

- [P1] Source spine body is wider and less over-clipped
  Evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v99.png`.
  Change: widened the dynamic subject plane, loosened right-side culling, increased the dynamic/organic masks, and moved the pillar field left so the visible body sits behind the card like the reference instead of collapsing into a thin center strip.
  Remaining gap: the upper bone cluster and lower connector still depend on local approximation layers rather than the exact source render pass.

- [P2] Runtime verification is clean
  Evidence: `/tmp/ai-pm-exact-spine/v102-report.json`.
  Result: desktop and mobile canvases are nonblank, shader compilation does not report errors, wheel interaction works, and the captured console has no error/warning issues.

## Patches Made In V102

- Added CMS-derived Hogwarts assets from the mirror/source project: `public/landing/active-theory-hogwarts-thumb.jpg` and `public/landing/active-theory-hogwarts-logo.jpg`.
- Rebuilt the front glass panel texture to match the mirror WorkPaneUI model: source-scale `Welcome to Hogwarts` projection, greyer dirty glass, muted scan lines, and stronger media haze.
- Added a dedicated media ShaderMaterial for the front pane so the real thumbnail/logo projection animates with time and scroll, then sits between the base UI canvas and WorkItem-style refraction layer.
- Increased front pane width/height and adjusted its shader blend so the media projection survives the glass/refraction layer instead of fading into a clean dark panel.
- Widened and shifted the source-video pillar subject layer, relaxed mask clipping, and reduced the foreground occlusion layer so the column reads as a wider source-like body behind the card.
- Re-ran lint, production build, desktop/mobile Playwright captures, and full/focused source-vs-implementation comparison images.

## Required Fidelity Surfaces

- Fonts/copy remain AI PM-specific; acceptable for product landing, not a literal clone.
- Geometry uses the real source `spine.bin`, but source post-processing and MRT refraction are still approximated.
- Work card content and exact camera crop remain the biggest visible differences from the provided reference frame.
- Do not mark Product Design QA as fully passed until pillar silhouette, front-card content density, oil-film refraction, and source camera timing match the mp4 at the same frame/state.
