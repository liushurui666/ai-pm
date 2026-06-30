# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v123-wheel-fallback/top.png`
- implementation after-wheel screenshot: `/tmp/ai-pm-v124-wheel-half-fallback/after-wheel-980.png`
- viewport: 1920x1080 desktop, Codex in-app browser, `http://localhost:3004/?qa=v124`
- state: unauthenticated landing page, hydrated WebGL canvas, real `mouse.wheel(0, 980)` page scroll from `scrollY=0` to `scrollY=980`
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

- [P1] WorkItem interaction direction is corrected again toward the source queue.
  Location: DOM card rail and WebGL panel track.
  Evidence: browser verification on `http://localhost:3004/?qa=v124` reports 15 DOM WorkItem hit layers. After a real `mouse.wheel(0, 980)`, `scrollY=980`, 11 cards are visible in the viewport band, 9 are interactive, and active focus advances from `command` to `requirement`.
  Impact: this resolves the user's complaint that only one card seemed to exist. The UI now has multiple real slots moving through the scene while preserving click/focus on readable cards.
  Fix: keep the 15-slot queue and source-style slot count; do not revert to single-card copy swapping.

- [P1] Pillar no longer drifts horizontally during scroll.
  Location: `activeTheorySpineInstances` animation in `src/components/landing-home/index.tsx`.
  Evidence: the implementation wraps spine instances along y, locks `pillarGroup.position` and `pillarGroup.rotation` to a fixed x/z pose, locks fallback spine segment x values, and changes WorkItem x from progress-driven orbiting to fixed slot lanes. In v124 the visible DOM card centers stay within x `1028-1103` after wheel scroll.
  Impact: this matches the requested “从上到下” scroll behavior and avoids the previous lateral twisting impression.
  Fix: keep y-only looping for the pillar and fixed-lane WorkItems; any future camera/card changes must not feed scroll progress into `pillarGroup`, individual spine instance x/z, or WorkItem x position.

- [P2] WebGL WorkPane projections are now the primary card visual layer.
  Location: `referenceGlassPanels`, `panelMeshes`, and `.landing-story-hero-asset`.
  Evidence: `/tmp/ai-pm-v124-wheel-half-fallback/after-wheel-980.png` shows the large reference glass panels and WorkItem panes as translucent media surfaces. DOM cards are visible enough for interaction, while WebGL panes remain the main glass/media layer.
  Impact: this removes the most obvious single-giant-card impression from the previous pass and makes the card stack read more like source media panes, though the panel design still is not identical to the source.
  Fix: refine panel media/refraction in a later pass rather than increasing flat opacity.

## Patches Made In This Pass

- Changed the landing shell from fixed 100vh fake-scroll to a real long-scroll section with a sticky 3D viewport.
- Switched scroll syncing to an animation-frame read of native `scrollY`, so track progress works for real wheel, touchpad inertia, browser scroll, and QA automation.
- Added a wheel fallback that waits one frame for browser default scrolling, then writes half-delta into `window.scrollY` only if default scrolling did not move; this keeps the experience on real page scroll without double-scrolling in normal browsers.
- Reworked `getStoryWorkItemVisual()` again so WorkItem cards use fixed slot lanes, y-axis staging, z-depth, and turn-in rotation while the pillar/camera stay locked.
- Reworked WebGL `panelMeshes` to mirror that same fixed-lane multi-card queue, so DOM cards and translucent 3D panes advance together instead of reading as a single card layer.
- Added a native `scroll` event sync path so DOM WorkItems update immediately on real browser scroll, with RAF continuing to smooth the WebGL scene.
- Removed pointer-down scene selection from story cards so drag/scroll gestures do not force one card to seize the active state before the real scroll progress updates.
- Tightened the DOM WorkItem card dimensions, scale, z-depth, and y spacing so the vertical queue reads as multiple source-style panes rather than one oversized product card.
- Limited pointer events to sufficiently visible card slots, keeping interaction on the cards that are actually readable on screen.
- Demoted DOM WorkItem buttons to faint hit layers, keeping accessibility/click/focus while moving the visible card design back into WebGL.
- Raised WebGL WorkPane texture/backplate strength so media panes are the primary visible card layer.
- Reduced `createPanelTexture()` text scale, border weight, shadow, and label brightness so panes read as media projections instead of story-title cards.
- Changed the source spine instance animation to y-only infinite looping, with x/z and per-segment rotation locked to the source-style base queue.
- Locked `pillarGroup` rotation and fallback segment x positions so time/scroll no longer creates visible lateral pillar sway.
- Added source-inspired `uSpineScroll` deformation inside the `spine.bin` shader so the column reacts to scroll as vertical internal motion rather than lateral group drift.
- Added deterministic `random` attributes to the FlowerParticle point cloud and ported more of the source top/bottom spiral math, improving the pillar's internal particle flow while the group itself remains anchored.
- Reversed column particle drift so the pillar reads as top-to-bottom movement on downward scroll.
- Lowered WebGL WorkPane opacity/backplate strength and the static reference background opacity so the panels do not cover the pillar and card stack as large colored rectangles.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v124`.
- Browser checks: real `mouse.wheel(0, 980)` advanced the page to `scrollY=980`; the DOM rail rendered 15 WorkItem hit layers; after wheel scroll, 11 cards were visible, 9 were interactive, active focus advanced to slot `1`/`requirement`, and visible card center x stayed in a narrow fixed-lane band `1028-1103`. Console contained only the existing DRACOLoader deprecation warning.

## Follow-up Polish

- Port more of the source Work/refraction pipeline if exact ActiveTheory-style glass is still the goal.
- Tune the pillar shader toward darker wet geometry with sharper chromatic rim highlights.
- Replace approximated AI PM panel texture behavior with source-like project media timing once the desired content set is decided.
