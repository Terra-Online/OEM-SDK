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
| `labels` | `boolean` | `true` |
| `boundaries` | `boolean` | `false` |
| `markerClustering` | `boolean` | `true` |
| `zoom` | Finite number within the region range | Region or subregion preset |
| `center` | `{ x: number; y: number }` | Region or subregion preset |

`markerTypes: '*'` loads all published marker types. An empty array or `false` disables marker data. Marker type keys remain data-driven and are not restricted to a package-level union.

Coordinates use the selected region's published pixel coordinate system, not longitude and latitude.

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
  resize(): void;
  destroy(): void;
}
```

- `getState()` returns a defensive copy of the resolved state.
- `setOptions()` applies partial content or view updates in call order.
- `resize()` refreshes map dimensions after a host layout change.
- `destroy()` releases the Widget and is safe to call more than once.

Methods other than `destroy()` throw after the Widget has been destroyed.

The state contains `regionId`, `subregionId`, `floorId`, `locale`, `markerTypes`, `labels`, `boundaries`, `markerClustering`, `zoom`, and `center`.

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

The selected channel must resolve to a compatible schema v1 manifest. Manifest asset paths are relative to `baseUrl`, and static requests do not include credentials.

## URL Adapter

`parseOEMUrlState()` supports integrations that already store map state in a URL. New integrations should prefer named options.

```ts
import { createOEMWidget, parseOEMUrlState } from '@opendfieldmap/sdk';

const options = parseOEMUrlState('?r=VL&f=crate_i&s=VL_7&layer=M&z=2');
const widget = await createOEMWidget('#map', options);
```

Supported keys are `r`, `s`, `f`, `l`, `layer`, `labels`, `names`, `boundaries`, `boundary`, `cluster`, `z`, `x`, and `y`.

## Lower-Level Renderer

`@opendfieldmap/map` exports `createOEM()` and the framework-neutral `OEM` interface. It provides view, region, floor, locale, feature, filtering, clustering, resize, event, and lifecycle methods without mounting Widget controls.

Use `@opendfieldmap/sdk` for the standard embeddable experience and `@opendfieldmap/map` when the host owns its control layer.
