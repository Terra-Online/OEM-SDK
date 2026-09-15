import { invalid } from '@opendfieldmap/core';
import type { OEMMapConfig, OEMMapFlatConfig, OEMMapState } from './types';

type Group = 'view' | 'layers' | 'interaction' | 'appearance' | 'points';
interface Field { group: Group; state?: keyof OEMMapState; nullable?: boolean; url?: readonly string[]; kind: 'string' | 'nullableString' | 'boolean' | 'number' | 'center' | 'markers' | 'points' | 'theme' | 'boundarySource' }
/** Exhaustive registry: adding a config field requires declaring its owner. */
export const OEM_MAP_CONFIG_FIELDS = Object.freeze({
  region: { url: ['r'], group: 'view', kind: 'string', state: 'regionId' },
  subregion: { url: ['s'], group: 'view', kind: 'nullableString', state: 'subregionId', nullable: true },
  floor: { url: ['layer'], group: 'view', kind: 'string', state: 'floorId' },
  center: { url: ['cx', 'cz', 'centerZ'], group: 'view', kind: 'center', state: 'center' },
  zoom: { url: ['z'], group: 'view', kind: 'number', state: 'zoom' },
  locale: { url: ['l'], group: 'layers', kind: 'string', state: 'locale' },
  markerTypes: { url: ['f'], group: 'layers', kind: 'markers', state: 'markerTypes' },
  labels: { url: ['labels', 'names'], group: 'layers', kind: 'boolean', state: 'labels' },
  boundaries: { url: ['boundaries', 'boundary'], group: 'layers', kind: 'boolean', state: 'boundaries' },
  boundarySource: { url: ['boundarySource'], group: 'layers', kind: 'boundarySource', state: 'boundarySource' },
  markerClustering: { url: ['cluster'], group: 'layers', kind: 'boolean', state: 'markerClustering' },
  lockDrag: { url: ['lockDrag'], group: 'interaction', kind: 'boolean', state: 'lockDrag' },
  lockZoom: { url: ['lockZoom'], group: 'interaction', kind: 'boolean', state: 'lockZoom' },
  theme: { url: ['theme'], group: 'appearance', kind: 'theme', state: 'theme' },
  customPoints: { group: 'points', kind: 'points' },
  customPointsUrl: { group: 'points', kind: 'string' },
} as const satisfies Record<keyof OEMMapFlatConfig, Field>);
export const OEM_MAP_DEFAULTS = Object.freeze({
  labels: true, boundaries: false, boundarySource: 'oem', markerClustering: true,
  lockDrag: false, lockZoom: false, theme: 'light',
} as const);
export const OEM_MAP_CONFIG_KEYS = Object.freeze(Object.keys(OEM_MAP_CONFIG_FIELDS) as (keyof OEMMapFlatConfig)[]);

/** Picks dynamic fields only. No data-source reads or manifest scanning. */
export function flattenOEMMapConfig(input: OEMMapConfig): OEMMapFlatConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('options', 'Expected an object');
  const result: Record<string, unknown> = {};
  for (const group of ['view', 'layers', 'interaction'] as const) {
    const values = input[group];
    if (values === undefined) continue;
    if (!values || typeof values !== 'object' || Array.isArray(values)) invalid(`options.${group}`, 'Expected an object');
    for (const [key, value] of Object.entries(values)) {
      if (!(key in OEM_MAP_CONFIG_FIELDS) || OEM_MAP_CONFIG_FIELDS[key as keyof OEMMapFlatConfig].group !== group) invalid(`options.${group}.${key}`, 'Unknown field in this group');
      if (value !== undefined) result[key] = value;
    }
  }
  for (const key of OEM_MAP_CONFIG_KEYS) if (input[key] !== undefined) result[key] = input[key];
  for (const key of OEM_MAP_CONFIG_KEYS) if (result[key] === null && key !== 'subregion') invalid(`options.${key}`, 'This field cannot be cleared with null');
  return result as OEMMapFlatConfig;
}

/** Semantic comparison of config data; reference-equal collections are O(1). */
export function equalOEMConfigValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.hasOwn(b, key) &&
    equalOEMConfigValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Undefined/omitted fields preserve state; arrays and center objects replace. */
export function diffOEMMapConfig(previous: OEMMapConfig, next: OEMMapConfig): OEMMapFlatConfig {
  const before = flattenOEMMapConfig(previous), after = flattenOEMMapConfig(next);
  return Object.fromEntries(OEM_MAP_CONFIG_KEYS.filter(key => after[key] !== undefined &&
    !equalOEMConfigValue(before[key], after[key])).map(key => [key, after[key]])) as OEMMapFlatConfig;
}
