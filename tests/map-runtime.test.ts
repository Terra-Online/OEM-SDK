// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OEMManifest, OEMPoint, OEMRegion } from '@opendfieldmap/core';
import type { OEMCustomPoint, OEMOptions } from '@opendfieldmap/map';

const region: OEMRegion = {
  id: 'test',
  name: 'Test',
  locales: { 'en-US': 'Test' },
  dimensions: [8000, 8000],
  boundsOffset: { x: 0, y: 0 },
  tileSize: 200,
  minZoom: 0,
  maxNativeZoom: 3,
  maxZoom: 4,
  initialView: { regionId: 'test', x: 4000, y: 4000, zoom: 2 },
  floors: [{ id: 'M', tileTemplate: '/tiles/1_5_3/test/{z}/{x}/{y}.webp', tileVersions: {} }],
  subregions: [],
  points: [{ path: '/marker/1_5_3/test-release/points/all.json', sha256: 'unused', bytes: 1 }],
  coverage: {},
  gameTransform: {
    scaleX: 0.4687511298,
    scaleZ: 0.4687511298,
    offsetX: 519.6990737,
    offsetZ: -479.9101599,
  },
};

const point: OEMPoint = {
  id: '2100500004',
  regionId: 'test',
  subregionId: 'test',
  type: 'crate_i',
  tier: 0,
  raw: { x: 10, y: 20, z: -30 },
  position: { regionId: 'test', x: 80, y: 240, floorId: 'M' },
};

const manifest: OEMManifest = {
  schemaVersion: 1,
  gameVersion: '1_5_3',
  releaseId: 'test-release',
  generatedAt: '2026-09-09T00:00:00Z',
  defaultRegionId: 'test',
  regions: [region],
  types: { path: '/marker/1_5_3/test-release/type.json', sha256: 'unused', bytes: 1 },
  pointIndex: { path: '/marker/1_5_3/test-release/point-index.json', sha256: 'unused', bytes: 1 },
  locales: {},
  controls: {
    'en-US': {
      layerSelect: 'Layer selection', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
      brandName: 'Open Endfield Map', termsOfService: 'Terms of Service',
    },
  },
  fallbackLocale: 'en-US',
  source: { repository: 'test', commit: 'test', usage: 'test' },
};

const resources = { baseUrl: 'https://example.test', manifestPath: '/channels/stable.json' };

describe('OEM runtime points', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let core: InstanceType<typeof import('../packages/map/src/runtime').OEM>;
  let host: HTMLDivElement;

  beforeEach(async () => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/custom-points.json')
        ? JSON.stringify([{ id: 'custom-url-point', position: { regionId: 'test', x: 420, y: 620 }, style: 'framed', icon: './instance.webp' }])
        : url.endsWith('/point-index.json')
        ? JSON.stringify({ [point.id]: '/marker/1_5_3/test-release/points/all.json' })
        : url.endsWith('/type.json')
          ? JSON.stringify({ crate_i: { key: 'crate_i', icon: '/marker/1_5_3/test-release/assets/crate.webp', category: { main: 'item', sub: 'item' } } })
          : JSON.stringify([point]);
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    host = document.createElement('div');
    host.style.height = '480px';
    document.body.append(host);
    const { OEM } = await import('../packages/map/src/runtime');
    const options: OEMOptions = { resources, manifest, features: {} };
    core = new OEM(host, manifest, options);
  });

  afterEach(() => {
    core.destroy();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('loads one indexed point without loading the full point feature', async () => {
    await expect(core.loadPoint(point.id)).resolves.toEqual(point);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/point-index.json');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/points/all.json');
    expect(core.getPoint(point.id)).toBeUndefined();
  });

  it('renders and replaces custom points independently of static points', () => {
    const customPoints: OEMCustomPoint[] = [
      { id: 'custom-route', position: { regionId: 'test', x: 400, y: 600 }, style: 'framed', icon: '/icons/route.webp' },
      { id: 'custom-target', position: { regionId: 'test', x: 600, y: 800 }, style: 'no-frame', icon: '/icons/target.webp' },
    ];
    core.setCustomPoints(customPoints);
    expect(host.querySelectorAll('.frameMarkerIcon')).toHaveLength(1);
    expect(host.querySelectorAll('.noFrameMarkerIcon')).toHaveLength(1);
    const framed = host.querySelector<HTMLElement>('.frameMarkerIcon');
    const noFrame = host.querySelector<HTMLElement>('.noFrameMarkerIcon');
    expect(framed?.querySelector('img')?.getAttribute('src')).toContain('/icons/route.webp');
    expect(noFrame?.querySelector('img')?.getAttribute('src')).toContain('/icons/target.webp');
    expect(framed?.style.width).toBe('32px');
    expect(framed?.style.height).toBe('32px');
    expect(framed?.style.marginLeft).toBe('-16px');
    expect(framed?.style.marginTop).toBe('-32px');
    expect(noFrame?.style.width).toBe('50px');
    expect(noFrame?.style.height).toBe('50px');
    expect(noFrame?.style.marginLeft).toBe('-25px');
    expect(noFrame?.style.marginTop).toBe('-25px');
    core.clearCustomPoints();
    expect(host.querySelectorAll('.frameMarkerIcon, .noFrameMarkerIcon')).toHaveLength(0);
  });

  it('loads custom points from a JSON URL and resolves relative icons', async () => {
    await core.loadCustomPoints('https://example.test/data/custom-points.json');
    const image = host.querySelector<HTMLElement>('.frameMarkerIcon img');
    expect(image?.getAttribute('src')).toBe('https://example.test/data/instance.webp');
  });

  it('reports OEM and recoverable game coordinates for map clicks', () => {
    const clicks: unknown[] = [];
    core.on('click', (payload) => clicks.push(payload));
    const map = (core as unknown as { map: { fire: (event: string, payload: unknown) => void } }).map;
    map.fire('click', { latlng: { lat: -562.8297, lng: 400.0071 } });
    expect(clicks).toEqual([{
      position: { regionId: 'test', x: 400.0071, y: 562.8297, floorId: 'M' },
      game: { x: -255.34226179053363, z: -176.89459252157732 },
    }]);
  });

  it('rejects custom marker variants outside the Atlos compositions', () => {
    expect(() => core.setCustomPoints([{
      id: 'invalid-style',
      position: { regionId: 'test', x: 400, y: 600 },
      style: 'custom' as never,
      icon: '/icons/custom.webp',
    }])).toThrow('Invalid custom point style');
    expect(() => core.setCustomPoints([{
      id: 'missing-icon',
      position: { regionId: 'test', x: 400, y: 600 },
      style: 'framed',
      icon: '',
    }])).toThrow('Custom point icon');
  });

  it('loads static points for getPoint and returns defensive copies', async () => {
    await core.setFeatures({ points: true });
    const loaded = core.getPoint(point.id);
    expect(loaded).toEqual(point);
    loaded!.raw.x = 999;
    expect(core.getPoint(point.id)?.raw.x).toBe(point.raw.x);
  });
});
