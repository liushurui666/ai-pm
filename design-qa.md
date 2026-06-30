# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v114-vertical-workitems/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v114-vertical-workitems/after-scroll-980.png`
- implementation second-scroll screenshot: `/tmp/ai-pm-v114-vertical-workitems/after-scroll-1960.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://localhost:3004/`
- state: unauthenticated landing page, hydrated WebGL canvas, native page scroll from `scrollY=0` to `scrollY=980` and `scrollY=1960`
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

- [P1] WorkItem interaction direction is corrected.
  Location: DOM card rail and WebGL panel track.
  Evidence: browser verification on `http://localhost:3004/` reports `cardCount=15`; the v114 pass shows 7 visible/high-opacity WorkItem slots at `scrollY=0`, 7 visible slots at `scrollY=980`, and 8 visible slots at `scrollY=1960`. Active focus advances from slot `0` to `1` to `3`, while surrounding cards retain their own y positions, rotationY, opacity, and depth.
  Impact: this resolves the user's latest complaint that the experience behaved like one static/single-card layer instead of real scrolling cards.
  Fix: no further structural fix needed for this pass; future visual work should keep the 15-slot queue and avoid reverting to five cards or a single-card content swap.

- [P1] Pillar no longer drifts horizontally during scroll.
  Location: `activeTheorySpineInstances` animation in `src/components/landing-home/index.tsx`.
  Evidence: the new implementation wraps spine instances along y, locks x/z and base rotations to the source-style instancer queue, and adds `uSpineScroll` vertex phase for internal top-to-bottom deformation without moving `pillarGroup` sideways. Browser metrics show visible DOM card center x ranges stay tight across scroll (`1017-1046`, `1012-1048`, `1018-1050`) instead of the previous broad lateral orbit.
  Impact: this matches the requested “从上到下” scroll behavior and avoids the previous lateral twisting impression.
  Fix: keep y-only looping for the pillar; any future camera/card changes must not feed x/z progress into `pillarGroup` or individual spine instance x/z.

- [P2] WebGL WorkPane projections are now supporting depth instead of overpowering the page.
  Location: `referenceGlassPanels`, `panelMeshes`, and `.landing-story-hero-asset`.
  Evidence: `/tmp/ai-pm-v112-scroll-slots/after-scroll-980-clean.png` shows the large reference glass panels reduced to faint background projection while the 15-slot DOM/WebGL queue remains the readable interaction layer.
  Impact: this removes the most obvious single-giant-card impression from the previous pass, though the panel design still is not identical to the source.
  Fix: refine panel media/refraction in a later pass rather than increasing flat opacity.

## Patches Made In This Pass

- Changed the landing shell from fixed 100vh fake-scroll to a real long-scroll section with a sticky 3D viewport.
- Switched scroll syncing to an animation-frame read of native `scrollY`, so track progress works for real wheel, touchpad inertia, browser scroll, and QA automation.
- Kept wheel handling passive and only used it for inertia/glow impulse, avoiding `preventDefault` blocking native scroll.
- Reworked `getStoryWorkItemVisual()` to drive 15 WorkItem slots on a fixed-x vertical conveyor with 50-degree source-inspired rotateY, y-depth staging, and z-depth instead of broad screen-x orbiting.
- Reworked WebGL `panelMeshes` to mirror the same fixed-x vertical WorkItem conveyor, so DOM cards and translucent 3D panes advance together from top to bottom.
- Added pointer-down scene selection on story cards so card interaction is not dependent on delayed click dispatch.
- Changed the source spine instance animation to y-only infinite looping, with x/z and per-segment rotation locked to the source-style base queue.
- Added source-inspired `uSpineScroll` deformation inside the `spine.bin` shader so the column reacts to scroll as vertical internal motion rather than lateral group drift.
- Added deterministic `random` attributes to the FlowerParticle point cloud and ported more of the source top/bottom spiral math, improving the pillar's internal particle flow while the group itself remains anchored.
- Reversed column particle drift so the pillar reads as top-to-bottom movement on downward scroll.
- Lowered WebGL WorkPane opacity/backplate strength and the static reference background opacity so the panels do not cover the pillar and card stack as large colored rectangles.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/`.
- Browser checks: hydrated canvas reported 1876x992; the DOM/WebGL rail rendered 15 WorkItem slots, 7 high-opacity slots were visible at top, 7 after the first scroll, and 8 after the second scroll; active focus advanced from slot `0` to slot `1` to slot `3`; visible card x ranges stayed within about 40px while y positions advanced from top to bottom; console contained only the existing DRACOLoader deprecation warning.

## Follow-up Polish

- Port more of the source Work/refraction pipeline if exact ActiveTheory-style glass is still the goal.
- Tune the pillar shader toward darker wet geometry with sharper chromatic rim highlights.
- Replace approximated AI PM panel texture behavior with source-like project media timing once the desired content set is decided.
