import type { OEMBoundarySource, OEMWidgetConfig } from './types';
import { OEM_MAP_CONFIG_FIELDS } from '@opendfieldmap/map';
import { OEM_WIDGET_CONTROL_DEFAULTS, snapshotOEMWidgetConfig } from './config';

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
  return parse(source, false);
}

/** Patch-safe adapter: absent URL keys never clear existing map state. */
export function parseOEMUrlPatch(source: string | URLSearchParams): OEMWidgetConfig {
  return snapshotOEMWidgetConfig(parse(source, true));
}

function parse(source: string | URLSearchParams, patch: boolean): OEMWidgetConfig {
  const params = typeof source === 'string' ? toSearchParams(source) : source;
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(OEM_MAP_CONFIG_FIELDS)) {
    if (!('url' in field)) continue;
    const value = field.url.map(name => params.get(name)).find(value => value !== null) ?? null;
    switch (field.kind) {
      case 'boolean': result[key] = parseBoolean(value); break;
      case 'number': result[key] = parseNumber(value); break;
      case 'string': result[key] = value ?? undefined; break;
      case 'nullableString': result[key] = value === null ? patch ? undefined : null : value; break;
      case 'theme': result[key] = value === 'light' || value === 'dark' ? value : undefined; break;
      case 'boundarySource': result[key] = parseBoundarySource(value); break;
      case 'markers': result[key] = value === '*' ? '*' : parseList(value); break;
      case 'center': {
        const x = parseNumber(params.get('cx')), z = parseNumber(params.get('cz') ?? params.get('centerZ'));
        result[key] = x === undefined || z === undefined ? undefined : { x, z };
        break;
      }
    }
  }
  for (const key of Object.keys(OEM_WIDGET_CONTROL_DEFAULTS)) {
    const value = parseBoolean(params.get(key));
    if (value !== undefined) result[key] = value;
  }
  return result as OEMWidgetConfig;
}
