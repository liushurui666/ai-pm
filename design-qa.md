# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v130-scroll-track/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v130-scroll-track/after-scroll-1320.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://localhost:3004/?qa=scroll-track-v130`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll from `scrollY=0` to `scrollY=1320`
- full-view comparison evidence: `/tmp/ai-pm-v130-scroll-track/source-vs-after-scroll-1320.png`
- focused region comparison evidence: center pillar and foreground WorkItem queue were inspected in `/tmp/ai-pm-v130-scroll-track/top.png`, `/tmp/ai-pm-v130-scroll-track/after-scroll-1320.png`, and the side-by-side comparison.
- final result: blocked
- blocking reason: v130 fixes the user's latest interaction complaint around pillar lateral drift and single-card behavior, but literal 100% ActiveTheory visual fidelity is still blocked by media-pane composition, source project assets, and exact material/refraction differences.

## Findings

- [P1] Pillar scroll direction now matches the requested top-to-bottom behavior.
  Location: `src/components/landing-home/index.tsx`.
  Evidence: v130 keeps `pillarGroup` position/rotation locked, keeps `activeTheorySpineInstances` x/z and base rotation fixed, removes scroll-driven `uRotate` from the flower point cloud, and removes scroll-driven y-rotation from chain links. In screenshots, the central pillar axis remains visually anchored while scroll advances internal y-looping geometry, particles, and oil/refraction phase.
  Impact: this addresses the user's complaint that the whole pillar looked like it shifted left/right while scrolling.
  Fix: keep scroll out of pillar x/z, camera x/z, spine instance x/z, and scroll-driven column rotation. Future polish should only add vertical internal phase or time-only breathing.

- [P1] WorkItem cards now use a real 15-slot continuous queue instead of a single-card reading.
  Location: DOM WorkItem rail, WebGL panel track, and slot interaction handlers in `src/components/landing-home/index.tsx`.
  Evidence: browser verification reports 15 DOM WorkItem slots. At `scrollY=0`, active slot is `0`; after real browser scroll to `scrollY=1320`, active slot advances to `2`, with 7 on-screen interactive cards: slots `0,1,2,3,4,5,14`. The rail center remains fixed at x `938` before and after scroll.
  Impact: scrolling now reads as a queue of cards passing the fixed pillar, not one card swapping content.
  Fix: keep `getInfiniteStorySlotOffset()` as a modulo loop, keep the 50deg source track, and keep hover/click mapped to per-slot targets.

- [P2] Interaction no longer snaps the page back to one focused card on keyboard focus.
  Location: `handleStoryCardFocus()` and `handleStoryCardPointerEnter()`.
  Evidence: focus now only syncs active business context; mouse hover follows the source-style WorkItem behavior by advancing the scroll rig to that card's slot. Click still scrolls to the chosen slot.
  Impact: keyboard and pointer interactions both support the full card queue instead of forcing an accidental single-card lock.
  Fix: keep focus side-effect free; use pointer hover/click for source-style queue navigation.

- [P1] Source material/media fidelity is still not exact.
  Location: center pillar, glass panels, and WorkPane media layers.
  Evidence: `/tmp/ai-pm-v130-scroll-track/source-vs-after-scroll-1320.png` shows the implementation has a fixed center pillar and multiple cards, but the source still has larger real project media panes, heavier glass occlusion, darker wet-shell geometry, sharper chromatic text splitting, and richer refraction around the spine.
  Impact: this prevents claiming 100% ActiveTheory reproduction.
  Fix: continue porting source-like WorkItemShader/refraction behavior and replace approximated AI PM panes with stronger media-pane composition.

## Patches Made In This Pass

- Replaced the nearest-cycle WorkItem offset with a fixed modulo loop so slots do not self-correct or visually fold back after scrolling.
- Added explicit source-track constants: radius `3.8`, virtual camera radius `7.6`, y-step `0.84`, desktop step `50deg`, and shared visible range.
- Re-centered the DOM WorkItem rail on the screen axis and reduced lateral orbit strength to avoid making the fixed pillar feel dragged sideways.
- Adjusted DOM/WebGL WorkItem y-step and visible range so multiple cards remain on screen while the queue continues vertically.
- Removed scroll-driven horizontal/rotational phase from the pillar point-cloud shader; scroll now drives vertical phase while lateral motion is time-only and subtle.
- Removed scroll-driven chain-link y-rotation so the side chain no longer suggests the pillar is twisting left/right as a whole.
- Changed card focus behavior so keyboard focus does not scroll the page back to one card.
- Added mouse pointer-enter behavior that advances to each visible slot, matching the source WorkItem hover-to-target interaction.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=scroll-track-v130`.
- Browser screenshots:
  - `/tmp/ai-pm-v130-scroll-track/top.png`
  - `/tmp/ai-pm-v130-scroll-track/after-scroll-1320.png`
  - `/tmp/ai-pm-v130-scroll-track/source-vs-after-scroll-1320.png`
- Browser checks: real in-app browser scroll advanced the page from `scrollY=0` to `scrollY=1320`; the DOM rail rendered 15 WorkItem slots; after scroll, 7 on-screen cards remained interactive, active focus advanced to slot `2`, and console logs contained no new runtime errors. Existing warnings were limited to Three.js `DRACOLoader.setDecoderConfig` deprecation warnings.

## Follow-up Polish

- Port the source WorkItem media/refraction pass more literally, especially large project panes and chromatic text splitting.
- Tune the pillar material toward darker wet geometry with stronger source-like occlusion.
- Reduce remaining AI PM copy density on the floating panes if the target remains a near-literal ActiveTheory Work clone rather than an AI PM branded adaptation.
