import type { OEMFloor, OEMRegion } from '@opendfieldmap/core';

export interface OEMTileLookup { covered: boolean; version?: string }

export const lookupOEMTile = (
  coverage: OEMRegion['coverage'],
  floor: OEMFloor,
  zoom: number,
  x: number,
  y: number,
): OEMTileLookup => {
  const ranges = coverage[String(zoom)]?.[floor.id]?.[String(y)] ?? [];
  let offset = 0;
  for (let index = 0; index < ranges.length; index += 2) {
    const start = ranges[index];
    const end = ranges[index + 1];
    if (x >= start && x <= end) {
      return {
        covered: true,
        version: floor.tileVersions?.[String(zoom)]?.[String(y)]?.[offset + x - start],
      };
    }
    offset += end - start + 1;
  }
  return { covered: false };
};

export const appendOEMTileVersion = (url: string, version?: string): string =>
  version ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}` : url;
