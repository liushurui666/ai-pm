# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation top screenshot: `/tmp/ai-pm-landing-scroll-v140/scroll-0.png`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v140/scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-scroll-v140/scroll-1900.png`
- full-view comparison evidence: `/tmp/ai-pm-landing-scroll-v140/source-vs-scroll-1155.png`
- focused region comparison evidence: center WorkItem/pillar crop was inspected from the full-view comparison; no separate crop was needed because the pillar, active card, adjacent cards, and x/y relationship are visible at the desktop viewport.
- viewport: 1910x1035 desktop, local Playwright headless fallback, `http://localhost:3004/?qa=scroll-v140-active-target`
- state: unauthenticated landing page, hydrated WebGL canvas, programmatic native page scroll through top/mid/deep states; mid-scroll also hovered a non-center visible card to verify the card rail is not center-card-only.
- final result: blocked
- blocking reason: v140 fixes the latest behavior complaints around pillar x/z stability, y-only pillar drop, and 15-slot card interaction continuity, but the source still has stronger exact media-card rendering, WorkItem MRT refraction, source camera composite, and material response than this implementation.

## Findings

- [P1] Pillar x/z remains locked while scroll creates a y-only downward pass.
  Location: `src/components/landing-home/index.tsx`.
  Evidence: v140 metrics show `pillarDrop` moving from `0.000` to `0.663`, `0.355`, `0.736`, and `0.820` across scroll positions; `pillarGroup.position.x/z` still comes only from `pillarBasePosition`.
  Impact: this addresses the report that the column should not shift left/right during downward scroll.
  Fix: keep pillar/camera x-z fixed, derive y drop from continuous `motionProgress`, and use scroll impulse only as a light transient overlay.

- [P1] Card rail now keeps a true 15-slot nearest target instead of losing active state between cards.
  Location: `getNearestStoryWorkItemSlotIndex()`, `syncActiveIndexFromProgress()`, and `applyStoryCardDomProgress()` in `src/components/landing-home/index.tsx`.
  Evidence: v140 metrics show `totalCards=15`, `visibleCount=5`, and `activeCount=1` at all sampled scroll positions. Before this pass, fractional scroll positions could produce `activeCount=0`, making the rail feel like a single card swapping content.
  Impact: visible cards now behave like a continuous WorkItem target queue rather than a narrow five-scene carousel.
  Fix: compute the active WorkItem from the nearest 15-slot progress index and attach `data-focus-distance` to every card for QA/debug.

- [P1] All visible DOM cards retain pointer reachability and hover feedback.
  Location: `.landing-story-workitem-card` in `src/components/landing-home/index.less`.
  Evidence: sampled visible cards all have `pointer=auto`; the mid-scroll screenshot was taken after hovering a non-center card. Hover only changes border/glow/scan opacity and does not override the JS-written 3D transform.
  Impact: this addresses the complaint that only one card appears interactive.
  Fix: added source-like hover affordance while preserving the scroll-driven 3D transform.

- [P2] Visual fidelity is improved behaviorally but still not source-identical.
  Location: source spine/material layers, WorkItem pane shader, and text/card composition in `src/components/landing-home/index.tsx`.
  Evidence: the full-view comparison shows our card stack is still text-heavy and translucent, while the reference uses stronger media panes, sharper Hogwarts-style content, deeper refraction, and a more precise camera/composite pipeline.
  Impact: the interaction direction now matches the requested mechanics more closely, but the exact Active Theory visual quality remains open.
  Fix: continue porting source `WorkItemShader`/`WorkItemUIShader`, `Work/refraction` MRT, and source camera target interpolation where practical.

## Patches Made In This Pass

- Added 15-slot nearest-target active calculation so every scroll stop has one current WorkItem.
- Kept all 15 DOM/WebGL WorkItem slots on the same continuous progress path.
- Added `data-focus-distance` metrics for card QA and debugging.
- Added hover feedback for every visible card without changing its RAF-driven transform.
- Preserved v139 y-only pillar drop and x/z locked camera/pillar behavior.

## Validation

- `git diff --check`: passed.
- `corepack pnpm lint`: passed.
- Browser route: `http://localhost:3004/?qa=scroll-v140-active-target`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v140/scroll-0.png`
  - `/tmp/ai-pm-landing-scroll-v140/scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v140/scroll-1900.png`
  - `/tmp/ai-pm-landing-scroll-v140/source-vs-scroll-1155.png`
- Browser metrics:
  - Top: 15 total cards, 5 visible cards, active slot `0`, focused card about `915x555`, x spread `158px`.
  - Scroll 410: active slot `0`, `pillarDrop=0.663`, 5 visible cards, x spread `151px`.
  - Scroll 1155: active slot `1`, `pillarDrop=0.355`, 5 visible cards, x spread `158px`.
  - Scroll 1900: active slot `2`, `pillarDrop=0.736`, 5 visible cards, x spread `152px`.
  - Scroll 2650: active slot `2`, `pillarDrop=0.820`, 5 visible cards, x spread `154px`.
  - Console/page errors: none.

## Follow-up Polish

- Port the source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `WorkRefraction` output.
- Replace more text-heavy foreground cards with source-style media panes so the cards read closer to the reference.
- Tune source pane depth/opacity and exact camera target interpolation after the current y-only pillar constraint is preserved.
