# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1900.png`
- metrics evidence: `/tmp/ai-pm-landing-scroll-v149-readable/metrics.json`
- mobile evidence: `/tmp/ai-pm-landing-scroll-v149-readable/mobile-720.png`
- viewport: 1910x1035 desktop and 390x844 mobile, Playwright browser verification, `http://localhost:3004/?qa=v149-readable`
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
  Evidence: active card sizes are now top `843x450`, scroll `1155` `791x444`, scroll `1900` `794x445`, roughly `41%-45%` of the desktop viewport width instead of v147's `68%-76%`.
  Impact: the foreground screen keeps the Active Theory-like media-panel presence without turning into a full-screen poster.

- [P1] Current card copy is readable instead of washed out.
  Evidence: v149 raises the focused DOM card opacity to `0.620`, with active title/body/metric colors at `0.96/0.86/0.98` alpha and a darker focused media underlay for the text side.
  Impact: the active WorkItem can still feel like a glass media screen, but the user can now read the Chinese title, description, and metric without guessing.

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
- Raised focused DOM card opacity and focused text contrast while keeping non-focused cards low-opacity.
- Added a darker focused media underlay on the text side so the copy stays crisp without increasing card size.
- Raised the weak WebGL pane UI projection to match the DOM layer's improved readability.

## Validation

- `git diff --check`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v149-readable`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v149-readable/scroll-1900.png`
  - `/tmp/ai-pm-landing-scroll-v149-readable/mobile-720.png`
- Browser metrics:
  - Top: active card `843x450`, `activeOpacity=0.620`, `pillarDrop=0.000`, `pillarX=-0.620`, `pillarZ=-0.360`, active slot `0`.
  - Scroll 720: active card `858x454`, `activeOpacity=0.620`, `pillarDrop=1.194`, active slot `1`.
  - Scroll 1155: active card `791x444`, `activeOpacity=0.620`, `pillarDrop=1.599`, active slot `2`, title/body/metric alpha `0.96/0.86/0.98`.
  - Scroll 1900: active card `794x445`, `activeOpacity=0.620`, `pillarDrop=2.033`, active slot `3`, title/body/metric alpha `0.96/0.86/0.98`.
  - Mobile 390px: active card text alpha remains `0.96/0.86/0.98`; existing 3D stage crop is unchanged by this readability pass.
  - Console/page errors: none observed in Playwright run; Fast Refresh still logs the existing WebGL 3D texture warning.

## Follow-up Polish

- Port source `WorkItemShader` / `WorkItemUIShader` and true `Work/refraction` MRT instead of approximating via canvas and DOM layers.
- Tune final camera composite and glass thickness after preserving the current no-horizontal-pillar-drift behavior.
