import { invalid } from './errors';
import { OEM_SCHEMA_VERSION } from './types';
import type { OEMManifest } from './types';

type RecordValue = Record<string, unknown>;
const isObject = (value: unknown): value is RecordValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const isTransform = (value: unknown): boolean => value === undefined ||
  isObject(value) && ['scaleX', 'scaleZ', 'offsetX', 'offsetZ'].every(key => Number.isFinite(value[key])) &&
  value.scaleX !== 0 && value.scaleZ !== 0;

/** Constant-time compatibility check used by trusted resource loading. */
export function checkOEMManifestVersion(value: unknown): OEMManifest {
  if (!isObject(value) || value.schemaVersion !== OEM_SCHEMA_VERSION) invalid('manifest.schemaVersion', 'Unsupported or invalid OEM manifest');
  return value as unknown as OEMManifest;
}

/**
 * Opt-in diagnostics for host-supplied data, never called during initialization.
 * Check only the invariants consumed by the renderer. Unknown fields and
 * publication metadata are deliberately left to the export validator.
 */
export function validateOEMManifest(value: unknown): OEMManifest {
  if (!isObject(value) || value.schemaVersion !== OEM_SCHEMA_VERSION) invalid('manifest.schemaVersion', 'Unsupported or invalid OEM manifest');
  if (!isText(value.releaseId) || !isText(value.gameVersion)) invalid('manifest', 'Missing release identity');
  if (!Array.isArray(value.regions) || !value.regions.length) invalid('manifest.regions', 'Expected regions');
  const ids = new Set<string>();
  for (const [index, region] of value.regions.entries()) {
    const path = `manifest.regions[${index}]`;
    if (!isObject(region) || !isText(region.id)) invalid(path, 'Expected a region with an ID');
    if (ids.has(region.id)) invalid(`${path}.id`, 'Duplicate region');
    ids.add(region.id);
    if (!isPair(region.dimensions) || region.dimensions.some(n => n <= 0)) invalid(`${path}.dimensions`, 'Expected two positive dimensions');
    if (!isObject(region.boundsOffset) || !Number.isFinite(region.boundsOffset.x) || !Number.isFinite(region.boundsOffset.z)) invalid(`${path}.boundsOffset`, 'Expected finite x/z offsets');
    if (!Number.isFinite(region.tileSize) || (region.tileSize as number) <= 0) invalid(`${path}.tileSize`, 'Expected a positive tile size');
    const { minZoom, maxZoom, maxNativeZoom } = region;
    if (![minZoom, maxZoom, maxNativeZoom].every(Number.isFinite) ||
      (minZoom as number) > (maxZoom as number) || (maxNativeZoom as number) > (maxZoom as number) || !Number.isFinite(2 ** (maxNativeZoom as number)) || 2 ** (maxNativeZoom as number) === 0) invalid(path, 'Invalid zoom range');
    if (!isObject(region.initialView) || region.initialView.regionId !== region.id ||
      !['x', 'z', 'zoom'].every(key => Number.isFinite((region.initialView as RecordValue)[key]))) invalid(`${path}.initialView`, 'Expected a finite view in this region');
    if (!Array.isArray(region.floors) || !region.floors.some(f => isObject(f) && f.id === 'M')) invalid(`${path}.floors`, 'Main floor M is required');
    const floors = new Set<string>();
    for (const [i, floor] of region.floors.entries()) {
      if (!isObject(floor) || !isText(floor.id) || !isText(floor.tileTemplate)) invalid(`${path}.floors[${i}]`, 'Expected floor ID and tile template');
      if (floors.has(floor.id)) invalid(`${path}.floors[${i}].id`, 'Duplicate floor');
      floors.add(floor.id);
    }
    if (!Array.isArray(region.subregions)) invalid(`${path}.subregions`, 'Expected subregions');
    const subregions = new Set<string>();
    for (const [i, subregion] of region.subregions.entries()) {
      const subpath = `${path}.subregions[${i}]`;
      if (!isObject(subregion) || !isText(subregion.id) || !isText(subregion.key)) invalid(subpath, 'Expected subregion ID and key');
      if (subregions.has(subregion.id)) invalid(`${subpath}.id`, 'Duplicate subregion');
      subregions.add(subregion.id);
      if (subregion.bounds !== undefined && (!Array.isArray(subregion.bounds) || subregion.bounds.length !== 2 || !subregion.bounds.every(isPair))) invalid(`${subpath}.bounds`, 'Expected two finite corners');
      if (!isTransform(subregion.gameTransform)) invalid(`${subpath}.gameTransform`, 'Invalid coordinate transform');
    }
    if (!isTransform(region.gameTransform)) invalid(`${path}.gameTransform`, 'Invalid coordinate transform');
    if (!Array.isArray(region.points)) invalid(`${path}.points`, 'Expected point resource references');
    if (!isObject(region.coverage)) invalid(`${path}.coverage`, 'Expected coverage lookup');
    if (!isObject(region.locales)) invalid(`${path}.locales`, 'Expected region names');
  }
  if (!ids.has(String(value.defaultRegionId))) invalid('manifest.defaultRegionId', 'Unknown OEM region');
  if (!isObject(value.types) || !isText(value.types.path)) invalid('manifest.types', 'Missing point type resource');
  if (!isObject(value.locales)) invalid('manifest.locales', 'Expected locale resources');
  if (!isText(value.fallbackLocale) || !isObject(value.controls) || !Object.hasOwn(value.controls, value.fallbackLocale)) invalid('manifest.controls', 'Fallback control messages are unavailable');
  const controls = value.controls[value.fallbackLocale];
  if (!isObject(controls) || !['layerSelect', 'zoomIn', 'zoomOut', 'brandName', 'termsOfService'].every(key => isText(controls[key]))) invalid('manifest.controls', 'Fallback control messages are unavailable');
  if (value.fonts !== undefined && !Array.isArray(value.fonts)) invalid('manifest.fonts', 'Expected font resources');
  return value as unknown as OEMManifest;
}
