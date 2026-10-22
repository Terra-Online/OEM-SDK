# Internal Canvas renderer

This directory follows Atlos `mapCore/canvas`, with SDK CSS class names and interaction/loading compatibility kept local. These modules are implementation details, not a public rendering or styling API.

- `markerViewport`: Leaflet membership and semantic event nodes.
- `canvasMarkerSurface`: scene lifecycle, hit testing, visibility, display density and drawing coordination.
- `canvasViewport`: bounded camera padding. Small pans reuse the retained surface; zoom, larger moves and display changes repaint it. Backing area stays within 150% of the viewport at the existing render density.
- `canvasMarkerPaint`: official artwork, typography and cached raster sprites. Settled opaque pulses reuse frame/foreground artwork and a shared ring clock; fades and geometry changes retain the original composite path. Sprite density is independent of viewport density; small sprites use at least 2× sampling, while the viewport uses `max(2, devicePixelRatio)`. Hit testing remains in CSS pixels.
- `canvasSpriteBatch`: instanced GPU composition into a scratch canvas sized to the damaged rectangle. The visible Canvas2D backing store retains the complete image; a clipped `copy` replaces the damaged pixels, including transparency, without copying the whole viewport each frame. No CPU pixel readback is used in rendering. The surface owns the pure Canvas2D fallback.
- `canvasMarkerMotion`: shared animation channels without shared mutable marker state.
- `clusterGroup`, `spatialClusters`, `canvasMarkerCluster`: spatial grouping and expansion to authored positions.

Port renderer optimizations without importing main-site UI or changing SDK interactions. Display changes invalidate cached poses without replacing marker identities or restarting animation channels. Decoded images update the existing loading placeholders; SDK link and keyboard dispatch stay unchanged. A bounded weak index reuses settled artwork still owned by visible entries after eviction from the strong cache.

The connected semantic tree is clipped under the map's event container, outside the moving Leaflet pane. Both elements and their pseudo-elements have CSS animation/transition work disabled; visible animation belongs exclusively to the Canvas scene. Keep keyboard and delegated link events connected when changing this containment boundary.

Damage bounds include shadows and decorations. All intersecting points are drawn in their existing order, including static points behind/above a pulse. Layer splitting is restricted to group opacity 1 because independently fading overlapping parts would change their appearance. Per-part atlas bindings must be released on representation changes, visibility changes and removal.

After `pnpm build`, run `node scripts/verify-canvas.mjs <baseline-git-ref>` for a browser comparison of the baseline Canvas modules and the working tree with identical SDK code, fixture data, dependencies and styles. It covers 1k/5k/10k spread points and 5k dense points, Canvas2D/WebGL2, one warmup and five alternating samples. Results and screenshots stay in ignored `artifacts/canvas-performance/`. `BENCH_SAMPLES=0` runs only the interaction, density, visibility and fallback regressions. These fixtures measure local rendering, not CDN loading or the complete main site.
