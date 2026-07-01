# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v135-workitem-media/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v135-workitem-media/scroll-1420.png`
- implementation long-scroll screenshot: `/tmp/ai-pm-v135-workitem-media/scroll-deep.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://ai-pm.localhost:3004/?qa=workitem-media-v135`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll through normal and longer-scroll states.
- final result: blocked
- blocking reason: v135 fixes the latest scroll/interaction complaint, but literal 100% ActiveTheory reproduction is still blocked by exact source camera/composite pipeline, WorkItem MRT output, and unrecovered source scene materials.

## Findings

- [P1] WorkItem cards now behave as a real multi-card queue, not a single-card content swap.
  Location: `getStoryWorkItemVisualFromOffset()`, `getStoryWorkItemWebGLLayout()`, `createStoryWorkItemShaderMaterial()`, and the DOM rail loop in `src/components/landing-home/index.tsx`.
  Evidence: hydrated browser route `http://ai-pm.localhost:3004/?qa=workitem-media-v135` rendered 15 WorkItem slots and 13 visible/interactable cards in all checked states. Top active slot was `0`; at `scrollY=1420`, active slot changed to `2`; at `scrollY=4220`, active slot changed to `6`.
  Impact: this directly addresses the reported problem where scrolling looked like only one card was present.
  Fix: keep 15 slot instances alive, run them through the source-style 50-degree WorkItem orbit, and fade edge cards before the modulo loop reconnects.

- [P1] Pillar/camera x-z stay locked while cards scroll around the fixed column.
  Location: native scroll loop, pillar group update, veil sprite update, source spine instances, and WorkItem vertex shader in `src/components/landing-home/index.tsx`.
  Evidence: active card x stayed around the center while visible card spread stayed within the card orbit: top `786-1091`, after scroll `787-1091`, deeper scroll `783-1088`. The pillar is visually anchored in the same center-left column across all screenshots.
  Impact: the page now reads as a vertical scan through a fixed pillar, with cards moving independently around it.
  Fix: lock pillar/camera x-z, remove scroll-driven local x jitter, and stop pillar veil sprites from doing independent x-axis breathing.

- [P1] WorkItem shader now includes a source-like media projection layer.
  Location: `createStoryWorkItemShaderMaterial()` in `src/components/landing-home/index.tsx`.
  Evidence: the shader now passes `mediaTexture` as `tVideo`, uses a `uVideoBlend`-style mix, and combines pane text, media, refraction, env, and water normal sampling. Browser screenshots show stronger video-glass projection across multiple cards.
  Impact: WorkItems are closer to the source `WorkItemShader.glsl` data flow than a plain transparent UI card.
  Fix: port the source `videoUV` / screen UV mix pattern into the local shader while keeping x/z movement outside the material.

- [P2] Visual match is improved but not source-identical.
  Location: source spine/material layers and WorkItem shader in `src/components/landing-home/index.tsx`.
  Evidence: screenshots now show a fixed central spine, media-glass panes, and many card layers, but the reference still has stronger exact material response, MRT refraction, and a more precise source camera/composite stack.
  Impact: interaction behavior follows the requested source mechanics more closely, but the 100% visual reproduction goal remains open.
  Fix: continue porting source `WorkItemShader`/`WorkItemUIShader`, source `Work/refraction` MRT, and exact camera target interpolation.

## Patches Made In This Pass

- Changed the WorkItem visible range so cards fade before the 15-slot modulo loop reconnects.
- Added `tVideo`/`uVideoBlend`-style media projection to the WorkItem shader.
- Increased WebGL WorkItem opacity enough for multiple cards to read as a real queue.
- Kept pillar/camera x-z locked and fixed veil sprite x-axis movement.
- Preserved native scroll synchronization so real `scrollY` remains the source of truth.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://ai-pm.localhost:3004/?qa=workitem-media-v135`.
- Browser screenshots:
  - `/tmp/ai-pm-v135-workitem-media/top.png`
  - `/tmp/ai-pm-v135-workitem-media/scroll-1420.png`
  - `/tmp/ai-pm-v135-workitem-media/scroll-deep.png`
- Browser checks:
  - Top: 15 slots, 13 visible/interactable cards, active slot `0`, visible x spread `786-1091`.
  - After scroll: 15 slots, 13 visible/interactable cards, active slot `2`, visible x spread `787-1091`.
  - Longer scroll: 15 slots, 13 visible/interactable cards, active slot `6`, visible x spread `783-1088`.
  - Console check found no new runtime errors; only existing Three.js `DRACOLoader.setDecoderConfig` deprecation warnings were present.

## Follow-up Polish

- Port the source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `WorkRefraction` output.
- Tune source pane depth/opacity so the media screens read as clearly as the reference instead of receding into the dark column.
- Continue replacing source-video planar shortcuts with source geometry/material data where available.
