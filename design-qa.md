# Landing 3D WorkItem Design QA

- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source image: `/var/folders/xf/l02y_0qx7pd4zztgnkrpsbq80000gn/T/codex-clipboard-1e846b05-ef1a-49ee-bb9c-a6eb441cb54a.png`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v111-qa/default-v111.png`
- implementation card-focus screenshot: `/tmp/ai-pm-v111-qa/focus-click-card-1-v111.png`
- validation viewport: 1876x992 desktop in Codex in-app browser
- final result: blocked
- result detail: v111 fixes the user-reported structure problem: the central pillar outer group is locked to a stable x/z anchor, WorkItem cards are all rendered as persistent track items, and their DOM/WebGL positions now share one 50-degree source-inspired orbit formula. The page still is not a literal 100% Active Theory clone because the original MRT refraction, exact post-processing stack, and input timing are not fully reproduced.

## Findings

- [P1] WorkItem cards are now persistent instead of one replacement card
  Evidence: `/tmp/ai-pm-v111-qa/default-v111.png`.
  Change: all five AI PM story cards render at first paint with stable transform/opacity/z-index values, matching the mirror's `WorkItems.positionViews()` idea that all project items exist on one track.

- [P1] Pillar no longer follows horizontal card orbit
  Evidence: code path in `src/components/landing-home/index.tsx`.
  Change: `pillarGroup.position.copy(pillarBasePosition)` remains fixed during animation, camera scan is y-only, and `getStoryWorkItemVisual()` owns the card x/y/rotation path. The card orbit can move left/right, but the pillar itself does not consume that x/z progress.

- [P1] Card track uses one shared source-inspired formula
  Evidence: `getLoopedStoryOffset()` and `getStoryWorkItemVisual()`.
  Change: default SSR/first paint, immediate wheel/touch target updates, and RAF interpolation all use the same looped offset and 50-degree step. This avoids the earlier mismatch where WebGL and DOM card layers could appear to disagree.

- [P2] Front cards are interactive elements
  Evidence: DOM inspection shows five `.landing-story-workitem-card` buttons with pointer events and focus-visible states.
  Change: cards are buttons with `onClick`/`onFocus` wired to `goToScene(index)`, so actual browser interaction can select any card instead of only changing copy through a single foreground item.

- [P2] Runtime health is clean
  Evidence: `pnpm-equivalent` local checks via `./node_modules/.bin/eslint .` and `./node_modules/.bin/next build`.
  Result: lint and production build both pass. Browser console only reports the existing Three.js DRACOLoader deprecation warning.

## Remaining Risks

- Codex in-app browser's current control layer did not dispatch real wheel/click/key events into this fixed-viewport page during QA, and its read-only evaluate scope lacks `Event`, `WheelEvent`, `document.createEvent`, and `button.click()`. Visual/default DOM state was verified, but real physical wheel interaction should still be checked manually in Chrome/Safari.
- The Active Theory source mirror is still a minified production bundle plus assets, not the full editable engine. Exact WorkItem refraction, post-processing, CMS video timing, and the source pillar's final material stack remain approximated.
- Because exact source fidelity is still below the user's reference, this QA remains `blocked` instead of `passed`.

## Patches Made In V111

- Added a shared looped WorkItem track helper based on the mirror's 50-degree `positionViews()` step.
- Made all five story cards render on first paint and persist on the same orbit.
- Removed duplicate React/native wheel handling so real wheel input is not double-counted.
- Added immediate DOM card updates on scroll target changes, then reused the same helper in RAF.
- Kept the central pillar and camera x/z stable; scroll affects card orbit plus pillar internal light/particle phase only.
- Added card button interaction, focus styling, and active-card visual emphasis.
- Integrated the local `flower_spine-1024.bin` point-cloud asset through the Active Theory-style Draco header decode path.
