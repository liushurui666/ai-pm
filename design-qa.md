# Landing 3D WorkItem Design QA

- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source image: `/var/folders/xf/l02y_0qx7pd4zztgnkrpsbq80000gn/T/codex-clipboard-1e846b05-ef1a-49ee-bb9c-a6eb441cb54a.png`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v112-qa/default-v112.png`
- implementation wheel screenshot: `/tmp/ai-pm-v112-qa/wheel-card-1-v112.png`
- implementation card-focus screenshot: `/tmp/ai-pm-v112-qa/focus-click-card-3-v112.png`
- validation viewport: 1876x992 desktop in Codex in-app browser
- final result: passed for the requested interaction fix
- result detail: v112 keeps the central pillar outer group locked to a stable x/z anchor, moves only the internal point cloud/oil/spine phases on scroll, and verifies that all five WorkItem cards are persistent interactive buttons on one source-inspired 50-degree track. The page still is not a literal byte-for-byte Active Theory clone because the original MRT refraction and exact post-processing stack are not fully reproduced.

## Findings

- [P1] WorkItem cards are persistent instead of one replacement card
  Evidence: `/tmp/ai-pm-v112-qa/default-v112.png`.
  Change: all five AI PM story cards render at first paint with stable transform/opacity/z-index values, matching the mirror's `WorkItems.positionViews()` idea that all project items exist on one track.

- [P1] Pillar no longer follows horizontal card orbit
  Evidence: code path in `src/components/landing-home/index.tsx`.
  Change: `pillarGroup.position.copy(pillarBasePosition)` remains fixed during animation, the pillar outer rotation no longer consumes scroll progress, and `getStoryWorkItemVisual()` owns the card x/y/rotation path. The card orbit can move left/right, but the pillar itself does not consume that x/z progress.

- [P1] Real wheel input advances the track
  Evidence: `/tmp/ai-pm-v112-qa/wheel-card-1-v112.png`.
  Change: wheel handling moved to non-passive window capture and now accepts canvas, card, and document wheel targets. Browser QA confirmed scrolling moves focus from card 0 to card 1 while neighboring cards keep their queued positions.

- [P1] Card track uses one shared source-inspired formula
  Evidence: `getLoopedStoryOffset()` and `getStoryWorkItemVisual()`.
  Change: default SSR/first paint, immediate wheel/touch target updates, and RAF interpolation all use the same looped offset and 50-degree step. This avoids the earlier mismatch where WebGL and DOM card layers could appear to disagree.

- [P2] Front cards are interactive elements
  Evidence: `/tmp/ai-pm-v112-qa/focus-click-card-3-v112.png`.
  Change: cards are buttons with `onClick`/`onFocus` wired to `goToScene(index)`, `data-active`/`aria-pressed` now follow `activeIndex`, and browser QA confirmed clicking card 3 moves the Bug card into focus.

- [P2] Runtime health is clean
  Evidence: `corepack pnpm lint` and `corepack pnpm build`.
  Result: lint and production build both pass. Browser console only reports the existing Three.js DRACOLoader deprecation warning.

## Remaining Risks

- The Active Theory source mirror is still a minified production bundle plus assets, not the full editable engine. Exact WorkItem refraction, post-processing, CMS video timing, and the source pillar's final material stack remain approximated.
- Browser console still reports the existing Three.js `DRACOLoader.setDecoderConfig` deprecation warning from the custom Draco attribute decode path; this warning does not block the current interaction fix.

## Patches Made In V112

- Added a shared looped WorkItem track helper based on the mirror's 50-degree `positionViews()` step.
- Made all five story cards render on first paint and persist on the same orbit.
- Moved wheel handling to window capture so real wheel input reaches the fixed-viewport story consistently.
- Added immediate DOM card updates on scroll target changes, then reused the same helper in RAF.
- Kept the central pillar and camera x/z stable; scroll affects card orbit plus pillar internal light/particle/spine phase only.
- Fixed card active state so React does not hard-code the first card after rerender.
- Verified real wheel and click interactions in the Codex in-app browser.
- Integrated the local `flower_spine-1024.bin` point-cloud asset through the Active Theory-style Draco header decode path.
