# Open Endfield Map SDK

Languages: English · [简体中文](docs/README.zh-CN.md) · [繁體中文（香港）](docs/README.zh-HK.md)

Open Endfield Map SDK (`@opendfieldmap/sdk`) provides an embeddable Endfield map for wikis, guides, databases, and other web applications. It renders the map, markers, place names, boundaries, and compact map controls without requiring the full Open Endfield Map application.

## Install

```bash
npm install @opendfieldmap/sdk
```

The package is ESM-only and includes TypeScript declarations. Import its stylesheet once in the host application.

## Quick Start

Give the host element an explicit height, then create a Widget with named options:

```html
<div id="map" style="height: 480px"></div>
```

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'Valley_4',
  subregion: null,
  floor: 'M',
  locale: 'en-US',
  markerTypes: ['crate_i', 'aurylene'],
  labels: true,
  boundaries: false,
  markerClustering: true,
  zoom: 2,
  center: { x: 3000, y: 5000 },
  showRegionSelector: true,
  showFloorSelector: true,
  showScaleBar: true,
  lockDrag: false,
  lockZoom: false,
});

widget.destroy();
```

All options are optional. Region, floor, and scale controls are shown by default. Dragging and zooming are enabled, marker clustering is enabled, boundaries are hidden, and marker data is disabled until `markerTypes` is provided.

Point markers open their canonical `https://oem.re/<token>` pages. The Widget does not include the main-site sidebar or application state.

| Property | Type and accepted values | Default |
| --- | --- | --- |
| `region` | `Valley_4`, `Wuling`, `Dijiang`, `Weekraid_1`, or the aliases `VL`, `WL`, `DJ`, `ES` | The manifest default region (`Valley_4` in the current export) |
| `subregion` | A subregion ID belonging to the selected region, or `null` | `null` |
| `floor` | `M`, `L1`–`L4`, or `B1`–`B4` when published for the region | `M` |
| `locale` | A locale published in the manifest; the current type includes `en-US`, `zh-CN`, `zh-HK`, `ja-JP`, `ko-KR`, `ru-RU`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `id-ID`, `pt-BR`, `th-TH`, and `vi-VN` | Closest browser locale, then the manifest fallback (`en-US`) |
| `markerTypes` | An array of manifest type keys, `'*'` for all, or `false` for none | No marker data (`false`) |
| `labels` | `true` or `false` | `true` |
| `boundaries` | Shows published subregion polygons and rectangular fallbacks | `false` |
| `markerClustering` | Groups nearby markers of the same eligible type using Atlos clustering rules | `true` |
| `zoom` | A finite number, clamped to the selected region range | Region preset |
| `center` | `{ x: number, y: number }` in region pixel coordinates | Region or subregion preset |

## Runtime Updates

Content and view options can be updated without replacing the Widget:

```ts
await widget.setOptions({
  region: 'Wuling',
  subregion: 'WL_1',
  floor: 'M',
  markerTypes: ['gather'],
  boundaries: true,
});

const state = widget.getState();
widget.resize();
widget.destroy();
```

Control visibility, interaction locks, resources, theme, and lifecycle callbacks are creation options. Recreate the Widget when those options need to change.

## React

```bash
npm install @opendfieldmap/react
```

```tsx
import { OEMWidget } from '@opendfieldmap/react';
import '@opendfieldmap/sdk/style.css';

export function MapPanel() {
  return (
    <OEMWidget
      options={{ region: 'Valley_4', markerTypes: ['crate_i'] }}
      style={{ height: 480 }}
    />
  );
}
```

## Architecture

```text
Host application
  ├─ @opendfieldmap/sdk      Widget lifecycle and controls
  │    ├─ @opendfieldmap/map   Framework-neutral renderer
  │    └─ @opendfieldmap/core  Manifest, resources, and coordinates
  └─ @opendfieldmap/react    Optional React lifecycle wrapper

Static origin
  └─ channel → release manifest → versioned map resources
```

- `@opendfieldmap/sdk` is the primary integration package.
- `@opendfieldmap/map` exposes the lower-level `OEM` renderer for custom integrations.
- `@opendfieldmap/core` contains shared protocol types and resource utilities.
- `@opendfieldmap/react` wraps Widget creation, updates, and cleanup.

The runtime packages contain code, styles, and control assets. Tiles and map data are loaded from the configured static origin.

## Resources

The default resource origin is `https://data.opendfieldmap.org`. A complete compatible static tree can also be hosted elsewhere:

```ts
const widget = await createOEMWidget('#map', {
  resources: {
    baseUrl: 'https://maps.example.com',
    manifestPath: '/channels/stable.json',
  },
});
```

The channel selects a schema v1 release manifest. The manifest then resolves all versioned marker, label, boundary, tile, and optional font resources. Consumers do not need to construct individual asset URLs.

## Development

```bash
pnpm install
pnpm dev
```

Run the complete local verification after implementation changes:

```bash
pnpm check
```

Create release-candidate npm tarballs with:

```bash
pnpm pack:release
```

The repository does not publish npm packages or change external infrastructure automatically.

## Documentation

- [Widget API](docs/api.md)
- [Static resource protocol](docs/cdn-design.md)
- [Package and release structure](docs/npm-release.md)

The SDK source is licensed under AGPL-3.0-only. Static game resources and third-party assets may have separate terms.
