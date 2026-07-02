# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-v156-cohesive-pillar/refined-progress-5.png`
- metrics evidence: `/tmp/ai-pm-landing-v156-cohesive-pillar/refined-progress-*.png` plus sampled DOM rects in this QA note.
- refresh performance evidence: `/tmp/ai-pm-refresh-perf-v157/early-120ms.png` and `/tmp/ai-pm-refresh-perf-v157/late-webgl.png`
- refresh scroll-restore evidence: `/tmp/ai-pm-scroll-restore-v158/after-reload-top.png`
- mobile evidence: `/tmp/ai-pm-landing-v156-cohesive-pillar/mobile-progress-5.png`
- viewport: 1706x918 desktop and 390x844 mobile, in-app browser Playwright verification, `http://localhost:3004/?qa=v156-cohesive-pillar`
- state: unauthenticated landing page, hydrated WebGL canvas, programmatic native page scroll through top/mid/deep states.
- final result: interaction corrected, visual still approximate
- remaining gap: this is still not a 100% Active Theory shader port. The exact source MRT refraction, WorkItemShader, WorkPaneUI capture, and camera composite are approximated with local Three.js shaders and DOM media layers.

## Findings

- [P1] Pillar x/z stays locked through scroll.
  Evidence: v148 desktop metrics keep `pillarX=-0.620` and `pillarZ=-0.360` at every sampled scroll position from `0` through `2650`.
  Impact: the column no longer produces left/right drift while the user scrolls downward.

- [P1] The column moves downward continuously instead of snapping back.
  Evidence: sampled `pillarDrop` is monotonic: `0.000 -> 1.250 -> 1.638 -> 2.070 -> 2.297`.
  Impact: stopping mid-scroll no longer makes the column look like it is returning to center.

- [P1] WorkItem interaction is a true multi-card queue.
  Evidence: v148 keeps `totalCards=15`, `activeCount=1`, visible cards normally `4-5`, and active slots advance `0 -> 1 -> 2 -> 3 -> 4`.
  Impact: the page is not swapping content inside one card; all 15 slot nodes remain in the DOM and all 15 WebGL panes remain in the scene.

- [P1] Cards orbit beside the pillar instead of covering the center column.
  Evidence: v151 moves the focused DOM/WebGL WorkItem to the right side of the pillar using a 50deg `cos(angle)` side-clearance phase. Desktop samples keep an approximate center-column gap of `116-124px` and `rightOverflow=0` at scroll `0/720/1900`.
  Impact: the column remains the primary visual object while the active card reads as a panel moving around it.

- [P1] Cards now orbit around the pillar instead of staying on one side.
  Evidence: v152 adds continuous scroll progress into the WorkItem orbit phase. Desktop active card center samples move across the viewport `1229 -> 898 -> 386 -> 635 -> 1157 -> 389`, proving the current card crosses right, center, left, and back right instead of resetting to the right on every active item.
  Impact: the WorkItem queue now reads as a true orbit around the light column while the pillar x/z stays locked.

- [P1] Horizontal orbit is the primary motion, not a vertical queue.
  Evidence: v153 uses `cos(angle)` for the main left/right projection and `sin(angle)` for front/back depth, while reducing the DOM y-step from `312px` to `96px`. Desktop active card centerX moves `1254 -> 594 -> 403 -> 818 -> 1170 -> 488`, while centerY stays in a narrower `379-500px` band.
  Impact: the interaction reads as horizontal orbit around the light pillar, with only slight vertical layering for handoff between cards.

- [P1] Cards sit behind the real WebGL column without a black fake pillar.
  Evidence: v155 removes the `.landing-story-pillar-occlusion` black overlay entirely, sets the DOM card rail below the canvas (`railZ=1`, `canvasZ=2`), and leaves `canvasPointer=none` so interactions still pass through. Desktop progress `5` shows the card crossing behind the WebGL spine, with `blackStripeExists=false`.
  Impact: the column/card depth now comes from the actual Three.js layer instead of a visible black mask.

- [P1] The pillar now reads as one cohesive WebGL column instead of stacked reference sheets.
  Evidence: v156 replaces the wide `referenceSpineField`/`rim` mesh-basic planes with a shared narrow cohesion-film shader, disables the old ghost layer, lowers the motion/subject overlays behind the real `spine.bin` instances, and adds a low-opacity cylindrical oil skin. Desktop screenshots `refined-progress-0/3/5/8.png` show the column core stays continuous while cards still pass behind it.
  Impact: the pillar no longer depends on several offset semi-transparent rectangles to form its body; the visible body comes from the real geometry plus one restrained material skin.

