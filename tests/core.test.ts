import { describe, expect, it } from 'vitest';
import { createOEMPointUrl, encodeOEMPointToken, fromOEMLeafletPosition, normalizeOEMLocale, OEM_SCHEMA_VERSION, resolveOEMAsset, toOEMLeafletPosition, validateOEMManifest } from '@opendfieldmap/core';
import type { OEMManifest, OEMRegion } from '@opendfieldmap/core';

const region: OEMRegion = {
  id: 'test', name: 'Test', locales: { 'en-US': 'Test' }, dimensions: [8000, 8000], boundsOffset: { x: 0, y: 0 },
  tileSize: 200, minZoom: 0, maxNativeZoom: 3, maxZoom: 4.5,
  initialView: { regionId: 'test', x: 4000, y: 4000, zoom: 2 },
  floors: [{ id: 'M', tileTemplate: '/tiles/test/test/{z}/{x}/{y}.webp' }], subregions: [], points: [], coverage: {},
};
const manifest: OEMManifest = {
  schemaVersion: 1, gameVersion: '1_5_3', releaseId: 'test-release', generatedAt: '2026-09-07T00:00:00Z',
  defaultRegionId: 'test', regions: [region],
  types: { path: '/marker/1_5_3/types.json', sha256: 'hash', bytes: 2 },
  locales: {}, controls: { 'en-US': { layerSelect: 'Layer selection', zoomIn: 'Zoom in', zoomOut: 'Zoom out', brandName: 'Open Endfield Map', termsOfService: 'Terms of Service' } }, fallbackLocale: 'en-US',
  source: { repository: 'test', commit: 'test', usage: 'test' },
};

describe('core protocol', () => {
  it('round-trips max-zoom pixel coordinates', () => {
    const position = { regionId: 'test', x: 1632.25, y: 2048.5, floorId: 'M' };
    const [lat, lng] = toOEMLeafletPosition(position, region);
    expect(fromOEMLeafletPosition(lat, lng, region)).toEqual(position);
  });

  it('normalizes supported locale aliases', () => {
    expect(normalizeOEMLocale('zh_TW', ['en-US', 'zh-CN', 'zh-HK'], 'en-US')).toBe('zh-HK');
    expect(normalizeOEMLocale('fr-CA', ['en-US', 'fr-FR'], 'en-US')).toBe('fr-FR');
  });

  it('keeps static paths inside the configured origin', () => {
    expect(resolveOEMAsset('https://data.example/', '/marker/1_5_3/types.json')).toBe('https://data.example/marker/1_5_3/types.json');
    expect(() => resolveOEMAsset('https://data.example', 'https://attacker.example/file')).toThrow();
    expect(() => resolveOEMAsset('https://data.example', '../private.json')).toThrow();
  });

  it('creates canonical seven-character point links', () => {
    const token = encodeOEMPointToken('2100500004');
    expect(token).toHaveLength(7);
    expect(createOEMPointUrl('2100500004')).toBe(`https://oem.re/${token}`);
    expect(() => encodeOEMPointToken('not-numeric')).toThrow('Invalid OEM point ID');
  });

  it('validates the default map region', () => {
    expect(OEM_SCHEMA_VERSION).toBe(1);
    expect(validateOEMManifest(manifest)).toBe(manifest);
    expect(() => validateOEMManifest({ ...manifest, schemaVersion: 2 })).toThrow('Unsupported or invalid OEM manifest');
    expect(() => validateOEMManifest({ ...manifest, defaultRegionId: 'missing' })).toThrow('Unknown OEM region');
  });
});
