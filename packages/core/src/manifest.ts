import { withOEMAbort } from './abort';
import { checkOEMManifestVersion } from './validation';
import { resourceError } from './errors';
import { resolveOEMAsset } from './resources';
import type { OEMManifest, OEMRegion, OEMResources } from './types';

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
/** Preserve M for existing releases, otherwise use the manifest's first floor. */
export function getOEMDefaultFloor(region: OEMRegion): string {
  return region.floors.find(floor => floor.id === 'M')?.id ?? region.floors[0]?.id ?? 'M';
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
