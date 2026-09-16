# @opendfieldmap/map

Framework-independent map runtime for **Open Endfield Map**, an Arknights: Endfield map toolkit. Use its public behavior API to build your own host controls while retaining official map and marker visuals. For built-in region, floor and scale controls, use [@opendfieldmap/sdk](https://www.npmjs.com/package/@opendfieldmap/sdk).

```bash
npm install @opendfieldmap/map
```

Create a browser container with an explicit height, for example `<div id="map" style="height:480px"></div>`, and import the stylesheet once:

```ts
import { createOEM } from '@opendfieldmap/map';
import '@opendfieldmap/map/style.css';

const map = await createOEM('#map', {
  resources: {
    baseUrl: 'https://data.opendfieldmap.org',
    manifestPath: '/channels/stable.json',
  },
  regionId: 'Valley_4',
  features: { points: true, labels: true },
  pointFilter: { types: ['crate_i'] },
});

await map.update({
  view: { floor: 'M' },
  layers: { markerTypes: ['crate_i', 'aurylene'] },
  interaction: { lockZoom: false },
});

const unsubscribe = map.on('click', (snapshot) => {
  localStorage.setItem('saved-position', JSON.stringify(snapshot));
});

// When the host view is removed:
unsubscribe();
map.destroy();
```

## Behavior and configuration

`createOEM()` returns `OEMMapAPI`: view/region/floor commands, layer and interaction controls, custom-point collection commands, published-point lookup/loading, resource state/retry, events and coordinate conversion. It does not expose a Leaflet instance. Published markers use the Canvas implementation; rendering details are internal.

The low-level creation contract remains `OEMOptions` (`regionId`, `floorId`, `features`, `pointFilter`, and the original `OEMView`). Grouped `view/layers/interaction` configuration applies to `map.update()`; do not substitute the grouped update shape for the constructor's `view`.

Updates share one queue. Await writes before reading their completed state. Defined flat fields override grouped fields; omitted/undefined fields preserve state, arrays replace, and only `subregion` accepts `null` to clear. Optional layer failures are reported through resource state and errors; check `getResourceState()` and use `retry()` as needed. Destroying aborts instance work; repeated `destroy()` is safe.

Click subscriptions do not add points. Snapshots contain tagged map/pixel coordinates, available game coordinates, release context and resolution status; game coordinates can be `null`. Subscribe to `pointclick` separately and call `preventDefault()` to replace a point's default link action.

Custom points use normalized map `{ x, z }` positions and support image URLs with official `framed` or `no-frame` styles. View centers use published pixels. Official colors, fonts, dimensions and anchors are fixed; there are no public renderer or theme-variable hooks. Official light/dark themes remain supported.

ESM with TypeScript declarations; import is SSR-safe, creation requires a browser. Dispose the instance on unmount. Static content is loaded from the configured manifest/CDN, separately from the npm package.

## Documentation

- [Complete behavior API](https://github.com/Terra-Online/OEM-SDK/blob/main/docs/api.md)
- [0.3 configuration and compatibility guide (Chinese)](https://github.com/Terra-Online/OEM-SDK/blob/main/docs/config-governance.zh-CN.md)
- [Live Widget demo](https://sdk.opendfieldmap.org/demo/)
- [Source and issues](https://github.com/Terra-Online/OEM-SDK)

License: AGPL-3.0-only. Map data and image/font assets retain their applicable upstream terms.
