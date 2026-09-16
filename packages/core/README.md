# @opendfieldmap/core

Data contracts, release manifest loading, coordinate conversions and errors for **Open Endfield Map**, an Arknights: Endfield map toolkit. Use this package for data and coordinate work without creating a map. For a ready-to-use map, install [@opendfieldmap/sdk](https://www.npmjs.com/package/@opendfieldmap/sdk).

```bash
npm install @opendfieldmap/core
```

```ts
import {
  defaultOEMResources,
  loadOEMManifest,
  getOEMRegion,
  pixelToMapPosition,
  mapToPixelPosition,
} from '@opendfieldmap/core';

const manifest = await loadOEMManifest(defaultOEMResources);
const region = getOEMRegion(manifest, manifest.defaultRegionId);
const pixel = { space: 'pixel' as const, regionId: region.id, x: 3200, z: -4800 };
const position = pixelToMapPosition(pixel, region);
const restored = mapToPixelPosition(position, region);
console.log(position, restored);
```

## Coordinates and compatibility

- Published pixel positions use `space: 'pixel'`; normalized map positions use `space: 'map'`. Map coordinates equal published pixels divided by `2 ** region.maxNativeZoom`.
- Both use horizontal `{ x, z }`, not latitude/longitude. Game `y` is height and cannot be recovered from a 2D location. Uncalibrated map distances must not be described as meters.
- `OEMPixelPosition` and `OEMNormalizedMapPosition` require their space tags. The preferred named conversion functions return tagged records in 0.3.0-beta; account for this when comparing or serializing whole objects.
- Legacy `OEMPosition`, `OEMMapPosition`, `toOEMMapPosition()` and `fromOEMMapPosition()` remain supported with their previous shapes.
- Keep the region, optional subregion and release context with saved locations. A conversion must use the corresponding manifest; coordinates from different releases are not automatically interchangeable.

`loadOEMManifest()` reads trusted release data and checks schema compatibility without scanning every record. `validateOEMManifest()` is available for explicit diagnostics. Fetch helpers accept an `AbortSignal`; `OEMError` exposes error codes and context.

ESM with TypeScript declarations; safe to import during SSR. Coordinate functions require no DOM or renderer. Manifest loading requires an environment with `fetch`.

## Documentation

- [API and coordinates](https://github.com/Terra-Online/OEM-SDK/blob/main/docs/api.md)
- [0.3 configuration and compatibility guide (Chinese)](https://github.com/Terra-Online/OEM-SDK/blob/main/docs/config-governance.zh-CN.md)
- [Source and issues](https://github.com/Terra-Online/OEM-SDK)

License: AGPL-3.0-only. Map data and image/font assets retain their applicable upstream terms; see the repository and release metadata.