- [P1] Refresh no longer starts every heavy 3D resource on the first frame.
  Evidence: v157 delays WebGL scene hydration until after the first DOM paint, caps the full-screen renderer pixel ratio at `1.5`, and defers the 7MB flower-spine point cloud by `1200ms`. Built-in browser route `http://localhost:3004/?qa=refresh-perf-v157-clean` showed the landing page present with `storyProgress=0.000`, `pillarDrop=0.000`, `docWidth=1280`, and no horizontal overflow.
  Impact: refreshing the public landing page now shows readable title/CTA content first, while the high-fidelity point-cloud layer loads as progressive enhancement instead of blocking the first visual response.

- [P1] Refresh does not reuse the previous scroll position as new story input.
  Evidence: v158 reproduces the failure path by scrolling to `scrollY=2200` (`storyProgress=4.296`, active card `上线前最后锁定`) and then reloading. Seven post-reload samples stayed at `scrollY=0`, `storyProgress=0.000`, `pillarDrop=0.000`, active card `AI PM 项目作战舱`.
  Impact: browser scroll restoration no longer looks like the user rolled several times on refresh, so the landing page avoids the accidental WorkItem/pillar jump that felt like a freeze.

- [P1] Cards no longer cover the full screen.
  Evidence: v153 active card sizes are top `619px` wide, left orbit `765-770px`, center/front pass `458px`, and right return `685px`, instead of v147's `68%-76%` viewport-width full-screen pane.
  Impact: the foreground screen keeps the Active Theory-like media-panel presence without turning into a full-screen poster.

- [P1] Current card copy is readable instead of washed out.
  Evidence: v149 raises the focused DOM card opacity to `0.620`, with active title/body/metric colors at `0.96/0.86/0.98` alpha and a darker focused media underlay for the text side.
  Impact: the active WorkItem can still feel like a glass media screen, but the user can now read the Chinese title, description, and metric without guessing.

- [P1] Right-side gray ghost layer is reduced.
  Evidence: v150 removes the rear/front reference glass environment panels from the visible stage, fixes the wide occlusion shader opacity to `0`, and lowers the second-highest DOM card opacity to `0.018` at scroll `1900`.
  Impact: the current card and pillar remain visible, but the empty right-side area no longer reads as a dirty rectangular overlay.

- [P1] Adjacent cards use different real media textures.
  Evidence: sampled visible slots show media paths rotating through `active-theory-hogwarts-thumb.jpg`, `active-theory-work-lab.jpg`, `active-theory-work-reel-frame.jpg`, `active-theory-work-test.jpg`, and `active-theory-work-local.png`.
  Impact: scrolling no longer looks like one repeated card texture.

- [P2] Visual fidelity is closer but not source-complete.
  Evidence: `/tmp/ai-pm-landing-scroll-v148-size/scroll-1900.png` shows the corrected scale and interaction model, but source shader refraction, exact glass thickness, and final composite are still approximations.
  Impact: this pass is acceptable as an interaction/visual correction, but a later full shader port would still be needed for pixel-level parity.

## Patches Made In This Pass

- Added four local media assets from the Active Theory mirror under `public/landing/active-theory-work-*`.
- Added `mediaPath` to each landing story scene and wired DOM cards to `--card-media`.
- Loaded per-scene media textures in the Three.js stage and passed them to each WorkItem shader material by `sceneIndex`.
- Moved DOM and WebGL WorkItem tracks onto a side-clearance orbit around the pillar instead of the previous centerline lane.
- Reduced WebGL pane scale/depth while preserving the 15-slot queue and fixed pillar/camera x-z behavior.
- Raised focused DOM card opacity and focused text contrast while keeping non-focused cards low-opacity.
- Added a darker focused media underlay on the text side so the copy stays crisp without increasing card size.
- Raised the weak WebGL pane UI projection to match the DOM layer's improved readability.
- Removed visible front/rear reference glass panels, disabled the broad occlusion shader layer, and lowered non-focused DOM/WebGL pane opacity to avoid gray ghost rectangles.
- Added a continuous progress-driven orbit phase so active cards do not keep returning to the same side of the column.
- Reduced DOM/WebGL orbit radius and focus scale after adding true orbit, keeping the side pass visible without letting perspective inflate the card into a full-screen layer.
- Rebalanced the orbit to prioritize horizontal x-z movement: larger side/depth phase, reduced y-step, and matching refraction-canvas pane projection.
- Moved the DOM WorkItem rail behind the WebGL canvas and removed the black pillar overlay, so the real column layer occludes cards naturally.
- Replaced the broad field/ghost/rim reference planes with one shared narrow cohesion-film shader and hid the ghost layer to remove the “stacked flat sheets” reading.
- Added a subtle continuous oil-skin cylinder behind the real `spine.bin` geometry, lowered subject/motion overlays behind the geometry, and reduced foreground cavity/surface oil sprites so they read as material details instead of pasted layers.
- Delayed WebGL scene hydration by two animation frames plus a short timer so refresh can paint the DOM shell before initializing Three.js, video textures, and DRACO/KTX2 resources.
- Capped the landing renderer pixel ratio at `1.5` to reduce full-screen canvas allocation cost on high-DPI displays.
- Deferred the 7MB flower-spine point cloud load by `1200ms`, keeping the core pillar and card interaction available before the final particle detail layer arrives.
- Disabled browser scroll restoration while the landing story is mounted and added a short refresh guard that resets `scrollY`, story progress, impulse, active index, and DOM WorkItem transforms to `0` before restored scroll can enter the 3D rig.

