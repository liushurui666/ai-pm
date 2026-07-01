# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v134-scroll-orbit/fix2-top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v134-scroll-orbit/host-active-scroll.png`
- implementation long-scroll screenshot: `/tmp/ai-pm-v134-scroll-orbit/host-active-long.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://ai-pm.localhost:3004/?qa=scroll-orbit-v134-host-active`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll through normal and longer-scroll states.
- full-view comparison evidence: source reference remains `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`; this pass focuses on interaction correctness, with new rendered evidence in `/tmp/ai-pm-v134-scroll-orbit/`.
- focused region comparison evidence: center pillar and multi-card WorkItem rail are visible in `host-active-scroll.png`; no extra crop was needed for this interaction pass.
- final result: blocked
- blocking reason: v134 fixes the user's latest scroll interaction complaint, but literal 100% ActiveTheory reproduction is still blocked by exact source camera/composite pipeline, WorkItem MRT output, and unrecovered source scene materials.

## Findings

- [P1] WorkItem scroll now uses a real multi-card source-style orbit instead of a single-card illusion.
  Location: `getStoryWorkItemVisualFromOffset()`, `getStoryWorkItemWebGLLayout()`, and the DOM rail loop in `src/components/landing-home/index.tsx`.
  Evidence: hydrated browser route `http://ai-pm.localhost:3004/?qa=scroll-orbit-v134-host-active` rendered 15 WorkItem slots, with 7 visible cards at top and after scroll. Top active slot was `0`; at `scrollY=1430`, active slot changed to `2`; at `scrollY=4288`, active slot changed to `6`.
  Impact: this directly addresses the reported problem where scrolling looked like only one card was present.
  Fix: restore each card's own 50-degree source orbit projection while keeping camera and pillar x/z locked.

- [P1] Pillar and camera x/z remain locked while cards move around them.
  Location: native scroll loop, `activeTheorySpineInstances`, `spineFlecks`, `surfaceOilPatches`, and helper geometry updates in `src/components/landing-home/index.tsx`.
  Evidence: browser metrics kept the rail/camera baseline around x `938`; active card center stayed near x `933` while surrounding cards used their own orbit spread, e.g. after scroll visible x spread `779-1098`.
  Impact: the column no longer reads as if the whole object drifts left/right; only WorkItem cards and material phases move.
  Fix: remove scroll/impulse-driven x jitter from shader vertices, spine highlight flecks, oil patches, and fallback geometry.

- [P1] Scroll synchronization no longer depends only on one event path.
  Location: native scroll synchronization and RAF branch in `src/components/landing-home/index.tsx`.
  Evidence: `127.0.0.1` loaded the SSR frame but did not hydrate reliably in the in-app browser; `ai-pm.localhost` hydrated and proved the scroll chain. The fix also adds an 80ms lightweight scroll-position poll and synchronizes DOM cards inside the RAF branch when native progress changes.
  Impact: browser automation, touchpad inertia, and manual scroll all have the same source of truth: real `scrollY` / `rect.top`.
  Fix: when native progress changes, update `nativeScrollProgressRef`, `scrollTargetRef`, DOM card transforms, and active slot in the same branch.

- [P2] Visual match is improved but not source-identical.
  Location: `createStoryWorkItemShaderMaterial()` and source spine/material layers in `src/components/landing-home/index.tsx`.
  Evidence: screenshots now show a fixed central spine, visible glass media panes, and multiple card layers. The reference still has stronger exact material response, MRT refraction, and a more precise source camera/composite stack.
  Impact: interaction behavior now follows the requested source mechanics more closely, but the 100% visual reproduction goal remains open.
  Fix: continue porting source `WorkItemShader`/`WorkItemUIShader`, source `Work/refraction` MRT, and exact camera target interpolation.

## Patches Made In This Pass

- Restored WorkItem card x orbit from the source-style 50-degree track while keeping pillar/camera x/z fixed.
- Increased DOM and WebGL card visibility so multiple cards are readable and interactable at once.
- Removed scroll-driven local x jitter from WorkItem vertex deformation, spine instances, surface flecks, oil patches, and fallback column pieces.
- Added a scroll-position polling fallback plus immediate RAF DOM sync so native page scroll always advances the card queue.
- Kept long-scroll/unlimited behavior based on the existing 15-slot rebase strategy.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://ai-pm.localhost:3004/?qa=scroll-orbit-v134-host-active`.
- Browser screenshots:
  - `/tmp/ai-pm-v134-scroll-orbit/fix2-top.png`
  - `/tmp/ai-pm-v134-scroll-orbit/host-active-scroll.png`
  - `/tmp/ai-pm-v134-scroll-orbit/host-active-long.png`
  - `/tmp/ai-pm-v134-scroll-orbit/host-scroll.png`
- Browser checks:
  - Top: 15 slots, 7 visible cards, active slot `0`, visible x spread `778-1097`.
  - After scroll: 15 slots, 7 visible cards, active slot `2`, visible x spread `779-1098`.
  - Longer scroll: 15 slots, 7 visible cards, active slot `6`, visible x spread `779-1098`.
  - Console check found no new runtime errors; only existing Three.js `DRACOLoader.setDecoderConfig` deprecation warnings were present.

## Follow-up Polish

- Port the source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `WorkRefraction` output.
- Tune source pane depth/opacity so the media screens read as clearly as the reference instead of receding into the dark column.
- Continue replacing source-video planar shortcuts with source geometry/material data where available.
