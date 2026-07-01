# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v143-final/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-scroll-v143-final/scroll-2650.png`
- full-view comparison evidence: `/tmp/ai-pm-landing-scroll-v143-final/source-vs-scroll-1155.png`
- metrics evidence: `/tmp/ai-pm-landing-scroll-v143-final/metrics.json`
- mobile evidence: `/tmp/ai-pm-landing-scroll-v143-final/mobile-scroll-900.png`, `/tmp/ai-pm-landing-scroll-v143-final/mobile-metrics.json`
- viewport: 1910x1035 desktop and 390x844 mobile, Chrome via Codex Node Playwright, `http://localhost:3004/?qa=v143-final`
- state: unauthenticated landing page, hydrated WebGL canvas, programmatic native page scroll through top/mid/deep states.
- final result: blocked
- blocking reason: v143 fixes the current priority direction, namely stronger whole-column downward movement and large WorkItem screen cards, but the implementation is still visually foggier than the Active Theory source and does not yet port the exact source MRT refraction, camera composite, project media textures, or shader response.

## Findings

- [P1] Whole-column downward movement is now the main pillar motion.
  Location: `getStoryPillarScrollDrop()` and render-loop `pillarGroup.position` in `src/components/landing-home/index.tsx`.
  Evidence: v143 metrics show `pillarDrop` moving from `0.000` at top to `1.557`, `1.807`, and `1.970` at sampled scroll positions. v142 was around `0.992`, `0.863`, and `0.303` for comparable mid/deep positions.
  Impact: this addresses the latest complaint that the column should visibly move downward as a whole while scrolling.
  Fix: replaced the per-slot sine return-to-zero with a continuous whole-column drop curve, then reduced internal reference-video layer offsets so the column reads as one object instead of stretched internal layers.

- [P1] Cards are back to large screen-pane scale.
  Location: `THREE_PANEL_WIDTH/HEIGHT`, `getStoryWorkItemVisualFromOffset()`, `getStoryWorkItemWebGLLayout()`, and `.landing-story-workitem-card`.
  Evidence: v143 desktop metrics show the active card is about `1211x663` at top and about `1062-1071x658-659` at mid/deep scroll positions. v142 mid/deep active cards were roughly `988-991x553-554`.
  Impact: the WorkItem now reads as a large glass screen near the source frame rather than a small SaaS card.
  Fix: increased WebGL pane texture size, rebalanced 3D scale, enlarged the DOM hit layer and type, then corrected the overshoot so the card no longer fills the whole viewport.

- [P1] The 15-slot WorkItem queue remains real and interactable.
  Location: `storyWorkItemSlots`, `getInfiniteStorySlotOffset()`, `getNearestStoryWorkItemSlotIndex()`, and `applyStoryCardDomProgress()` in `src/components/landing-home/index.tsx`.
  Evidence: v143 metrics keep `totalCards=15`, `visibleCount=14-15`, and `activeCount=1` across sampled scroll positions. Active slots advance through `0 -> 2 -> 3 -> 4`.
  Impact: preserving the queue prevents regression to a single card swapping content.
  Fix: kept the existing nearest-target active slot and per-card transform/opacity/pointer updates while changing size and pillar motion.

- [P2] Visual fidelity remains below the source.
  Location: WorkItem pane shader, refraction texture emulation, source media content, glass material layers, and camera composite in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-landing-scroll-v143-final/source-vs-scroll-1155.png` shows the implementation now has larger cards and stronger downward pillar state, but it is still softer and more fogged than the reference with less precise media/refraction.
  Impact: the highest-priority interaction direction is corrected, but this still should not be called a 100% Active Theory clone.
  Fix: continue porting source `WorkItemShader` / `WorkItemUIShader`, true Work/refraction MRT, source project media, and exact camera composite.

## Patches Made In This Pass

- Replaced the slot-local sine pillar drop with a continuous whole-column downward drop curve.
- Moved most pillar downshift onto `pillarGroup` and reduced internal reference layer offsets to avoid stretched-column artifacts.
- Enlarged WebGL WorkItem pane dimensions to `1500x720` and raised pane/media alpha for stronger large-screen presence.
- Enlarged DOM hit-layer cards, then corrected the overshoot to a desktop active range around `1060-1210px` wide.
- Preserved the 15-slot real queue, active-slot uniqueness, and no horizontal pillar/camera drift constraint.

## Validation

- `git diff --check`: passed.
- Browser route: `http://localhost:3004/?qa=v143-final`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v143-final/scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v143-final/scroll-2650.png`
  - `/tmp/ai-pm-landing-scroll-v143-final/source-vs-scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v143-final/mobile-scroll-900.png`
- Browser metrics:
  - Top: active card `1211x663`, `pillarDrop=0.000`, 15 total cards, 15 visible/interactable cards, active slot `0`.
  - Scroll 1155: active card `1071x659`, `pillarDrop=1.557`, 15 total cards, 14 visible/interactable cards, active slot `2`.
  - Scroll 1900: active card `1062x658`, `pillarDrop=1.807`, 15 total cards, 14 visible/interactable cards, active slot `3`.
  - Scroll 2650: active card `1067x658`, `pillarDrop=1.970`, 15 total cards, 14 visible/interactable cards, active slot `4`.
  - Mobile 390px: document/body `scrollWidth=390`, active card is intentionally stage-cropped but page has no horizontal overflow.
  - Console/page errors: none observed in Chrome-based Playwright run.

## Follow-up Polish

- Port source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `Work/refraction`.
- Replace text-heavy AI PM pane content with source-style media texture panes so adjacent cards look like real project screens.
- Tune glass opacity and camera composite once the current whole-column-down + large-card behavior is preserved.
