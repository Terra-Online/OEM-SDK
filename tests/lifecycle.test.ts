// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { createOEM } from '@opendfieldmap/map';
import { createOEMWidget } from '@opendfieldmap/sdk';
import { OEMWidget } from '@opendfieldmap/react';
import { createManifest, deferred, json } from './fixtures';

const resources = { baseUrl: 'https://data.example', manifestPath: '/manifest.json' };
let host: HTMLDivElement;
const handles: { destroy(): void }[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  host = document.createElement('div'); host.style.height = '480px'; document.body.append(host);
  fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/labels.json') ? json([]) : json({}));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  vi.unstubAllGlobals(); document.body.replaceChildren();
});
const keep = <T extends { destroy(): void }>(instance: T): T => { handles.push(instance); return instance; };

describe('creation ownership', () => {
  it('allows an immediate remount after cancelling creation and ignores late cleanup', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const old = createOEMWidget(host, { resources, signal: controller.signal, labels: false });
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    expect(host.children).toHaveLength(0);
    const current = keep(await createOEMWidget(host, { manifest: createManifest(), labels: false }));
    pending.resolve(json(createManifest()));
    await rejected;
    expect(host.querySelectorAll('.oemWidget')).toHaveLength(1);
    expect(current.destroyed).toBe(false);
    await expect(createOEMWidget(host, { manifest: createManifest(), labels: false })).rejects.toThrow('already hosts');
  });

  it('mounts exactly one map under React StrictMode', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(host); const ready = vi.fn(); const error = vi.fn();
    try {
      await act(async () => { root.render(createElement(StrictMode, null, createElement(OEMWidget, {
        options: { manifest: createManifest(), labels: false, onReady: ready, onError: error },
      }))); });
      await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
      expect(host.querySelectorAll('.mapRoot')).toHaveLength(1);
      expect(error).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); }
    expect(host.querySelectorAll('.mapRoot')).toHaveLength(0);
  });

  it('does not download initial custom points twice in React', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    fetchMock.mockResolvedValue(json([]));
    const root = createRoot(host); const ready = vi.fn();
    try {
      await act(async () => root.render(createElement(OEMWidget, { options: {
        manifest: createManifest(), labels: false, customPointsUrl: '/custom.json', onReady: ready,
      } })));
      await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/custom.json'))).toHaveLength(1);
    } finally { await act(async () => root.unmount()); }
  });

  it('unmounts React while its manifest request is pending', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
    const root = createRoot(host); const ready = vi.fn(); const error = vi.fn();
    await act(async () => root.render(createElement(OEMWidget, { options: { resources, onReady: ready, onError: error } })));
    await act(async () => root.unmount());
    await act(async () => pending.resolve(json(createManifest())));
    expect(host.children).toHaveLength(0);
    expect(ready).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('does not report cancelled prop updates after React unmounts', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(host); const error = vi.fn(); const ready = vi.fn();
    const manifest = createManifest();
    await act(async () => root.render(createElement(OEMWidget, { options: { manifest, labels: false, onReady: ready, onError: error } })));
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
    await act(async () => root.render(createElement(OEMWidget, { options: { manifest, labels: true, onError: error } })));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => root.unmount());
    expect(error).not.toHaveBeenCalled();
    await act(async () => pending.resolve(json([])));
    expect(error).not.toHaveBeenCalled();
  });

  it('releases a partially constructed renderer after a setup failure', async () => {
    await expect(createOEM(host, { resources, manifest: createManifest(), view: { regionId: 'Valley_4', x: 0, z: 0, zoom: NaN } })).rejects.toThrow('Zoom must be finite');
    expect(host.querySelectorAll('.mapRoot')).toHaveLength(0);
    keep(await createOEM(host, { resources, manifest: createManifest() }));
    expect(host.querySelectorAll('.mapRoot')).toHaveLength(1);
  });
});

