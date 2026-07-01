# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v148-size/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-scroll-v148-size/scroll-1900.png`
- metrics evidence: `/tmp/ai-pm-landing-scroll-v148-size/metrics.json`
- mobile evidence: `/tmp/ai-pm-landing-scroll-v148-balance/mobile-scroll-980.png`
- viewport: 1910x1035 desktop and 390x844 mobile, Chrome via Codex Node Playwright, `http://localhost:3004/?qa=v148-size`
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

- [P1] Cards no longer cover the full screen.
  Evidence: active card sizes are now top `859x454`, scroll `1155` `794x445`, scroll `1900` `797x445`, roughly `41%-45%` of the desktop viewport width instead of v147's `68%-76%`.
  Impact: the foreground screen keeps the Active Theory-like media-panel presence without turning into a full-screen poster.

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
- Reduced WebGL pane size/depth/opacity so cards orbit around the column instead of covering the viewport.
- Reduced DOM media-layer size and opacity while keeping it as a weak interaction/accessibility layer over the media screen.

## Validation

- `git diff --check`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v148-size`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v148-size/scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v148-size/scroll-1900.png`
  - `/tmp/ai-pm-landing-scroll-v148-balance/mobile-scroll-980.png`
- Browser metrics:
  - Top: active card `859x454`, `pillarDrop=0.000`, `pillarX=-0.620`, `pillarZ=-0.360`, `totalCards=15`, active slot `0`.
  - Scroll 720: active card `858x453`, `pillarDrop=1.250`, active slot `1`.
  - Scroll 1155: active card `794x445`, `pillarDrop=1.638`, active slot `2`, visible slots `0,1,2,3`.
  - Scroll 1900: active card `797x445`, `pillarDrop=2.070`, active slot `3`, visible slots `1,2,3,4`.
  - Scroll 2650: active card `798x445`, `pillarDrop=2.297`, active slot `4`, visible slots `2,3,4,5`.
  - Mobile 390px: document `scrollWidth=390`, `totalCards=15`, no horizontal overflow.
  - Console/page errors: none observed in Chrome-based Playwright run.

## Follow-up Polish

- Port source `WorkItemShader` / `WorkItemUIShader` and true `Work/refraction` MRT instead of approximating via canvas and DOM layers.
- Tune final camera composite and glass thickness after preserving the current no-horizontal-pillar-drift behavior.
