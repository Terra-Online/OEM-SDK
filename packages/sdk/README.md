# `@opendfieldmap/sdk`

Embeddable Open Endfield Map Widget for web applications.

```bash
npm install @opendfieldmap/sdk
```

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'Valley_4',
  floor: 'M',
  locale: 'en-US',
  markerTypes: ['crate_i', 'aurylene'],
  labels: true,
  markerClustering: true,
  boundarySource: 'oem',
  customPoints: [{
    id: 'route-start',
    position: { regionId: 'Valley_4', x: 400, z: -600, floorId: 'M' },
    style: 'framed',
    icon: '/icons/route-start.webp',
  }],
});

await widget.setOptions({ boundaries: true });
const point = await widget.loadPoint('2100500004');
widget.destroy();
```

The host element must have an explicit height. Region, floor, and scale controls are enabled by default. Import `@opendfieldmap/sdk/style.css` once in the host application.

Coordinates in `customPoints` are normalized map coordinates, with published pixels divided by `2 ** maxNativeZoom`. Atlos `markTool` uses map `[z, x]` values; `gameXZToOEMPosition()` applies the selected Atlos region transform and returns the normalized `{ x, z }` shape directly usable by a custom point.

For a large point collection, host the same JSON array separately and load it by URL:

```ts
const widget = await createOEMWidget('#map', {
  region: 'WL',
  customPointsUrl: '/data/custom-points.json',
});

await widget.loadCustomPoints('/data/another-set.json');
```

`customPoints` and `customPointsUrl` are mutually exclusive. Relative icon URLs in the JSON file resolve against that file's URL.

Host-defined points support only the Atlos `framed` (`32 × 32`, anchor `[16, 32]`) and `no-frame` (`50 × 50`, anchor `[25, 25]`) compositions. Supply the image URL through `icon`; custom point size, color, and label fields are not supported. The map click event exposes the normalized map position and the recovered game `x/z` coordinates.


All map positions use horizontal `{ x, z }` coordinates. Game positions use `{ x, y, z }`, where `y` is height; a 2D map position only recovers game `x/z`. Set `boundarySource` to `'oem'` for Atlos-drawn boundaries or `'game'` for official game level-grid boundaries.

The package uses named, typed options and is safe to import during SSR. Widget creation must run in a browser. Tiles and map data are selected through a schema v1 release manifest and loaded from the configured static origin.

See the repository documentation for the complete API, resource protocol, localized guides, and release workflow.

## Behavior API

`widget.map` is the same public `OEMMapAPI` returned by `createOEM()`. Map commands and Widget updates share one queue and state; writes should be awaited. Custom point reads return copies, while upsert/removal operate by ID:

```ts
await widget.map.upsertCustomPoints([{
  id: 'saved', position: { space: 'map', regionId: 'Valley_4', x: 400, z: -600 },
  style: 'framed', icon: '/pin.webp',
}]);
await widget.map.removeCustomPoints(['saved']);

widget.on('click', snapshot => {
  localStorage.setItem('position', JSON.stringify(snapshot));
});
widget.on('pointclick', event => {
  event.preventDefault(); // Host application handles this activation.
  console.log(event.source, event.point, event.coordinates);
});
```

Click snapshots carry map/pixel/game units, release context and resolution status; game coordinates can be `null`. No point is created merely by subscribing. For optional click-to-add behavior:

```ts
import { createClickPointTool } from '@opendfieldmap/sdk';
const tool = createClickPointTool(widget.map, { mode: 'multiple', style: 'framed', icon: '/pin.webp' });
await tool.clear(); // Only the tool's own points.
tool.destroy();    // Stops adding points, retaining existing points.
```

This replaces `setClickPointMode()` / `clearClickPoints()`. Map/view/layer/point writes now return promises. Core coordinate conversions can be used without a map instance. Official fonts, colors, marker dimensions and anchors remain fixed; Leaflet and arbitrary renderers are not exposed.
