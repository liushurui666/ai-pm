# Landing 3D WorkItem Design QA

- source visual truth path: `/tmp/ai-pm-at-reference/mp4-02-4.2s.png`
- source video: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- source mirror: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- implementation default screenshot: `/tmp/ai-pm-v133-scroll-axis/top.png`
- implementation after-scroll screenshot: `/tmp/ai-pm-v133-scroll-axis/after-scroll.png`
- implementation long-scroll screenshot: `/tmp/ai-pm-v133-scroll-axis/after-long-scroll.png`
- viewport: 1876x992 desktop, Codex in-app browser, `http://localhost:3004/?qa=scroll-track-v133`
- state: unauthenticated landing page, hydrated WebGL canvas, real in-app browser scroll through normal and long-scroll states.
- full-view comparison evidence: `/tmp/ai-pm-v133-scroll-axis/source-vs-after-scroll.png`
- focused region comparison evidence: center pillar and WorkItem rail are visible in the full-view comparison; no extra crop was needed because this pass targets scene-level motion/axis behavior rather than small typography.
- final result: blocked
- blocking reason: v133 fixes the user's latest interaction complaint, but literal 100% ActiveTheory reproduction is still blocked by exact source camera/composite pipeline, WorkItem MRT output, and unrecovered source scene materials.

## Findings

- [P1] Pillar axis no longer drifts horizontally during scroll.
  Location: `getStoryWorkItemVisualFromOffset()`, `getStoryWorkItemWebGLLayout()`, and the native scroll loop in `src/components/landing-home/index.tsx`.
  Evidence: top, normal-scroll, and long-scroll browser metrics all reported 15 WorkItem slots and 7 visible cards. Visible card center x stayed tightly centered: top `933-944`, after scroll `933-943`, long scroll `933-943`.
  Impact: this directly addresses the reported problem where scrolling made the column read as if it were shifting left/right.
  Fix: keep camera and pillar x/z locked; only y, z-depth, rotation, opacity, and shader phase should react to scroll.

- [P1] Multi-card interaction is restored as a real vertical queue.
  Location: DOM rail and WebGL pane loop in `src/components/landing-home/index.tsx`.
  Evidence: the page rendered all 15 slots, with 7 visible/interactable cards in the viewport after both normal and long scroll. Active slot changed from `0` at top, to `3` after scroll, and to `2` after long scroll.
  Impact: the experience no longer behaves like one card swapping content; multiple cards pass through the same center-axis scroll path.
  Fix: continue using one slot per WorkItem and avoid hover/click logic that snaps the whole rail to a single card.

- [P1] Long scrolling no longer forces a visual reset at the end of the native page.
  Location: native scroll rebasing in the animation loop.
  Evidence: after a large scroll delta, the page rebased to `scrollY=33759`, approximate progress `47.266`, with the same 7-card visible queue and centered x spread. The visible state stayed continuous because the rebase offset is a 15-slot multiple.
  Impact: this better approximates the source `Scroll.getUnlimited()` behavior inside a real browser page.
  Fix: keep rebasing by full slot cycles only; do not rebase by partial scene index.

- [P2] WorkItem visuals are closer to source shader behavior but still too dim and not source-identical.
  Location: `createStoryWorkItemShaderMaterial()` in `src/components/landing-home/index.tsx`.
  Evidence: WebGL panes now use water normal, environment texture, runtime refraction, chromatic split, and scroll phase. Side-by-side comparison still shows source panes with much stronger media projection, clearer glass thickness, and better spatial separation.
  Impact: the latest interaction bug is fixed, but the visual target remains short of the user's requested 100% match.
  Fix: continue porting source `WorkItemShader`/`WorkItemUIShader` and the real `Work/refraction` MRT pipeline instead of only approximating with a single ShaderMaterial.

## Patches Made In This Pass

- Removed scroll-driven DOM/WebGL card x orbit so the rail moves vertically through a fixed center axis.
- Preserved source-inspired 50-degree rotational phase for card facing, depth, and render ordering.
- Added native scroll rebasing by full 15-slot cycles to approximate unlimited scrolling.
- Replaced main WorkItem `MeshBasicMaterial` with `createStoryWorkItemShaderMaterial()` using pane texture, water normal, environment texture, runtime refraction, chromatic split, fresnel, and scroll phase.
- Raised DOM hit-layer opacity enough that surrounding cards remain visibly interactive while WebGL panes carry the main glass look.

## Validation

- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- Browser route: `http://localhost:3004/?qa=scroll-track-v133`.
- Browser screenshots:
  - `/tmp/ai-pm-v133-scroll-axis/top.png`
  - `/tmp/ai-pm-v133-scroll-axis/after-scroll.png`
  - `/tmp/ai-pm-v133-scroll-axis/after-long-scroll.png`
  - `/tmp/ai-pm-v133-scroll-axis/source-vs-after-scroll.png`
- Browser checks:
  - Top: 15 slots, 7 visible cards, active slot `0`, centered x spread `933-944`.
  - After scroll: 15 slots, 7 visible cards, active slot `3`, centered x spread `933-943`.
  - Long scroll: 15 slots, 7 visible cards, active slot `2`, centered x spread `933-943`, approximate progress rebased to `47.266`.
  - Console check found no new runtime errors; only existing Three.js `DRACOLoader.setDecoderConfig` deprecation warnings were present.

## Follow-up Polish

- Port the source `WorkItemShader.glsl` and `WorkItemUIShader.glsl` more literally, including true MRT `WorkRefraction` output.
- Tune source pane depth/opacity so the media screens read as clearly as the reference instead of receding into the dark column.
- Continue replacing source-video planar shortcuts with source geometry/material data where available.