## Validation

- `git diff --check`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v156-cohesive-pillar`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
  - `/tmp/ai-pm-landing-v151-orbit-clear-column/scroll-1900-fit.png`
  - `/tmp/ai-pm-landing-v151-orbit-clear-column/mobile-final.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-0.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-3.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-5.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-8.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/mobile-progress-5.png`
  - `/tmp/ai-pm-landing-v153-horizontal-orbit/progress-0.png`
  - `/tmp/ai-pm-landing-v153-horizontal-orbit/progress-3.png`
  - `/tmp/ai-pm-landing-v153-horizontal-orbit/progress-5.png`
  - `/tmp/ai-pm-landing-v153-horizontal-orbit/progress-8.png`
  - `/tmp/ai-pm-landing-v153-horizontal-orbit/mobile-progress-3.png`
  - `/tmp/ai-pm-landing-v155-card-behind-canvas/progress-0.png`
  - `/tmp/ai-pm-landing-v155-card-behind-canvas/progress-3.png`
  - `/tmp/ai-pm-landing-v155-card-behind-canvas/progress-5.png`
  - `/tmp/ai-pm-landing-v155-card-behind-canvas/progress-8.png`
  - `/tmp/ai-pm-landing-v155-card-behind-canvas/mobile.png`
  - `/tmp/ai-pm-landing-v156-cohesive-pillar/refined-progress-0.png`
  - `/tmp/ai-pm-landing-v156-cohesive-pillar/refined-progress-3.png`
  - `/tmp/ai-pm-landing-v156-cohesive-pillar/refined-progress-5.png`
  - `/tmp/ai-pm-landing-v156-cohesive-pillar/refined-progress-8.png`
  - `/tmp/ai-pm-landing-v156-cohesive-pillar/mobile-progress-5.png`
  - `/tmp/ai-pm-refresh-perf-v157/early-120ms.png`
  - `/tmp/ai-pm-refresh-perf-v157/late-webgl.png`
  - `/tmp/ai-pm-scroll-restore-v158/after-reload-top.png`
- Browser metrics:
  - Desktop horizontal orbit centers: active card centerX `1254 -> 1263 -> 594 -> 403 -> 626 -> 818 -> 1016 -> 1170 -> 488` across sampled progress `0/1/2/3/4/5/6/8/11`.
  - Desktop vertical range: active card centerY stays within `379-500px` across those samples, confirming vertical movement is secondary.
  - Desktop card bounds: right edge max `1596px` within `1706px` viewport; left orbit sample stays on-screen at `left=20px`.
  - Mobile 390px: document width remains `390px`, active card rect `76..508`, `blackStripeExists=false`; no horizontal page overflow observed in the captured viewport.
  - Layering: `canvasZ=2`, `railZ=1`, `canvasPointer=none`, `blackStripeExists=false` across sampled desktop states.
  - Console/page errors: none observed in Playwright run; Fast Refresh still logs the existing WebGL 3D texture warning.
  - v156 desktop layer metrics: `pillarX=-0.620`, `pillarZ=-0.360`, `canvasZ=2`, `railZ=1`, `canvasPointer=none`, and `docWidth=1706` across refined desktop samples.
  - v156 mobile 390px: `docWidth=390`, active card rect `left=76/right=508`, and no horizontal document overflow observed.
  - v156 console/page errors: none observed in the in-app browser run after reload.
  - v157 refresh performance: clean built-in browser route `http://localhost:3004/?qa=refresh-perf-v157-clean` showed `hasLanding=true`, `storyProgress=0.000`, `pillarDrop=0.000`, `docWidth=1280`, and `viewportWidth=1280`; a stale Fast Refresh dependency warning from an earlier hot update remained in cached dev logs but was not reproduced in the clean state sample.
  - v158 refresh scroll restoration: built-in browser route `http://localhost:3004/?qa=scroll-restore-v158` was scrolled to `scrollY=2200` / `storyProgress=4.296`, then reloaded; samples at roughly `120ms` plus six `260ms` intervals all stayed at `scrollY=0`, `storyProgress=0.000`, `pillarDrop=0.000`.

## Follow-up Polish

- Port source `WorkItemShader` / `WorkItemUIShader` and true `Work/refraction` MRT instead of approximating via canvas and DOM layers.
- Tune final camera composite and glass thickness after preserving the current no-horizontal-pillar-drift behavior.