describe('request lifetime and resource state', () => {
  it.each(['index', 'shard', 'custom'] as const)('aborts a pending %s request on destroy, even without an external signal', async kind => {
    const map = keep(await createOEM(host, { resources, manifest: createManifest() }));
    const pending = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (kind === 'shard' && String(input).endsWith('/index.json')) return Promise.resolve(json({ '2100500004': '/VL_1.json' }));
      return pending.promise;
    });
    const operation = kind === 'custom' ? map.loadCustomPoints('/custom.json') : map.loadPoint('2100500004');
    const result = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(kind === 'shard' ? 2 : 1));
    const events = vi.fn(); map.on('error', events); map.on('loading', events);
    map.destroy();
    await result;
    for (const [, options] of fetchMock.mock.calls) expect(options.signal.aborted).toBe(true);
    pending.resolve(json([])); await Promise.resolve();
    expect(events).not.toHaveBeenCalled(); expect(host.children).toHaveLength(0);
  });

  it('does not wait for boundary metadata during creation and cancels its background request', async () => {
    const manifest = createManifest(); manifest.regions[0].boundaries = { path: '/boundaries.json', sha256: 'hash', bytes: 2 };
    const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
    const controller = new AbortController();
    const map = keep(await createOEM(host, { resources, manifest, signal: controller.signal }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(map.destroyed).toBe(false);
    controller.abort();
    expect(map.destroyed).toBe(true);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    keep(await createOEM(host, { resources, manifest: createManifest() }));
    pending.resolve(json([])); await Promise.resolve();
    expect(host.querySelectorAll('.mapRoot')).toHaveLength(1);
  });

  it('preserves requested visibility on failure and retries identical Widget configuration', async () => {
    let fail = true;
    fetchMock.mockImplementation(async input => {
      if (String(input).endsWith('/labels.json')) { if (fail) throw new Error('labels unavailable'); return json([]); }
      return json({});
    });
    const error = vi.fn();
    const widget = keep(await createOEMWidget(host, { resources, manifest: createManifest(), locale: 'en-US', onError: error }));
    expect(widget.getState().labels).toBe(true);
    expect(widget.getResourceState().labels).toMatchObject({ requested: true, status: 'error', error: { message: 'labels unavailable' } });
    expect(error).toHaveBeenCalledOnce();
    const events = vi.fn(); widget.on('resourcechange', events);
    fail = false;
    await widget.setOptions({ labels: true });
    expect(widget.getResourceState().labels).toEqual({ requested: true, status: 'ready' });
    expect(events).toHaveBeenCalledWith({ feature: 'labels', state: { requested: true, status: 'ready' } });
    const snapshot = widget.getResourceState(); snapshot.labels.status = 'error';
    expect(widget.getResourceState().labels.status).toBe('ready');
  });

  it('offers explicit retry and never retries a disabled layer', async () => {
    const map = keep(await createOEM(host, { resources, manifest: createManifest() }));
    fetchMock.mockRejectedValue(new Error('unavailable'));
    await map.setFeatures({ labels: true });
    const errorSnapshot = map.getResourceState(); errorSnapshot.labels.error!.message = 'mutated';
    expect(map.getResourceState().labels.error!.message).toBe('unavailable');
    fetchMock.mockImplementation(async input => String(input).endsWith('/labels.json') ? json([]) : json({}));
    await map.retry('labels'); expect(map.getResourceState().labels.status).toBe('ready');
    await map.setFeatures({ labels: false }); fetchMock.mockClear();
    await map.retry(); expect(fetchMock).not.toHaveBeenCalled();
    expect(map.getResourceState().labels).toEqual({ requested: false, status: 'idle' });
  });

  it('does not treat an observer exception as a failed layer load', async () => {
    const error = vi.fn(); const map = keep(await createOEM(host, { resources, manifest: createManifest(), onError: error }));
    map.on('resourcechange', () => { throw new Error('host observer'); });
    await map.setFeatures({ labels: true });
    expect(map.getResourceState().labels.status).toBe('ready');
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'CALLBACK_FAILED' }));
  });
});

describe('configuration failure isolation', () => {
  it('does not commit a view change when required custom point loading fails, then applies the next update', async () => {
    const widget = keep(await createOEMWidget(host, { manifest: createManifest(), labels: false }));
    const before = widget.getState();
    fetchMock.mockRejectedValue(new Error('required data failed'));
    const failing = widget.setOptions({ customPointsUrl: '/custom.json', floor: 'B1', zoom: 3 });
    const rejected = expect(failing).rejects.toThrow('required data failed');
    await rejected; expect(widget.getState()).toEqual(before);
    await widget.setOptions({ floor: 'B1', zoom: 3 });
    expect(widget.getState()).toMatchObject({ floorId: 'B1', zoom: 3 });
  });

  it('settles optional locale failure without leaving Widget state behind the renderer', async () => {
    const widget = keep(await createOEMWidget(host, { resources, manifest: createManifest(), locale: 'en-US' }));
    fetchMock.mockImplementation(async input => { if (String(input).endsWith('/zh.json')) throw new Error('locale failed'); return json([]); });
    await widget.setOptions({ locale: 'zh-CN', floor: 'B1', zoom: 3 });
    expect(widget.getState()).toMatchObject({ locale: 'zh-CN', floorId: 'B1', zoom: 3, labels: true });
    expect(widget.getResourceState().labels.status).toBe('error');
    await widget.setOptions({ labels: false, floor: 'M' });
    expect(widget.getState()).toMatchObject({ labels: false, floorId: 'M' });
  });

  it('validates the whole patch before changing points or view', async () => {
    const widget = keep(await createOEMWidget(host, { manifest: createManifest(), labels: false }));
    const before = widget.getState();
    await expect(widget.setOptions({ customPoints: [{ id: 'valid', style: 'framed', icon: '/icon', position: { regionId: 'Valley_4', x: 1, z: 2 } }], zoom: Infinity })).rejects.toMatchObject({ code: 'INVALID_INPUT', path: 'options.zoom' });
    expect(widget.getState()).toEqual(before); expect(host.querySelectorAll('.frameMarkerIcon')).toHaveLength(0);
    await widget.setOptions({ zoom: 3 }); expect(widget.getState().zoom).toBe(3);
  });

  it('does not cancel valid in-flight data when a synchronous replacement is invalid', async () => {
    const map = keep(await createOEM(host, { resources, manifest: createManifest() }));
    const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
    const operation = map.loadCustomPoints('/custom.json');
    expect(() => map.setCustomPoints([null as never])).toThrow();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    pending.resolve(json([{ id: 'valid', style: 'framed', icon: '/icon', position: { regionId: 'Valley_4', x: 1, z: 2 } }]));
    await operation; expect(host.querySelectorAll('.frameMarkerIcon')).toHaveLength(1);
  });
});
