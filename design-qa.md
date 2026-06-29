# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference evidence: `/tmp/ai-pm-reference-video/four-frames.jpg`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v48.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v48.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v48.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v48.png`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default static frame plus one story-advance interaction
- final result: blocked for exact-source fidelity, improved for requested motion behavior

## Findings

- [P1] 柱体仍不能声明为和参考视频完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/default-v48.png` and `/tmp/ai-pm-exact-spine/impulse-v48.png` show a more continuous, regular, glossy center spine than v44/v46. The scroll impulse frame now exposes the full pillar through the card orbit, closer to the reference. It still differs from the source mp4 in exact vertebra silhouette, oil-film fleck placement, and glass-refraction micro detail.
  Impact: the user explicitly asked for no visible difference from the reference pillar, so strict QA remains blocked.
  Fix: use a dedicated modeled-in-code mesh or imported authored 3D asset matched against source frames if exact silhouette is mandatory.

- [P1] 粒子/光影质感已增强，但还不是参考级复杂度
  Location: `columnParticleCount`, `createVolumetricParticleMaterial`, and oil materials in `src/components/landing-home/index.tsx`.
  Evidence: v48 increases the local column particle field and gives the main spine a darker wet-glass material, but the reference has richer sub-surface shimmer, sharper bright speckles, and stronger color separation.
  Impact: the effect reads more premium than the prior build, but still not Active Theory production fidelity.
  Fix: add a second layer of small high-frequency spark/fleck particles and a purpose-built noise/refraction shader pass.

- [P2] 滚动联动行为 now satisfies the requested interaction direction
  Location: animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v48.png` shows the pillar moving/rotating into the center while the story cards rotate around it; `/tmp/ai-pm-exact-spine/settled-v48.png` shows the next story card settled with the pillar still aligned to the story state.
  Impact: this addresses the specific regression where the cards moved but the pillar felt static.
  Fix: continue tuning easing only if the user wants mp4-frame timing, not just the interaction model.

## Patches Made In V48

- Added a separate reference spine material tuned for dark wet-glass, stronger clearcoat, iridescence, and oil-film reflection.
- Added a 12-segment regular main spine stack with fixed vertical rhythm, alternating side lobes, and per-segment dark cavities.
- Reduced the old exposed top random segment weight so it becomes background volume instead of the primary silhouette.
- Moved the default carousel card to reveal the pillar edge, then increased story-orbit translation and yaw so the pillar visibly follows story navigation.
- Increased local column particles from 980 to 1380 and raised their global opacity for a stronger light-dust field.
- Verified desktop default, desktop story impulse, desktop settled state, and 390x844 mobile layout.

## Implementation Checklist

- Keep v48 screenshots as the current evidence baseline.
- Do not mark Product Design QA passed until the pillar silhouette, material flecks, and refraction match the reference at source-frame level.
- Preserve the v48 behavior where default is static, while scroll/story navigation moves the whole center installation.
