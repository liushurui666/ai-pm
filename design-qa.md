# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v52.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v52.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v52.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v52.png`
- same-frame comparison evidence: `/tmp/ai-pm-exact-spine/ref-default-compare-v51.png`, `/tmp/ai-pm-exact-spine/spine-compare-v51.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked for exact-source fidelity, improved for scroll-coupled motion and regular side-spine silhouette

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/default-v52.png` and `/tmp/ai-pm-exact-spine/impulse-v52.png` show the column now moves with the story transition and reads more like a side-profile spine than v48. The reference crop still has more authored vertebra geometry: flatter right-side masses, smoother left protrusions, and more source-specific oil-film fleck placement.
  Impact: the user explicitly requires no visible difference from the mp4 reference, so strict QA remains blocked.
  Fix: replace more of the procedural stack with a dedicated frame-matched modeled mesh or a more specific custom geometry generator for the visible vertebra silhouettes.

- [P1] 光影粒子方向 improved but source-level material complexity is still missing
  Location: `makeReferenceSpineMaterial`, `spineFlecks`, and `columnParticleCount` in `src/components/landing-home/index.tsx`.
  Evidence: v52 adds 118 local oil-fleck sprites and a deeper wet-glass material, which improves small cyan/purple highlights. The reference still has higher-frequency noisy iridescence embedded inside the surface, not just additive highlights above it.
  Impact: the surface now feels less flat, but it is not yet the same production-grade refraction/shader look.
  Fix: add a real shader pass or a denser material texture pipeline that breaks highlights inside the mesh surface rather than only on sprite layers.

- [P2] 旧随机骨节层 no longer dominates the silhouette
  Location: `vertebraSegments` and `spineTendons` in `src/components/landing-home/index.tsx`.
  Evidence: v52 lowers old random segment opacity and hides the old tube tendons that appeared as straight black rods in v51. The impulse frame now exposes the main side-spine stack more clearly.
  Impact: this moves the shape closer to the reference, but exact silhouette matching remains open.
  Fix: continue reducing non-reference layers if they create artifacts during future passes.

- [P2] 滚动联动 behavior remains correct
  Location: wheel/key story progression and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v52.png` shows the pillar and carousel moving together; `/tmp/ai-pm-exact-spine/settled-v52.png` shows the next story state retaining pillar alignment.
  Impact: the interaction part of the user's request is still satisfied.
  Fix: only tune timing further if exact mp4 easing becomes the next blocker.

## Patches Made In V52

- Re-shaped the main spine from 12 small alternating beads into 10 larger side-profile vertebra segments with consistent left protrusions.
- Deepened the reference spine material: darker base color, stronger clearcoat/specular response, higher environment reflection, and tighter roughness.
- Added 118 local oil-fleck sprites attached to the pillar, with scroll-reactive opacity and stretch for sharper cyan/purple/red-gold micro highlights.
- Reduced the legacy random vertebra layer to a low-opacity background volume so it no longer competes with the main silhouette.
- Hid the old tube tendon layer after comparison showed it rendered as straight black rods not present in the reference.
- Verified desktop default, desktop story impulse, desktop settled state, and 390x844 mobile layout.

## Implementation Checklist

- Keep v52 screenshots as the current evidence baseline.
- Do not mark Product Design QA passed until the visible vertebra silhouette and embedded oil-film/refraction match the reference at source-frame level.
- Preserve the v52 behavior where default is static, while scroll/story navigation moves the whole center installation.
