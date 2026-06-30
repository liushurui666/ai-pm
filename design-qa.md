# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- supplemental mirror path: `/Users/liushurui/Desktop/workspace/new-jiguangjuzhen/activetheory-work-clone-nav-orb-20260524-121151(1)`
- mirror runtime screenshot: `/tmp/ai-pm-exact-spine/active-theory-clone-work-recapture.png`
- extracted reference frame: `/tmp/ai-pm-video-reference/user-ref-02.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v85.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v85.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v85.png`
- comparison evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v85.png`
- latest code adjustment after screenshot evidence: v86 transform tightening in `src/components/landing-home/index.tsx`
- viewport: 1280x720 desktop evidence
- state: unauthenticated landing page; default idle light/motion plus one wheel interaction
- final result: blocked
- blocker: v85/v86 improves the spatial glass screens, source-video pillar response, and scroll-coupled rotation, but strict pixel-level identity with the mp4 reference is still not certified. The local mirror exposes useful `HomeLogoShader`/asset/config clues, yet its `/work/` runtime did not fully reproduce the 3D background locally, so the mp4 remains the only reliable visual truth.

## Findings

- [P1] 柱体和玻璃屏已按同一轨道联动，但仍不是源站同一套 3D 资产
  Location: `src/components/landing-home/index.tsx` Three.js stage.
  Evidence: `/tmp/ai-pm-exact-spine/ref-default-impulse-v85.png` puts the mp4 reference, default implementation, and scroll implementation side by side. v85 adds self-generated left/front/rear glass panels and binds them to `storyOrbit`; v86 further reduces horizontal drift so the interaction reads more like rotation than translation.
  Impact: addresses “滚动时柱子也要跟随滚动”的 behavior problem, but cannot claim 100% identical geometry/material.
  Fix: exact identity would require authorized source 3D assets or a source-matched rebuilt model/shader pipeline; additional hand tuning can only approach, not certify zero difference.

- [P1] 镜像能指导技术方向，不能作为直接复制来源
  Location: supplemental mirror directory.
  Evidence: the mirror contains `compiled.vs`, `spine.bin`, `flower_spine-1024.bin`, and `uil.local-z-v2.json`; `HomeLogoShader` confirms reference-style rendering uses normal/refraction/fresnel/video layers and `uScrollDelta`. The local `/work/` mirror screenshot did not show the full 3D scene, only the Work list plus canvas shell.
  Impact: useful for choosing implementation mechanics, not enough to replace mp4 comparison.
  Fix: keep using the mirror for parameter/shader analysis while recreating visuals with AI PM-owned procedural Three.js/Canvas layers.

- [P2] 默认态更接近“静止装置”，滚动才出现宣传卡片运动
  Location: `referenceGlassPanels`, `referenceSpineSubjectMaterial`, `pillarGroup`, and `panelMeshes`.
  Evidence: `/tmp/ai-pm-exact-spine/default-v85.png` keeps custom story cards subdued and lets the source-video pillar/glass composition lead; `/tmp/ai-pm-exact-spine/impulse-v85.png` shows wheel-driven rotation.
  Impact: better matches the requested “默认不动，只保留光晕粒子；滚动宣传时卡片旋转”的 direction.
  Fix: no immediate code blocker, but visual exactness remains blocked.

## Patches Made In V85/V86

- Added `createReferenceGlassPanelTexture` and `referenceGlassPanels` for self-generated left/front/rear frosted glass screens.
- Added a HomeLogoShader-inspired rolling refraction/rainbow edge layer to `referenceSpineSubjectMaterial` without copying third-party shader source.
- Increased column fleck/particle visibility to make the pillar surface read as oily, not plain smoke.
- Tightened `pillarGroup` default scale and reduced horizontal scroll drift after v85 so the stage rotates around the pillar instead of sliding away.
- Connected source-video field, ghost, motion, subject, occlusion, rim, and glass panels to the same `storyOrbit` / `scrollFollow` motion model.

## Implementation Checklist

- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Browser evidence was captured for v85; a later browser-plugin capture attempt for v86 timed out, so v86 is verified by code review, diff check, lint, and build.
- Do not mark Product Design QA passed until the visible vertebra silhouette, embedded oil-film/refraction, left/front glass-panel composition, foreground-card occlusion, and scroll motion match the mp4 at source-frame level.
