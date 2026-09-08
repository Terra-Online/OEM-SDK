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
});

await widget.setOptions({ boundaries: true });
widget.destroy();
```

The host element must have an explicit height. Region, floor, and scale controls are enabled by default. Import `@opendfieldmap/sdk/style.css` once in the host application.

The package uses named, typed options and is safe to import during SSR. Widget creation must run in a browser. Tiles and map data are selected through a schema v1 release manifest and loaded from the configured static origin.

See the repository documentation for the complete API, resource protocol, localized guides, and release workflow.
