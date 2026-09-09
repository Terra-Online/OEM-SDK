# Open Endfield Map SDK

[![Live demo](https://img.shields.io/badge/demo-sdk.opendfieldmap.org-111111?style=flat-square)](https://sdk.opendfieldmap.org/demo/)
[![GitHub](https://img.shields.io/badge/source-GitHub-24292f?style=flat-square&logo=github)](https://github.com/Terra-Online/OEM-SDK)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-fbc825?style=flat-square)](LICENSE)

Languages: English · [简体中文](docs/README.zh-CN.md) · [繁體中文](docs/README.zh-HK.md)

Open Endfield Map SDK is an easy-to-integrate map toolkit for Arknights: Endfield wikis, databases, and companion tools. Build rich, interactive Endfield maps through a lightweight integration surface, without maintaining the underlying map infrastructure and game data yourself.

Backed by [Open Endfield Map](https://github.com/Terra-Online/Atlos), the SDK provides access to our carefully maintained map sources and datasets. Historical releases are preserved alongside current data, supporting version comparison, verification, archival work, and research.

**Integrate once, stay up to date, and leave the map maintenance to us.**

## Preview

The interactive demo is available at [sdk.opendfieldmap.org/demo](https://sdk.opendfieldmap.org/demo/).

![Open Endfield Map SDK preview](docs/assets/preview.webp)


## What it provides

- **Interactive map rendering** with markers, labels, boundaries, regions, floors, clustering, themes, and configurable controls.
- **Host-defined overlays** with runtime custom points, indexed single-point lookup, and game/map horizontal coordinate conversion.
- **Framework-neutral integration** with first-class React support.
- **Versioned map sources and datasets**, covering both current and historical game releases.
- **Localization support** for map content across supported languages.
- **Managed data and asset delivery** through OEM infrastructure. You won’t need to worry about datamining, updating, or hosting map tiles and data yourself.

Most common configurations can be explored in the [**SDK Demo**](https://sdk.opendfieldmap.org/demo), which generates ready-to-use integration code as you adjust the map.

More advanced APIs are available for applications that need finer control beyond the demo. You can find them in our [Widget API Docs](docs/api.md).

## Install and configure

The primary integration package is `@opendfieldmap/sdk`:

```bash
npm install @opendfieldmap/sdk
```

Give the host element an explicit height, import the stylesheet once, and create
the widget with named options:

```html
<div id="map" style="height: 480px"></div>
```

```ts
import { createOEMWidget } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

const widget = await createOEMWidget('#map', {
  region: 'WL',
  locale: 'zh-HK',
  markerTypes: '*',
  zoom: 2,
  center: { x: 7425, y: 6257 },
});

// Later:
await widget.setOptions({ region: 'WL', markerTypes: ['gather'] });
widget.destroy();
```

By default, the SDK uses the latest stable map data maintained by Open Endfield Map. Or you can use a self-hosted tree with a compatible manifest:

```ts
const widget = await createOEMWidget('#map', {
  resources: {
    baseUrl: 'https://maps.example.com',
    manifestPath: '/channels/stable.json',
  },
  region: 'DJ',
  markerTypes: false,
});
```

For React applications:

```bash
npm install @opendfieldmap/react
```

```tsx
import { OEMWidget } from '@opendfieldmap/react';
import '@opendfieldmap/sdk/style.css';

export function MapPanel() {
  return <OEMWidget options={{ region: 'ES', markerTypes: ['crate_i'] }} style={{ height: 480 }} />;
}
```


## Package layout

| Package | Role |
| --- | --- |
| `@opendfieldmap/sdk` | Primary embeddable Widget and standard controls |
| `@opendfieldmap/map` | Lower-level framework-neutral renderer |
| `@opendfieldmap/core` | Manifest schema, resource helpers, coordinates, and point links |
| `@opendfieldmap/react` | React lifecycle wrapper for the Widget |

## Development

```bash
pnpm install
pnpm dev                 # local HMR demo at http://127.0.0.1:4173/demo/
pnpm export:atlos:dev    # refresh generated local map data
pnpm build               # build package distributions
pnpm pack:release        # write npm tarballs to artifacts/npm
pnpm build:demo          # build the Pages artifact
pnpm validate:r2         # validate a prepared/published R2 release without browser smoke tests
```
The demo build is application-only; it does not bundle map tiles or data.

## Links

- [Live SDK Demo](https://sdk.opendfieldmap.org/demo/)
- [OEM-SDK Source Repo](https://github.com/Terra-Online/OEM-SDK)
- [Widget API](docs/api.md) · [简体中文](docs/api.zh-CN.md) · [繁體中文](docs/api.zh-HK.md)
- [Static Resource Protocol](docs/cdn-design.md) · [简体中文](docs/cdn-design.zh-CN.md) · [繁體中文](docs/cdn-design.zh-HK.md)
- [Package and NPM Release Structure](docs/npm-release.md) · [简体中文](docs/npm-release.zh-CN.md) · [繁體中文](docs/npm-release.zh-HK.md)
- [Terms of Services](https://blog.opendfieldmap.org/docs/tos#intellectual-property-and-copyright)
