// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OEMManifest, OEMPoint, OEMView } from '@opendfieldmap/core';
import type { OEMMapClick } from '@opendfieldmap/map';

const { createOEM } = vi.hoisted(() => ({ createOEM: vi.fn() }));

vi.mock('@opendfieldmap/map', () => ({ createOEM }));

const initialView: OEMView = {
  regionId: 'Valley_4',
  floorId: 'M',
  x: 4000,
  y: 4000,
  zoom: 2,
};

const manifest: OEMManifest = {
  schemaVersion: 1,
  gameVersion: '1_5_3',
  releaseId: 'test-release',
  generatedAt: '2026-09-07T00:00:00Z',
  defaultRegionId: 'Valley_4',
  regions: [{
    id: 'Valley_4',
    name: 'Valley IV',
    locales: { 'en-US': 'Valley IV' },
    dimensions: [8000, 8000],
    boundsOffset: { x: 0, y: 0 },
    tileSize: 200,
    minZoom: 0,
    maxNativeZoom: 3,
    maxZoom: 4,
    initialView,
    floors: [
      { id: 'M', tileTemplate: '/tiles/1_5_3/Valley_4/{z}/{x}/{y}.webp', tileVersions: {} },
      { id: 'B1', tileTemplate: '/tiles/1_5_3/Valley_4/{z}/{x}/{y}_b1.webp', tileVersions: {} },
    ],
    subregions: [
      { id: 'VL_1', key: 'hub', bounds: [[1000, 1000], [2000, 2000]], locales: { 'en-US': { name: 'Hub', short: 'H' } } },
      { id: 'VL_2', key: 'pass', bounds: [[2000, 2000], [3000, 3000]], locales: { 'en-US': { name: 'Pass', short: 'P' } } },
    ],
    points: [],
    coverage: {},
  }],
  types: { path: '/marker/1_5_3/test-release/type.json', sha256: 'hash', bytes: 2 },
  locales: {},
  controls: { 'en-US': { layerSelect: 'Layer selection', zoomIn: 'Zoom in', zoomOut: 'Zoom out', brandName: 'Open Endfield Map', termsOfService: 'Terms of Services' } },
  fallbackLocale: 'en-US',
  source: { repository: 'test', commit: 'test', usage: 'test' },
};

const makeCore = () => {
  let view = { ...initialView };
  return {
    manifest,
    destroyed: false,
    getView: vi.fn(() => ({ ...view })),
    setView: vi.fn((next: OEMView) => { view = { ...next }; }),
    setZoom: vi.fn((zoom: number) => { view.zoom = zoom; }),
    fitBounds: vi.fn(),
    setRegion: vi.fn(async (): Promise<void> => undefined),
    setFloor: vi.fn(),
    setLocale: vi.fn(async (): Promise<void> => undefined),
    getLocale: vi.fn(() => ({ requested: 'en-US', resolved: 'en-US' })),
    setTheme: vi.fn(),
    setFeatures: vi.fn(async (): Promise<void> => undefined),
    setPointFilter: vi.fn(),
    setCustomPoints: vi.fn(),
    loadCustomPoints: vi.fn(async (): Promise<void> => undefined),
    clearCustomPoints: vi.fn(),
    getPoint: vi.fn((): OEMPoint | undefined => undefined),
    loadPoint: vi.fn(async (): Promise<OEMPoint | undefined> => undefined),
    setMarkerClustering: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(() => () => undefined),
    destroy: vi.fn(),
  };
};

