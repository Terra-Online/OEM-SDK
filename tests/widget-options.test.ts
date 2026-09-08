// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OEMManifest, OEMView } from '@opendfieldmap/core';

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
      { id: 'M', tileTemplate: '/tiles/test/Valley_4/{z}/{x}/{y}.webp' },
      { id: 'B1', tileTemplate: '/tiles/test/Valley_4/{z}/{x}/{y}_b1.webp' },
    ],
    subregions: [
      { id: 'VL_1', key: 'hub', bounds: [[1000, 1000], [2000, 2000]], locales: { 'en-US': { name: 'Hub', short: 'H' } } },
      { id: 'VL_2', key: 'pass', bounds: [[2000, 2000], [3000, 3000]], locales: { 'en-US': { name: 'Pass', short: 'P' } } },
    ],
    points: [],
    coverage: {},
  }],
  types: { path: '/marker/1_5_3/types.json', sha256: 'hash', bytes: 2 },
  locales: {},
  controls: { 'en-US': { layerSelect: 'Layer selection', zoomIn: 'Zoom in', zoomOut: 'Zoom out', brandName: 'Open Endfield Map', termsOfService: 'Terms of Service' } },
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
