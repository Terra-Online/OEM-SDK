import { describe, expect, it } from 'vitest';
import { createOEMPointUrl, defaultOEMResources, encodeOEMPointToken, fromOEMLeafletPosition, gameToOEMPosition, gameXZToOEMPosition, normalizeOEMLocale, OEM_SCHEMA_VERSION, oemToGamePosition, resolveOEMAsset, toOEMLeafletPosition, validateOEMManifest } from '@opendfieldmap/core';
import type { OEMManifest, OEMRegion } from '@opendfieldmap/core';

const region: OEMRegion = {
  id: 'test', name: 'Test', locales: { 'en-US': 'Test' }, dimensions: [8000, 8000], boundsOffset: { x: 0, z: 0 },
  tileSize: 200, minZoom: 0, maxNativeZoom: 3, maxZoom: 4.5,
  initialView: { regionId: 'test', x: 4000, z: 4000, zoom: 2 },
  floors: [{ id: 'M', tileTemplate: '/tiles/1_5_3/test/{z}/{x}/{y}.webp', tileVersions: {} }], subregions: [], points: [], coverage: {},
};
const manifest: OEMManifest = {
  schemaVersion: 1, gameVersion: '1_5_3', releaseId: 'test-release', generatedAt: '2026-09-07T00:00:00Z',
  defaultRegionId: 'test', regions: [region],
  types: { path: '/marker/1_5_3/test-release/type.json', sha256: 'hash', bytes: 2 },
  locales: {}, controls: { 'en-US': { layerSelect: 'Layer selection', zoomIn: 'Zoom in', zoomOut: 'Zoom out', brandName: 'Open Endfield Map', termsOfService: 'Terms of Service' } }, fallbackLocale: 'en-US',
  source: { repository: 'test', commit: 'test', usage: 'test' },
};

const valleyRegion: OEMRegion = {
  ...region,
  id: 'Valley_4',
  gameTransform: {
    scaleX: 0.4687511298,
    scaleZ: 0.4687511298,
    offsetX: 519.6990737,
    offsetZ: -479.9101599,
  },
};

describe('core protocol', () => {
  it('round-trips max-zoom pixel coordinates', () => {
    const position = { regionId: 'test', x: 1632.25, z: 2048.5, floorId: 'M' };
    const [lat, lng] = toOEMLeafletPosition(position, region);
    expect(fromOEMLeafletPosition(lat, lng, region)).toEqual(position);
  });

  it('round-trips horizontal game coordinates', () => {
    const raw = { x: 123.5, y: 42, z: -77.25 };
    expect(oemToGamePosition(gameToOEMPosition(raw, region), region)).toEqual({ x: raw.x, z: raw.z });
    expect(() => oemToGamePosition({ regionId: 'other', x: 1, z: 2 }, region)).toThrow('Invalid OEM position');
  });

  it('converts Atlos horizontal coordinates to normalized map coordinates', () => {
    expect(gameXZToOEMPosition({ x: 400.0071, z: -562.8297 }, region)).toEqual({
      regionId: 'test', x: 400.0071, z: -562.8297, floorId: 'M',
    });
  });

  it('applies the Atlos region transform without changing normalized map units', () => {
    const mapPosition = gameXZToOEMPosition({ x: -255.34226179053363, z: -176.89459252157732 }, valleyRegion);
    expect(mapPosition.x).toBeCloseTo(400.0071, 8);
    expect(mapPosition.z).toBeCloseTo(-562.8297, 8);
    expect(oemToGamePosition({ ...mapPosition, space: 'pixel', x: mapPosition.x * 8, z: mapPosition.z * 8 }, valleyRegion)).toEqual({
      x: expect.closeTo(-255.34226179053363, 8),
      z: expect.closeTo(-176.89459252157732, 8),
    });
  });

  it('normalizes supported locale aliases', () => {
    expect(normalizeOEMLocale('zh_TW', ['en-US', 'zh-CN', 'zh-HK'], 'en-US')).toBe('zh-HK');
    expect(normalizeOEMLocale('fr-CA', ['en-US', 'fr-FR'], 'en-US')).toBe('fr-FR');
  });

  it('keeps static paths inside the configured origin', () => {
    expect(defaultOEMResources).toEqual({
      baseUrl: 'https://data.opendfieldmap.org',
      manifestPath: '/channels/stable.json',
    });
    expect(resolveOEMAsset('https://data.example/', '/marker/1_5_3/test-release/type.json')).toBe('https://data.example/marker/1_5_3/test-release/type.json');
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