describe('widget creation options', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    createOEM.mockReset();
  });

  it('shows all controls and leaves interactions unlocked by default', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false });

    expect(host.querySelector('.regionSwitch')).not.toBeNull();
    expect(host.querySelector('.layerSwitch')).not.toBeNull();
    expect(host.querySelector('.regionSwitch .switchLabel')?.textContent).toBe('');
    expect(host.querySelector('.regionSwitch .switchLabel')?.classList.contains('regionLabel')).toBe(true);
    expect(host.querySelector('.layerSwitch .switchLabel')?.textContent).toBe('');
    expect(host.querySelector('.layerSwitch .switchLabel')?.classList.contains('layerLabel')).toBe(true);
    expect(host.querySelector('.scaleControl')).not.toBeNull();
    expect(createOEM).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      lockDrag: false,
      lockZoom: false,
      markerClustering: true,
      features: { points: false, labels: false, boundaries: false },
    }));
    widget.destroy();
  });

  it('hides selectors and scale independently', async () => {
    createOEM.mockResolvedValue(makeCore());
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, {
      manifest,
      labels: false,
      showRegionSelector: false,
      showFloorSelector: false,
      showScaleBar: false,
    });

    expect(host.querySelector('.regionSwitch')).toBeNull();
    expect(host.querySelector('.layerSwitch')).toBeNull();
    expect(host.querySelector('.scaleControl')).toBeNull();
    expect(host.querySelector('.controlOverlay')).toBeNull();
    widget.destroy();
  });

  it('skips updates that resolve to the current state', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false });
    await widget.setOptions({ labels: false, zoom: undefined });

    expect(core.setFeatures).not.toHaveBeenCalled();
    expect(core.setPointFilter).not.toHaveBeenCalled();
    expect(core.setView).not.toHaveBeenCalled();
    widget.destroy();
  });

  it('exposes host-defined points and indexed point lookup', async () => {
    const core = makeCore();
    const point = {
      id: '2100500004',
      regionId: 'Valley_4',
      subregionId: 'VL_1',
      type: 'crate_i',
      tier: 0,
      raw: { x: 1, y: 2, z: 3 },
      position: { regionId: 'Valley_4', x: 8, y: -24, floorId: 'M' },
    };
    core.getPoint.mockReturnValue(point);
    core.loadPoint.mockResolvedValue(point);
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const customPoints = [{
      id: 'route-start',
      position: { regionId: 'Valley_4', x: 400, y: 600 },
      style: 'framed' as const,
      icon: '/icons/route-start.webp',
    }];
    const widget = await createOEMWidget(host, { manifest, labels: false, customPoints });

    expect(createOEM).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ customPoints }));
    widget.setCustomPoints(customPoints);
    widget.clearCustomPoints();
    await widget.setOptions({ customPoints });
    expect(core.setCustomPoints).toHaveBeenCalledWith(customPoints);
    expect(core.clearCustomPoints).toHaveBeenCalledOnce();
    expect(widget.getPoint('2100500004')).toEqual(point);
    await expect(widget.loadPoint('2100500004')).resolves.toEqual(point);
    expect(core.getPoint).toHaveBeenCalledWith('2100500004');
    expect(core.loadPoint).toHaveBeenCalledWith('2100500004');
    widget.destroy();
  });

  it('supports URL-backed custom points without embedding the data in Widget options', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false, customPointsUrl: '/data/custom-points.json' });

    expect(createOEM).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      customPoints: undefined,
      customPointsUrl: '/data/custom-points.json',
    }));
    await widget.loadCustomPoints('/data/other-points.json');
    expect(core.loadCustomPoints).toHaveBeenCalledWith('/data/other-points.json');
    await widget.setOptions({ customPointsUrl: '/data/final-points.json' });
    expect(core.loadCustomPoints).toHaveBeenLastCalledWith('/data/final-points.json');
    widget.destroy();
  });

  it('forwards map click coordinates through the Widget handle', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false });
    const received: OEMMapClick[] = [];
    const unsubscribe = widget.on('click', (payload) => received.push(payload));
    const coreClick = (core.on.mock.calls as unknown[][]).find(([event]) => event === 'click')?.[1] as unknown as ((payload: OEMMapClick) => void);
    const payload: OEMMapClick = {
      position: { regionId: 'Valley_4', x: 400.0071, y: 562.8297, floorId: 'M' },
      game: { x: 400.0071, z: -562.8297 },
    };
    coreClick(payload);
    expect(received).toEqual([payload]);
    unsubscribe();
    coreClick(payload);
    expect(received).toHaveLength(1);
    widget.destroy();
  });

  it('applies overlapping updates in call order', async () => {
    const core = makeCore();
    let finishFirst: (() => void) | undefined;
    core.setFeatures
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValue(undefined);
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false });
    const showLabels = widget.setOptions({ labels: true });
    const hideLabels = widget.setOptions({ labels: false });
    await Promise.resolve();

    expect(core.setFeatures).toHaveBeenCalledOnce();
    finishFirst?.();
    await Promise.all([showLabels, hideLabels]);

    expect(core.setFeatures).toHaveBeenNthCalledWith(1, {
      points: false,
      labels: true,
      boundaries: false,
    });
    expect(core.setFeatures).toHaveBeenNthCalledWith(2, {
      points: false,
      labels: false,
      boundaries: false,
    });
    expect(widget.getState().labels).toBe(false);
    widget.destroy();
  });

  it('passes interaction locks through and disables scale-bar zoom', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, {
      manifest,
      labels: false,
      lockDrag: true,
      lockZoom: true,
    });

    expect(createOEM).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      lockDrag: true,
      lockZoom: true,
    }));
    const zoomButtons = [...host.querySelectorAll<HTMLButtonElement>('.zoomButton')];
    expect(zoomButtons).toHaveLength(2);
    expect(zoomButtons.every((button) => button.disabled)).toBe(true);
    zoomButtons[0].click();
    expect(core.setZoom).not.toHaveBeenCalled();
    widget.destroy();
  });

  it('uses native map zoom without running a Widget view update', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false });

    host.querySelector<HTMLButtonElement>('.zoomIn')!.click();
    expect(core.setZoom).toHaveBeenCalledWith(2.5, { animate: true });
    expect(core.setView).not.toHaveBeenCalled();
    expect(host.querySelector('.oemWidget')?.classList.contains('loading')).toBe(false);
    widget.destroy();
  });

  it('ends compact scale dragging after implicit pointer capture release', async () => {
    createOEM.mockResolvedValue(makeCore());
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false });
    const track = host.querySelector<HTMLElement>('.scaleTrack')!;
    Object.defineProperties(track, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => false) },
      releasePointerCapture: { value: vi.fn() },
    });
    const pointer = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, clientY: 100 });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
      });
      track.dispatchEvent(event);
    };

    pointer('pointerdown');
    expect(host.querySelector('.scaleControl')?.classList.contains('dragging')).toBe(true);
    pointer('pointerup');
    expect(host.querySelector('.scaleControl')?.classList.contains('dragging')).toBe(false);
    widget.destroy();
  });

  it('keeps touch-expanded switch panels mutually exclusive', async () => {
    createOEM.mockResolvedValue(makeCore());
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false });
    const region = host.querySelector<HTMLElement>('.regionEntry')!;
    const layer = host.querySelector<HTMLElement>('.layerSwitch .switchItem')!;
    const touch = (target: HTMLElement) => {
      const event = new MouseEvent('pointerdown', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      target.dispatchEvent(event);
    };

    touch(region);
    expect(region.classList.contains('expanded')).toBe(true);
    touch(layer);
    expect(region.classList.contains('expanded')).toBe(false);
    expect(layer.classList.contains('expanded')).toBe(true);
    widget.destroy();
  });

  it('updates boundaries and marker clustering declaratively', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    const widget = await createOEMWidget(host, { manifest, labels: false, boundaries: true, markerClustering: false });

    expect(createOEM).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      markerClustering: false,
      features: { points: false, labels: false, boundaries: true },
    }));
    expect(widget.getState()).toMatchObject({ boundaries: true, markerClustering: false });

    await widget.setOptions({ boundaries: false, markerClustering: true });
    expect(core.setMarkerClustering).toHaveBeenLastCalledWith(true);
    expect(core.setFeatures).toHaveBeenLastCalledWith({ points: false, labels: false, boundaries: false });
    expect(core.setPointFilter).not.toHaveBeenCalled();
    expect(core.setView).not.toHaveBeenCalled();
    widget.destroy();
  });

  it('cleans up when an onReady callback fails', async () => {
    const core = makeCore();
    createOEM.mockResolvedValue(core);
    const host = document.createElement('div');
    document.body.append(host);

    const { createOEMWidget } = await import('@opendfieldmap/sdk');
    await expect(createOEMWidget(host, {
      manifest,
      labels: false,
      onReady: () => { throw new Error('ready failed'); },
    })).rejects.toThrow('ready failed');

    expect(core.destroy).toHaveBeenCalledOnce();
    expect(host.childElementCount).toBe(0);
  });
});
