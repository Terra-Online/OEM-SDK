import { createOEMWidget } from '@opendfieldmap/sdk';
import { OEMWidget } from '@opendfieldmap/react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const image = '/pixel.svg';
const fixture = (id: string) => fetch(`/fixture/${id}`).then(response => response.json());
const nativeFetch = window.fetch.bind(window);
const requests: string[] = [];
window.fetch = (...args) => { requests.push(String(args[0])); return nativeFetch(...args); };

(window as any).runBenchmark = async (scenario: string) => {
  const data = await fixture(scenario);
  requests.length = 0;
  const host = document.createElement('div');
  host.style.cssText = 'width:960px;height:640px';
  document.body.append(host);
  const errors: string[] = [];
  const options = { ...data.options, manifest: data.manifest, resources: { baseUrl: location.origin, manifestPath: '/manifest.json' }, onError: (e: Error) => errors.push(e.message) };
  const longTasks: number[] = [];
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
  observer.observe({ type: 'longtask' });
  let widget: any;
  let root: ReturnType<typeof createRoot> | undefined;
  const started = performance.now();
  if (scenario === 'react-url') {
    widget = await new Promise(resolve => { root = createRoot(host); root.render(createElement(OEMWidget, { options: { ...options, onReady: resolve } })); });
  } else widget = await createOEMWidget(host, options);
  const readyMs = performance.now() - started;
  await frame(); await frame();
  const paintMs = performance.now() - started;
  // Allow the old React wrapper's second request to finish; excluded from ready/paint timing.
  if (scenario === 'react-url') await new Promise(resolve => setTimeout(resolve, 100));
  const initialRequests = [...requests];
  const floorStart = performance.now();
  await widget.setOptions({ floor: data.floor });
  const floorMs = performance.now() - floorStart;
  await frame();
  let appendMs: number | null = null;
  let appendMethod: string | null = null;
  if (data.points) {
    const point = { id: 'added', position: { regionId: 'Valley_4', x: 500, z: 500, floorId: 'M' }, style: 'framed', icon: image };
    const t = performance.now();
    if (widget.map?.upsertCustomPoints) { await widget.map.upsertCustomPoints([point]); appendMethod = 'upsertCustomPoints'; }
    else { widget.setCustomPoints([...data.points, point]); appendMethod = 'setCustomPoints'; }
    appendMs = performance.now() - t;
  }
  await frame(); await frame();
  const markers = host.querySelectorAll('.frameMarkerIcon,.noFrameMarkerIcon').length;
  const destroyStart = performance.now();
  if (root) root.unmount(); else widget.destroy();
  const destroyMs = performance.now() - destroyStart;
  const leftoverRoots = host.querySelectorAll('.mapRoot,.oemWidget').length;
  widget = null; root = undefined; host.remove();
  await frame(); await frame(); observer.disconnect();
  return { readyMs, paintMs, floorMs, appendMs, appendMethod, destroyMs, initialRequests: initialRequests.length,
    customRequests: initialRequests.filter(url => url.includes('/custom/')).length, longTaskCount: longTasks.length,
    longTaskMs: longTasks.reduce((a,b) => a+b,0), markers, leftoverRoots, errors };
};
(window as any).benchmarkReady = true;
