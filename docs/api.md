# Widget API

Languages: English · [简体中文](api.zh-CN.md) · [繁體中文（香港）](api.zh-HK.md)

## `createOEMWidget`

```ts
createOEMWidget(
  container: string | HTMLElement,
  options?: OEMWidgetOptions,
): Promise<OEMWidget>
```

Creates one Widget in an element or selector. The element must exist and have an explicit height. A container can host only one Widget at a time.

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'Valley_4',
  locale: 'en-US',
  markerTypes: ['crate_i'],
  customPoints: [{
    id: 'route-start',
    position: { regionId: 'Valley_4', x: 400, z: -600, floorId: 'M' },
    style: 'framed',
    icon: '/icons/route-start.webp',
  }],
});
```

Importing the module is SSR-safe; call `createOEMWidget()` only in a browser.

## Content and View Options

These options can be passed at creation and later to `widget.setOptions()`.

| Option | Type | Default |
| --- | --- | --- |
| `region` | Region ID or `VL`, `WL`, `DJ`, `ES` | Manifest default |
| `subregion` | Published subregion ID or `null` | `null` |
| `floor` | Published floor ID: `M`, `L1`–`L4`, `B1`–`B4` | `M` |
| `locale` | Locale published by the manifest | Browser locale, then manifest fallback |
| `markerTypes` | Type-key array, `'*'`, or `false` | `false` |
| `customPoints` | `OEMCustomPoint[]` | `[]` |
| `customPointsUrl` | URL of an `OEMCustomPoint[]` JSON file | None |
| `labels` | `boolean` | `true` |
| `boundaries` | `boolean` | `false` |
| `boundarySource` | `'oem' | 'game'` | `'oem'` |
| `markerClustering` | `boolean` | `true` |
| `zoom` | Finite number within the region range | Region or subregion preset |
| `center` | `{ x: number; z: number }` | Region or subregion preset |

`markerTypes: '*'` loads all published marker types. An empty array or `false` disables marker data. Marker type keys remain data-driven and are not restricted to a package-level union.

Coordinates for view and published points use the selected region's published pixel coordinate system, not longitude and latitude. Atlos `markTool` exports `pos` as `[z, x]` in map coordinates. Custom-point positions and map-click results use normalized horizontal map coordinates `{ x, z }`: the published pixel values divided by `2 ** maxNativeZoom`.

```ts
interface OEMCustomPoint {
  id: string;
  position: OEMMapPosition;
  style: 'framed' | 'no-frame';
  icon: string;
}
```

```ts
interface OEMClickPointOptions {
  mode: 'multiple' | 'single';
  style: 'framed' | 'no-frame';
  icon: string;
}
```

`OEMMapPosition` uses horizontal `{ x, z }` fields. `x` increases to the right and `z` is the map's second horizontal axis. For example, published `{ x: 3200, z: -4800 }` becomes normalized map `{ x: 400, z: -600 }`, displayed as `Map (x 400, z -600)`. Game `y` is the height axis and is not inferred from a 2D map position.

`subregionId` is optional metadata that identifies the Atlos subregion containing the point. It corresponds to Atlos `markTool`'s `subregId` (for example, `VL_1`). Preserve it when converting a markTool result; it selects a subregion-specific game transform. If it is omitted, conversion falls back to the region transform, which is only correct where the region has no subregion-specific transform. Map clicks infer `subregionId` from the selected subregion or its published bounds when possible.

`style` is limited to the two native Atlos marker compositions. `framed` uses a `32 × 32` pixel marker with anchor `[16, 32]`; `no-frame` uses a `50 × 50` pixel marker with anchor `[25, 25]`. `icon` is the image URL rendered by that composition. Custom marker size, color, and label fields are not supported.

Use `customPointsUrl` for a large point set instead of embedding it in `createOEMWidget()`. The URL must return the same JSON array accepted by `customPoints`; relative icon URLs are resolved against the JSON URL. `customPoints` and `customPointsUrl` are mutually exclusive. Calling `setCustomPoints()` or `loadCustomPoints()` replaces the current custom-point set.

## Creation Options

| Option | Type | Default |
| --- | --- | --- |
| `resources` | `OEMResources` | Open Endfield Map static origin |
| `manifest` | `OEMManifest` | Loaded from `resources` |
| `showRegionSelector` | `boolean` | `true` |
| `showFloorSelector` | `boolean` | `true` |
| `showScaleBar` | `boolean` | `true` |
| `lockDrag` | `boolean` | `false` |
| `lockZoom` | `boolean` | `false` |
| `theme` | `'light' | 'dark'` | `'light'` |
| `className` | `string` | None |
| `signal` | `AbortSignal` | None |
| `onReady` | `(widget: OEMWidget) => void` | None |
| `onStateChange` | `(state: OEMWidgetState) => void` | None |
| `onError` | `(error: Error) => void` | None |

Interaction locks affect user input only. Programmatic updates remain available. Creation options are not accepted by `setOptions()`.

## Widget Handle

```ts
interface OEMWidget {
  readonly destroyed: boolean;
  getState(): OEMWidgetState;
  setOptions(options: OEMWidgetConfig): Promise<void>;
  setCustomPoints(points: readonly OEMCustomPoint[]): void;
  setClickPointMode(options: OEMClickPointOptions | null): void;
  clearClickPoints(): void;
  loadCustomPoints(url: string): Promise<void>;
  clearCustomPoints(): void;
  getPoint(pointId: string): OEMPoint | undefined;
  loadPoint(pointId: string): Promise<OEMPoint | undefined>;
  resize(): void;
  destroy(): void;
}
```

`setClickPointMode()` enables automatic point creation from map clicks. Pass `mode: 'multiple'` to keep every click, or `mode: 'single'` to keep only the latest click-created point. `style` and `icon` select the marker composition. Pass `null` to disable the mode; `clearClickPoints()` removes click-created points without removing points supplied through `setCustomPoints()`.

- `getState()` returns a defensive copy of the resolved state.
- `setOptions()` applies partial content or view updates in call order.
- `resize()` refreshes map dimensions after a host layout change.
- `destroy()` releases the Widget and is safe to call more than once.

`customPoints` replaces the host-defined point set. Each point uses normalized map coordinates, with published pixel values divided by `2 ** maxNativeZoom`. `style` is limited to Atlos's `framed` and `no-frame` compositions, and `icon` is the image URL used by the selected composition. Custom points are not clustered and remain available when the region or floor changes. The top-level `labels` option controls the published place-name layer; it does not add labels to custom points. Use `loadCustomPoints(url)` when the point set is hosted separately.

`getPoint()` reads a point already loaded by the marker layer. `loadPoint()` uses `point-index.json` to fetch only the point shard containing the requested published point ID, and returns `undefined` when the ID is not found. Both methods return the point's published map position and retained raw game position.

Methods other than `destroy()` throw after the Widget has been destroyed.

The state contains `regionId`, `subregionId`, `floorId`, `locale`, `markerTypes`, `labels`, `boundaries`, `boundarySource`, `markerClustering`, `zoom`, and `center`. The `center` object uses horizontal `{ x, z }` coordinates; the Demo configuration labels these axes `X` and `Z`.

`boundarySource: 'oem'` loads Atlos-drawn subregion boundaries. `boundarySource: 'game'` loads official game level-grid boundaries generated from `AKEData` and rendered with the same boundary layer. Game boundary data is available only for regions included in the current static release.

## Resources

```ts
interface OEMResources {
  baseUrl: string;
  manifestPath: string;
}
```

```ts
const widget = await createOEMWidget('#map', {
  resources: {
    baseUrl: 'https://maps.example.com',
    manifestPath: '/channels/stable.json',
  },
});
```

When `resources` is omitted, the SDK follows `https://data.opendfieldmap.org/channels/stable.json` and automatically loads the latest release. Set `manifestPath` explicitly to pin another compatible schema v1 manifest. Manifest asset paths are relative to `baseUrl`, tile requests receive per-file `v` cache keys, and static requests do not include credentials.

