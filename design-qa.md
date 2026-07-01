# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation mid-scroll screenshot: `/tmp/ai-pm-landing-scroll-v142/ai-pm-v142-scroll-1155.png`
- implementation deep-scroll screenshot: `/tmp/ai-pm-landing-scroll-v142/ai-pm-v142-scroll-2650.png`
- metrics evidence: `/tmp/ai-pm-landing-scroll-v142/ai-pm-v142-real-scroll-metrics-viewport.json`
- viewport: 1910x1035 desktop, Codex Playwright browser, `http://localhost:3004/?qa=v142-real-scroll`
- state: unauthenticated landing page, hydrated WebGL canvas, programmatic native page scroll through top/mid/deep states.
- final result: blocked
- blocking reason: v142 addresses the latest interaction complaint by keeping the pillar/camera x-z anchored while a 15-slot WorkItem queue scrolls past it, but the visual is still not a 100% Active Theory clone because the source MRT refraction, source camera composite, project media textures, and exact shader material response are not fully ported.

## Findings

- [P1] Pillar remains the centered visual anchor; scrolling now reads as vertical pass-through, not column lateral drift.
  Location: `getStoryWorkItemWebGLLayout()`, `getStoryPillarScrollDrop()`, and the render-loop camera update in `src/components/landing-home/index.tsx`.
  Evidence: WorkItem x/z motion is applied only to pane meshes and DOM hit layers; camera target keeps `cameraBasePosition.x/z` and `cameraBaseLookAt.x/z`. v142 metrics show `pillarDrop` changing with scroll (`0.855`, `0.992`, `0.863`, `0.303`) while the pillar/camera x-z code remains fixed.
  Impact: addresses the report that scrolling made the column appear to shift left/right.
  Fix: keep the pillar/camera x-z path locked and drive only y scan/drop plus internal oil/particle phase.

- [P1] WorkItem is a real 15-slot queue, not one center card swapping content.
  Location: `storyWorkItemSlots`, `getInfiniteStorySlotOffset()`, `getNearestStoryWorkItemSlotIndex()`, and `applyStoryCardDomProgress()` in `src/components/landing-home/index.tsx`.
  Evidence: v142 metrics keep `totalCards=15`, `visibleCount=14-15`, and `activeCount=1` across sampled scroll positions. Active slots advance through `1 -> 1 -> 2 -> 3 -> 4` as native scroll advances.
  Impact: all cards stay mounted and interactive on the same continuous track, so the page behaves like a scrollable Work queue rather than a fake one-card carousel.
  Fix: preserve the 15-slot modulo queue and nearest-target active slot while writing per-card transform, opacity, pointer, and focus distance every frame.

- [P1] Card motion now follows source-like top-to-bottom passing with stronger side panes.
  Location: orbit constants and `getStoryWorkItemVisualFromOffset()` / `getStoryWorkItemWebGLLayout()` in `src/components/landing-home/index.tsx`.
  Evidence: v142 uses wider horizontal card spacing (`STORY_WORK_WEBGL_ORBIT_X=0.74`, `STORY_WORK_DOM_ORBIT_X=184`) and larger vertical travel (`STORY_WORK_WEBGL_Y_STEP=1.2`, `STORY_WORK_DOM_Y_STEP=246`). Metrics show visible card y spread above `3300px`, so cards are not locked to one center position.
  Impact: adjacent panes remain visible above/below the focused item while the central pillar stays readable.
  Fix: anchor the focused pane slightly off-center, enlarge the source-inspired widescreen pane ratio, and reduce the DOM text layer so WebGL panes carry the visual.

- [P2] Visual fidelity remains below the source.
  Location: WorkItem pane shader, refraction texture emulation, source media content, and glass material layers in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-landing-scroll-v142/ai-pm-v142-scroll-1155.png` shows the right behavior pattern, but the result is still foggier and more UI-text heavy than the reference frame.
  Impact: the interaction is now closer to the requested source behavior, but the final visual still needs shader/media work before it should be called an exact clone.
  Fix: continue porting the source `WorkItemShader`/`WorkItemUIShader` behavior, true Work/refraction MRT, source project media, and camera composite.

## Patches Made In This Pass

- Strengthened y-only pillar drop and kept pillar/camera x-z locked.
- Rebalanced the WorkItem track so panes move through a taller y path with clearer side spacing.
- Converted the DOM card layer into a lighter interaction/hit layer instead of a dominant product card.
- Changed WebGL pane texture ratio toward the source `Element_3_Workscale=[4,2,1]` widescreen feel.
- Verified all 15 WorkItem slots remain mounted, visible/interactable in sequence, and keep exactly one active slot.

## Validation

- `git diff --check`: passed.
- Browser route: `http://localhost:3004/?qa=v142-real-scroll`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v142/ai-pm-v142-scroll-1155.png`
  - `/tmp/ai-pm-landing-scroll-v142/ai-pm-v142-scroll-2650.png`
- Browser metrics:
  - Scroll 410: 15 total cards, 14 visible/interactable cards, active slot `1`, `pillarDrop=0.855`, y spread `3322px`.
  - Scroll 1155: 15 total cards, 14 visible/interactable cards, active slot `2`, `pillarDrop=0.992`, y spread `3359px`.
  - Scroll 1900: 15 total cards, 14 visible/interactable cards, active slot `3`, `pillarDrop=0.863`, y spread `3359px`.
  - Scroll 2650: 15 total cards, 15 visible/interactable cards, active slot `4`, `pillarDrop=0.303`, y spread `3341px`.
  - Console/page errors: none observed in Codex Playwright page run.

## Follow-up Polish

- Port source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `Work/refraction`.
- Replace text-heavy AI PM pane content with source-style media texture panes so adjacent cards look like real project screens.
- Tune glass opacity and source camera target interpolation after preserving the current no-horizontal-pillar-drift constraint.
