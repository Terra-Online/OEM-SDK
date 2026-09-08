export * from './types';
export * from './pointLink';
import { OEM_SCHEMA_VERSION } from './types';
import type { OEMGamePosition, OEMManifest, OEMPosition, OEMRegion, OEMResources } from './types';

/** Default static origin used by OEM clients. */
export const defaultOEMResources: Readonly<OEMResources> = Object.freeze({
  baseUrl: 'https://data.opendfieldmap.org',
  manifestPath: '/channels/stable.json',
});

/**
 * Resolves a manifest asset against one configured CDN origin.
 *
 * Only relative paths are accepted so a manifest cannot redirect requests to
 * an untrusted origin or a parent directory.
 */
export function resolveOEMAsset(base: string, assetPath: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(assetPath) || assetPath.startsWith('//')) {
    throw new Error('Resource paths must be relative to their configured CDN');
  }
  if (assetPath.split('/').includes('..')) throw new Error('Resource traversal is not allowed');
  return `${base.replace(/\/$/, '')}/${assetPath.replace(/^\//, '')}`;
}

/** Returns a published region or throws a descriptive configuration error. */
export function getOEMRegion(manifest: OEMManifest, id: string): OEMRegion {
  const region = manifest.regions.find((entry) => entry.id === id);
  if (!region) throw new Error(`Unknown OEM region: ${id}`);
  return region;
}

/** Validates the structural invariants required before a map can be created. */
export function validateOEMManifest(value: unknown): OEMManifest {
  const manifest = value as OEMManifest;
  if (!manifest || manifest.schemaVersion !== OEM_SCHEMA_VERSION || !/^\d+_\d+_\d+$/.test(manifest.gameVersion) ||
    !manifest.releaseId || !Array.isArray(manifest.regions) || !manifest.regions.length) {
    throw new Error('Unsupported or invalid OEM manifest');
  }
  const ids = new Set<string>();
  for (const region of manifest.regions) {
    if (ids.has(region.id) || !region.id || !Array.isArray(region.floors) || !region.floors.some((floor) => floor.id === 'M') ||
      !Array.isArray(region.subregions) || new Set(region.subregions.map((subregion) => subregion.id)).size !== region.subregions.length ||
      !region.dimensions?.every((dimension) => Number.isFinite(dimension) && dimension > 0) ||
      !Number.isFinite(region.maxNativeZoom) || !(region.tileSize > 0) || !Number.isFinite(region.maxZoom) ||
      !Number.isFinite(region.minZoom) || region.maxZoom < region.maxNativeZoom ||
      !Number.isFinite(region.initialView?.x) || !Number.isFinite(region.initialView?.y)) {
      throw new Error(`Invalid region configuration: ${region.id}`);
    }
    ids.add(region.id);
  }
  getOEMRegion(manifest, manifest.defaultRegionId);
  const fallbackControls = manifest.controls?.[manifest.fallbackLocale];
  if (
    !fallbackControls?.layerSelect ||
    !fallbackControls.zoomIn ||
    !fallbackControls.zoomOut ||
    !fallbackControls.brandName ||
    !fallbackControls.termsOfService
  ) {
    throw new Error('Fallback control messages are unavailable');
  }
  if (manifest.fonts && (!Array.isArray(manifest.fonts) || manifest.fonts.some((font) => !font.family || !font.path || !font.sha256 || !(font.bytes > 0) ||
    !Number.isFinite(font.weight) || font.style !== 'normal' ||
    (font.weightRange && (!Array.isArray(font.weightRange) || font.weightRange.length !== 2 ||
      !font.weightRange.every((value) => Number.isFinite(value) && value > 0) || font.weightRange[0] > font.weightRange[1]))))) {
    throw new Error('Invalid font configuration');
  }
  if (manifest.fontLicenses && (!Array.isArray(manifest.fontLicenses) || manifest.fontLicenses.some((license) =>
    !license?.path || !license.sha256 || !(license.bytes > 0)))) {
    throw new Error('Invalid font license configuration');
  }
  return manifest;
}

/** Converts an OEM pixel position to the Simple CRS coordinates used by Leaflet. */
export function toOEMLeafletPosition(position: OEMPosition, region: OEMRegion): [number, number] {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error('Invalid OEM position');
  const scale = 2 ** region.maxNativeZoom;
  return [-position.y / scale, position.x / scale];
}

/** Converts Simple CRS coordinates back to an OEM pixel position. */
export function fromOEMLeafletPosition(lat: number, lng: number, region: OEMRegion, floorId = 'M'): OEMPosition {
  const scale = 2 ** region.maxNativeZoom;
  return { regionId: region.id, x: lng * scale, y: -lat * scale, floorId };
}

/** Converts a retained game-space position into published map coordinates. */
export function gameToOEMPosition(raw: OEMGamePosition, region: OEMRegion, floorId = 'M'): OEMPosition {
  return fromOEMLeafletPosition(raw.z, raw.x, region, floorId);
}

/** Maps an Atlos tier number to its visible floor identifier. */
export function getOEMFloorFromTier(tier: number): string {
  return tier === 0 ? 'M' : `${tier < 0 ? 'B' : 'L'}${Math.abs(Math.trunc(tier))}`;
}

/** Applies OEM language fallback rules to a requested locale. */
export function normalizeOEMLocale(requested: string, available: string[], fallback: string): string {
  const locale = requested.replace(/_/g, '-').toLowerCase();
  const exact = available.find((entry) => entry.toLowerCase() === locale);
  if (exact) return exact;
  if (locale.startsWith('zh')) {
    const chinese = /hant|tw|hk|mo/.test(locale) ? 'zh-HK' : 'zh-CN';
    if (available.includes(chinese)) return chinese;
  }
  return available.find((entry) => entry.toLowerCase().split('-')[0] === locale.split('-')[0]) ?? fallback;
}

/** Fetches a JSON asset without credentials for a static CDN request. */
export async function fetchOEMJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Static resource failed (${response.status}): ${url}`);
  return response.json() as Promise<T>;
}

/** Loads and validates the channel-selected OEM manifest. */
export async function loadOEMManifest(resources: OEMResources, signal?: AbortSignal): Promise<OEMManifest> {
  const value = await fetchOEMJson<OEMManifest | { manifest: { path: string } }>(resolveOEMAsset(resources.baseUrl, resources.manifestPath), signal);
  return validateOEMManifest(value && typeof value === 'object' && 'manifest' in value
    ? await fetchOEMJson<OEMManifest>(resolveOEMAsset(resources.baseUrl, value.manifest.path), signal)
    : value);
}
