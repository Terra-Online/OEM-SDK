import { getOEMRegion, getOEMDefaultFloor, normalizeOEMLocale, invalid } from '@opendfieldmap/core';
import type { OEMManifest, OEMRegion, OEMSubregion } from '@opendfieldmap/core';
import type { OEMMapConfig, OEMMapState } from './types';
import { flattenOEMMapConfig, OEM_MAP_DEFAULTS, OEM_MAP_CONFIG_FIELDS, OEM_MAP_CONFIG_KEYS, equalOEMConfigValue } from './configSpec';

export const OEM_REGION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  VL: 'Valley_4',
  WL: 'Wuling',
  DJ: 'Dijiang',
  ES: 'Weekraid_1',
});

/** Validate the entire patch before cloning it or touching a live instance. */
export const validateConfig = (config: OEMMapConfig): void => {
  config = flattenOEMMapConfig(config);
  for (const key of OEM_MAP_CONFIG_KEYS) {
    const value = config[key];
    if (value === undefined) continue;
    const path = `options.${key}`;
    switch (OEM_MAP_CONFIG_FIELDS[key].kind) {
      case 'string': if (typeof value !== 'string' || !value.trim()) invalid(path, 'Expected a non-empty string'); break;
      case 'nullableString': if (value !== null && typeof value !== 'string') invalid(path, 'Expected a string or null'); break;
      case 'boolean': if (typeof value !== 'boolean') invalid(path, 'Expected boolean'); break;
      case 'number': if (!Number.isFinite(value)) invalid(path, 'Expected a finite number'); break;
      case 'theme': if (value !== 'light' && value !== 'dark') invalid(path, 'Unknown official theme'); break;
      case 'boundarySource': if (value !== 'oem' && value !== 'game') invalid(path, 'Expected oem or game'); break;
      case 'center': {
        const center = value as OEMMapConfig['center'];
        if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) invalid(path, 'Center coordinates must be finite');
        if (center.space !== undefined && center.space !== 'pixel') invalid(`${path}.space`, 'Center uses published pixels');
        break;
      }
      case 'markers': if (value !== false && value !== '*' && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) invalid(path, 'Expected type keys, * or false'); break;
      case 'points': {
        if (!Array.isArray(value)) invalid(path, 'Expected an array');
        value.forEach((point, index) => { if (!point || typeof point !== 'object' || !point.position || typeof point.position !== 'object') invalid(`${path}[${index}]`, 'Expected a point with a position'); });
        break;
      }
    }
  }
  if (config.customPoints !== undefined && config.customPointsUrl !== undefined) invalid('options.customPoints', 'Pass either customPoints or customPointsUrl, not both');
};

export const cloneConfig = (input: OEMMapConfig): OEMMapConfig => {
  const config = flattenOEMMapConfig(input);
  return {
  ...config,
  markerTypes: Array.isArray(config.markerTypes) ? [...config.markerTypes] : config.markerTypes,
  customPoints: config.customPoints?.map((point) => ({ ...point, position: { ...point.position } })),
  center: config.center ? { ...config.center } : config.center,
  };
};

export const resolveRegionId = (manifest: OEMManifest, value?: string): string => {
  const requested = value ? manifest.regions.some(region => region.id === value) ? value : OEM_REGION_ALIASES[value.toUpperCase()] ?? value : manifest.defaultRegionId;
  return getOEMRegion(manifest, requested).id as string;
};

const normalizeMarkerTypes = (value: OEMMapConfig['markerTypes']): string[] | '*' => {
  if (value === '*') return '*';
  if (!value || !Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => entry.trim()).filter(Boolean))];
};

const normalizeBoundarySource = (value: OEMMapConfig['boundarySource']): OEMMapState['boundarySource'] => {
  if (value === undefined || value === 'oem') return 'oem';
  if (value === 'game') return 'game';
  throw new Error(`Unknown OEM boundary source: ${value}`);
};

export const getPreset = (region: OEMRegion, subregion?: OEMSubregion) => {
  if (!subregion?.bounds) {
    return {
      center: { x: region.initialView.x, z: region.initialView.z },
      zoom: region.initialView.zoom,
    };
  }
  return {
    center: {
      x: (subregion.bounds[0][0] + subregion.bounds[1][0]) / 2,
      z: (subregion.bounds[0][1] + subregion.bounds[1][1]) / 2,
    },
    zoom: Math.max(region.minZoom, Math.min(region.maxZoom, 1)),
  };
};

