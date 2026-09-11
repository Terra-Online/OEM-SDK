import type { OEMCoordinateSnapshot, OEMManifest, OEMMapPosition } from './types';
import { getOEMRegion, fromOEMMapPosition, mapToGameXZPosition } from './index';

/** Capture units and release context without retaining the manifest or a renderer. */
export function createOEMCoordinateSnapshot(
  position: OEMMapPosition,
  manifest: OEMManifest,
  subregionResolution: OEMCoordinateSnapshot['subregionResolution'] = position.subregionId ? 'provided' : 'unresolved',
): OEMCoordinateSnapshot {
  const region = getOEMRegion(manifest, position.regionId);
  const subregion = position.subregionId ? region.subregions.find(item => item.id === position.subregionId) : undefined;
  const needsSubregion = region.subregions.some(item => item.gameTransform);
  const reliable = subregionResolution === 'provided' || subregionResolution === 'geometry';
  const transform = subregion?.gameTransform ?? region.gameTransform;
  const gameResolution = needsSubregion && (!subregion || !reliable)
    ? 'subregion-unresolved' : transform ? 'resolved' : 'transform-unavailable';
  return Object.freeze({
    mapPosition: Object.freeze({ ...position, space: 'map' as const }),
    pixelPosition: Object.freeze({ ...fromOEMMapPosition(position, region), space: 'pixel' as const }),
    gamePosition: gameResolution === 'resolved' ? Object.freeze({ ...mapToGameXZPosition(position, region), space: 'game' as const }) : null,
    context: Object.freeze({ schemaVersion: 1 as const, releaseId: manifest.releaseId, gameVersion: manifest.gameVersion }),
    subregionResolution,
    gameResolution,
  });
}
