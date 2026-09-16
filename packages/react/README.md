# @opendfieldmap/react

React lifecycle adapter for the **Open Endfield Map** Widget for Arknights: Endfield. Supports React 18 and 19, StrictMode, typed refs, dynamic configuration and independent event props.

```bash
npm install @opendfieldmap/react @opendfieldmap/sdk
```

Install React and your React renderer in the host application. The SDK is a direct dependency in this example because the application imports its stylesheet and handle type.

```tsx
import { useRef } from 'react';
import { OEMWidget } from '@opendfieldmap/react';
import type { OEMWidget as OEMWidgetHandle } from '@opendfieldmap/sdk';
import '@opendfieldmap/sdk/style.css';

export function MapPanel() {
  const ref = useRef<OEMWidgetHandle>(null);
  return (
    <>
      <button onClick={() => void ref.current?.map.setFloor('M').catch(console.error)}>Main floor</button>
      <OEMWidget
        ref={ref}
        style={{ height: 480 }}
        options={{
          view: { region: 'VL' },
          layers: { markerTypes: ['crate_i'], labels: true },
          controls: { showScaleBar: true },
        }}
        onMapClick={(snapshot) => console.log(snapshot.mapPosition)}
        onError={console.error}
      />
    </>
  );
}
```

## Lifecycle and updates

- The ref is `null` until ready and is cleared on unmount/destruction. `onReady(widget)` receives the handle directly; React may not yet have committed the ref when the callback runs.
- Dynamic options use the same semantic comparison as the SDK. Equivalent arrays/centers do not resubmit commands. Use immutable props; omitted/undefined fields preserve state rather than resetting defaults. Legacy flat options remain supported.
- Theme, interaction locks and official control visibility/layout now update dynamically. The ref's `map` is the same public API used by the Widget controls.
- `resources`, `manifest` and `signal` are fixed per mount. Change the React `key` to replace the data source/release. The adapter cancels pending work and destroys its Widget on cleanup.
- Outer `style`/`className` configure the host wrapper's layout. They do not provide a public override contract for official map visuals. The default wrapper height is 480px.

Event props include `onMapClick`, `onPointClick`, `onPointEnter`, `onPointLeave`, `onViewChange`, `onRegionChange`, `onFloorChange`, `onCustomPointsChange`, `onResourceChange`, `onLoading`, `onLoad` and `onDestroy`, plus `onReady`, `onStateChange` and `onError`. Callbacks read the latest props; top-level ready/state/error callbacks take precedence over their legacy `options` counterparts.

Event subscriptions start after creation; initial loading events are not replayed. Use `onReady` for creation completion. Component cleanup unsubscribes before destroying, so `onDestroy` covers destruction while the component remains mounted. Merely listening for clicks never creates points. For host point handling, call `event.preventDefault()` in `onPointClick` to replace default link behavior.

ESM with TypeScript declarations; SSR import is supported and the Widget is created in a browser effect. In React Server Component applications, use this component within a client boundary.

## Documentation

- [Widget and behavior API](https://github.com/Terra-Online/OEM-SDK/blob/main/docs/api.md)
- [0.3 configuration and compatibility guide (Chinese)](https://github.com/Terra-Online/OEM-SDK/blob/main/docs/config-governance.zh-CN.md)
- [Live demo](https://sdk.opendfieldmap.org/demo/)
- [Source and issues](https://github.com/Terra-Online/OEM-SDK)

License: AGPL-3.0-only. Official visual presets remain fixed; map data and image/font assets retain their applicable upstream terms.
