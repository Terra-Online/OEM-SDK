import { getOEMRegion, normalizeOEMLocale, invalid } from '@opendfieldmap/core';
import type { OEMManifest, OEMRegion, OEMSubregion } from '@opendfieldmap/core';
import type { OEMMapConfig, OEMMapState } from './types';

const REGION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  VL: 'Valley_4',
  WL: 'Wuling',
  DJ: 'Dijiang',
  ES: 'Weekraid_1',
});

/** Validate the entire patch before cloning it or touching a live instance. */
export const validateConfig = (config: OEMMapConfig): void => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) invalid('options', 'Expected an object');
  for (const key of ['region', 'floor', 'locale', 'customPointsUrl'] as const) {
    if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key]!.trim())) invalid(`options.${key}`, 'Expected a non-empty string');
  }
  if (config.subregion !== undefined && config.subregion !== null && typeof config.subregion !== 'string') invalid('options.subregion', 'Expected a string or null');
  for (const key of ['labels', 'boundaries', 'markerClustering', 'lockDrag', 'lockZoom'] as const) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') invalid(`options.${key}`, 'Expected boolean');
  }
  if (config.theme !== undefined && config.theme !== 'light' && config.theme !== 'dark') invalid('options.theme', 'Unknown official theme');
  if (config.zoom !== undefined && !Number.isFinite(config.zoom)) invalid('options.zoom', 'Zoom must be finite');
  if (config.center !== undefined && (!config.center || !Number.isFinite(config.center.x) || !Number.isFinite(config.center.z))) invalid('options.center', 'Center coordinates must be finite');
  if (config.markerTypes !== undefined && config.markerTypes !== false && config.markerTypes !== '*' &&
    (!Array.isArray(config.markerTypes) || config.markerTypes.some(value => typeof value !== 'string'))) invalid('options.markerTypes', 'Expected type keys, * or false');
  if (config.customPoints !== undefined && !Array.isArray(config.customPoints)) invalid('options.customPoints', 'Expected an array');
  config.customPoints?.forEach((point, index) => { if (!point || typeof point !== 'object' || !point.position || typeof point.position !== 'object') invalid(`options.customPoints[${index}]`, 'Expected a point with a position'); });
  if (config.customPoints !== undefined && config.customPointsUrl !== undefined) invalid('options.customPoints', 'Pass either customPoints or customPointsUrl, not both');
};

export const cloneConfig = (config: OEMMapConfig): OEMMapConfig => ({
  ...config,
  markerTypes: Array.isArray(config.markerTypes) ? [...config.markerTypes] : config.markerTypes,
  customPoints: config.customPoints?.map((point) => ({ ...point, position: { ...point.position } })),
  center: config.center ? { ...config.center } : config.center,
});

export const resolveRegionId = (manifest: OEMManifest, value?: string): string => {
  const requested = value ? REGION_ALIASES[value.toUpperCase()] ?? value : manifest.defaultRegionId;
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
  const floorId = (input.floor ?? 'M') as string;
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
    labels: input.labels ?? true,
    boundaries: input.boundaries ?? false,
    boundarySource: normalizeBoundarySource(input.boundarySource),
    markerClustering: input.markerClustering ?? true,
    theme: input.theme ?? 'light',
    lockDrag: input.lockDrag ?? false,
    lockZoom: input.lockZoom ?? false,
    zoom: Math.max(region.minZoom, Math.min(region.maxZoom, input.zoom ?? preset.zoom)),
    center: {
      x: requestedCenter?.x ?? preset.center.x,
      z: requestedCenter?.z ?? preset.center.z,
    },
  };
};

export const toConfig = (state: OEMMapState): OEMMapConfig => ({
  region: state.regionId,
  subregion: state.subregionId,
  floor: state.floorId,
  locale: state.locale,
  markerTypes: state.markerTypes,
  labels: state.labels,
  boundaries: state.boundaries,
  boundarySource: state.boundarySource,
  markerClustering: state.markerClustering,
  theme: state.theme,
  lockDrag: state.lockDrag,
  lockZoom: state.lockZoom,
  zoom: state.zoom,
  center: { ...state.center },
});

export const sameMarkers = (left: OEMMapState['markerTypes'], right: OEMMapState['markerTypes']): boolean =>
  left === right || (left !== '*' && right !== '*' && left.length === right.length &&
    left.every((marker, index) => marker === right[index]));

export const sameState = (left: OEMMapState, right: OEMMapState): boolean =>
  left.theme === right.theme && left.lockDrag === right.lockDrag && left.lockZoom === right.lockZoom &&
  left.regionId === right.regionId &&
  left.subregionId === right.subregionId &&
  left.floorId === right.floorId &&
  left.locale === right.locale &&
  sameMarkers(left.markerTypes, right.markerTypes) &&
  left.labels === right.labels &&
  left.boundaries === right.boundaries &&
  left.boundarySource === right.boundarySource &&
  left.markerClustering === right.markerClustering &&
  left.zoom === right.zoom &&
  left.center.x === right.center.x &&
  left.center.z === right.center.z;

export const hasMarkers = (state: OEMMapState): boolean =>
  state.markerTypes === '*' || state.markerTypes.length > 0;