## URL Adapter

`parseOEMUrlState()` supports integrations that already store map state in a URL. New integrations should prefer named options.

```ts
import { createOEMWidget, parseOEMUrlState } from '@opendfieldmap/sdk';

const options = parseOEMUrlState('?r=VL&f=crate_i&s=VL_7&layer=M&z=2&cx=400&cz=-600');
const widget = await createOEMWidget('#map', options);
```

Supported keys are `r`, `s`, `f`, `l`, `layer`, `labels`, `names`, `boundaries`, `boundary`, `boundarySource`, `cluster`, `z`, `cx`, and `cz`. `z` is zoom; `cx` and `cz` are the horizontal map center coordinates.

## Lower-Level Renderer

`@opendfieldmap/map` exports `createOEM()` and the framework-neutral `OEM` interface. It provides view, region, floor, locale, feature, filtering, custom points, point lookup, clustering, resize, event, and lifecycle methods without mounting Widget controls.

## Coordinates

```ts
import { oemToGamePosition } from '@opendfieldmap/sdk';

const horizontal = oemToGamePosition(
  { regionId: 'Valley_4', x: 3200.0568, z: -4502.6376, floorId: 'M' },
  manifest.regions.find((region) => region.id === 'Valley_4')!,
);
// { x: -255.3423, z: -176.8946 }
```

`gameToOEMPosition()` and `oemToGamePosition()` first apply the selected Atlos region transform, then convert between published pixels and normalized map coordinates. `gameXZToOEMPosition()` returns normalized map coordinates, so it can be used directly for a custom point. `mapToGameXZPosition()` accepts normalized map coordinates. For `WL_2` and `WL_4`, include `subregionId` so the corresponding Wuling transform is selected. A 2D map position can recover game `x/z`; game height `y` is intentionally not reconstructed.

The lower-level renderer emits `click` with both coordinate forms. It also supports the same click-point methods as the Widget:

```ts
map.on('click', ({ position, game }) => {
  console.log(position); // normalized map coordinates
  console.log(game); // { x, z } in game coordinates
});
```

The Widget exposes the same event with `widget.on('click', handler)`.

Use `@opendfieldmap/sdk` for the standard embeddable experience and `@opendfieldmap/map` when the host owns its control layer.
