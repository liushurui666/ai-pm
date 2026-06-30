# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v132-media-spine/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v132-media-spine/after-scroll-1320.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://localhost:3004/?qa=scroll-track-v132`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll from `scrollY=0` to `scrollY=1320`
- full-view comparison evidence: `/tmp/ai-pm-v132-media-spine/source-vs-after-scroll-1320.png`
- focused region comparison evidence: center pillar/media-pane region is visible in the full-view comparison at the same viewport; no extra crop was needed for this pass because the patch target was scene-level media-pane hierarchy and scroll behavior, not small typography.
- final result: blocked
- blocking reason: v132 moves the scene closer to the ActiveTheory Work reference by strengthening real media panes, refraction, and scroll-coupled spine sampling, but literal 100% reproduction is still blocked by exact source camera/composite pipeline, WorkItem MRT refraction, and source geometry/material differences.

## Findings

- [P1] Media-pane hierarchy is closer, but still not source-identical.
  Location: `src/components/landing-home/index.tsx`.
  Evidence: v132 side-by-side comparison shows larger left/front media panes and stronger glass occlusion than v131, matching the source direction better. The source still has a more dominant left screen, sharper project-media projection, and cleaner front/back separation.
  Impact: this is visible in the first viewport and still prevents a 100% match claim.
  Fix: continue porting the source `WorkItemShader`/MRT refraction and tune pane positions from the mirror camera targets rather than approximating by hand.

- [P1] Pillar scroll-follow is stronger, but not exact.
  Location: source video subject and occlusion shaders in `src/components/landing-home/index.tsx`.
  Evidence: the source video plane and occlusion layer now sample with `uScroll` on the y axis while the mesh x/z remains fixed. This makes the visible pillar layer travel vertically with scroll. The source mp4 still has a deeper true 3D column/composite relationship than the current hybrid source-video + mesh stack.
  Impact: it addresses the user's "柱子要像 mp4 一样跟随滚动" direction, but exact geometry/material parity is not proven.
  Fix: replace more of the visible source-video plane with source geometry/shader data, or derive the correct animated camera/composite pass from the mirror.

- [P1] DOM business cards no longer dominate the source-like scene.
  Location: `getStoryWorkItemHitLayerOpacity()` in `src/components/landing-home/index.tsx`.
  Evidence: browser verification after scroll shows active DOM slot opacity `0.238` and surrounding slots `0.093-0.142`, while all remain pointer-interactive.
  Impact: the scene reads more like media panes around a pillar instead of a vertical SaaS card stack, while retaining the user's requirement that all cards remain real scroll targets.
  Fix: keep DOM as hit/focus layer; continue moving visual weight into WebGL pane/media layers.

- [P1] Scroll interaction remains correct after the visual changes.
  Location: landing route `/`.
  Evidence: route rendered 15 DOM WorkItem slots. After real in-app browser scroll to `scrollY=1320`, 7 cards remained visible and interactive, active slot was `2`, and rail center x stayed `939`.
  Impact: v132 did not regress the v131 interaction fix.
  Fix: keep rail center and scroll target logic unchanged while improving materials.

## Patches Made In This Pass

- Increased left/front reference glass pane size and opacity to better match the source's large media-screen hierarchy.
- Attached real Hogwarts media and Work-style refraction material to the left screen as well as the front screen.
- Switched the media pane shader from additive-only blending to normal smoky media blending so panes can actually occlude the pillar.
- Raised media/refraction uniform opacity limits for source-like thick glass while keeping right/rear panes lighter.
- Added scroll-coupled y-axis texture sampling to the source-video pillar and occlusion layer so the visible column follows downward scrolling without moving x/z.
- Lowered DOM WorkItem card opacity so DOM remains an interaction layer rather than the primary visual layer.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- `git diff --check`: passed.
- Browser route: `http://localhost:3004/?qa=scroll-track-v132`.
- Browser screenshots:
  - `/tmp/ai-pm-v132-media-spine/top.png`
  - `/tmp/ai-pm-v132-media-spine/after-scroll-1320.png`
  - `/tmp/ai-pm-v132-media-spine/source-vs-after-scroll-1320.png`
- Browser checks:
  - Real in-app browser scroll advanced the page to `scrollY=1320`.
  - DOM rail rendered 15 WorkItem slots.
  - After scroll: 7 visible interactive cards, active slot `2`, rail center x `939`.
  - Active DOM slot opacity reduced to `0.238`; surrounding visible slots stayed interactive at `0.093-0.142`.
  - Console check found no new runtime errors; only existing Three.js `DRACOLoader.setDecoderConfig` deprecation warnings were present.

## Follow-up Polish

- Port more of `WorkItemShader.glsl` literally: `tRefraction`, `tEnv`, `tNormal`, RGB split, radial blur, and the separate `WorkRefraction` output.
- Use mirror camera/pane target data to place left/front/rear panes instead of hand-tuned x/z/rotation constants.
- Continue replacing source-video planar shortcuts with source geometry/materials where available.
