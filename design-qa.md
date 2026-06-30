# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v128-real-scroll/top.png`
- implementation after-wheel screenshot: `/tmp/ai-pm-v128-real-scroll/after-wheel-980-stable.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://localhost:3004/?qa=v128`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll from `scrollY=0` to `scrollY=980`
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
  Evidence: browser verification on `http://localhost:3004/?qa=v128` reports 15 DOM WorkItem hit layers. At the top state, 8 cards are visible and all 8 are interactive, with the focus card at slot `0`/command and the surrounding queue spanning x `731-1324`. After a real browser scroll of 980px and stabilization, `scrollY=980`, 8 cards remain visible/interactable, active focus advances to slot `1`/requirement, and the visible queue spans x `737-1353`.
  Impact: this resolves the user's complaint that the card interaction looked like one card. The UI now uses 15 source-style slots, each with its own click/focus scroll target, while readable cards retain interaction.
  Fix: keep the 15-slot queue, per-slot click/focus target, and offset-driven 50deg card orbit; do not revert to 5 scene-level targets, single-card copy swapping, or fixed-x card lanes.

- [P1] Pillar no longer drifts horizontally during scroll.
  Location: `activeTheorySpineInstances` animation in `src/components/landing-home/index.tsx`.
  Evidence: the implementation wraps spine instances along y, locks `pillarGroup.position` and `pillarGroup.rotation` to a fixed x/z pose, locks fallback spine segment x values, and keeps scroll progress out of pillar x/z. In v128 the broader card x range comes from the offset-driven WorkItem orbit; the pillar itself remains anchored while scroll drives y-looping spine instances, chain links, oil-film phase, and card queue progress.
  Impact: this matches the requested “从上到下” scroll behavior and avoids the previous lateral twisting impression.
  Fix: keep y-only looping for the pillar; any future camera/card changes must not feed scroll progress into `pillarGroup`, individual spine instance x/z, or fallback spine segment x values.

- [P2] WebGL WorkPane projections are now the primary card visual layer.
  Location: `referenceGlassPanels`, `panelMeshes`, and `.landing-story-hero-asset`.
  Evidence: `/tmp/ai-pm-v128-real-scroll/after-wheel-980-stable.png` shows the static background glass reduced to a darker environment layer while the 15 WorkItem panes/cards remain readable enough to show queue continuity. DOM cards are visible enough for interaction, while WebGL panes remain the main glass/media layer.
  Impact: this removes the large foggy board that made the queue read as one covered card, while preserving the dark ActiveTheory-style glass stage.
  Fix: refine panel media/refraction in a later pass rather than increasing flat opacity.

## Patches Made In This Pass

- Changed the landing shell from fixed 100vh fake-scroll to a real long-scroll section with a sticky 3D viewport.
- Switched scroll syncing to an animation-frame read of native `scrollY`, so track progress works for real wheel, touchpad inertia, browser scroll, and QA automation.
- Added a wheel fallback that waits one frame for browser default scrolling, then writes half-delta into `window.scrollY` only if default scrolling did not move; this keeps the experience on real page scroll without double-scrolling in normal browsers.
- Reworked `getStoryWorkItemVisual()` again so WorkItem cards use offset-driven 50deg orbit, y-axis staging, z-depth, and turn-in rotation while the pillar/camera stay locked.
- Reworked WebGL `panelMeshes` to mirror that same offset-driven orbit, so DOM cards and translucent 3D panes advance together instead of reading as a single card layer.
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
- Changed WorkItem lane generation from 5 repeated scene lanes to 15 source-style slots at 50deg spacing, so all repeated cards occupy distinct positions instead of collapsing into one visible card.
- Added `goToStorySlot(slotIndex)` so each visible repeated WorkItem has its own click/focus scroll target, matching the source behavior where every WorkItem view maps to a target.
- Expanded visible card hit targets to the near/mid queue (`absOffset < 7.4`) and assigns `tabIndex` accordingly, so all readable cards are actually interactive.
- Reduced the static reference background glass opacity and changed WorkPane opacity/backplate falloff to focus-weighted curves, preventing environment glass from smearing the 15-card queue into a single flat board.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=v128`.
- Browser checks: real in-app browser scroll advanced the page from `scrollY=0` to `scrollY=980`; the DOM rail rendered 15 WorkItem hit layers. Top state had 8 visible/interactive cards with visible slots `0,1,2,3,11,12,13,14`; after scroll it had 8 visible/interactive cards with visible slots `0,1,2,3,4,12,13,14`, active focus advanced to slot `1`/`requirement`, and the visible card range spanned x `737-1353` from the card-only orbit while the pillar stayed anchored.

## Follow-up Polish

- Port more of the source Work/refraction pipeline if exact ActiveTheory-style glass is still the goal.
- Tune the pillar shader toward darker wet geometry with sharper chromatic rim highlights.
- Replace approximated AI PM panel texture behavior with source-like project media timing once the desired content set is decided.
