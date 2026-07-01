# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-v151-orbit-clear-column/scroll-1900-fit.png`
- metrics evidence: `/tmp/ai-pm-landing-v151-orbit-clear-column/metrics.json`
- mobile evidence: `/tmp/ai-pm-landing-v151-orbit-clear-column/mobile-final.png`
- viewport: 1706x918 desktop and 390x844 mobile, Playwright browser verification, `http://localhost:3004/?qa=v151-orbit-clear-column`
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

- [P1] Cards no longer cover the full screen.
  Evidence: v151 active card sizes are now top `704x371`, scroll `720` `701x371`, scroll `1900` `688x362`, roughly `40%-41%` of the desktop viewport width instead of v147's `68%-76%`.
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

## Validation

- `git diff --check`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v151-orbit-clear-column`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
  - `/tmp/ai-pm-landing-v151-orbit-clear-column/scroll-1900-fit.png`
  - `/tmp/ai-pm-landing-v151-orbit-clear-column/mobile-final.png`
- Browser metrics:
  - Top: active card `704x371`, `activeOpacity=0.620`, `pillarDrop=0.000`, `pillarX=-0.620`, `pillarZ=-0.360`, active slot `0`, approximate column gap `124px`, right overflow `0`.
  - Scroll 720: active card `701x371`, `activeOpacity=0.620`, `pillarDrop=1.273`, active slot `1`, approximate column gap `116px`, right overflow `0`.
  - Scroll 1900: active card `688x362`, `activeOpacity=0.620`, `pillarDrop=2.097`, active slot `3`, approximate column gap `118px`, right overflow `0`, second DOM opacity `0.018`.
  - Mobile 390px: active card is visible above hero copy with rect `7..398`, visible width `383px`.
  - Console/page errors: none observed in Playwright run; Fast Refresh still logs the existing WebGL 3D texture warning.

## Follow-up Polish

- Port source `WorkItemShader` / `WorkItemUIShader` and true `Work/refraction` MRT instead of approximating via canvas and DOM layers.
- Tune final camera composite and glass thickness after preserving the current no-horizontal-pillar-drift behavior.
