// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OEMManifest, OEMPoint, OEMRegion } from '@opendfieldmap/core';
import type { OEMCustomPoint, OEMOptions } from '@opendfieldmap/map';

const region: OEMRegion = {
  id: 'test',
  name: 'Test',
  locales: { 'en-US': 'Test' },
  dimensions: [8000, 8000],
  boundsOffset: { x: 0, z: 0 },
  tileSize: 200,
  minZoom: 0,
  maxNativeZoom: 3,
  maxZoom: 4,
  initialView: { regionId: 'test', x: 4000, z: 4000, zoom: 2 },
  floors: [{ id: 'M', tileTemplate: '/tiles/1_5_3/test/{z}/{x}/{y}.webp', tileVersions: {} }],
  subregions: [{ id: 'test', key: 'test' }],
  points: [{ path: '/marker/1_5_3/test-release/points/all.json', sha256: 'unused', bytes: 1 }],
  gameBoundaries: { path: '/map/1_5_3/test-release/boundaries/test.game.json', sha256: 'unused', bytes: 1 },
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
  position: { regionId: 'test', x: 80, z: 240, floorId: 'M' },
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
        ? JSON.stringify([{ id: 'custom-url-point', position: { regionId: 'test', x: 420, z: -620 }, style: 'framed', icon: './instance.webp' }])
        : url.endsWith('/test.game.json')
        ? JSON.stringify({ count: 1, boundaries: [{ id: 'game-level', rings: [[{ x: 80, z: 80 }, { x: 160, z: 80 }, { x: 160, z: 160 }, { x: 80, z: 160 }]] }] })
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

  it('decodes Atlos compact marker tuples with the shard subregion fallback', () => {
    const decode = (core as unknown as {
      decodePointShard: (value: unknown[], path: string) => OEMPoint[];
    }).decodePointShard;
    const decoded = decode.call(core, [[point.id, 10, -30, 20, 0, 'crate_i']], '/marker/1_5_3/test-release/points/test.json');
    expect(decoded[0]).toMatchObject({
      id: point.id,
      regionId: 'test',
      subregionId: 'test',
      type: 'crate_i',
      tier: 0,
      position: { x: -240, z: 80, floorId: 'M' },
      raw: { y: 20 },
    });
  });

  it('renders and replaces custom points independently of static points', () => {
    const customPoints: OEMCustomPoint[] = [
      { id: 'custom-route', position: { regionId: 'test', x: 400, z: -600 }, style: 'framed', icon: '/icons/route.webp' },
      { id: 'custom-target', position: { regionId: 'test', x: 600, z: -800 }, style: 'no-frame', icon: '/icons/target.webp' },
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

  it('rejects legacy custom-point positions that use y instead of z', () => {
    expect(() => core.setCustomPoints([{
      id: 'legacy-point',
      position: { regionId: 'test', x: 420, y: 620 } as never,
      style: 'framed',
      icon: '/icons/legacy.webp',
    }])).toThrow('Invalid OEM map position');
  });

  it('switches the boundary layer between OEM and game sources', async () => {
    await core.setFeatures({ boundaries: true, boundarySource: 'game' });
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('/boundaries/test.game.json');
    expect(host.querySelectorAll('.subregionBoundaryStroke')).toHaveLength(1);
    await core.setFeatures({ boundarySource: 'oem' });
    expect(host.querySelectorAll('.subregionBoundaryStroke')).toHaveLength(0);
  });

  it('reports OEM and recoverable game coordinates for map clicks', () => {
    const clicks: unknown[] = [];
    core.on('click', (payload) => clicks.push(payload));
    const map = (core as unknown as { map: { fire: (event: string, payload: unknown) => void } }).map;
    map.fire('click', { latlng: { lat: -562.8297, lng: 400.0071 } });
    expect(clicks).toEqual([{
      position: { regionId: 'test', x: 400.0071, z: -562.8297, floorId: 'M' },
      game: { x: -255.34226179053363, z: -176.89459252157732 },
    }]);
  });

  it('resolves overlapping subregions by pairwise interior clearance', () => {
    const runtime = core as unknown as {
      region: OEMRegion;
      boundaryData: Map<string, unknown>;
      inferSubregionId: (x: number, z: number) => string | undefined;
    };
    const boundaryPath = '/boundaries/overlap.json';
    runtime.region = {
      ...region,
      boundaries: { path: boundaryPath, sha256: 'unused', bytes: 1 },
      subregions: [
        { id: 'near-edge', key: 'near-edge' },
        { id: 'middle', key: 'middle' },
        { id: 'deep', key: 'deep' },
      ],
    };
    const ring = (minX: number, minZ: number, maxX: number, maxZ: number) => [
      { regionId: 'test', x: minX, z: minZ },
      { regionId: 'test', x: maxX, z: minZ },
      { regionId: 'test', x: maxX, z: maxZ },
      { regionId: 'test', x: minX, z: maxZ },
    ];
    runtime.boundaryData.set(boundaryPath, [
      { id: 'near-edge', rings: [ring(70, 0, 90, 160)] },
      { id: 'middle', rings: [ring(40, -20, 120, 180)] },
      { id: 'deep', rings: [ring(0, -80, 200, 240)] },
    ]);

    // Leaflet click coordinates are normalized by max-native zoom (2^3 here),
    // so this probes published coordinate (80, 80), inside all three polygons.
    expect(runtime.inferSubregionId(10, 10)).toBe('deep');
  });

  it('does not infer a subregion outside every precise boundary', () => {
    const runtime = core as unknown as {
      region: OEMRegion;
      boundaryData: Map<string, unknown>;
      inferSubregionId: (x: number, z: number) => string | undefined;
    };
    const boundaryPath = '/boundaries/disjoint.json';
    runtime.region = {
      ...region,
      boundaries: { path: boundaryPath, sha256: 'unused', bytes: 1 },
      subregions: [{ id: 'bounded', key: 'bounded', bounds: [[0, 0], [800, 800]] }],
    };
    runtime.boundaryData.set(boundaryPath, [{
      id: 'bounded',
      rings: [[
        { regionId: 'test', x: 0, z: 0 },
        { regionId: 'test', x: 80, z: 0 },
        { regionId: 'test', x: 80, z: 80 },
        { regionId: 'test', x: 0, z: 80 },
      ]],
    }]);

    // Published coordinate (400, 400) is inside the coarse bounds but not the
    // precise subregion polygon, so it must remain unassigned.
    expect(runtime.inferSubregionId(50, 50)).toBeUndefined();
  });

  it('does not infer the nearest subregion when all fallback bounds miss', () => {
    const runtime = core as unknown as {
      region: OEMRegion;
      inferSubregionId: (x: number, z: number) => string | undefined;
    };
    runtime.region = {
      ...region,
      subregions: [{ id: 'bounded', key: 'bounded', bounds: [[0, 0], [80, 80]] }],
    };

    expect(runtime.inferSubregionId(5, 5)).toBe('bounded');
    expect(runtime.inferSubregionId(50, 50)).toBeUndefined();
  });

  it('adds one custom marker for every click in multiple mode', () => {
    core.setClickPointMode({ mode: 'multiple', style: 'framed', icon: '/icons/pin.webp' });
    const map = (core as unknown as { map: { fire: (event: string, payload: unknown) => void } }).map;
    map.fire('click', { latlng: { lat: -100, lng: 200 } });
    map.fire('click', { latlng: { lat: -300, lng: 400 } });
    expect(host.querySelectorAll('.frameMarkerIcon')).toHaveLength(2);
    expect([...host.querySelectorAll('.frameMarkerIcon img')].map((image) => image.getAttribute('src')))
      .toEqual(['/icons/pin.webp', '/icons/pin.webp']);
  });

  it('keeps only the latest click marker in single mode and can clear it', () => {
    core.setCustomPoints([{
      id: 'host-point', position: { regionId: 'test', x: 10, z: 20 }, style: 'no-frame', icon: '/icons/host.webp',
    }]);
    core.setClickPointMode({ mode: 'single', style: 'framed', icon: '/icons/pin.webp' });
    const map = (core as unknown as { map: { fire: (event: string, payload: unknown) => void } }).map;
    map.fire('click', { latlng: { lat: -100, lng: 200 } });
    map.fire('click', { latlng: { lat: -300, lng: 400 } });
    expect(host.querySelectorAll('.frameMarkerIcon')).toHaveLength(1);
    expect(host.querySelectorAll('.noFrameMarkerIcon')).toHaveLength(1);
    core.clearClickPoints();
    expect(host.querySelectorAll('.frameMarkerIcon, .noFrameMarkerIcon')).toHaveLength(1);
    core.setClickPointMode(null);
    map.fire('click', { latlng: { lat: -500, lng: 600 } });
    expect(host.querySelectorAll('.frameMarkerIcon, .noFrameMarkerIcon')).toHaveLength(1);
  });

  it('rejects custom marker variants outside the Atlos compositions', () => {
    expect(() => core.setCustomPoints([{
      id: 'invalid-style',
      position: { regionId: 'test', x: 400, z: -600 },
      style: 'custom' as never,
      icon: '/icons/custom.webp',
    }])).toThrow('Invalid custom point style');
    expect(() => core.setCustomPoints([{
      id: 'missing-icon',
      position: { regionId: 'test', x: 400, z: -600 },
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

  it('keeps the map alive when an optional feature payload is unavailable', async () => {
    const errors: Error[] = [];
    core.on('error', (error) => errors.push(error));
    fetchMock.mockRejectedValueOnce(new Error('temporary CDN failure'));
    await expect(core.setFeatures({ points: true })).resolves.toBeUndefined();
    expect(errors[0]?.message).toBe('temporary CDN failure');
    expect(core.destroyed).toBe(false);
  });
});
