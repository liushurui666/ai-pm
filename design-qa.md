# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v131-scroll-track/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v131-scroll-track/after-scroll-1320.png`
- implementation after-click screenshot: `/tmp/ai-pm-v131-scroll-track/after-click-slot4.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://localhost:3004/?qa=scroll-track-v131`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll from `scrollY=0` to `scrollY=1320`
- full-view comparison evidence: `/tmp/ai-pm-v131-scroll-track/source-vs-after-scroll-1320.png`
- final result: blocked
- blocking reason: v131 fixes the user's current scroll/card interaction complaint, but literal 100% ActiveTheory visual fidelity is still blocked by remaining media-pane composition, exact WorkItemShader refraction, and material/light differences.

## Findings

- [P1] Pillar/camera no longer receive scroll-driven lateral or spin phase.
  Location: `src/components/landing-home/index.tsx`.
  Evidence: v131 keeps `pillarGroup` and camera x/z locked, removes scroll-driven oil x drift and chain y-spin, and keeps point-cloud `uRotate` time-only. Browser verification kept the rail center at x `939` before and after `scrollY=1320`.
  Impact: downward scroll now reads as vertical pillar flow plus card travel, not whole-column side drift.

- [P1] WorkItem hover no longer steals the scroll rig.
  Location: `handleStoryCardPointerEnter()` in `src/components/landing-home/index.tsx`.
  Evidence: in browser, hover over a non-current visible card kept `scrollY` at `1320` and active slot at `2`.
  Impact: moving the mouse across cards no longer creates the previous "single card吸附" feeling.

- [P1] All visible cards remain real scroll targets.
  Location: DOM WorkItem rail, WebGL panel layout, and slot target normalization in `src/components/landing-home/index.tsx`.
  Evidence: route rendered 15 DOM slots. At `scrollY=0`, 7 cards were visible and interactive. After real scroll to `scrollY=1320`, 7 cards remained visible and interactive, active slot advanced to `2`. Clicking visible slot `4` scrolled to `scrollY=2857`, active slot became `4`, and 7 cards remained visible.
  Impact: interaction is now a queue of real slots, not one card swapping text.

- [P2] Top-loop slot clicks no longer resolve to negative progress.
  Location: `getClosestScrollableStoryTarget()` and `goToStorySlot()` in `src/components/landing-home/index.tsx`.
  Evidence: negative prior-loop candidates are folded into the next scrollable cycle before calling native `window.scrollTo`.
  Impact: cards visible above the active slot do not snap back to page top after click.

- [P1] Source fidelity is still not exact.
  Location: center media panes, pillar material, and WorkItem/refraction passes.
  Evidence: `/tmp/ai-pm-v131-scroll-track/source-vs-after-scroll-1320.png` still shows the source has heavier real media planes, denser chromatic refraction, darker wet-shell geometry, and sharper project-card light breakup.
  Impact: do not claim 100% ActiveTheory reproduction yet.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=scroll-track-v131`.
- Browser screenshots:
  - `/tmp/ai-pm-v131-scroll-track/top.png`
  - `/tmp/ai-pm-v131-scroll-track/after-scroll-1320.png`
  - `/tmp/ai-pm-v131-scroll-track/after-click-slot4.png`
  - `/tmp/ai-pm-v131-scroll-track/source-vs-after-scroll-1320.png`
- Browser checks:
  - Real in-app browser scroll advanced the page from `scrollY=0` to `scrollY=1320`.
  - DOM rail rendered 15 WorkItem slots.
  - Before scroll: 7 visible interactive cards, active slot `0`.
  - After scroll: 7 visible interactive cards, active slot `2`, rail center x `939`.
  - Hover over a visible non-current card did not change `scrollY`.
  - Click on visible slot `4` changed active slot to `4` and kept 7 cards visible.
  - Console check found no new runtime errors; only existing Three.js `DRACOLoader.setDecoderConfig` deprecation warnings were present.

## Follow-up Polish

- Port the source WorkItem media/refraction pass more literally, especially large project panes and chromatic text splitting.
- Tune pillar material toward darker wet geometry with stronger source-like occlusion.
- Continue reducing AI PM copy density on floating panes if the target remains a near-literal ActiveTheory Work clone rather than a branded adaptation.
