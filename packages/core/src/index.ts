export * from './types';
export * from './pointLink';
export * from './errors';
export { withOEMAbort } from './abort';
import { withOEMAbort } from './abort';
export { validateOEMManifest, checkOEMManifestVersion } from './validation';
import { checkOEMManifestVersion } from './validation';
import { resourceError } from './errors';
import { resolveOEMAsset } from './resources';
export { resolveOEMAsset } from './resources';
import type { OEMGamePosition, OEMGameTransform, OEMGameXZPosition, OEMManifest, OEMMapPosition, OEMPosition, OEMRegion, OEMResources } from './types';

/** Default static origin used by OEM clients. */
export const defaultOEMResources: Readonly<OEMResources> = Object.freeze({
  baseUrl: 'https://data.opendfieldmap.org',
  manifestPath: '/channels/stable.json',
});

/** Returns a published region or throws a descriptive configuration error. */
export function getOEMRegion(manifest: OEMManifest, id: string): OEMRegion {
  const region = manifest.regions.find((entry) => entry.id === id);
  if (!region) throw new Error(`Unknown OEM region: ${id}`);
  return region;
}

/** Converts an OEM pixel position to the Simple CRS coordinates used by Leaflet. */
export function toOEMLeafletPosition(position: OEMPosition, region: OEMRegion): [number, number] {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z)) throw new Error('Invalid OEM position');
  const scale = 2 ** region.maxNativeZoom;
  return [position.z / scale, position.x / scale];
}

/** Converts Simple CRS coordinates back to an OEM pixel position. */
export function fromOEMLeafletPosition(lat: number, lng: number, region: OEMRegion, floorId = 'M'): OEMPosition {
  const scale = 2 ** region.maxNativeZoom;
  return { regionId: region.id, x: lng * scale, z: lat * scale, floorId };
}

/** Converts a published OEM pixel position into normalized map coordinates. */
export function toOEMMapPosition(position: OEMPosition, region: OEMRegion): OEMMapPosition {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    throw new Error('Invalid OEM position');
  }
  const scale = 2 ** region.maxNativeZoom;
  return {
    regionId: region.id,
    ...(position.subregionId ? { subregionId: position.subregionId } : {}),
    x: position.x / scale,
    z: position.z / scale,
    floorId: position.floorId,
  };
}

/** Converts normalized map coordinates into a published OEM pixel position. */
export function fromOEMMapPosition(position: OEMMapPosition, region: OEMRegion): OEMPosition {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    throw new Error('Invalid OEM map position');
  }
  const scale = 2 ** region.maxNativeZoom;
  return {
    regionId: region.id,
    ...(position.subregionId ? { subregionId: position.subregionId } : {}),
    x: position.x * scale,
    z: position.z * scale,
    floorId: position.floorId,
  };
}

/** Converts normalized map coordinates into Leaflet Simple CRS coordinates. */
export function toOEMLeafletMapPosition(position: OEMMapPosition): [number, number] {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) throw new Error('Invalid OEM map position');
  return [position.z, position.x];
}

/** Converts a retained game-space position into published map coordinates. */
export function gameToOEMPosition(raw: OEMGamePosition, region: OEMRegion, floorId = 'M', subregionId?: string): OEMPosition {
  if (![raw.x, raw.y, raw.z].every(Number.isFinite)) throw new Error('Invalid game position');
  return fromOEMMapPosition(gameXZToOEMPosition(raw, region, floorId, subregionId), region);
}

/** Converts horizontal game coordinates into published map coordinates. */
export function gameXZToOEMPosition(raw: OEMGameXZPosition, region: OEMRegion, floorId = 'M', subregionId?: string): OEMMapPosition {
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.z)) throw new Error('Invalid game position');
  const transform = getOEMGameTransform(region, subregionId);
  return {
    regionId: region.id,
    ...(subregionId ? { subregionId } : {}),
    x: raw.x * transform.scaleX + transform.offsetX,
    z: raw.z * transform.scaleZ + transform.offsetZ,
    floorId,
  };
}

/** Converts an OEM map position to the recoverable horizontal game coordinates. */
export function oemToGamePosition(position: OEMPosition, region: OEMRegion, subregionId?: string): OEMGameXZPosition {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    throw new Error('Invalid OEM position');
  }
  return mapToGameXZPosition(toOEMMapPosition(position, region), region, subregionId);
}

/** Converts normalized OEM map coordinates into the recoverable game X/Z coordinates. */
export function mapToGameXZPosition(position: OEMMapPosition, region: OEMRegion, subregionId?: string): OEMGameXZPosition {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    throw new Error('Invalid OEM map position');
  }
  const transform = getOEMGameTransform(region, position.subregionId ?? subregionId);
  return {
    x: (position.x - transform.offsetX) / transform.scaleX,
    z: (position.z - transform.offsetZ) / transform.scaleZ,
  };
}

/** Returns the transform selected by a region and optional subregion. */
export function getOEMGameTransform(region: OEMRegion, subregionId?: string): OEMGameTransform {
  if (subregionId) {
    const subregion = region.subregions.find((entry) => entry.id === subregionId);
    if (!subregion) throw new Error(`Unknown OEM subregion ${subregionId} in ${region.id}`);
    if (subregion.gameTransform) return subregion.gameTransform;
  }
  return region.gameTransform ?? { scaleX: 1, scaleZ: 1, offsetX: 0, offsetZ: 0 };
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
  signal?.throwIfAborted();
  try {
    const response = await withOEMAbort(fetch(url, { signal, credentials: 'omit', headers: { Accept: 'application/json' } }), signal);
    if (!response.ok) throw resourceError('fetch', new Error(`Static resource failed (${response.status}): ${url}`));
    return await withOEMAbort(response.json() as Promise<T>, signal);
  } catch (error) {
    signal?.throwIfAborted();
    throw resourceError('fetch', error);
  }
}

/** Loads a trusted manifest and checks only its schema compatibility. */
export async function loadOEMManifest(resources: OEMResources, signal?: AbortSignal): Promise<OEMManifest> {
  const value = await fetchOEMJson<OEMManifest | { manifest: { path: string } }>(resolveOEMAsset(resources?.baseUrl, resources?.manifestPath), signal);
  return checkOEMManifestVersion(value && typeof value === 'object' && 'manifest' in value
    ? await fetchOEMJson<OEMManifest>(resolveOEMAsset(resources.baseUrl, value.manifest?.path), signal)
    : value);
}

export { createOEMCoordinateSnapshot } from './snapshot';
export const pixelToMapPosition = toOEMMapPosition;
export const mapToPixelPosition = fromOEMMapPosition;
export const gameXZToMapPosition = gameXZToOEMPosition;
export const pixelToGameXZPosition = oemToGamePosition;