export const normalizeState = (input: OEMMapConfig, manifest: OEMManifest): OEMMapState => {
  input = flattenOEMMapConfig(input);
  validateConfig(input);
  let regionId = resolveRegionId(manifest, input.region);
  const subregionId = input.subregion?.trim() || null;
  if (subregionId) {
    const owner = manifest.regions.find((region) => region.subregions.some((subregion) => subregion.id === subregionId));
    if (!owner) throw new Error(`Unknown OEM subregion: ${subregionId}`);
    if (input.region && owner.id !== regionId) {
      throw new Error(`OEM subregion ${subregionId} does not belong to ${regionId}`);
    }
    regionId = owner.id as string;
  }

  const region = getOEMRegion(manifest, regionId);
  const subregion = subregionId
    ? region.subregions.find((entry) => entry.id === subregionId)
    : undefined;
  const floorId = input.floor ?? getOEMDefaultFloor(region);
  if (!region.floors.some((floor) => floor.id === floorId)) {
    throw new Error(`Unknown OEM floor ${floorId} in ${regionId}`);
  }

  const requestedCenter = input.center;
  if (requestedCenter && (!Number.isFinite(requestedCenter.x) || !Number.isFinite(requestedCenter.z))) {
    throw new Error('OEM Widget center coordinates must be finite');
  }
  const preset = getPreset(region, subregion);
  const requestedLocale = input.locale ?? (typeof navigator === 'undefined' ? manifest.fallbackLocale : navigator.language);

  return {
    regionId,
    subregionId,
    floorId,
    locale: normalizeOEMLocale(requestedLocale, Object.keys(manifest.locales), manifest.fallbackLocale) as string,
    markerTypes: normalizeMarkerTypes(input.markerTypes),
    labels: input.labels ?? OEM_MAP_DEFAULTS.labels,
    boundaries: input.boundaries ?? OEM_MAP_DEFAULTS.boundaries,
    boundarySource: normalizeBoundarySource(input.boundarySource),
    markerClustering: input.markerClustering ?? OEM_MAP_DEFAULTS.markerClustering,
    theme: input.theme ?? OEM_MAP_DEFAULTS.theme,
    lockDrag: input.lockDrag ?? OEM_MAP_DEFAULTS.lockDrag,
    lockZoom: input.lockZoom ?? OEM_MAP_DEFAULTS.lockZoom,
    zoom: Math.max(region.minZoom, Math.min(region.maxZoom, input.zoom ?? preset.zoom)),
    center: {
      x: requestedCenter?.x ?? preset.center.x,
      z: requestedCenter?.z ?? preset.center.z,
    },
  };
};

export const toConfig = (state: OEMMapState): OEMMapConfig => Object.fromEntries(
  OEM_MAP_CONFIG_KEYS.flatMap(key => {
    const field = OEM_MAP_CONFIG_FIELDS[key];
    return 'state' in field ? [[key, state[field.state]]] : [];
  }),
) as OEMMapConfig;

export const sameMarkers = (left: OEMMapState['markerTypes'], right: OEMMapState['markerTypes']): boolean =>
  left === right || (left !== '*' && right !== '*' && left.length === right.length &&
    left.every((marker, index) => marker === right[index]));

export const sameState = (left: OEMMapState, right: OEMMapState): boolean => OEM_MAP_CONFIG_KEYS.every(key => {
  const field = OEM_MAP_CONFIG_FIELDS[key];
  return !('state' in field) || equalOEMConfigValue(left[field.state], right[field.state]);
});

export const hasMarkers = (state: OEMMapState): boolean =>
  state.markerTypes === '*' || state.markerTypes.length > 0;

/** Resolve dependent region/subregion presets before committing any runtime state. */
export function resolveConfigUpdate(previous: OEMMapState, config: OEMMapConfig, manifest: OEMManifest): { changes: OEMMapConfig; next: OEMMapState } {
  const changes = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as OEMMapConfig;
  if (changes.subregion !== undefined) changes.subregion = changes.subregion?.trim() || null;
  if (changes.subregion && changes.region === undefined) {
    const owner = manifest.regions.find(region => region.subregions.some(sub => sub.id === changes.subregion));
    if (!owner) invalid('options.subregion', 'Unknown subregion');
    changes.region = owner.id;
  }
  const merged = { ...toConfig(previous), ...changes };
  const regionId = resolveRegionId(manifest, changes.region ?? previous.regionId);
  if (regionId !== previous.regionId) {
    const preset = getPreset(getOEMRegion(manifest, regionId));
    if (changes.floor === undefined) merged.floor = undefined;
    if (changes.subregion === undefined) merged.subregion = null;
    if (changes.center === undefined) merged.center = preset.center;
    if (changes.zoom === undefined) merged.zoom = preset.zoom;
  }
  if (changes.subregion !== undefined && changes.subregion !== previous.subregionId) {
    const region = getOEMRegion(manifest, regionId);
    const preset = getPreset(region, region.subregions.find(sub => sub.id === changes.subregion));
    if (changes.center === undefined) merged.center = preset.center;
    if (changes.zoom === undefined) merged.zoom = preset.zoom;
  }
  const next = normalizeState(merged, manifest);
  return { changes, next };
}
