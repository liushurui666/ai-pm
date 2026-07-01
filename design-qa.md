# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v136-spine-y-follow/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v136-spine-y-follow/scroll-1420.png`
- implementation long-scroll screenshot: `/tmp/ai-pm-v136-spine-y-follow/scroll-deep.png`
- viewport: 1910x1035 desktop, Codex in-app browser, `http://ai-pm.localhost:3004/?qa=spine-y-follow-v136`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll through normal and deeper-scroll states.
- final result: blocked
- blocking reason: v136 addresses the latest interaction complaints around pillar x/z stability and multi-card scrolling, but literal 100% ActiveTheory reproduction is still blocked by exact source camera/composite pipeline, WorkItem MRT output, and unrecovered source scene materials.

## Findings

- [P1] Pillar/camera x-z remain locked while the pillar reads as a stronger y-only scroll.
  Location: native scroll loop, source spine shader, reference spine subject/occlusion shaders, chain loop, column particle loop, and pillar group update in `src/components/landing-home/index.tsx`.
  Evidence: hydrated browser route `http://ai-pm.localhost:3004/?qa=spine-y-follow-v136` rendered the pillar in the same central column across top, `scrollY=1420`, and `scrollY=3820` screenshots. The scroll phase now drives `sourceSpineTravel`, `sourceSpineUvScroll`, chain y-loop, column particles, and video UV sampling; none of those paths changes pillar/camera x-z.
  Impact: scrolling now reads as moving down through the column instead of dragging the whole column sideways.
  Fix: strengthened y-only spine travel and UV phase, reduced source spine shader lateral spiral, and kept camera/pillar/veil positions locked.

- [P1] WorkItem cards now expose a clearer real 15-slot queue.
  Location: `getStoryWorkItemVisualFromOffset()`, `getStoryWorkItemWebGLLayout()`, `getStoryWorkItemHitLayerOpacity()`, and the DOM rail loop in `src/components/landing-home/index.tsx`.
  Evidence: browser metrics show 15 card slots in every state, with 13 interactable slots and 8 viewport-visible cards. Active slot changed from `0` at top to `2` at `scrollY=1420`, then to `5` at `scrollY=3820`. Visible card x spread stayed within the WorkItem orbit: top `782-1128`, after scroll `779-1125`, deeper scroll `788-1135`.
  Impact: this directly addresses the report that the interaction looked like only one card existed.
  Fix: tightened vertical spacing, raised non-focus visibility, increased the card-only orbit/rotation, and kept DOM/WebGL slots on the same progress.

- [P1] Source-video pillar layers now follow the same continuous scroll phase.
  Location: `referenceSpineSubjectMaterial`, `referenceSpineOcclusionMaterial`, and `referenceOilTexture` updates in `src/components/landing-home/index.tsx`.
  Evidence: both video subject and occlusion layers now sample `uScroll` from the continuous `sourceSpineUvScroll` value, rather than a lightly modulated normalized phase. Screenshots show the central oil/glass highlights changing along the column while the mesh itself remains anchored.
  Impact: the video layer no longer feels like an unrelated background loop sitting behind the scroll interaction.
  Fix: moved only UV sampling and scan bands, not mesh coordinates.

- [P2] Visual match is improved but not source-identical.
  Location: source spine/material layers and WorkItem shader in `src/components/landing-home/index.tsx`.
  Evidence: screenshots now show a fixed central spine and a multi-card WorkItem queue, but the reference still has stronger exact material response, MRT refraction, and a more precise source camera/composite stack.
  Impact: the latest interaction behavior follows the requested source mechanics more closely, but the 100% visual reproduction goal remains open.
  Fix: continue porting source `WorkItemShader`/`WorkItemUIShader`, source `Work/refraction` MRT, and exact camera target interpolation where possible.

## Patches Made In This Pass

- Strengthened y-only spine travel, shader y displacement, column particles, chain y-loop, and video UV scroll phase.
- Reduced source spine shader lateral spiral so scroll-driven pillar deformation does not read as x-axis drift.
- Tightened the WorkItem vertical queue and raised non-focus card visibility so multiple real cards are obvious.
- Increased card-only 50-degree orbit/rotation while keeping camera, pillar, and veils locked in x-z.
- Kept the 15-slot DOM rail and WebGL pane driven from the same continuous scroll progress.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://ai-pm.localhost:3004/?qa=spine-y-follow-v136`.
- Browser screenshots:
  - `/tmp/ai-pm-v136-spine-y-follow/top.png`
  - `/tmp/ai-pm-v136-spine-y-follow/scroll-1420.png`
  - `/tmp/ai-pm-v136-spine-y-follow/scroll-deep.png`
- Browser checks:
  - Top: 15 slots, 13 interactable cards, 8 viewport-visible cards, active slot `0`, visible x spread `782-1128`.
  - After scroll: 15 slots, 13 interactable cards, 8 viewport-visible cards, active slot `2`, visible x spread `779-1125`.
  - Longer scroll: 15 slots, 13 interactable cards, 8 viewport-visible cards, active slot `5`, visible x spread `788-1135`.
  - Console check found no new runtime errors; only existing Three.js `DRACOLoader.setDecoderConfig` deprecation warnings were present.

## Follow-up Polish

- Port the source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `WorkRefraction` output.
- Tune source pane depth/opacity so the media screens read as clearly as the reference instead of receding into the dark column.
- Continue replacing source-video planar shortcuts with source geometry/material data where available.
