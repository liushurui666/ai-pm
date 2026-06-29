# Landing 3D Spine Design QA

- source visual truth path: `/tmp/ai-pm-video-reference/frame-02.png`
- implementation screenshot path: `/tmp/ai-pm-exact-spine/default-v44.png`
- viewport: 1920x1080 desktop, 390x844 mobile
- state: unauthenticated landing page default frame; scroll state captured after one wheel gesture
- full-view comparison evidence: `/tmp/ai-pm-exact-spine/crop-compare-v44.png`
- focused region comparison evidence: `/tmp/ai-pm-exact-spine/top-vertebra-compare-v44.png`, `/tmp/ai-pm-exact-spine/panel-projection-compare-v44.png`, `/tmp/ai-pm-exact-spine/motion-strip-v44.png`
- final result: blocked

## Findings

- [P1] 顶部柱体仍未达到参考视频的一模一样
  Location: `src/components/landing-home/index.tsx` Three.js spine geometry/material.
  Evidence: `/tmp/ai-pm-exact-spine/top-vertebra-compare-v44.png` shows the implementation now keeps the pillar scroll-coupled and uses an additional reference crown layer, but the visible top still reads as a darker purple faceted mass. The source has a more legible vertical black hollow, sharper cyan/purple/gold oil-film fragments, and a cleaner right-side fin.
  Impact: the user explicitly requires the pillar to match the video exactly, so this remains blocking.
  Fix: continue with a source-frame-specific sculpting pass or a real custom modeled asset for the upper vertebra silhouette, rather than relying only on procedural lobe geometry.

- [P1] 玻璃屏投影接近方向但物理质感仍不足
  Location: `createPanelTexture` in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/panel-projection-compare-v44.png` shows warmer dirty-glass bloom and darker pores, but the source projection has sharper irregular islands, more local contrast, and less symmetrical center haze.
  Impact: the foreground card still reads as a procedural approximation next to the reference capture.
  Fix: add stronger nonuniform oil-film masks and localized bright/dark breakup while preserving AI PM copy readability.

- [P2] 滚动联动已可见，但 easing 仍未逐帧匹配
  Location: wheel/touch handlers and animation loop in `src/components/landing-home/index.tsx`.
  Evidence: `/tmp/ai-pm-exact-spine/motion-strip-v44.png` shows the pillar rotates/translates with the story cards on wheel impulse and settles into the next state. The reference mp4 still has a different camera easing curve, card orbit radius, and pillar yaw timing.
  Impact: the requested “滚动时柱子也跟随滚动” behavior is now satisfied at interaction level, but not exact-video fidelity.
  Fix: tune wheel impulse decay, carousel radius, and pillar yaw against the mp4 frame strip.

## Required Fidelity Surfaces

- Fonts and typography: AI PM product copy remains product-specific; typography is not the blocker for this pillar-focused request.
- Spacing and layout rhythm: desktop and mobile v44 captures show no new horizontal overflow; nav, hero copy, CTA, and glass card remain usable.
- Colors and visual tokens: v44 keeps the darker Active Theory-inspired palette and adds stronger smoky/oil-film treatment, but top-column highlights are still less vivid and less naturally placed than the source.
- Image quality and asset fidelity: the implementation remains procedural Three.js geometry/material/texture as requested. It is not a copied screenshot, but the custom procedural result still falls short of the visual target.
- Copy and content: AI PM labels remain intentionally different from the source portfolio page.

## Patches Made Since Previous QA Pass

- Added a custom `createReferenceSpineShardGeometry` extrusion helper for source-like top crown pieces.
- Reduced the old exposed top lobe/fin opacity so it no longer fully dominates the silhouette.
- Added a forward vertical top cavity and top crown pieces with an alpha-map-free oil material so the intended shape can render more reliably.
- Added additional dirty-glass projection fragments and localized dark pores to the main panel texture.
- Preserved scroll-coupled pillar/card movement and captured desktop default, scroll impulse, scroll settled, and mobile screenshots for v44.

## Implementation Checklist

- Keep v44 screenshots as the current evidence baseline.
- Do not mark Product Design QA passed until the upper pillar silhouette and panel refraction no longer have P1 differences.
- Consider replacing the top procedural lobe stack with a dedicated modeled/modeled-in-code asset if exact silhouette matching remains mandatory.
- Preserve current scroll-coupled motion behavior while continuing the pillar fidelity pass.
