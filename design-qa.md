# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference frame: `/tmp/ai-pm-video-reference/user-ref-02.png`
- supplemental mirror path: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- mirror source assets now used: `spine.bin`, `draco_wasm_wrapper.js`, `draco_decoder.wasm`, `matcap-test.jpg`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v88-source-matcap.png`
- implementation scroll screenshot: `/tmp/ai-pm-exact-spine/impulse-v88-source-matcap.png`
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v88.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v88.png`
- viewport: 1280x720 desktop
- state: unauthenticated landing page; default idle motion and one wheel-driven scroll state
- final result: blocked
- blocker: v88 now loads the mirror's real Draco `spine.bin` geometry and source matcap highlight, but the visible result is still not pixel-identical to the provided reference mp4. The remaining differences are visible in front-screen opacity/content, WorkItem-style refraction thickness, and upper-column oil-film density.

## Findings

- [P1] Source geometry is integrated, but source shader is not fully reproduced
  Location: `src/components/landing-home/index.tsx` Active Theory spine instance layer.
  Evidence: `spine.bin` loads through browser-served Draco assets, and v88 shows more regular vertebra silhouettes than v86. The reference frame still has stronger cyan/purple wet highlights and deeper black-to-glass contrast.
  Impact: the mirror materially improves the chance of close restoration, but geometry alone is not enough for a 100% visual match.
  Fix: continue porting the core ideas from `SpineShader`: heavier refraction buffer contribution, normal-map distortion, and Work composite bloom/contrast.

- [P1] Front glass screen now blocks the column, but it differs from the reference Work card
  Location: `createReferenceGlassPanelTexture` and `referenceGlassPanels`.
  Evidence: `/tmp/ai-pm-exact-spine/pillar-panel-focused-v88.png` shows the AI PM main screen occupying a similar spatial role, but the source screen has denser image/video content, brighter typography, and a thicker green glass edge.
  Impact: the composition is closer, but users can still see it is not the same screen/rendering stack.
  Fix: increase WorkItem-style video/refraction density or build a dedicated runtime texture for the front panel instead of the current low-contrast canvas projection.

- [P2] Scroll coupling works, but motion amplitude still differs from the mp4
  Location: `activeTheorySpineInstances`, `referenceGlassPanels`, and `pillarGroup` animation.
  Evidence: v88 scroll screenshot shows the pillar and card rotate together. The reference scroll state rotates the central card around the column with a heavier parallax shift and less visible landing-page text overlap.
  Impact: behavior direction is correct, but exact timing/easing remains unmatched.
  Fix: tune `storyOrbit`, `scrollFollow`, and front-panel radius/rotation against additional mp4 frames.

## Patches Made In V88

- Added browser-side Draco decode for the mirror `spine.bin` custom package format.
- Added public Draco wasm decoder assets and ignored those third-party runtime files in ESLint.
- Added the mirror `matcap-test.jpg` as a thin additive highlight layer over each source spine instance.
- Enlarged and darkened the front glass screen so it behaves more like the reference occluding Work card.
- Removed the deprecated `DRACOLoader.setDecoderConfig` call after browser verification showed only an old cached warning.

## Required Fidelity Surfaces

- Fonts and typography: AI PM landing copy remains product-specific, not source-identical Work typography; blocked for exact clone.
- Spacing and layout rhythm: central column/card relationship is closer, but the reference card begins farther left and carries stronger foreground dominance.
- Colors and visual tokens: matcap improves cyan/purple highlights, but source bloom/refraction contrast is still stronger.
- Image quality and asset fidelity: real source `spine.bin` and matcap are used; Work screen texture is still recreated by canvas and not source-identical.
- Copy and content: intentionally uses AI PM copy; this is acceptable for product context but not for a literal 100% visual clone.

## Implementation Checklist

- Keep v88 evidence as the baseline for the next fidelity pass.
- Next pass should target source-like `SpineShader` material and WorkItem card refraction before further layout polish.
- Do not mark Product Design QA as passed until the pillar silhouette, front card opacity/content, oil-film refraction, and scroll motion match the mp4 at the same frame/state.
