# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v118-workitem-scroll/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v118-workitem-scroll/after-scroll-980.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://localhost:3004/?qa=v118`
- state: unauthenticated landing page, hydrated WebGL canvas, native page scroll from `scrollY=0` to `scrollY=980`
- full-view comparison evidence: source frame and implementation screenshots were opened separately in Codex visual inspection; side-by-side image generation was blocked because the local environment lacks PIL/ImageMagick.
- focused region comparison evidence: center pillar + foreground WorkItem card stack were inspected in the source frame and latest after-scroll screenshot.
- final result: blocked
- blocking reason: interaction structure now matches the requested direction, but literal 100% ActiveTheory visual fidelity is still blocked by material/refraction/media differences.

## Findings

- [P1] Source material/refraction is still richer than the implementation.
  Location: center pillar and glass panels in `src/components/landing-home/index.tsx`.
  Evidence: the reference frame has darker wet-shell geometry, sharper oil-film highlights, and denser chromatic refraction; `/tmp/ai-pm-latest-landing-qa/final-after-scroll.png` still uses approximated local shader layers and AI PM canvas textures.
  Impact: this prevents claiming a pixel-level clone of the ActiveTheory Work scene.
  Fix: continue porting the mirror's `SpineShader`/Work refraction behavior and replace remaining approximated panel media with closer source-like media surfaces.

- [P1] WorkItem interaction direction is corrected again toward the source carousel.
  Location: DOM card rail and WebGL panel track.
  Evidence: browser verification on `http://localhost:3004/?qa=v118` reports 15 DOM WorkItem slots. At `scrollY=0`, 11 slots are visible above opacity `0.25`; after `scrollY=980`, 10 slots remain visible above opacity `0.25`, active focus advances from slot `0` to slot `1`, and surrounding slots keep distinct x/y/z, rotateY, opacity, scale, and pointer-event states.
  Impact: this resolves the user's latest complaint that only one card seemed to exist; multiple real cards now rotate through the field, while the active card changes by scroll position rather than by swapping text in place.
  Fix: keep the 15-slot queue and source-style 50-degree stepping; do not revert to fixed-x single-stack cards.

- [P1] Pillar no longer drifts horizontally during scroll.
  Location: `activeTheorySpineInstances` animation in `src/components/landing-home/index.tsx`.
  Evidence: the implementation wraps spine instances along y, locks `pillarGroup.position` and `pillarGroup.rotation` to a fixed x/z pose, and locks fallback spine segment x values. Card x now belongs only to the WorkItem rail, not to the pillar/camera.
  Impact: this matches the requested “从上到下” scroll behavior and avoids the previous lateral twisting impression.
  Fix: keep y-only looping for the pillar; any future camera/card changes must not feed x/z progress into `pillarGroup` or individual spine instance x/z.

- [P2] WebGL WorkPane projections are now supporting depth instead of overpowering the page.
  Location: `referenceGlassPanels`, `panelMeshes`, and `.landing-story-hero-asset`.
  Evidence: `/tmp/ai-pm-v118-workitem-scroll/after-scroll-980.png` shows the large reference glass panels as weaker translucent depth layers while the 15-slot DOM/WebGL queue remains the readable interaction layer.
  Impact: this removes the most obvious single-giant-card impression from the previous pass, though the panel design still is not identical to the source.
  Fix: refine panel media/refraction in a later pass rather than increasing flat opacity.

## Patches Made In This Pass

- Changed the landing shell from fixed 100vh fake-scroll to a real long-scroll section with a sticky 3D viewport.
- Switched scroll syncing to an animation-frame read of native `scrollY`, so track progress works for real wheel, touchpad inertia, browser scroll, and QA automation.
- Kept wheel handling passive and only used it for inertia/glow impulse, avoiding `preventDefault` blocking native scroll.
- Reworked `getStoryWorkItemVisual()` again so WorkItem cards use source-style horizontal radius, 50-degree stepping, y-depth staging, and z-depth while the pillar/camera stay locked.
- Reworked WebGL `panelMeshes` to mirror that same multi-card carousel, so DOM cards and translucent 3D panes advance together instead of reading as a single card layer.
- Added a native `scroll` event sync path so DOM WorkItems update immediately on real browser scroll, with RAF continuing to smooth the WebGL scene.
- Removed pointer-down scene selection from story cards so drag/scroll gestures do not force one card to seize the active state before the real scroll progress updates.
- Tightened the DOM WorkItem card dimensions, scale, z-depth, and y spacing so the carousel reads as multiple source-style panes rather than one oversized product card.
- Limited pointer events to sufficiently visible card slots, keeping interaction on the cards that are actually readable on screen.
- Changed the source spine instance animation to y-only infinite looping, with x/z and per-segment rotation locked to the source-style base queue.
- Locked `pillarGroup` rotation and fallback segment x positions so time/scroll no longer creates visible lateral pillar sway.
- Added source-inspired `uSpineScroll` deformation inside the `spine.bin` shader so the column reacts to scroll as vertical internal motion rather than lateral group drift.
- Added deterministic `random` attributes to the FlowerParticle point cloud and ported more of the source top/bottom spiral math, improving the pillar's internal particle flow while the group itself remains anchored.
- Reversed column particle drift so the pillar reads as top-to-bottom movement on downward scroll.
- Lowered WebGL WorkPane opacity/backplate strength and the static reference background opacity so the panels do not cover the pillar and card stack as large colored rectangles.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v118`.
- Browser checks: hydrated canvas reported 1876x992; the DOM rail rendered 15 WorkItem slots; at `scrollY=0`, 11 cards were visible above opacity `0.25`; after `scrollY=980`, 10 cards were visible above opacity `0.25`, active focus advanced from slot `0` to slot `1`, and surrounding cards held distinct x/y/z/rotation/opacity/pointer-event values. Console contained only the existing DRACOLoader deprecation warning.

## Follow-up Polish

- Port more of the source Work/refraction pipeline if exact ActiveTheory-style glass is still the goal.
- Tune the pillar shader toward darker wet geometry with sharper chromatic rim highlights.
- Replace approximated AI PM panel texture behavior with source-like project media timing once the desired content set is decided.
