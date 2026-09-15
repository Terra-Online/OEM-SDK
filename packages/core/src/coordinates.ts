import type {
  OEMGamePosition,
  OEMGameTransform,
  OEMGameXZPosition,
  OEMMapPosition,
  OEMNormalizedMapPosition,
  OEMPixelPosition,
  OEMPosition,
  OEMRegion,
} from './types';

/** Converts an OEM pixel position to the Simple CRS coordinates used by Leaflet. */
export function toOEMLeafletPosition(position: OEMPosition, region: OEMRegion): [number, number] {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z))
    throw new Error('Invalid OEM position');
  const scale = 2 ** region.maxNativeZoom;
  return [position.z / scale, position.x / scale];
}

/** Converts Simple CRS coordinates back to an OEM pixel position. */
export function fromOEMLeafletPosition(
  lat: number,
  lng: number,
  region: OEMRegion,
  floorId = 'M',
): OEMPosition {
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
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z))
    throw new Error('Invalid OEM map position');
  return [position.z, position.x];
}

/** Converts a retained game-space position into published map coordinates. */
export function gameToOEMPosition(
  raw: OEMGamePosition,
  region: OEMRegion,
  floorId = 'M',
  subregionId?: string,
): OEMPosition {
  if (![raw.x, raw.y, raw.z].every(Number.isFinite)) throw new Error('Invalid game position');
  return fromOEMMapPosition(gameXZToOEMPosition(raw, region, floorId, subregionId), region);
}

/** Converts horizontal game coordinates into published map coordinates. */
export function gameXZToOEMPosition(
  raw: OEMGameXZPosition,
  region: OEMRegion,
  floorId = 'M',
  subregionId?: string,
): OEMMapPosition {
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
export function oemToGamePosition(
  position: OEMPosition,
  region: OEMRegion,
  subregionId?: string,
): OEMGameXZPosition {
  if (position.regionId !== region.id || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    throw new Error('Invalid OEM position');
  }
  return mapToGameXZPosition(toOEMMapPosition(position, region), region, subregionId);
}

/** Converts normalized OEM map coordinates into the recoverable game X/Z coordinates. */
export function mapToGameXZPosition(
  position: OEMMapPosition,
  region: OEMRegion,
  subregionId?: string,
): OEMGameXZPosition {
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

/** Preferred conversions return explicit, serializable space tags. */
export function pixelToMapPosition(position: OEMPosition, region: OEMRegion): OEMNormalizedMapPosition {
  return { ...toOEMMapPosition(position, region), space: 'map' };
}
export function mapToPixelPosition(position: OEMMapPosition, region: OEMRegion): OEMPixelPosition {
  return { ...fromOEMMapPosition(position, region), space: 'pixel' };
}
export function gameXZToMapPosition(
  position: OEMGameXZPosition,
  region: OEMRegion,
  floorId = 'M',
  subregionId?: string,
): OEMNormalizedMapPosition {
  return { ...gameXZToOEMPosition(position, region, floorId, subregionId), space: 'map' };
}
export function pixelToGameXZPosition(
  position: OEMPosition,
  region: OEMRegion,
  subregionId?: string,
): OEMGameXZPosition & { space: 'game' } {
  return { ...oemToGamePosition(position, region, subregionId), space: 'game' };
}
