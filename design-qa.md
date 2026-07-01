# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v144-final/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-scroll-v144-final/scroll-2650.png`
- full-view comparison evidence: `/tmp/ai-pm-landing-scroll-v144-final/source-vs-scroll-1155.png`
- metrics evidence: `/tmp/ai-pm-landing-scroll-v144-final/metrics.json`
- mobile evidence: `/tmp/ai-pm-landing-scroll-v144-final/mobile-scroll-900.png`, `/tmp/ai-pm-landing-scroll-v144-final/mobile-metrics.json`
- viewport: 1910x1035 desktop and 390x844 mobile, Chrome via Codex Node Playwright, `http://localhost:3004/?qa=v144-final`
- state: unauthenticated landing page, hydrated WebGL canvas, programmatic native page scroll through top/mid/deep states.
- final result: blocked
- blocking reason: v144 fixes the current interaction priority, namely no horizontal pillar drift, monotonic whole-column downward motion, and a real multi-card WorkItem queue; however the implementation still looks foggier and more product-text-heavy than the Active Theory source because it does not yet port the exact source MRT refraction, WorkItem shader, camera composite, and project media pipeline.

## Findings

- [P1] Pillar x/z now stays locked while scrolling.
  Location: render loop `pillarGroup.position`, `cameraTargetPosition`, and the new `root.dataset.pillarX/pillarZ` diagnostics in `src/components/landing-home/index.tsx`.
  Evidence: v144 desktop metrics keep `pillarX=-0.620` and `pillarZ=-0.360` at every sampled scroll position from `0` through `3400`.
  Impact: this addresses the user-visible complaint that the column appeared to drift left/right when scrolling.
  Fix: reduced focus-card horizontal drift, kept camera x/z fixed, and kept pillar/flower/spine local x/z independent from scroll.

- [P1] The column no longer returns upward at slot boundaries.
  Location: `getStoryPillarScrollDrop()` in `src/components/landing-home/index.tsx`.
  Evidence: sampled `pillarDrop` is monotonic: `0.000 -> 1.060 -> 1.422 -> 1.648 -> 1.813 -> 2.076 -> 2.221`.
  Impact: the scroll now reads as one column moving downward through the viewport, not an internal effect that resets after each card.
  Fix: removed the per-slot `cycleDrift` reset and replaced it with a continuous progress-based drop plus one-way downward impulse.

- [P1] The WorkItem cards remain a real 15-slot queue.
  Location: `storyWorkItemSlots`, `getInfiniteStorySlotOffset()`, `applyStoryCardDomProgress()`, and `panelMeshes.forEach()` in `src/components/landing-home/index.tsx`.
  Evidence: v144 metrics keep `totalCards=15` and `activeCount=1`; active slots advance through `0 -> 1 -> 2 -> 3 -> 4 -> 5` across the sampled scroll positions. The viewport normally shows `4-5` card hit layers at once, with offscreen slots cycling back into view.
  Impact: this avoids regressing to a single card swapping content.
  Fix: preserved one mesh and one DOM hit layer per slot, increased vertical spacing, and kept click/focus/hover bound to each real slot.

- [P1] Focus-card horizontal drift is reduced and vertical travel is clearer.
  Location: `getStoryWorkItemVisualFromOffset()` and `getStoryWorkItemWebGLLayout()` in `src/components/landing-home/index.tsx`.
  Evidence: active card center x stays around `803-819px` from top through deep scroll, while adjacent cards sit above/below the focus card. The active card remains large: about `1211x663` at top and about `1073-1086x658` at mid/deep samples.
  Impact: users should perceive card progression as top-to-bottom travel around a fixed column instead of the whole scene sliding sideways.
  Fix: locked the focus lane with `focusLaneLock`, reduced orbit x amplitude, and increased y-step spacing.

- [P2] Visual fidelity remains below the source.
  Location: WorkItem pane shader, refraction texture emulation, source media content, glass material layers, and camera composite in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-landing-scroll-v144-final/source-vs-scroll-1155.png` shows the corrected motion model, but the implementation is still softer, greener, and less media-textured than the Active Theory frame.
  Impact: this pass should be treated as an interaction/rig correction, not a finished pixel-level clone.
  Fix: next pass should port the source `WorkItemShader` / `WorkItemUIShader`, true `Work/refraction` MRT, and source-style media panes more literally.

## Patches Made In This Pass

- Locked focus-card lane and reduced x-orbit amplitude for both DOM and WebGL WorkItems.
- Increased card y-step spacing so multiple cards read as a vertical queue instead of one overlapped pane.
- Replaced the per-slot pillar drop reset with a monotonic downward curve.
- Added pillar x/z QA diagnostics.
- Lowered DOM hit-layer text and large environment-glass opacity so the 15 real WorkItem panes are not swallowed by one green fog layer.

## Validation

- `git diff --check`: passed.
- Browser route: `http://localhost:3004/?qa=v144-final`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v144-final/scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v144-final/scroll-2650.png`
  - `/tmp/ai-pm-landing-scroll-v144-final/source-vs-scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v144-final/mobile-scroll-900.png`
- Browser metrics:
  - Top: active card `1211x663`, `pillarDrop=0.000`, `pillarX=-0.620`, `pillarZ=-0.360`, `totalCards=15`, active slot `0`.
  - Scroll 720: active card `1209x662`, `pillarDrop=1.060`, active slot `1`.
  - Scroll 1155: active card `1073x658`, `pillarDrop=1.422`, active slot `2`.
  - Scroll 1900: active card `1069x657`, `pillarDrop=1.813`, active slot `3`.
  - Scroll 2650: active card `1082x658`, `pillarDrop=2.076`, active slot `4`.
  - Scroll 3400: active card `1086x658`, `pillarDrop=2.221`, active slot `5`.
  - Mobile 390px: document/body `scrollWidth=390`, `totalCards=15`, no horizontal overflow.
  - Console/page errors: none observed in Chrome-based Playwright run.

## Follow-up Polish

- Port source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `Work/refraction`.
- Replace text-heavy AI PM pane content with source-style media texture panes so adjacent cards look like real project screens.
- Tune glass opacity and camera composite once the current no-horizontal-pillar-drift behavior is preserved.
