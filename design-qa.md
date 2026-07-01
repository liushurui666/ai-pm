# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-5.png`
- metrics evidence: `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-*.png` plus sampled DOM rects in this QA note.
- mobile evidence: `/tmp/ai-pm-landing-v152-true-orbit/mobile-progress-5.png`
- viewport: 1706x918 desktop and 390x844 mobile, in-app browser Playwright verification, `http://localhost:3004/?qa=v152-true-orbit`
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

- [P1] Cards no longer cover the full screen.
  Evidence: v152 active card sizes are now top `602px` wide, middle `568px`, left orbit `825px` at its most perspective-stretched desktop sample, and return-right `597px`, instead of v147's `68%-76%` viewport-width full-screen pane.
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

## Validation

- `git diff --check`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v152-true-orbit`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
  - `/tmp/ai-pm-landing-v151-orbit-clear-column/scroll-1900-fit.png`
  - `/tmp/ai-pm-landing-v151-orbit-clear-column/mobile-final.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-0.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-3.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-5.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/refined-progress-8.png`
  - `/tmp/ai-pm-landing-v152-true-orbit/mobile-progress-5.png`
- Browser metrics:
  - Desktop orbit centers: active card centerX `1229 -> 1180 -> 898 -> 386 -> 635 -> 1157 -> 1085 -> 389` across sampled progress `0/1/3/5/8/11/14/18`.
  - Desktop card widths: active card `602`, `551`, `568`, `825`, `639`, `597`, `530`, `763` across the same samples; the widest side pass stays mostly on-screen with left edge `-27px`.
  - Mobile 390px: active card remains visible above hero copy with rect `-35..299`, width `334px`; no horizontal page overflow observed in the captured viewport.
  - Console/page errors: none observed in Playwright run; Fast Refresh still logs the existing WebGL 3D texture warning.

## Follow-up Polish

- Port source `WorkItemShader` / `WorkItemUIShader` and true `Work/refraction` MRT instead of approximating via canvas and DOM layers.
- Tune final camera composite and glass thickness after preserving the current no-horizontal-pillar-drift behavior.
