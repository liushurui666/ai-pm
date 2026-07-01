# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v145-final/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-scroll-v145-final/scroll-2650.png`
- side-by-side comparison evidence: `/tmp/ai-pm-landing-scroll-v145-final/source-vs-scroll-1155.png`
- metrics evidence: `/tmp/ai-pm-landing-scroll-v145-final/metrics.json`
- mobile evidence: `/tmp/ai-pm-landing-scroll-v145-final/mobile-scroll-980.png`
- viewport: 1910x1035 desktop and 390x844 mobile, Chrome via Codex Node Playwright, `http://localhost:3004/?qa=v145-final`
- state: unauthenticated landing page, hydrated WebGL canvas, programmatic native page scroll through top/mid/deep states.
- final result: blocked
- blocking reason: v145 fixes the current interaction priority: the pillar no longer drifts left/right, the pillar moves downward continuously with native scroll, and the WorkItem interaction is a real 15-slot queue. It is still not a 100% Active Theory clone because the exact source MRT refraction, WorkItem shader, media pipeline, and camera composite have not been ported.

## Findings

- [P1] Pillar x/z stays locked through scroll.
  Location: render loop `pillarGroup.position`, `cameraTargetPosition`, and `.landing-story-viewport` diagnostics in `src/components/landing-home/index.tsx`.
  Evidence: v145 desktop metrics keep `pillarX=-0.620` and `pillarZ=-0.360` at every sampled scroll position from `0` through `3400`.
  Impact: this directly addresses the complaint that the column appeared to slide left/right while scrolling.
  Fix: kept camera and pillar x/z fixed, removed scroll-driven x/z perturbation from the visible spine/particle layers, and compressed WorkItem x orbit into card-local flip depth.

- [P1] The column reads as downward travel rather than slot reset.
  Location: `getStoryPillarScrollDrop()` and render-loop `pillarGroup.position` in `src/components/landing-home/index.tsx`.
  Evidence: sampled `pillarDrop` is monotonic: `0.000 -> 1.088 -> 1.439 -> 1.667 -> 1.830 -> 2.089 -> 2.236`.
  Impact: stopping mid-scroll no longer causes the pillar to visually “return to center” at slot boundaries.
  Fix: the whole-column drop is progress-based with only one-way downward impulse; slot cycling no longer resets pillar y.

- [P1] WorkItem cards remain real multi-card scroll interactions.
  Location: `storyWorkItemSlots`, `getInfiniteStorySlotOffset()`, `applyStoryCardDomProgress()`, and `panelMeshes.forEach()` in `src/components/landing-home/index.tsx`.
  Evidence: v145 metrics keep `totalCards=15`, `activeCount=1`, visible cards normally `3-4`, and active slots advance `0 -> 1 -> 2 -> 3 -> 4 -> 5`.
  Impact: the page no longer behaves like one card swapping content; every slot has its own DOM hit layer and WebGL pane.
  Fix: kept the 15 repeated WorkItem slots, tightened the stable vertical lane, and drove DOM/WebGL from the same native-scroll progress.

- [P1] Card motion is now top-to-bottom first, lateral second.
  Location: `getStoryWorkItemVisualFromOffset()` and `getStoryWorkItemWebGLLayout()` in `src/components/landing-home/index.tsx`.
  Evidence: active card center x stays in a narrower lane while the active slot advances; visible adjacent slots appear above/below the focus card instead of dragging the column laterally.
  Impact: the scroll reads as cards rotating through a fixed pillar axis, closer to the source interaction model after removing camera x/z movement.
  Fix: reduced DOM/WebGL x orbit amplitude, lowered z/rotation side effects, and set a shared vertical lane for visible cards.

- [P2] Visual fidelity remains below the source.
  Location: WorkItem pane shader, reference glass panes, refraction emulation, media textures, and camera composite in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-landing-scroll-v145-final/source-vs-scroll-1155.png` shows the corrected motion model, but the implementation remains softer and more fog-like than the Active Theory frame.
  Impact: this pass should be treated as a motion/interaction correction, not a finished pixel-level clone.
  Fix: reduced green-gray veil opacity, pushed DOM text into a low-opacity hit layer, lowered fixed environment pane opacity, and made WorkItem alpha depend more on media/edge/fresnel instead of a full-surface haze.

## Patches Made In This Pass

- Compressed WorkItem x orbit for both DOM and WebGL panes so visible cards share a stable vertical lane.
- Reduced card y-step enough to keep 3-4 real slots visible while preserving top-to-bottom travel.
- Kept pillar/camera x/z fixed and used diagnostics to prove the values do not move during scroll.
- Lowered DOM card text/background opacity so the interaction layer does not read as a giant product card.
- Reduced fixed environment-panel opacity and WorkItem shader full-surface alpha so the card stack no longer becomes one opaque green veil.

## Validation

- `git diff --check`: passed.
- Browser route: `http://localhost:3004/?qa=v145-final`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v145-final/scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v145-final/scroll-2650.png`
  - `/tmp/ai-pm-landing-scroll-v145-final/source-vs-scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v145-final/mobile-scroll-980.png`
- Browser metrics:
  - Top: active card `1457x798`, `pillarDrop=0.000`, `pillarX=-0.620`, `pillarZ=-0.360`, `totalCards=15`, active slot `0`.
  - Scroll 720: active card `1453x796`, `pillarDrop=1.088`, active slot `1`.
  - Scroll 1155: active card `1316x783`, `pillarDrop=1.439`, active slot `2`, visible slots `0,1,2,3`.
  - Scroll 1900: active card `1314x782`, `pillarDrop=1.830`, active slot `3`, visible slots `1,2,3,4`.
  - Scroll 2650: active card `1323x783`, `pillarDrop=2.089`, active slot `4`, visible slots `2,3,4,5`.
  - Scroll 3400: active card `1326x784`, `pillarDrop=2.236`, active slot `5`, visible slots `3,4,5,6`.
  - Mobile 390px: document `scrollWidth=390`, `totalCards=15`, no horizontal overflow.
  - Console/page errors: none observed in Chrome-based Playwright run.

## Follow-up Polish

- Port source `WorkItemShader` / `WorkItemUIShader` and true `Work/refraction` MRT instead of approximating via canvas.
- Replace temporary AI PM pane texture content with source-style project media panes so cards look like real media screens rather than internal product labels.
- Re-tune camera composite and glass thickness after preserving the current no-horizontal-pillar-drift behavior.
