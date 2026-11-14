# Internal behavior overlay

Ported from Atlos `component/map/behaviorOverlay` and `styles/global.scss` at
`082c438`. The tuple decoder lives in `@opendfieldmap/core`; export validation
uses that same decoder. Authored `[z, x]` points are normalized map coordinates.

The scene, spline interpolation, reveal timeline and directional highlight
follow the main site. SDK loading and selection stay instance-local, use the
configured resource origin, and never move the camera or change point links.
The Canvas module is loaded only when a selected point has behavior records.
No main-site selection, user progress or location synchronization store is used.
