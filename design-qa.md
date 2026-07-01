# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-landing-scroll-v138/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-landing-scroll-v138/mid.png`
- implementation long-scroll screenshot: `/tmp/ai-pm-landing-scroll-v138/deep.png`
- viewport: 1910x1035 desktop, local Playwright headless fallback, `http://localhost:3004/?qa=scroll-v138-headless`
- state: unauthenticated landing page, hydrated WebGL canvas, programmatic page scroll through normal and deeper-scroll states. Codex in-app browser control timed out while listing tabs/navigating, so this pass used headless browser evidence.
- final result: blocked
- blocking reason: v138 addresses the latest priority complaints around pillar x/z stability, downward pillar movement, and oversized multi-card scrolling, but literal 100% ActiveTheory reproduction is still blocked by exact source camera/composite pipeline, WorkItem MRT output, and unrecovered source scene materials.

## Findings

- [P1] Pillar/camera x-z remain locked while the pillar now reads as a downward scroll.
  Location: native scroll loop, source spine shader, reference spine subject/occlusion shaders, chain loop, column particle loop, and pillar group update in `src/components/landing-home/index.tsx`.
  Evidence: v138 screenshots keep the pillar in the same central x column across top/mid/deep screenshots. Scroll input now drives `pillarScrollDrop` on y only; `pillarGroup.position.x/z` still comes from `pillarBasePosition`.
  Impact: scrolling reads as the column moving downward through the viewport instead of drifting left/right.
  Fix: added scroll-input y drop for the pillar group and its source-video spine layers, while keeping camera/pillar/veil x-z locked.

- [P1] WorkItem cards are now large enough to read as source-like foreground screens.
  Location: `getStoryWorkItemVisualFromOffset()`, `getStoryWorkItemWebGLLayout()`, `getStoryWorkItemHitLayerOpacity()`, and the DOM rail loop in `src/components/landing-home/index.tsx`.
  Evidence: headless metrics show 15 card slots, 5 viewport-visible large cards, and a center focused card measuring about `915x555` at 1910x1035. Visible card x-spread is about `159px`, so the queue reads primarily as vertical instead of lateral drift.
  Impact: this addresses the report that the cards were too small and looked like a single-card fake interaction.
  Fix: widened DOM cards, increased WebGL pane geometry, raised card scale/opacity, widened y step, and reduced x orbit.

- [P1] Multi-card progression remains real across deeper scroll.
  Location: `referenceSpineSubjectMaterial`, `referenceSpineOcclusionMaterial`, and `referenceOilTexture` updates in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-landing-scroll-v138/deep.png` shows the active foreground card advanced to the later Bug scene while previous/next cards remain visible above and below. Metrics still report all 15 slots present.
  Impact: the foreground no longer looks like one card swapping copy in place.
  Fix: kept 15 DOM/WebGL slots on the same offset math, with larger visible scale and constrained x orbit.

- [P2] Visual match is improved but not source-identical.
  Location: source spine/material layers and WorkItem shader in `src/components/landing-home/index.tsx`.
  Evidence: screenshots now show a fixed central spine and a multi-card WorkItem queue, but the reference still has stronger exact material response, MRT refraction, and a more precise source camera/composite stack.
  Impact: the latest interaction behavior follows the requested source mechanics more closely, but the 100% visual reproduction goal remains open.
  Fix: continue porting source `WorkItemShader`/`WorkItemUIShader`, source `Work/refraction` MRT, and exact camera target interpolation where possible.

## Patches Made In This Pass

- Added y-only `pillarScrollDrop` so scroll input visibly pushes the entire pillar stack downward without changing x/z.
- Enlarged DOM WorkItem cards and WebGL pane geometry so the cards read as large source-like screens.
- Reduced card x orbit and increased y spacing so the WorkItem queue reads as vertical scrolling instead of lateral drift.
- Raised non-focus card visibility while keeping the 15-slot DOM rail and WebGL pane driven from the same continuous progress.
- Preserved source-like flower particle matcap/shader tuning from the previous pass.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=scroll-v138-headless`.
- Browser screenshots:
  - `/tmp/ai-pm-landing-scroll-v138/top.png`
  - `/tmp/ai-pm-landing-scroll-v138/mid.png`
  - `/tmp/ai-pm-landing-scroll-v138/deep.png`
- Browser checks:
  - Top: 15 slots, 5 viewport-visible large cards, focused card about `915x555`, x spread about `159px`.
  - Mid/deep screenshots show the queue advancing vertically with the pillar held on the same x center.
  - Console check found no page errors. Headless browser emitted only WebGL `ReadPixels` performance warnings from screenshot capture.
  - Codex in-app browser control timed out while listing tabs/navigating, so this pass used local Playwright headless fallback instead of in-app-browser screenshots.

## Follow-up Polish

- Port the source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `WorkRefraction` output.
- Tune source pane depth/opacity so the media screens read as clearly as the reference instead of receding into the dark column.
- Continue replacing source-video planar shortcuts with source geometry/material data where available.
