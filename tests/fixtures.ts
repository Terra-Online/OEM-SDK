import type { OEMManifest } from '@opendfieldmap/core';

/** Small valid wire fixture; each test owns its copy. */
export const createManifest = (): OEMManifest => ({
  schemaVersion: 1, gameVersion: '1_5_3', releaseId: 'test-release', generatedAt: '2026-09-11T00:00:00Z',
  defaultRegionId: 'Valley_4',
  regions: [{
    id: 'Valley_4', name: 'Test', locales: { 'en-US': 'Test' }, dimensions: [8000, 8000], boundsOffset: { x: 0, z: 0 },
    tileSize: 200, minZoom: 0, maxNativeZoom: 3, maxZoom: 4,
    initialView: { regionId: 'Valley_4', x: 4000, z: 4000, zoom: 2 },
    floors: [{ id: 'M', tileTemplate: '/tiles/{z}/{x}/{y}.webp' }, { id: 'B1', tileTemplate: '/tiles/b1/{z}/{x}/{y}.webp' }],
    subregions: [{ id: 'VL_1', key: 'test' }], points: [{ path: '/VL_1.json', sha256: 'hash', bytes: 2 }], coverage: {},
    labels: { path: '/labels.json', sha256: 'hash', bytes: 2 },
    gameTransform: { scaleX: 1, scaleZ: 1, offsetX: 0, offsetZ: 0 },
  }],
  types: { path: '/types.json', sha256: 'hash', bytes: 2 },
  pointIndex: { path: '/index.json', sha256: 'hash', bytes: 2 },
  locales: { 'en-US': { path: '/en.json', sha256: 'hash', bytes: 2 }, 'zh-CN': { path: '/zh.json', sha256: 'hash', bytes: 2 } },
  controls: { 'en-US': { layerSelect: 'Layer', zoomIn: 'Zoom in', zoomOut: 'Zoom out', brandName: 'OEM', termsOfService: 'Terms' } },
  fallbackLocale: 'en-US', source: { repository: 'test', commit: 'test', usage: 'test' },
});

export const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
