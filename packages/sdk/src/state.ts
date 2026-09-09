import type { OEMBoundarySource, OEMFloorId, OEMLocale, OEMRegionSelector, OEMWidgetConfig } from './types';

const parseBoolean = (value: string | null): boolean | undefined => {
  if (value === null) return undefined;
  if (['1', 'true', 'on', 'yes'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'off', 'no'].includes(value.toLowerCase())) return false;
  return undefined;
};

const parseNumber = (value: string | null): number | undefined => {
  if (value === null || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const parseList = (value: string | null): string[] | undefined => {
  if (value === null) return undefined;
  return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
};

const parseBoundarySource = (value: string | null): OEMBoundarySource | undefined =>
  value === 'oem' || value === 'game' ? value : undefined;

const toSearchParams = (source: string): URLSearchParams => {
  const trimmed = source.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return new URL(trimmed).searchParams;
  const query = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : trimmed;
  return new URLSearchParams(query.replace(/^\?/, ''));
};

/**
 * Adapts compact OEM URL-state keys to the typed Widget configuration.
 *
 * This helper is optional; createOEMWidget accepts normal named properties.
 */
export function parseOEMUrlState(source: string | URLSearchParams): OEMWidgetConfig {
  const params = typeof source === 'string' ? toSearchParams(source) : source;
  const filter = params.get('f');
  const centerX = parseNumber(params.get('cx'));
  const centerZ = parseNumber(params.get('cz') ?? params.get('centerZ'));
  return {
    region: (params.get('r') ?? undefined) as OEMRegionSelector | undefined,
    subregion: params.get('s'),
    floor: (params.get('layer') ?? undefined) as OEMFloorId | undefined,
    locale: (params.get('l') ?? undefined) as OEMLocale | undefined,
    markerTypes: filter === '*' ? '*' : filter === null ? undefined : parseList(filter) ?? false,
    labels: parseBoolean(params.get('labels') ?? params.get('names')),
    boundaries: parseBoolean(params.get('boundaries') ?? params.get('boundary')),
    boundarySource: parseBoundarySource(params.get('boundarySource')),
    markerClustering: parseBoolean(params.get('cluster')),
    zoom: parseNumber(params.get('z')),
    center: centerX === undefined || centerZ === undefined ? undefined : { x: centerX, z: centerZ },
  };
}
