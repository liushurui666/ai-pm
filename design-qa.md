# Landing 3D Spine Design QA

- source visual truth path: `/Users/liushurui/Library/Application Support/LarkShell/screenshot/20260629120942_rec_.mp4`
- extracted reference overview: `/tmp/ai-pm-reference-video/four-frames.jpg`
- extracted precise reference frame: `/tmp/ai-pm-reference-video/precise/ref-stage-045.png`
- extracted precise reference spine crop: `/tmp/ai-pm-reference-video/precise/ref-spine-045.png`
- implementation default screenshot: `/tmp/ai-pm-exact-spine/default-v82.png`
- implementation scroll impulse screenshot: `/tmp/ai-pm-exact-spine/impulse-v82.png`
- implementation settled screenshot: `/tmp/ai-pm-exact-spine/settled-v82.png`
- implementation mobile screenshot: `/tmp/ai-pm-exact-spine/mobile-v82.png`
- same-subject comparison evidence: `/tmp/ai-pm-exact-spine/spine-compare-v82.png`
- focused material texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-field-wide-v67.png`
- focused rim texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-rim-wide-v67.png`
- focused motion texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-motion-v68.mp4`
- focused subject motion texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-subject-wide-v76.mp4`
- focused subject mask texture evidence: `/Users/liushurui/Desktop/workspace/Ai实战/ai-pm/public/landing/reference-spine-subject-mask-v76.mp4`
- viewport: 1280x720 desktop evidence, 390x844 mobile evidence
- state: unauthenticated landing page; default idle light/motion plus one story-advance wheel interaction
- final result: blocked
- blocker: v82 makes the source-video pillar and glass occlusion dominate the page, but strict pixel-level identity with the mp4 reference is still not certified because the authored left glass-panel composition and exact camera/crop relation are not fully reproduced as a single source-matched stage asset.

## Findings

- [P1] 柱体光影更接近参考，但仍不能声明为完全一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine material stack.
  Evidence: `/tmp/ai-pm-exact-spine/spine-compare-v82.png` places the reference crop, default v82 crop, and scroll-impulse v82 crop side by side. v82 raises the source-video subject layer, adds a source-video foreground glass occlusion shader, and suppresses the custom story card in the idle state. The material hierarchy is closer to the mp4 than v76, but the exact left-panel/card/pillar composition still differs.
  Impact: the user explicitly asked for no visible difference from the mp4 reference, so Product Design QA remains blocked.
  Fix: the next fidelity jump would require a source-matched full stage layer or a custom 3D asset rebuilt from the same authored geometry, not additional hand-tuned generic particles.

- [P1] 滚动时柱体已跟随，exact easing 仍未证明
  Location: wheel handling, `motionProgress`, `storyOrbit`, `pillarGroup`, `referenceSpineSubject`, `referenceSpineOcclusion`, and `panelMeshes` animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/impulse-v82.png` shows the pillar, source occlusion, and glass panels shifting/rotating together after a wheel gesture; `/tmp/ai-pm-exact-spine/settled-v82.png` shows the view settling back into the ambient state.
  Impact: this addresses the user's "滚动时柱子也要跟随滚动" concern, but the captured motion is not yet frame-matched against the reference mp4.
  Fix: capture a frame strip from a controlled wheel gesture and tune `storyOrbit`, `pillarGroup` transform, and panel opacity against the source strip.

- [P2] 默认态故事卡已退场，滚动时才短暂抬起
  Location: `panelMeshes` material opacity and animation loop.
  Evidence: `/tmp/ai-pm-exact-spine/default-v82.png` keeps the custom `COMMAND OS` card nearly invisible so the source pillar/glass field leads the visual. `/tmp/ai-pm-exact-spine/impulse-v82.png` raises card visibility only during scroll via `scrollImpulse`.
  Impact: this better matches the user's direction that default should not present an obvious story/progress line, while still preserving a subtle scroll-promo carousel.
  Fix: no immediate issue unless the desired scroll card needs to be more legible.

- [P2] Mobile layout remains stable
  Location: landing page 390x844 viewport.
  Evidence: `/tmp/ai-pm-exact-spine/mobile-v82.png`; the browser console reported no warn/error logs after the mobile capture.
  Impact: the stronger source-video layers and foreground occlusion did not introduce mobile overflow or text overlap.
  Fix: no immediate mobile fix needed for v82.

## Patches Made In V82

- Added `referenceSpineOcclusionMaterial`, a source-video sampled foreground glass shader that follows the pillar group and preserves the mp4's card-over-pillar relationship more closely.
- Raised the source-video subject and rim render order so the mp4-derived pillar/occlusion leads the composition instead of being covered by AI PM's generated story card.
- Increased the source-video subject opacity and kept it scroll-responsive so the column remains visible during wheel-driven rotation.
- Reduced idle story-card opacity to near-zero and made card visibility rise only while `scrollImpulse` is active.
- Kept the story carousel and pillar transforms tied to the same `motionProgress` / `storyOrbit`, so the cards and column move together during scroll.

## Implementation Checklist

- v82 evidence is now the current baseline.
- Browser verification used the Codex in-app browser on `http://localhost:3004/`.
- Desktop default, desktop scroll impulse, desktop settled, 390x844 mobile, and side-by-side comparison screenshots were captured.
- Browser console warn/error logs were empty after desktop and mobile verification.
- `git diff --check` passed.
- `CI=true corepack pnpm lint` passed.
- `CI=true corepack pnpm build` passed.
- Do not mark Product Design QA passed until the visible vertebra silhouette, embedded oil-film/refraction, left glass-panel composition, foreground-card occlusion, and scroll motion match the reference at source-frame level.
